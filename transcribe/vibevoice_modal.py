"""Modal worker for microsoft/VibeVoice-ASR-HF.

VibeVoice is a 9B-parameter ASR LLM (Qwen2.5-7B base) that emits utterance-level
JSON ``[{Start, End, Speaker, Content}, ...]``. It does **not** produce
word-level timestamps. We add those on the same worker with a forced-alignment
pass using torchaudio's MMS-FA pipeline (multilingual wav2vec2 CTC).

Lifecycle
---------
Self-deploys with ``modal deploy``. Container scales to zero after
``scaledown_window`` seconds of inactivity. First call after scale-down
triggers a cold start (~60-120s) — model weights are persisted on a Modal
Volume so we don't re-download 18GB each time.

Deploy:
    cd transcribe && uv run modal deploy vibevoice_modal.py

Local invocation goes through ``recognizer.VibeVoiceModalRecognizer`` which
looks up this app by name (see ``constants.VIBEVOICE_MODAL_APP_NAME``).
"""

from __future__ import annotations

import io
import json
import logging
import time
from typing import Any

import modal

logger = logging.getLogger(__name__)

# Match constants.VIBEVOICE_MODAL_APP_NAME / VIBEVOICE_MODAL_CLASS_NAME
APP_NAME = "caption-editor-vibevoice-asr"
CLASS_NAME = "VibeVoiceASR"

MODEL_ID = "microsoft/VibeVoice-ASR-HF"
HF_CACHE_DIR = "/cache/huggingface"
SCALEDOWN_SECONDS = 300  # idle timeout
GENERATE_TIMEOUT_SECONDS = 60 * 60  # one hour, for long audio

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch==2.5.1",
        "torchaudio==2.5.1",
        # VibeVoiceAsrForConditionalGeneration was added to transformers after
        # 4.53; install from main until a release with it lands.
        "transformers @ git+https://github.com/huggingface/transformers@main",
        "accelerate>=0.34",
        "soundfile>=0.13",
        "librosa>=0.11",
        "numpy<2.4",
        "huggingface_hub>=0.25",
    )
    .env({"HF_HOME": HF_CACHE_DIR})
)

app = modal.App(APP_NAME)
hf_volume = modal.Volume.from_name("caption-editor-hf-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L40S",
    volumes={HF_CACHE_DIR: hf_volume},
    scaledown_window=SCALEDOWN_SECONDS,
    timeout=GENERATE_TIMEOUT_SECONDS,
)
class VibeVoiceASR:
    """VibeVoice transcription + forced-alignment word timestamps."""

    @modal.enter()
    def load(self) -> None:
        import torch

        # VibeVoiceAsrForConditionalGeneration only exists in the worker's
        # `transformers @ git+...@main`, not in the locally pinned 4.53.x.
        from transformers import AutoProcessor, VibeVoiceAsrForConditionalGeneration  # type: ignore[attr-defined]

        t0 = time.time()
        print(f"[{time.strftime('%H:%M:%S')}] loading VibeVoice processor…")
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        print(f"[{time.strftime('%H:%M:%S')}] loading VibeVoice model (9B, bf16)…")
        self.model = VibeVoiceAsrForConditionalGeneration.from_pretrained(
            MODEL_ID,
            dtype=torch.bfloat16,
            device_map="cuda",
            attn_implementation="sdpa",
        )
        self.model.eval()
        print(
            f"[{time.strftime('%H:%M:%S')}] VibeVoice ready in {time.time() - t0:.1f}s"
        )

        # Forced-alignment (MMS-FA, ~300M params, 16kHz)
        from torchaudio.pipelines import MMS_FA as fa_bundle

        self.fa_bundle = fa_bundle
        self.fa_model = fa_bundle.get_model(with_star=False).to("cuda").eval()
        self.fa_dict = fa_bundle.get_dict()
        self.fa_sample_rate = fa_bundle.sample_rate
        print(
            f"[{time.strftime('%H:%M:%S')}] MMS-FA ready in {time.time() - t0:.1f}s total"
        )

        hf_volume.commit()

    @modal.method()
    def transcribe(self, audio_bytes: bytes) -> list[dict[str, Any]]:
        """Transcribe a WAV/FLAC/MP3 audio file (passed as raw bytes).

        Returns a list of segment dicts:
            [{"start": float, "end": float, "speaker": str | None,
              "text": str, "words": [{"word": str, "start": float, "end": float}, ...]}, ...]

        Word timestamps are produced by MMS-FA forced alignment on each segment.
        If alignment fails for a segment, words are synthesized uniformly.
        """
        import soundfile as sf

        t0 = time.time()
        audio_np, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
        if audio_np.ndim > 1:
            audio_np = audio_np.mean(axis=1)
        print(
            f"[{time.strftime('%H:%M:%S')}] received audio: {len(audio_np) / sr:.1f}s @ {sr}Hz"
        )

        # 1. Run VibeVoice (its processor handles its own resampling internally)
        segments = self._run_vibevoice(audio_np, sr)
        print(
            f"[{time.strftime('%H:%M:%S')}] VibeVoice produced {len(segments)} segments in {time.time() - t0:.1f}s"
        )

        # 2. Resample to 16kHz once for forced alignment
        if sr != self.fa_sample_rate:
            import librosa

            audio_16k = librosa.resample(
                audio_np, orig_sr=sr, target_sr=self.fa_sample_rate
            )
        else:
            audio_16k = audio_np

        # 3. Forced-align each segment
        t1 = time.time()
        for seg in segments:
            seg["words"] = self._align_segment(
                audio_16k, seg["start"], seg["end"], seg["text"]
            )
        print(
            f"[{time.strftime('%H:%M:%S')}] forced alignment finished in {time.time() - t1:.1f}s"
        )

        return segments

    def _run_vibevoice(self, audio_np, sr: int) -> list[dict[str, Any]]:
        import torch

        # The processor accepts (array, sample_rate) tuples directly; it handles resampling.
        inputs = self.processor.apply_transcription_request(
            audio=(audio_np, sr),
        ).to(self.model.device, self.model.dtype)

        with torch.inference_mode():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=8192,
                do_sample=False,
            )
        gen_ids = output_ids[:, inputs["input_ids"].shape[1] :]
        parsed = self.processor.decode(gen_ids, return_format="parsed")

        # parsed is a list (one per batch item) of lists of dicts.
        if not parsed:
            return []
        items = parsed[0] if isinstance(parsed[0], list) else parsed

        out: list[dict[str, Any]] = []
        for item in items:
            try:
                start = float(item.get("Start", item.get("start", 0.0)))
                end = float(item.get("End", item.get("end", start)))
                content = str(item.get("Content", item.get("text", ""))).strip()
                speaker_raw = item.get("Speaker", item.get("speaker"))
                speaker = f"Speaker {speaker_raw}" if speaker_raw is not None else None
            except (TypeError, ValueError):
                continue
            if not content or end <= start:
                continue
            out.append(
                {
                    "start": start,
                    "end": end,
                    "speaker": speaker,
                    "text": content,
                    "words": [],
                }
            )
        return out

    def _align_segment(
        self, audio_16k, seg_start: float, seg_end: float, text: str
    ) -> list[dict[str, Any]]:
        """Forced-align one segment's text against its audio span. Returns word dicts.

        Falls back to uniform-split words on any failure.
        """
        import numpy as np
        import torch
        import torchaudio

        words_text = text.split()
        if not words_text:
            return []

        sr = self.fa_sample_rate
        i0 = max(0, int(seg_start * sr))
        i1 = min(len(audio_16k), int(seg_end * sr))
        if i1 - i0 < sr // 10:  # < 100ms
            return _uniform_words(words_text, seg_start, seg_end)

        clip = audio_16k[i0:i1]
        # Build per-word token id sequences from MMS-FA char dict.
        token_seqs: list[list[int]] = []
        for w in words_text:
            chars = [c for c in _normalize_for_fa(w) if c in self.fa_dict]
            if not chars:
                # Word has no alignable chars — give up cleanly
                return _uniform_words(words_text, seg_start, seg_end)
            token_seqs.append([self.fa_dict[c] for c in chars])

        flat = [t for s in token_seqs for t in s]
        targets = torch.tensor([flat], dtype=torch.int32, device="cuda")
        wave = (
            torch.from_numpy(np.asarray(clip, dtype=np.float32)).unsqueeze(0).to("cuda")
        )

        try:
            with torch.inference_mode():
                emission, _ = self.fa_model(wave)
                alignments, scores = torchaudio.functional.forced_align(
                    emission, targets, blank=0
                )
        except Exception as e:
            print(f"forced_align failed ({e}); falling back to uniform")
            return _uniform_words(words_text, seg_start, seg_end)

        token_spans = torchaudio.functional.merge_tokens(alignments[0], scores[0])
        # Group tokens into words by the lengths of token_seqs
        ratio = (i1 - i0) / emission.shape[1] / sr  # frames -> seconds
        out_words: list[dict[str, Any]] = []
        cursor = 0
        for w_text, seq in zip(words_text, token_seqs):
            spans = token_spans[cursor : cursor + len(seq)]
            cursor += len(seq)
            if not spans:
                out_words.append({"word": w_text, "start": seg_start, "end": seg_end})
                continue
            w_start = seg_start + spans[0].start * ratio
            w_end = seg_start + spans[-1].end * ratio
            out_words.append(
                {"word": w_text, "start": float(w_start), "end": float(w_end)}
            )
        return out_words


def _normalize_for_fa(word: str) -> str:
    """Lowercase + strip punctuation. MMS-FA dict is lowercase + apostrophe + a few specials."""
    out = []
    for c in word.lower():
        if c.isalpha() or c == "'":
            out.append(c)
    return "".join(out)


def _uniform_words(
    words: list[str], seg_start: float, seg_end: float
) -> list[dict[str, Any]]:
    if not words:
        return []
    dur = max(seg_end - seg_start, 1e-3)
    step = dur / len(words)
    return [
        {
            "word": w,
            "start": seg_start + i * step,
            "end": seg_start + (i + 1) * step,
        }
        for i, w in enumerate(words)
    ]


@app.local_entrypoint()
def smoke(audio_path: str) -> None:
    """Send a local audio file to the deployed worker and print the result.

    Usage:
        cd transcribe
        uv run modal run vibevoice_modal.py::smoke --audio-path path/to/audio.wav
    """
    with open(audio_path, "rb") as f:
        data = f.read()
    cls = VibeVoiceASR()
    segs = cls.transcribe.remote(data)
    print(json.dumps(segs, indent=2))

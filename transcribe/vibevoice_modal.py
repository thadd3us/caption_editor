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
CACHE_ROOT = "/cache"
HF_CACHE_DIR = f"{CACHE_ROOT}/huggingface"
TORCH_HUB_DIR = f"{CACHE_ROOT}/torch"
SCALEDOWN_SECONDS = 300  # idle timeout
GENERATE_TIMEOUT_SECONDS = 60 * 60  # one hour, for long audio

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git")
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
    .env({"HF_HOME": HF_CACHE_DIR, "TORCH_HOME": TORCH_HUB_DIR})
)

app = modal.App(APP_NAME)
hf_volume = modal.Volume.from_name("caption-editor-hf-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="L40S",
    volumes={CACHE_ROOT: hf_volume},
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
            # The VibeVoiceAcousticTokenizerEncoderModel sub-module hasn't been
            # ported to sdpa as of transformers main 2026-04. Using "eager"
            # everywhere works; the LM itself can still flash via the kernels
            # transformers picks at runtime.
            attn_implementation="eager",
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
        import os
        import tempfile

        import soundfile as sf

        t_start = time.time()
        audio_np, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
        if audio_np.ndim > 1:
            audio_np = audio_np.mean(axis=1)
        audio_seconds = len(audio_np) / sr
        print(
            f"[{time.strftime('%H:%M:%S')}] received audio: {audio_seconds:.1f}s @ {sr}Hz"
        )

        # The VibeVoice processor's apply_transcription_request expects a file
        # path / URL string (or list thereof) — passing a (np, sr) tuple raises
        # "Invalid input type". Round-trip through a tmp WAV.
        #
        # We force-resample to the documented target rate before writing.
        # Note: VibeVoice's segment-level Start/End timestamps are unreliable
        # (the model often emits rough/quantized times that don't match the
        # actual audio — verified at 8/16/24 kHz inputs). We use them only as
        # a hint for ordering; real timing comes from a global forced-alignment
        # pass below. Sample-rate choice here therefore doesn't affect timing
        # quality, only ASR accuracy.
        VV_SR = 24000
        if sr != VV_SR:
            import librosa

            audio_for_vv = librosa.resample(audio_np, orig_sr=sr, target_sr=VV_SR)
        else:
            audio_for_vv = audio_np
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            sf.write(tmp.name, audio_for_vv, VV_SR)
            tmp_path = tmp.name
        t_vv0 = time.time()
        try:
            segments = self._run_vibevoice(tmp_path)
        finally:
            os.unlink(tmp_path)
        vv_seconds = time.time() - t_vv0
        # VibeVoice sometimes emits a duplicate "tail" segment whose Content
        # repeats the last sentence(s) of the previous one. Drop those.
        segments = _drop_duplicate_segments(segments)
        print(
            f"[{time.strftime('%H:%M:%S')}] VibeVoice produced {len(segments)} segments in "
            f"{vv_seconds:.1f}s (RTF {vv_seconds / audio_seconds:.3f}x, "
            f"{audio_seconds / vv_seconds:.1f}x realtime)"
        )

        # 2. Resample to 16kHz once for forced alignment
        if sr != self.fa_sample_rate:
            import librosa

            audio_16k = librosa.resample(
                audio_np, orig_sr=sr, target_sr=self.fa_sample_rate
            )
        else:
            audio_16k = audio_np

        # Stash the raw (model-emitted) timestamps before we overwrite them
        # with FA-derived ones, so callers can compare / debug.
        for seg in segments:
            seg["raw_start"] = seg["start"]
            seg["raw_end"] = seg["end"]

        # 3. One global forced-alignment pass over the entire audio + concat
        # transcript. VibeVoice's per-segment Start/End are unreliable for
        # read-speech, so we ignore them for timing and re-derive every
        # boundary from the FA word stream.
        t_fa0 = time.time()
        self._align_globally(audio_16k, segments)
        fa_seconds = time.time() - t_fa0
        print(
            f"[{time.strftime('%H:%M:%S')}] forced alignment finished in {fa_seconds:.1f}s "
            f"(RTF {fa_seconds / audio_seconds:.3f}x)"
        )
        for i, seg in enumerate(segments):
            print(
                f"  seg[{i}] raw=[{seg['raw_start']:6.2f},{seg['raw_end']:6.2f}] "
                f"fa=[{seg['start']:6.2f},{seg['end']:6.2f}]  "
                f"{seg['text'][:60]}"
            )

        total = time.time() - t_start
        print(
            f"[{time.strftime('%H:%M:%S')}] total inference: {total:.1f}s for "
            f"{audio_seconds:.1f}s of audio "
            f"(RTF {total / audio_seconds:.3f}x, {audio_seconds / total:.1f}x realtime)"
        )

        return segments

    def _run_vibevoice(self, audio_path: str) -> list[dict[str, Any]]:
        import torch

        inputs = self.processor.apply_transcription_request(
            audio=audio_path,
        ).to(self.model.device, self.model.dtype)

        with torch.inference_mode():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=8192,
                do_sample=False,
            )
        gen_ids = output_ids[:, inputs["input_ids"].shape[1] :]

        # Log the raw decoded text (before structured parsing) once per call so
        # we can tell whether timestamp issues come from VibeVoice itself or
        # from our parsing/forced-alignment. Truncated for sanity.
        try:
            raw_text = self.processor.decode(gen_ids, return_format="raw")
            raw_str = raw_text[0] if isinstance(raw_text, list) else raw_text
            print(f"[vibevoice raw] {raw_str[:1500]}")
        except Exception as e:
            print(f"[vibevoice raw] decode raw failed: {e}")

        parsed = self.processor.decode(gen_ids, return_format="parsed")

        # parsed is a list (one per batch item) of lists of dicts.
        if not parsed:
            return []
        items = parsed[0] if isinstance(parsed[0], list) else parsed
        print(f"[vibevoice parsed] {len(items)} items: {items}")

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
            # VibeVoice emits literal "[Silence]" / "[Music]" / "[Noise]" tokens
            # for non-speech regions. Drop them — downstream code expects words
            # that can be aligned and edited.
            if content.strip().startswith("[") and content.strip().endswith("]"):
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

    def _align_globally(self, audio_16k, segments: list[dict[str, Any]]) -> None:
        """Forced-align every word of every segment against the full audio.

        Replaces each segment's ``start``/``end``/``words`` with FA-derived
        values. ``raw_start``/``raw_end`` (the original VibeVoice times) are
        left in place so callers can compare. Mutates ``segments`` in place.

        Falls back to uniform splitting per-segment if global alignment fails
        (rare — FA tolerates any input text since we tokenize per-character).
        """
        import numpy as np
        import torch
        import torchaudio

        # Flatten all segments into one word sequence, remembering which
        # segment each word belongs to so we can re-distribute after FA.
        flat_words: list[str] = []
        seg_word_counts: list[int] = []
        for seg in segments:
            ws = seg["text"].split()
            seg_word_counts.append(len(ws))
            flat_words.extend(ws)

        if not flat_words:
            return

        # Build per-word char-token sequences from the MMS-FA dict. If a word
        # has no alignable chars we drop it from the alignment input and patch
        # it back in afterwards with synthesized timing.
        token_seqs: list[list[int]] = []
        droppable: list[bool] = []
        for w in flat_words:
            chars = [c for c in _normalize_for_fa(w) if c in self.fa_dict]
            if not chars:
                droppable.append(True)
                token_seqs.append([])
            else:
                droppable.append(False)
                token_seqs.append([self.fa_dict[c] for c in chars])

        keep_indices = [i for i, d in enumerate(droppable) if not d]
        if not keep_indices:
            self._uniform_fill(segments)
            return

        flat = [t for i in keep_indices for t in token_seqs[i]]
        targets = torch.tensor([flat], dtype=torch.int32, device="cuda")
        wave = (
            torch.from_numpy(np.asarray(audio_16k, dtype=np.float32))
            .unsqueeze(0)
            .to("cuda")
        )

        try:
            with torch.inference_mode():
                emission, _ = self.fa_model(wave)
                alignments, scores = torchaudio.functional.forced_align(
                    emission, targets, blank=0
                )
        except Exception as e:
            print(f"global forced_align failed ({e}); using uniform fallback")
            self._uniform_fill(segments)
            return

        token_spans = torchaudio.functional.merge_tokens(alignments[0], scores[0])
        # frames -> seconds
        ratio = len(audio_16k) / emission.shape[1] / self.fa_sample_rate

        # Walk token_spans alongside the kept words and assign times.
        all_word_times: list[tuple[float, float]] = [(-1.0, -1.0)] * len(flat_words)
        cursor = 0
        for global_idx in keep_indices:
            n = len(token_seqs[global_idx])
            if n == 0:
                continue
            spans = token_spans[cursor : cursor + n]
            cursor += n
            if not spans:
                continue
            all_word_times[global_idx] = (
                float(spans[0].start * ratio),
                float(spans[-1].end * ratio),
            )

        # Patch any dropped (un-alignable) words by interpolating between
        # neighbours.
        for i, (s, _e) in enumerate(all_word_times):
            if s < 0:
                # find nearest aligned neighbours
                prev_t = next(
                    (
                        all_word_times[j][1]
                        for j in range(i - 1, -1, -1)
                        if all_word_times[j][0] >= 0
                    ),
                    0.0,
                )
                next_t = next(
                    (
                        all_word_times[j][0]
                        for j in range(i + 1, len(all_word_times))
                        if all_word_times[j][0] >= 0
                    ),
                    prev_t,
                )
                all_word_times[i] = (prev_t, next_t)

        # Distribute back into segments and set start/end from word boundaries.
        cursor = 0
        for seg, n in zip(segments, seg_word_counts):
            if n == 0:
                seg["words"] = []
                # Keep raw_start/raw_end as-is; nothing better available.
                continue
            seg_words = []
            for j in range(n):
                w_text = flat_words[cursor + j]
                ws, we = all_word_times[cursor + j]
                seg_words.append({"word": w_text, "start": ws, "end": we})
            cursor += n
            seg["words"] = seg_words
            seg["start"] = seg_words[0]["start"]
            seg["end"] = seg_words[-1]["end"]

    def _uniform_fill(self, segments: list[dict[str, Any]]) -> None:
        """Last-resort: spread VibeVoice raw start/end uniformly across each segment's words."""
        for seg in segments:
            words_text = seg["text"].split()
            seg["words"] = _uniform_words(words_text, seg["raw_start"], seg["raw_end"])


def _drop_duplicate_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop a segment whose text is fully contained in the previous segment's text.

    VibeVoice sometimes emits a "tail" segment that just repeats the last
    sentence of the previous one (we observed this on Harvard-list audio).
    The duplicate has bogus timestamps, so its presence can drag a global FA
    pass into the wrong region.
    """
    out: list[dict[str, Any]] = []
    for seg in segments:
        text = seg["text"].strip()
        if out and text:
            prev_text = out[-1]["text"].strip()
            # Drop if this segment's text is contained in the previous one
            # (or vice versa, which would mean the previous was a stub).
            if text in prev_text or prev_text in text:
                continue
        out.append(seg)
    return out


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

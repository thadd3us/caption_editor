"""Recognizer abstraction for ASR.

Defines a Protocol so that bulk_cli can swap real ASR models for a fast
MockRecognizer in tests.  Implementations return **raw** chunked ASR segments only;
callers run :func:`asr_results_to_captions.post_process_raw_asr_segments` before
building a document.

Why a Protocol instead of an ABC:
  The codebase uses functions + Typer, not class hierarchies.
  A Protocol gives duck-typing polymorphism without requiring inheritance.

Why MockRecognizer lives here (not in test code):
  It is also useful from the CLI (``--recognizer mock``) for dry-run /
  integration testing without downloading multi-GB model weights.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Protocol, runtime_checkable

import soundfile as sf

from asr_results_to_captions import ASRSegment, WordTimestamp


@runtime_checkable
class Recognizer(Protocol):
    """Anything that can transcribe a WAV file into ASRSegments."""

    def transcribe(
        self,
        wav_path: Path,
        chunk_size: int,
        overlap: int,
        max_intra_segment_gap_seconds: float,
        max_segment_duration_seconds: float,
    ) -> List[ASRSegment]: ...


# ---------------------------------------------------------------------------
# Mock recognizer — deterministic, no model download
# ---------------------------------------------------------------------------

# Segment every MOCK_SEGMENT_INTERVAL seconds of audio.
MOCK_SEGMENT_INTERVAL = 3.0
# Words per mock segment.
MOCK_WORDS_PER_SEGMENT = 4


class MockRecognizer:
    """Generates deterministic segments based on audio duration.

    Useful for:
    - Fast pytest tests that exercise the full pipeline without ML models.
    - ``bulk_cli --recognizer mock`` dry runs.

    Each segment is MOCK_SEGMENT_INTERVAL seconds long and contains
    MOCK_WORDS_PER_SEGMENT evenly-spaced words like "mock_0", "mock_1", etc.

    Does not run overlap merge or gap/long-segment post-processing; callers should
    pass the result through :func:`post_process_raw_asr_segments` like real ASR.
    """

    def transcribe(
        self,
        wav_path: Path,
        chunk_size: int = 60,
        overlap: int = 5,
        max_intra_segment_gap_seconds: float = 0.50,
        max_segment_duration_seconds: float = 10.0,
    ) -> List[ASRSegment]:
        info = sf.info(wav_path)
        duration = info.duration

        segments: List[ASRSegment] = []
        t = 0.0
        seg_idx = 0
        while t < duration:
            seg_end = min(t + MOCK_SEGMENT_INTERVAL, duration)
            # Don't create tiny trailing segments
            if seg_end - t < 0.1:
                break

            word_dur = (seg_end - t) / MOCK_WORDS_PER_SEGMENT
            words: List[WordTimestamp] = []
            for w in range(MOCK_WORDS_PER_SEGMENT):
                ws = t + w * word_dur
                we = ws + word_dur
                words.append(WordTimestamp(word=f"mock_{w}", start=ws, end=we))

            text = " ".join(w.word for w in words)
            segments.append(
                ASRSegment(
                    text=text,
                    start=t,
                    end=seg_end,
                    words=words,
                )
            )
            t = seg_end
            seg_idx += 1

        return segments


# ---------------------------------------------------------------------------
# Real recognizer wrappers — thin shells around extracted functions
# ---------------------------------------------------------------------------


class NemoRecognizer:
    """Wraps a pre-loaded NeMo ASR model."""

    def __init__(self, model_name: str, device: str | None = None):
        from transcribe_cli import load_asr_model

        self.model, _ = load_asr_model(model_name, device)
        self.model_name = model_name

    def transcribe(
        self,
        wav_path: Path,
        chunk_size: int = 60,
        overlap: int = 5,
        max_intra_segment_gap_seconds: float = 0.50,
        max_segment_duration_seconds: float = 10.0,
    ) -> List[ASRSegment]:
        from transcribe_cli import transcribe_audio_file

        return transcribe_audio_file(
            wav_path,
            self.model,
            True,
            self.model_name,
            chunk_size=chunk_size,
            overlap=overlap,
            max_intra_segment_gap_seconds=max_intra_segment_gap_seconds,
            max_segment_duration_seconds=max_segment_duration_seconds,
        )


class TransformersRecognizer:
    """Wraps a pre-loaded HuggingFace Transformers ASR pipeline."""

    def __init__(self, model_name: str, device: str | None = None):
        from transcribe_cli import load_asr_model

        self.pipeline, _ = load_asr_model(model_name, device)
        self.model_name = model_name

    def transcribe(
        self,
        wav_path: Path,
        chunk_size: int = 60,
        overlap: int = 5,
        max_intra_segment_gap_seconds: float = 0.50,
        max_segment_duration_seconds: float = 10.0,
    ) -> List[ASRSegment]:
        from transcribe_cli import transcribe_audio_file

        return transcribe_audio_file(
            wav_path,
            self.pipeline,
            False,
            self.model_name,
            chunk_size=chunk_size,
            overlap=overlap,
            max_intra_segment_gap_seconds=max_intra_segment_gap_seconds,
            max_segment_duration_seconds=max_segment_duration_seconds,
        )


def create_recognizer(
    model_name: str, device: str | None = None, mock: bool = False
) -> Recognizer:
    """Factory: create the right Recognizer for a model name.

    Args:
        model_name: HuggingFace model id.
        device: 'cuda' or 'cpu'.  Auto-detected if None.
        mock: If True, return a MockRecognizer (ignores model_name).
    """
    if mock:
        return MockRecognizer()

    is_nemo = "parakeet" in model_name.lower() or "nvidia" in model_name.lower()
    if is_nemo:
        return NemoRecognizer(model_name, device)
    else:
        return TransformersRecognizer(model_name, device)

"""Unit tests for the complete post-processing pipeline using real ASR outputs.

These tests use captured raw ASR outputs as fixtures, so they run fast without
needing to actually run the ASR models.
"""

import json
from pathlib import Path

import pytest
from syrupy.extensions.amber import AmberSnapshotExtension

from asr_results_to_vtt import (
    parse_parakeet_raw_chunk,
    parse_whisper_raw_chunk,
    post_process_asr_segments,
)


class SingleFileSnapshotExtension(AmberSnapshotExtension):
    """Custom syrupy extension that creates one snapshot file per test."""

    @classmethod
    def dirname(cls, *, test_location) -> str:
        """Use a single directory for all snapshots."""
        return str(Path(test_location.filepath).parent / "__snapshots__")

    @classmethod
    def get_file_basename(cls, *, test_location, index) -> str:
        """Create file basename that includes test name for one file per test."""
        # Use test name as the file basename so each test gets its own file
        return test_location.testname


@pytest.fixture
def snapshot(snapshot):
    """Override snapshot fixture to use single-file extension for this test file."""
    return snapshot.use_extension(SingleFileSnapshotExtension)


def load_and_parse_fixture(
    fixture_name: str,
    parser_func,
    chunk_size: float,
    overlap: float,
) -> list:
    """Load raw ASR JSON fixture and parse into ASRSegment list.

    Args:
        fixture_name: Name of the JSON fixture file
        parser_func: Function to parse each chunk (parse_whisper_raw_chunk or parse_parakeet_raw_chunk)
        chunk_size: Size of audio chunks in seconds
        overlap: Overlap between chunks in seconds

    Returns:
        List of ASRSegment objects
    """
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / fixture_name
    chunks_data = json.load(open(fixture_path))

    all_segments = []
    for chunk_idx, chunk in enumerate(chunks_data):
        # Calculate the start time for this chunk
        # Chunks overlap, so each chunk starts at (chunk_idx * (chunk_size - overlap))
        chunk_start = chunk_idx * (chunk_size - overlap)
        segments = parser_func(chunk, chunk_start=chunk_start)
        all_segments.extend(segments)

    return all_segments


def format_result(cues: list) -> dict:
    """Format cues for snapshot comparison."""
    return {
        "num_cues": len(cues),
        "cues": [
            {
                "start_time": cue.start_time,
                "end_time": cue.end_time,
                "duration": cue.end_time - cue.start_time,
                "text": cue.text,
            }
            for cue in cues
        ],
    }


@pytest.mark.parametrize(
    "model,chunk_size",
    [
        ("whisper", 10),
        ("whisper", 60),
        ("parakeet", 10),
        ("parakeet", 60),
    ],
)
def test_asr_post_processing_pipeline(model: str, chunk_size: int, snapshot):
    """Test post-processing pipeline with different ASR models and chunk sizes.

    This test uses real raw ASR outputs captured from Whisper and Parakeet,
    and sends them through the complete post-processing pipeline:
    1. Parse raw ASR output into segments with word timestamps
    2. Resolve overlaps from chunked processing
    3. Group segments by gap (merge words into sentences)
    4. Split long segments

    Args:
        model: ASR model name ("whisper" or "parakeet")
        chunk_size: Audio chunk size in seconds (10 or 60)
        snapshot: Syrupy snapshot fixture
    """
    # Select parser based on model
    parser_func = (
        parse_whisper_raw_chunk if model == "whisper" else parse_parakeet_raw_chunk
    )

    # Load and parse fixture
    fixture_name = f"{model}_chunked_{chunk_size}s_raw_output.json"
    segments = load_and_parse_fixture(
        fixture_name=fixture_name,
        parser_func=parser_func,
        chunk_size=float(chunk_size),
        overlap=5.0,  # Standard 5s overlap
    )

    # Run production post-processing pipeline (same as transcribe.py)
    cues = post_process_asr_segments(
        segments=segments,
        chunk_size=float(chunk_size),
        overlap=5.0,
        gap_threshold=0.2
        if model == "whisper"
        else 2.0,  # Whisper groups at 200ms, Parakeet splits at 2s
        max_duration=10.0,  # Max 10s per segment
        is_whisper=(model == "whisper"),
    )

    # Compare with snapshot
    assert format_result(cues) == snapshot

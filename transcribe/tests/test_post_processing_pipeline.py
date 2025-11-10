"""Unit tests for the complete post-processing pipeline using real Whisper outputs.

These tests use captured raw ASR outputs as fixtures, so they run fast without
needing to actually run the ASR models.
"""

import json
from pathlib import Path

from asr_results_to_vtt import (
    asr_segments_to_vtt_cues,
    group_segments_by_gap,
    parse_transformers_result_with_words,
    resolve_overlap_conflicts,
    split_long_segments,
)


def run_full_file_pipeline(fixture_name: str, gap_threshold: float = 0.2, max_duration: float = 10.0) -> list:
    """Run post-processing pipeline on full-file fixture."""
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / fixture_name
    data = json.load(open(fixture_path))
    segments = parse_transformers_result_with_words(data, chunk_start=0.0)
    segments = group_segments_by_gap(segments, max_gap_seconds=gap_threshold)
    segments = split_long_segments(segments, max_duration_seconds=max_duration)
    return asr_segments_to_vtt_cues(segments)


def run_chunked_pipeline(
    fixture_name: str, chunk_size: float, overlap: float, gap_threshold: float = 0.2, max_duration: float = 10.0
) -> list:
    """Run post-processing pipeline on chunked fixture."""
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / fixture_name
    chunks_data = json.load(open(fixture_path))
    all_segments = []
    for chunk in chunks_data:
        segments = parse_transformers_result_with_words(chunk, chunk_start=0.0)
        all_segments.extend(segments)
    segments = resolve_overlap_conflicts(all_segments, chunk_size, overlap)
    segments = group_segments_by_gap(segments, max_gap_seconds=gap_threshold)
    segments = split_long_segments(segments, max_duration_seconds=max_duration)
    return asr_segments_to_vtt_cues(segments)


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


def test_full_file_processing(snapshot):
    """Test post-processing pipeline on full-file Whisper output."""
    cues = run_full_file_pipeline("whisper_full_file_raw_output.json")
    assert format_result(cues) == snapshot


def test_chunked_10s_processing(snapshot):
    """Test post-processing pipeline on 10s chunked Whisper output.

    NOTE: 10s chunks have poor word-level timestamps - Whisper extends word
    durations to fill time, hiding sentence boundaries.
    """
    cues = run_chunked_pipeline("whisper_chunked_10s_raw_output.json", chunk_size=10.0, overlap=5.0)
    assert format_result(cues) == snapshot

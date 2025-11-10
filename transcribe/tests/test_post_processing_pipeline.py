"""Unit tests for the complete post-processing pipeline using real Whisper outputs.

These tests use captured raw ASR outputs as fixtures, so they run fast without
needing to actually run the ASR models.
"""

import json
from pathlib import Path

from asr_results_to_vtt import (
    ASRSegment,
    WordTimestamp,
    asr_segments_to_vtt_cues,
    resolve_overlap_conflicts,
    split_long_segments,
    split_segments_by_word_gap,
)


def whisper_words_to_segments(words: list, chunk_start: float = 0.0) -> list[ASRSegment]:
    """Convert Whisper word-level output to ASRSegment list.

    For Whisper, we group all words into one big segment, then let the splitting
    logic break it apart based on gaps and duration.
    """
    if not words:
        return []

    word_objs = [
        WordTimestamp(
            word=w["text"],
            start=chunk_start + w["timestamp"][0],
            end=chunk_start + w["timestamp"][1],
        )
        for w in words
    ]

    text = " ".join(w.word for w in word_objs).strip()
    return [ASRSegment(text=text, start=word_objs[0].start, end=word_objs[-1].end, words=word_objs)]


def run_full_file_pipeline(fixture_name: str, gap_threshold: float = 0.2, max_duration: float = 10.0) -> list:
    """Run post-processing pipeline on full-file fixture."""
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / fixture_name
    data = json.load(open(fixture_path))
    segments = whisper_words_to_segments(data["chunks"])
    segments = split_segments_by_word_gap(segments, max_gap_seconds=gap_threshold)
    segments = split_long_segments(segments, max_duration_seconds=max_duration)
    return asr_segments_to_vtt_cues(segments)


def run_chunked_pipeline(
    fixture_name: str, chunk_size: float, overlap: float, gap_threshold: float = 0.2, max_duration: float = 10.0
) -> list:
    """Run post-processing pipeline on chunked fixture."""
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / fixture_name
    chunks_data = json.load(open(fixture_path))
    all_segments = [whisper_words_to_segments(chunk["chunks"]) for chunk in chunks_data]
    all_segments = [seg for segments in all_segments for seg in segments]  # Flatten
    segments = resolve_overlap_conflicts(all_segments, chunk_size, overlap)
    segments = split_segments_by_word_gap(segments, max_gap_seconds=gap_threshold)
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


def test_pipeline_step_counts():
    """Verify the number of segments after each pipeline step."""
    # Full file: should produce multiple sentence-level segments
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / "whisper_full_file_raw_output.json"
    data = json.load(open(fixture_path))
    segments = whisper_words_to_segments(data["chunks"])
    assert len(segments) == 1, "Initial: one big segment"

    after_gap = split_segments_by_word_gap(segments, 0.2)
    assert len(after_gap) > 1, "After gap split: multiple segments"

    after_duration = split_long_segments(after_gap, 10.0)
    assert len(after_duration) >= len(after_gap), "Duration split preserves or increases count"

    cues = asr_segments_to_vtt_cues(after_duration)
    assert len(cues) == len(after_duration), "One cue per segment"

    # Chunked: overlap resolution should reduce duplicates
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / "whisper_chunked_10s_raw_output.json"
    chunks_data = json.load(open(fixture_path))
    all_segments = [whisper_words_to_segments(chunk["chunks"]) for chunk in chunks_data]
    all_segments = [seg for segments in all_segments for seg in segments]

    assert len(all_segments) == len(chunks_data), "One segment per chunk"

    after_overlap = resolve_overlap_conflicts(all_segments, 10.0, 5.0)
    assert len(after_overlap) <= len(all_segments), "Overlap resolution removes duplicates"

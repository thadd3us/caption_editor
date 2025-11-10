"""Unit tests for the complete post-processing pipeline using real Whisper outputs.

These tests use captured raw ASR outputs as fixtures, so they run fast without
needing to actually run the ASR models.
"""

import json
from pathlib import Path

import pytest

from asr_results_to_vtt import (
    ASRSegment,
    WordTimestamp,
    asr_segments_to_vtt_cues,
    resolve_overlap_conflicts,
    split_long_segments,
    split_segments_by_word_gap,
)


def load_whisper_fixture(filename: str) -> dict:
    """Load a Whisper raw output fixture."""
    fixture_path = Path(__file__).parent.parent / "test_fixtures" / filename
    with open(fixture_path) as f:
        return json.load(f)


def whisper_words_to_segments(words: list, chunk_start: float = 0.0) -> list:
    """Convert Whisper word-level output to ASRSegment list.

    For Whisper, we group all words into one big segment, then let the splitting
    logic break it apart based on gaps and duration.
    """
    if not words:
        return []

    # Create WordTimestamp objects
    word_objs = []
    for word_data in words:
        word_objs.append(
            WordTimestamp(
                word=word_data["text"],
                start=chunk_start + word_data["timestamp"][0],
                end=chunk_start + word_data["timestamp"][1],
            )
        )

    # Group all words into one big segment
    text = " ".join(w.word for w in word_objs).strip()
    return [
        ASRSegment(
            text=text,
            start=word_objs[0].start,
            end=word_objs[-1].end,
            words=word_objs,
        )
    ]


def test_full_file_processing(snapshot):
    """Test post-processing pipeline on full-file Whisper output.

    Pipeline:
    1. Group words into one segment (Whisper-specific)
    2. Split by word gaps (0.2s threshold)
    3. Split by duration (10s max)
    4. Convert to VTT cues

    No overlap resolution needed for full-file processing.
    """
    # Load fixture
    data = load_whisper_fixture("whisper_full_file_raw_output.json")

    # Step 1: Convert to ASRSegments (one big segment with all words)
    segments = whisper_words_to_segments(data["chunks"])
    assert len(segments) == 1, "Should have one big segment initially"

    # Step 2: Split by word gaps (0.2s threshold)
    after_gap_split = split_segments_by_word_gap(segments, max_gap_seconds=0.2)

    # Step 3: Split by duration (10s max)
    after_duration_split = split_long_segments(after_gap_split, max_duration_seconds=10.0)

    # Step 4: Convert to VTT cues
    cues = asr_segments_to_vtt_cues(after_duration_split)

    # Snapshot the results
    result = {
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

    assert result == snapshot


def test_chunked_10s_processing(snapshot):
    """Test post-processing pipeline on 10s chunked Whisper output.

    NOTE: 10s chunks have poor word-level timestamps - Whisper extends word
    durations to fill time, hiding sentence boundaries. This results in fewer,
    longer segments. For better results, use 20s+ chunks or full-file processing.

    Pipeline:
    1. Group words into one segment per chunk (Whisper-specific)
    2. Resolve overlaps from chunked processing
    3. Split by word gaps (not effective for 10s chunks - no gaps preserved)
    4. Split by duration (10s max)
    5. Convert to VTT cues
    """
    # Load fixture
    chunks_data = load_whisper_fixture("whisper_chunked_10s_raw_output.json")

    # Step 1: Convert each chunk to ASRSegments (one segment per chunk with all words)
    all_segments = []
    for chunk in chunks_data:
        chunk_start = chunk["chunk_start_time"]
        segments = whisper_words_to_segments(chunk["chunks"], chunk_start=0.0)
        # Adjust times to absolute (already done in fixture)
        all_segments.extend(segments)

    # Step 2: Resolve overlaps from chunked processing
    chunk_size = 10.0
    overlap = 5.0
    after_overlap = resolve_overlap_conflicts(all_segments, chunk_size, overlap)

    # Step 3: Split by word gaps (0.2s threshold - won't find any in 10s chunks!)
    after_gap_split = split_segments_by_word_gap(after_overlap, max_gap_seconds=0.2)

    # Step 4: Split by duration (10s max) - this does the real work for 10s chunks
    after_duration_split = split_long_segments(after_gap_split, max_duration_seconds=10.0)

    # Step 5: Convert to VTT cues
    cues = asr_segments_to_vtt_cues(after_duration_split)

    # Snapshot the results
    result = {
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

    assert result == snapshot


def test_chunked_20s_processing(snapshot):
    """Test post-processing pipeline on 20s chunked Whisper output.

    Pipeline:
    1. Group words into one segment per chunk (Whisper-specific)
    2. Resolve overlaps from chunked processing
    3. Split by word gaps (0.2s threshold)
    4. Split by duration (10s max)
    5. Convert to VTT cues
    """
    # Load fixture
    chunks_data = load_whisper_fixture("whisper_chunked_20s_raw_output.json")

    # Step 1: Convert each chunk to ASRSegments (one segment per chunk with all words)
    all_segments = []
    for chunk in chunks_data:
        chunk_start = chunk["chunk_start_time"]
        segments = whisper_words_to_segments(chunk["chunks"], chunk_start=0.0)
        all_segments.extend(segments)

    # Step 2: Resolve overlaps from chunked processing
    chunk_size = 20.0
    overlap = 5.0
    after_overlap = resolve_overlap_conflicts(all_segments, chunk_size, overlap)

    # Step 3: Split by word gaps (0.2s threshold)
    after_gap_split = split_segments_by_word_gap(after_overlap, max_gap_seconds=0.2)

    # Step 4: Split by duration (10s max)
    after_duration_split = split_long_segments(after_gap_split, max_duration_seconds=10.0)

    # Step 5: Convert to VTT cues
    cues = asr_segments_to_vtt_cues(after_duration_split)

    # Snapshot the results
    result = {
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

    assert result == snapshot


def test_pipeline_step_counts():
    """Verify the number of segments after each pipeline step.

    This test documents how the pipeline transforms the data.
    """
    # Full file processing
    data = load_whisper_fixture("whisper_full_file_raw_output.json")
    segments = whisper_words_to_segments(data["chunks"])

    assert len(segments) == 1, "Initial: one big segment"

    after_gap = split_segments_by_word_gap(segments, 0.2)
    assert len(after_gap) > 1, "After gap split: multiple sentence-level segments"

    after_duration = split_long_segments(after_gap, 10.0)
    # May be same or more segments if any were too long
    assert len(after_duration) >= len(after_gap)

    cues = asr_segments_to_vtt_cues(after_duration)
    assert len(cues) == len(after_duration), "One cue per segment"

    # Chunked processing
    chunks_data = load_whisper_fixture("whisper_chunked_10s_raw_output.json")
    all_segments = []
    for chunk in chunks_data:
        segments = whisper_words_to_segments(chunk["chunks"], chunk_start=0.0)
        all_segments.extend(segments)

    assert len(all_segments) == len(chunks_data), "One segment per chunk initially"

    after_overlap = resolve_overlap_conflicts(all_segments, 10.0, 5.0)
    assert len(after_overlap) <= len(all_segments), "Overlap resolution removes duplicates"

    after_gap = split_segments_by_word_gap(after_overlap, 0.2)
    assert len(after_gap) >= len(after_overlap), "Gap split increases segment count"

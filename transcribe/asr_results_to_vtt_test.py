"""Tests for ASR result processing and segment splitting."""

from asr_results_to_vtt import (
    ASRSegment,
    WordTimestamp,
    asr_segments_to_vtt_cues,
    split_long_segments,
    split_segments_by_word_gap,
)


def test_split_segments_by_word_gap_no_split():
    """Test that segments with small gaps are not split."""
    segments = [
        ASRSegment(
            text="The birch canoe slid",
            start=0.0,
            end=2.0,
            words=[
                WordTimestamp("The", 0.0, 0.5),
                WordTimestamp("birch", 0.6, 1.0),
                WordTimestamp("canoe", 1.1, 1.5),
                WordTimestamp("slid", 1.6, 2.0),
            ],
        ),
    ]

    result = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    assert len(result) == 1
    assert result[0].text == "The birch canoe slid"
    assert len(result[0].words) == 4


def test_split_segments_by_word_gap_with_split():
    """Test that segments with large gaps are split."""
    segments = [
        ASRSegment(
            text="The birch canoe slid",
            start=0.0,
            end=10.0,
            words=[
                WordTimestamp("The", 0.0, 0.5),
                WordTimestamp("birch", 0.6, 1.0),
                # Large gap here (5 seconds)
                WordTimestamp("canoe", 6.0, 6.5),
                WordTimestamp("slid", 6.6, 7.0),
            ],
        ),
    ]

    result = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    assert len(result) == 2
    assert result[0].text == "The birch"
    assert result[0].start == 0.0
    assert result[0].end == 1.0
    assert len(result[0].words) == 2

    assert result[1].text == "canoe slid"
    assert result[1].start == 6.0
    assert result[1].end == 7.0
    assert len(result[1].words) == 2


def test_split_segments_by_word_gap_multiple_splits():
    """Test that segments can be split multiple times."""
    segments = [
        ASRSegment(
            text="The birch canoe slid on smooth",
            start=0.0,
            end=15.0,
            words=[
                WordTimestamp("The", 0.0, 0.5),
                WordTimestamp("birch", 0.6, 1.0),
                # Large gap (3 seconds)
                WordTimestamp("canoe", 4.0, 4.5),
                WordTimestamp("slid", 4.6, 5.0),
                # Large gap (5 seconds)
                WordTimestamp("on", 10.0, 10.3),
                WordTimestamp("smooth", 10.4, 11.0),
            ],
        ),
    ]

    result = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    assert len(result) == 3
    assert result[0].text == "The birch"
    assert result[1].text == "canoe slid"
    assert result[2].text == "on smooth"


def test_split_segments_by_word_gap_empty_words():
    """Test segments with no words."""
    segments = [
        ASRSegment(
            text="",
            start=0.0,
            end=1.0,
            words=[],
        ),
    ]

    result = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    assert len(result) == 1
    assert result[0].text == ""
    assert len(result[0].words) == 0


def test_split_segments_by_word_gap_single_word():
    """Test segment with single word."""
    segments = [
        ASRSegment(
            text="Hello",
            start=0.0,
            end=1.0,
            words=[
                WordTimestamp("Hello", 0.0, 1.0),
            ],
        ),
    ]

    result = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    assert len(result) == 1
    assert result[0].text == "Hello"
    assert len(result[0].words) == 1


def test_split_long_segments_no_split():
    """Test that short segments are not split."""
    segments = [
        ASRSegment(
            text="The birch canoe slid",
            start=0.0,
            end=5.0,
            words=[
                WordTimestamp("The", 0.0, 1.0),
                WordTimestamp("birch", 1.0, 2.0),
                WordTimestamp("canoe", 2.0, 3.0),
                WordTimestamp("slid", 3.0, 4.0),
            ],
        ),
    ]

    result = split_long_segments(segments, max_duration_seconds=10.0)

    assert len(result) == 1
    assert result[0].text == "The birch canoe slid"
    assert len(result[0].words) == 4


def test_split_long_segments_with_split():
    """Test that long segments are split at appropriate word boundaries."""
    segments = [
        ASRSegment(
            text="The birch canoe slid on the smooth planks yesterday",
            start=0.0,
            end=25.0,
            words=[
                WordTimestamp("The", 0.0, 2.0),
                WordTimestamp("birch", 2.0, 4.0),
                WordTimestamp("canoe", 4.0, 6.0),
                WordTimestamp("slid", 6.0, 8.0),
                WordTimestamp("on", 8.0, 9.0),
                # This word ends at 10.0, exactly at max_duration
                WordTimestamp("the", 9.0, 10.0),
                # These words would exceed max_duration, so split before them
                WordTimestamp("smooth", 11.0, 13.0),
                WordTimestamp("planks", 13.0, 15.0),
                WordTimestamp("yesterday", 15.0, 18.0),
            ],
        ),
    ]

    result = split_long_segments(segments, max_duration_seconds=10.0)

    # Should be split after "the" (at 10.0 seconds)
    assert len(result) == 2

    # First segment: words up to 10.0 seconds
    assert result[0].text == "The birch canoe slid on the"
    assert result[0].start == 0.0
    assert result[0].end == 10.0
    assert len(result[0].words) == 6

    # Second segment: remaining words
    assert result[1].text == "smooth planks yesterday"
    assert result[1].start == 11.0
    assert result[1].end == 18.0
    assert len(result[1].words) == 3


def test_split_long_segments_multiple_splits():
    """Test that very long segments can be split multiple times."""
    # Create a segment with words every 3 seconds for 30 seconds
    words = [
        WordTimestamp(f"word{i}", i * 3.0, (i + 1) * 3.0 - 0.5)
        for i in range(10)
    ]

    segments = [
        ASRSegment(
            text=" ".join(w.word for w in words),
            start=0.0,
            end=29.5,
            words=words,
        ),
    ]

    result = split_long_segments(segments, max_duration_seconds=10.0)

    # With 3-second words and 10-second max:
    # - word0 (0-2.5), word1 (3-5.5), word2 (6-8.5) = 8.5s duration -> segment 1
    # - word3 (9-11.5), word4 (12-14.5), word5 (15-17.5) = 8.5s duration -> segment 2
    # - word6 (18-20.5), word7 (21-23.5), word8 (24-26.5) = 8.5s duration -> segment 3
    # - word9 (27-29.5) -> segment 4

    assert len(result) == 4
    assert len(result[0].words) == 3
    assert len(result[1].words) == 3
    assert len(result[2].words) == 3
    assert len(result[3].words) == 1


def test_split_long_segments_single_word():
    """Test that single-word segments are not split even if too long."""
    segments = [
        ASRSegment(
            text="Supercalifragilisticexpialidocious",
            start=0.0,
            end=15.0,
            words=[
                WordTimestamp("Supercalifragilisticexpialidocious", 0.0, 15.0),
            ],
        ),
    ]

    result = split_long_segments(segments, max_duration_seconds=10.0)

    assert len(result) == 1
    assert result[0].text == "Supercalifragilisticexpialidocious"


def test_split_long_segments_empty_words():
    """Test segments with no words."""
    segments = [
        ASRSegment(
            text="",
            start=0.0,
            end=15.0,
            words=[],
        ),
    ]

    result = split_long_segments(segments, max_duration_seconds=10.0)

    assert len(result) == 1
    assert result[0].text == ""


def test_combined_splitting_pipeline():
    """Test that both splitting functions work together correctly."""
    # Create a segment with both large gaps AND long duration
    segments = [
        ASRSegment(
            text="The birch canoe slid on the smooth planks",
            start=0.0,
            end=30.0,
            words=[
                WordTimestamp("The", 0.0, 1.0),
                WordTimestamp("birch", 1.5, 2.5),
                # Large gap (5 seconds) - should split here first
                WordTimestamp("canoe", 7.5, 8.5),
                WordTimestamp("slid", 9.0, 10.0),
                WordTimestamp("on", 10.5, 11.0),
                WordTimestamp("the", 11.5, 12.0),
                WordTimestamp("smooth", 12.5, 13.0),
                # Another large gap (5 seconds)
                WordTimestamp("planks", 18.0, 19.0),
            ],
        ),
    ]

    # First pass: split by word gaps
    after_gap_split = split_segments_by_word_gap(segments, max_gap_seconds=2.0)

    # Should have 3 segments now
    assert len(after_gap_split) == 3

    # Second pass: split by duration
    final = split_long_segments(after_gap_split, max_duration_seconds=10.0)

    # The middle segment (7.5-13.0 = 5.5s duration) is under 10s, so no additional splits
    # Should still have 3 segments
    assert len(final) >= 3


def test_asr_segments_to_vtt_cues():
    """Test conversion from ASRSegment to VTTCue."""
    segments = [
        ASRSegment(
            text="The birch canoe slid",
            start=0.24,
            end=3.44,
            words=[
                WordTimestamp("The", 0.24, 0.56),
                WordTimestamp("birch", 0.56, 1.12),
                WordTimestamp("canoe", 1.12, 1.6),
                WordTimestamp("slid", 1.6, 2.0),
            ],
        ),
        ASRSegment(
            text="Glue the sheet",
            start=4.0,
            end=7.12,
            words=[
                WordTimestamp("Glue", 4.0, 4.5),
                WordTimestamp("the", 4.6, 4.9),
                WordTimestamp("sheet", 5.0, 5.5),
            ],
        ),
    ]

    cues = asr_segments_to_vtt_cues(segments)

    assert len(cues) == 2

    assert cues[0].text == "The birch canoe slid"
    assert cues[0].start_time == 0.24
    assert cues[0].end_time == 3.44
    assert cues[0].id == ""  # Not set yet

    assert cues[1].text == "Glue the sheet"
    assert cues[1].start_time == 4.0
    assert cues[1].end_time == 7.12
    assert cues[1].id == ""  # Not set yet


def test_asr_segments_to_vtt_cues_empty_text():
    """Test that segments with empty text are skipped."""
    segments = [
        ASRSegment(
            text="Valid text",
            start=0.0,
            end=1.0,
            words=[WordTimestamp("Valid", 0.0, 0.5), WordTimestamp("text", 0.5, 1.0)],
        ),
        ASRSegment(
            text="   ",  # Whitespace only
            start=1.0,
            end=2.0,
            words=[],
        ),
        ASRSegment(
            text="More valid text",
            start=2.0,
            end=3.0,
            words=[WordTimestamp("More", 2.0, 2.3), WordTimestamp("valid", 2.3, 2.6), WordTimestamp("text", 2.6, 3.0)],
        ),
    ]

    cues = asr_segments_to_vtt_cues(segments)

    assert len(cues) == 2
    assert cues[0].text == "Valid text"
    assert cues[1].text == "More valid text"

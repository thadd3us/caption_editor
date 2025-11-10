"""
Library for transforming ASR results into VTT cues.

This module provides functions to convert ASR output (with word-level timestamps)
into VTTCue objects, including segment splitting logic based on gaps and duration.
"""

from dataclasses import dataclass
from typing import List, Optional

from schema import VTTCue


@dataclass
class WordTimestamp:
    """Unified word-level timestamp representation.

    This format is compatible with both NeMo and Transformers ASR outputs.
    """
    word: str
    start: float
    end: float


@dataclass
class ASRSegment:
    """ASR segment with word-level timestamps.

    Represents a segment of transcribed text with timing information
    for the entire segment and for each word within it.
    """
    text: str
    start: float
    end: float
    words: List[WordTimestamp]


def parse_nemo_segment(segment_data: dict, word_data: List[dict]) -> ASRSegment:
    """Parse NeMo ASR output into ASRSegment format.

    Args:
        segment_data: Segment dict from NeMo output.timestamp['segment']
        word_data: All words from NeMo output.timestamp['word']

    Returns:
        ASRSegment with word-level timestamps
    """
    segment_text = segment_data['segment']
    segment_start = segment_data['start']
    segment_end = segment_data['end']

    # Find words that belong to this segment based on time overlap
    segment_words = []
    for word in word_data:
        # Word belongs to segment if it overlaps with segment time range
        if word['start'] >= segment_start and word['end'] <= segment_end:
            segment_words.append(WordTimestamp(
                word=word['word'],
                start=word['start'],
                end=word['end'],
            ))

    return ASRSegment(
        text=segment_text,
        start=segment_start,
        end=segment_end,
        words=segment_words,
    )


def parse_transformers_segment(chunk_data: dict, all_chunks: List[dict]) -> Optional[ASRSegment]:
    """Parse Transformers ASR output into ASRSegment format.

    When using return_timestamps="word", Transformers returns individual word chunks.
    We need to group consecutive words into segments.

    Args:
        chunk_data: Current chunk (could be word-level or segment-level)
        all_chunks: All chunks from Transformers pipeline

    Returns:
        ASRSegment or None if this chunk should be skipped
    """
    # Check if this is word-level (tuple timestamp) or segment-level (already grouped)
    timestamp = chunk_data.get('timestamp')

    if timestamp is None:
        return None

    if isinstance(timestamp, tuple):
        # Word-level timestamp - create segment with single word
        start, end = timestamp
        if start is None or end is None:
            return None

        return ASRSegment(
            text=chunk_data['text'],
            start=start,
            end=end,
            words=[WordTimestamp(
                word=chunk_data['text'],
                start=start,
                end=end,
            )],
        )

    return None


def group_whisper_words_into_segments(chunks: List[dict]) -> List[ASRSegment]:
    """Convert Whisper word-level chunks into individual word segments.

    Whisper with return_timestamps="word" gives us individual words.
    We create one tiny segment per word, and let the gap-based splitting
    handle grouping them into proper sentence-level segments.

    This approach allows overlap resolution to work on word-level granularity
    before we group into sentences.

    Args:
        chunks: Word-level chunks from Whisper pipeline

    Returns:
        List of ASRSegment objects, one per word
    """
    if not chunks:
        return []

    segments = []

    for chunk in chunks:
        timestamp = chunk.get('timestamp')
        if timestamp is None or not isinstance(timestamp, tuple):
            continue

        start, end = timestamp
        if start is None or end is None:
            continue

        word_obj = WordTimestamp(
            word=chunk['text'],
            start=start,
            end=end,
        )

        # Create a segment for each individual word
        segments.append(ASRSegment(
            text=chunk['text'].strip(),
            start=start,
            end=end,
            words=[word_obj],
        ))

    return segments


def group_segments_by_gap(
    segments: List[ASRSegment],
    max_gap_seconds: float = 0.5,
) -> List[ASRSegment]:
    """Group consecutive segments when gaps between them are small.

    This is useful for grouping individual word segments into sentence-level segments.
    Segments are grouped together as long as the gap between consecutive segments
    is less than max_gap_seconds.

    Args:
        segments: Input segments (e.g., individual words)
        max_gap_seconds: Maximum gap to allow within a group (default 0.5s)

    Returns:
        List of grouped segments
    """
    if not segments:
        return []

    # Sort by start time first
    sorted_segs = sorted(segments, key=lambda s: s.start)

    result = []
    current_group_segs = [sorted_segs[0]]

    for i in range(1, len(sorted_segs)):
        prev_seg = sorted_segs[i - 1]
        curr_seg = sorted_segs[i]

        gap = curr_seg.start - prev_seg.end

        if gap <= max_gap_seconds:
            # Continue current group
            current_group_segs.append(curr_seg)
        else:
            # Finalize current group and start new one
            if current_group_segs:
                # Merge all segments in group
                all_words = []
                for seg in current_group_segs:
                    all_words.extend(seg.words)

                text = ' '.join(w.word for w in all_words).strip()
                result.append(ASRSegment(
                    text=text,
                    start=current_group_segs[0].start,
                    end=current_group_segs[-1].end,
                    words=all_words,
                ))

            current_group_segs = [curr_seg]

    # Add final group
    if current_group_segs:
        all_words = []
        for seg in current_group_segs:
            all_words.extend(seg.words)

        text = ' '.join(w.word for w in all_words).strip()
        result.append(ASRSegment(
            text=text,
            start=current_group_segs[0].start,
            end=current_group_segs[-1].end,
            words=all_words,
        ))

    return result


def split_segments_by_word_gap(
    segments: List[ASRSegment],
    max_gap_seconds: float = 2.0,
) -> List[ASRSegment]:
    """Split segments where gaps between words exceed max_gap_seconds.

    This is the first pass of segment processing. If any two consecutive words
    within a segment have a gap (word2.start - word1.end) greater than max_gap_seconds,
    split the segment at that point.

    Args:
        segments: Input segments with word-level timestamps
        max_gap_seconds: Maximum gap between words before splitting (default 2.0s)

    Returns:
        New list of segments, potentially with some segments split
    """
    result = []

    for segment in segments:
        if len(segment.words) <= 1:
            # No words or single word - keep as is
            result.append(segment)
            continue

        # Find split points where gap exceeds threshold
        split_indices = []
        for i in range(len(segment.words) - 1):
            current_word = segment.words[i]
            next_word = segment.words[i + 1]
            gap = next_word.start - current_word.end

            if gap > max_gap_seconds:
                # Split after current word (at index i+1)
                split_indices.append(i + 1)

        if not split_indices:
            # No splits needed
            result.append(segment)
            continue

        # Split the segment at identified points
        split_indices = [0] + split_indices + [len(segment.words)]

        for i in range(len(split_indices) - 1):
            start_idx = split_indices[i]
            end_idx = split_indices[i + 1]

            sub_words = segment.words[start_idx:end_idx]
            if not sub_words:
                continue

            # Create new segment for this split
            sub_text = ' '.join(w.word for w in sub_words).strip()
            sub_start = sub_words[0].start
            sub_end = sub_words[-1].end

            result.append(ASRSegment(
                text=sub_text,
                start=sub_start,
                end=sub_end,
                words=sub_words,
            ))

    return result


def split_long_segments(
    segments: List[ASRSegment],
    max_duration_seconds: float = 10.0,
) -> List[ASRSegment]:
    """Split segments that exceed max_duration_seconds.

    This is the second pass of segment processing. For any segment longer than
    max_duration_seconds, split it after the last word whose end time does not
    exceed max_duration_seconds from the segment start.

    Args:
        segments: Input segments with word-level timestamps
        max_duration_seconds: Maximum segment duration (default 10.0s)

    Returns:
        New list of segments, with long segments split
    """
    result = []

    for segment in segments:
        duration = segment.end - segment.start

        if duration <= max_duration_seconds:
            # Segment is short enough
            result.append(segment)
            continue

        if len(segment.words) <= 1:
            # Can't split a single-word segment
            result.append(segment)
            continue

        # Split into multiple sub-segments
        current_words = []
        segment_start_time = segment.start

        for i, word in enumerate(segment.words):
            # Check if adding this word would exceed max duration
            if current_words:
                potential_duration = word.end - current_words[0].start

                if potential_duration > max_duration_seconds:
                    # Time to split - create segment from accumulated words
                    sub_text = ' '.join(w.word for w in current_words).strip()
                    sub_start = current_words[0].start
                    sub_end = current_words[-1].end

                    result.append(ASRSegment(
                        text=sub_text,
                        start=sub_start,
                        end=sub_end,
                        words=current_words,
                    ))

                    # Start new segment with current word
                    current_words = [word]
                    segment_start_time = word.start
                else:
                    current_words.append(word)
            else:
                current_words.append(word)

        # Add remaining words as final segment
        if current_words:
            sub_text = ' '.join(w.word for w in current_words).strip()
            sub_start = current_words[0].start
            sub_end = current_words[-1].end

            result.append(ASRSegment(
                text=sub_text,
                start=sub_start,
                end=sub_end,
                words=current_words,
            ))

    return result


def resolve_overlap_conflicts(
    segments: List[ASRSegment],
    chunk_size: float,
    overlap: float,
) -> List[ASRSegment]:
    """Resolve overlapping segments by keeping those with greater distance to chunk edge.

    This is the third pass of segment processing, handling overlaps that occur
    when processing audio in chunks with overlap.

    Args:
        segments: Input segments (may have overlaps from chunked processing)
        chunk_size: Size of audio chunks in seconds
        overlap: Overlap between chunks in seconds

    Returns:
        List of segments with overlaps resolved
    """
    if not segments:
        return []

    # Sort by start time
    sorted_segments = sorted(segments, key=lambda s: s.start)
    result = []

    for segment in sorted_segments:
        if not result:
            result.append(segment)
            continue

        prev_segment = result[-1]

        # Check if they overlap
        if segment.start < prev_segment.end:
            # Determine which chunk each segment belongs to
            prev_chunk_idx = int(prev_segment.start / (chunk_size - overlap))
            curr_chunk_idx = int(segment.start / (chunk_size - overlap))

            prev_chunk_start = prev_chunk_idx * (chunk_size - overlap)
            curr_chunk_start = curr_chunk_idx * (chunk_size - overlap)

            prev_chunk_end = prev_chunk_start + chunk_size
            curr_chunk_end = curr_chunk_start + chunk_size

            # Calculate distance to edges
            prev_dist = min(
                prev_segment.start - prev_chunk_start,
                prev_chunk_end - prev_segment.end,
            )
            curr_dist = min(
                segment.start - curr_chunk_start,
                curr_chunk_end - segment.end,
            )

            # Keep the one with greater distance (more reliable)
            if curr_dist > prev_dist:
                result[-1] = segment
        else:
            result.append(segment)

    return result


def asr_segments_to_vtt_cues(segments: List[ASRSegment]) -> List[VTTCue]:
    """Convert ASRSegment list to VTTCue list.

    IDs and timestamps will be set later by the calling code.

    Args:
        segments: List of ASR segments with word-level timestamps

    Returns:
        List of VTTCue objects (without IDs or timestamps set)
    """
    cues = []

    for segment in segments:
        if not segment.text.strip():
            continue

        cues.append(VTTCue(
            id="",  # Will be set later with hash
            start_time=segment.start,
            end_time=segment.end,
            text=segment.text.strip(),
        ))

    return cues


def parse_nemo_result_with_words(
    result,
    chunk_start: float,
) -> List[ASRSegment]:
    """Parse NeMo transcription result into ASRSegment list with word timestamps.

    Args:
        result: NeMo transcription result
        chunk_start: Start time of the audio chunk

    Returns:
        List of ASRSegment objects with word-level timestamps
    """
    segments = []

    if not result or len(result) == 0:
        return segments

    output = result[0]

    # Check if we have timestamps with word-level data
    if not hasattr(output, 'timestamp'):
        return segments

    if 'segment' not in output.timestamp or 'word' not in output.timestamp:
        return segments

    # Get all words
    all_words = output.timestamp['word']

    # Parse each segment
    for segment_data in output.timestamp['segment']:
        if not segment_data['segment'].strip():
            continue

        # Adjust times by chunk_start
        adjusted_segment = {
            'segment': segment_data['segment'],
            'start': chunk_start + segment_data['start'],
            'end': chunk_start + segment_data['end'],
        }

        # Adjust word times
        adjusted_words = [
            {
                'word': w['word'],
                'start': chunk_start + w['start'],
                'end': chunk_start + w['end'],
            }
            for w in all_words
        ]

        segment = parse_nemo_segment(adjusted_segment, adjusted_words)
        segments.append(segment)

    return segments


def parse_transformers_result_with_words(
    result,
    chunk_start: float,
) -> List[ASRSegment]:
    """Parse Transformers pipeline result into ASRSegment list with word timestamps.

    Args:
        result: Transformers pipeline result (with return_timestamps="word")
        chunk_start: Start time of the audio chunk

    Returns:
        List of ASRSegment objects with word-level timestamps
    """
    segments = []

    if not isinstance(result, dict) or 'chunks' not in result:
        return segments

    # Adjust times by chunk_start
    adjusted_chunks = [
        {
            'text': chunk['text'],
            'timestamp': (
                chunk_start + chunk['timestamp'][0] if chunk['timestamp'][0] is not None else None,
                chunk_start + chunk['timestamp'][1] if chunk['timestamp'][1] is not None else None,
            ) if isinstance(chunk.get('timestamp'), (tuple, list)) else None,
        }
        for chunk in result['chunks']
    ]

    # Group words into segments
    segments = group_whisper_words_into_segments(adjusted_chunks)

    return segments

"""Shared VTT file parsing and serialization utilities.

This module provides reusable functions for working with VTT files in the
CAPTION_EDITOR format, including parsing NOTE comments and serializing
cues back to VTT format.
"""

import json
import re
from pathlib import Path
from typing import Optional

from schema import CAPTION_EDITOR_SENTINEL, SegmentSpeakerEmbedding, TranscriptMetadata, TranscriptSegment


def parse_vtt_file(vtt_path: Path) -> tuple[TranscriptMetadata, list[TranscriptSegment]]:
    """Parse VTT file and extract metadata and segments from NOTE comments."""
    content = vtt_path.read_text()
    lines = content.split("\n")

    metadata = None
    segments = []

    # Pattern to match NOTE CAPTION_EDITOR: lines
    pattern = re.compile(
        rf"^NOTE {CAPTION_EDITOR_SENTINEL}:(\w+)\s+(.+)$"
    )

    for line in lines:
        match = pattern.match(line.strip())
        if match:
            data_type = match.group(1)
            json_data = match.group(2)

            if data_type == "TranscriptMetadata":
                metadata = TranscriptMetadata.model_validate_json(json_data)
            elif data_type == "TranscriptSegment":
                segment = TranscriptSegment.model_validate_json(json_data)
                segments.append(segment)
            elif data_type == "VTTCue":
                # Backwards compatibility: parse old VTTCue format
                segment = TranscriptSegment.model_validate_json(json_data)
                segments.append(segment)

    if metadata is None:
        raise ValueError(
            f"No TranscriptMetadata found in VTT file: {vtt_path}"
        )

    if not segments:
        raise ValueError(f"No TranscriptSegment entries found in VTT file: {vtt_path}")

    return metadata, segments


def format_timestamp(seconds: float) -> str:
    """Format seconds as VTT timestamp (HH:MM:SS.mmm)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def serialize_vtt(
    metadata: TranscriptMetadata,
    segments: list[TranscriptSegment],
    embeddings: Optional[list[SegmentSpeakerEmbedding]] = None,
    include_history: bool = False,
    vtt_path: Optional[Path] = None
) -> str:
    """Serialize metadata and segments to VTT format string.
    
    If vtt_path is provided, media paths are converted to relative paths.
    """
    lines = ["WEBVTT\n"]

    # Convert media file path to relative if possible
    metadata_copy = metadata.model_copy()
    if metadata_copy.media_file_path and vtt_path:
        media_path = Path(metadata_copy.media_file_path)
        if media_path.is_absolute() and vtt_path.is_absolute():
            try:
                # Try to compute relative path from VTT directory to media file
                vtt_dir = vtt_path.parent
                relative_path = media_path.relative_to(vtt_dir)
                metadata_copy.media_file_path = str(relative_path)
            except ValueError:
                # If files are on different drives or can't be made relative, keep absolute
                pass

    # Add TranscriptMetadata at the top with CAPTION_EDITOR sentinel
    metadata_json = metadata_copy.model_dump(by_alias=True, exclude_none=True)
    lines.append(f"NOTE {CAPTION_EDITOR_SENTINEL}:TranscriptMetadata {json.dumps(metadata_json, separators=(',', ':'))}\n")

    for segment in segments:
        # Add NOTE with entire segment using CAPTION_EDITOR sentinel
        segment_json = segment.model_dump(by_alias=True, exclude_none=True)
        lines.append(f"\nNOTE {CAPTION_EDITOR_SENTINEL}:TranscriptSegment {json.dumps(segment_json, separators=(',', ':'))}\n")

        # Format timestamps
        start = format_timestamp(segment.start_time)
        end = format_timestamp(segment.end_time)

        lines.append(f"{segment.id}")
        lines.append(f"{start} --> {end}")
        lines.append(f"{segment.text}\n")

    # Add speaker embeddings at the end if they exist (one NOTE per embedding)
    if embeddings:
        for embedding in embeddings:
            embedding_json = embedding.model_dump(by_alias=True, exclude_none=True)
            lines.append(f"\nNOTE {CAPTION_EDITOR_SENTINEL}:SegmentSpeakerEmbedding {json.dumps(embedding_json, separators=(',', ':'))}")

    return "\n".join(lines)

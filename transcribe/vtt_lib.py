"""Shared VTT file parsing and serialization utilities.

This module provides reusable functions for working with VTT files in the
CAPTION_EDITOR format, including parsing NOTE comments and serializing
cues back to VTT format.
"""

import json
import re
from pathlib import Path
from typing import Optional

from schema import CAPTION_EDITOR_SENTINEL, SegmentSpeakerEmbedding, TranscriptMetadata, VTTCue


def parse_vtt_file(vtt_path: Path) -> tuple[TranscriptMetadata, list[VTTCue]]:
    """Parse VTT file and extract metadata and cues from NOTE comments.

    Args:
        vtt_path: Path to the VTT file

    Returns:
        Tuple of (metadata, cues)
    """
    content = vtt_path.read_text()
    lines = content.split("\n")

    metadata = None
    cues = []

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
            elif data_type == "VTTCue":
                cue = VTTCue.model_validate_json(json_data)
                cues.append(cue)

    if metadata is None:
        raise ValueError(
            f"No TranscriptMetadata found in VTT file: {vtt_path}"
        )

    if not cues:
        raise ValueError(f"No VTTCue entries found in VTT file: {vtt_path}")

    return metadata, cues


def format_timestamp(seconds: float) -> str:
    """Format seconds as VTT timestamp (HH:MM:SS.mmm)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def serialize_vtt(
    metadata: TranscriptMetadata,
    cues: list[VTTCue],
    embeddings: Optional[list[SegmentSpeakerEmbedding]] = None,
    include_history: bool = False
) -> str:
    """Serialize metadata and cues to VTT format string.

    Args:
        metadata: Transcript metadata
        cues: List of VTT cues
        embeddings: Optional list of speaker embeddings
        include_history: Whether to include history entries (not implemented yet)

    Returns:
        VTT format string with NOTE comments
    """
    lines = ["WEBVTT\n"]

    # Add TranscriptMetadata at the top with CAPTION_EDITOR sentinel
    metadata_json = metadata.model_dump(by_alias=True, exclude_none=True)
    lines.append(f"NOTE {CAPTION_EDITOR_SENTINEL}:TranscriptMetadata {json.dumps(metadata_json)}\n")

    for cue in cues:
        # Add NOTE with entire cue using CAPTION_EDITOR sentinel
        cue_json = cue.model_dump(by_alias=True, exclude_none=True)
        lines.append(f"\nNOTE {CAPTION_EDITOR_SENTINEL}:VTTCue {json.dumps(cue_json)}\n")

        # Format timestamps
        start = format_timestamp(cue.start_time)
        end = format_timestamp(cue.end_time)

        lines.append(f"{cue.id}")
        lines.append(f"{start} --> {end}")
        lines.append(f"{cue.text}\n")

    # Add speaker embeddings at the end if they exist (one NOTE per embedding)
    if embeddings:
        for embedding in embeddings:
            embedding_json = embedding.model_dump(by_alias=True, exclude_none=True)
            lines.append(f"\nNOTE {CAPTION_EDITOR_SENTINEL}:SegmentSpeakerEmbedding {json.dumps(embedding_json)}")

    return "\n".join(lines)

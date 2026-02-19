"""
Pydantic schema definitions for the caption editor document structure.

This module defines the data models used by the caption editor for its native
`.captions_json` document format, including segments, metadata, history entries,
and speaker embeddings. These models are shared between the Python transcription
tools and the Electron app.

TypeScript/Python Schema Sync
==============================

IMPORTANT: This file must be kept in sync with the TypeScript schema
defined in src/types/schema.ts.

When adding or modifying fields:
1. Update both Python (this file) and TypeScript (src/types/schema.ts) schemas
2. Use snake_case in Python with Field aliases for camelCase conversion to match TypeScript
3. Ensure optional fields are marked consistently (Optional[type] in Python, readonly field?: type in TS)
4. Update serialization/parsing logic in src/utils/captionsJson.ts if needed
5. Run both Python and TypeScript tests to verify compatibility
"""

import base64
import struct
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.aliases import AliasChoices


def encode_embedding(values: list[float]) -> str:
    """Pack a float32 vector into a base64 string (little-endian)."""
    raw = struct.pack(f"<{len(values)}f", *values)
    return base64.b64encode(raw).decode("ascii")


def decode_embedding(b64: str) -> list[float]:
    """Unpack a base64 string back to a list of float32 values."""
    raw = base64.b64decode(b64)
    count = len(raw) // 4
    return list(struct.unpack(f"<{count}f", raw))


class HistoryAction(str, Enum):
    """Action types for segment history entries."""

    MODIFIED = "modified"
    DELETED = "deleted"
    SPEAKER_RENAMED = "speakerRenamed"


class TranscriptWord(BaseModel):
    """Word-level timestamp from ASR output."""

    model_config = ConfigDict(populate_by_name=True)

    text: str = Field(description="Word text")
    start_time: Optional[float] = Field(
        None, description="Start time in seconds", alias="startTime"
    )
    end_time: Optional[float] = Field(
        None, description="End time in seconds", alias="endTime"
    )


class TranscriptSegment(BaseModel):
    """Transcript segment (formerly VTTCue) matching the frontend data model."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID - segment identifier")
    start_time: float = Field(description="Start time in seconds", alias="startTime")
    end_time: float = Field(description="End time in seconds", alias="endTime")
    text: str = Field(description="Segment text")
    words: Optional[list[TranscriptWord]] = Field(
        None, description="Optional word-level timestamps from ASR"
    )
    speaker_name: Optional[str] = Field(
        None, description="Optional speaker name", alias="speakerName"
    )
    rating: Optional[int] = Field(None, description="Optional rating 1-5")
    timestamp: Optional[str] = Field(
        None,
        description="ISO 8601 timestamp of when the segment was created/last modified",
    )
    verified: Optional[bool] = Field(
        None, description="Whether a human has reviewed/checked off this segment"
    )
    asr_model: Optional[str] = Field(
        None,
        description="Name of the ASR model that generated this segment",
        alias="asrModel",
    )


# Legacy alias for backwards compatibility during migration
VTTCue = TranscriptSegment


class TranscriptMetadata(BaseModel):
    """Metadata for the transcript document."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID for the document")
    media_file_path: Optional[str] = Field(
        None,
        description="Optional path to the media file (relative to captions file directory if possible)",
        alias="mediaFilePath",
    )


class SegmentHistoryEntry(BaseModel):
    """Historical record of a segment modification or deletion."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID for this history entry")
    action: HistoryAction = Field(description="Type of action performed")
    action_timestamp: str = Field(
        description="ISO 8601 timestamp of when this action occurred",
        alias="actionTimestamp",
    )
    segment: TranscriptSegment = Field(
        description="The segment's state before the change (preserves the original timestamp)",
        validation_alias=AliasChoices("segment"),
        serialization_alias="segment",
    )


class SegmentSpeakerEmbedding(BaseModel):
    """Speaker embedding vector for a segment, stored as base64-encoded little-endian float32."""

    model_config = ConfigDict(populate_by_name=True)

    segment_id: str = Field(
        description="UUID of the segment this embedding belongs to", alias="segmentId"
    )
    speaker_embedding: str = Field(
        description="Base64-encoded little-endian float32 speaker embedding vector",
        alias="speakerEmbedding",
    )
    model: Optional[str] = Field(
        None,
        description="Name of the embedding model that produced this vector",
    )


class CaptionsDocument(BaseModel):
    """Complete captions document (native .captions_json format)."""

    model_config = ConfigDict(populate_by_name=True)

    metadata: TranscriptMetadata = Field(
        description="Document metadata (id, media file path)"
    )
    title: Optional[str] = Field(None, description="Optional document title")
    segments: list[TranscriptSegment] = Field(description="Transcript segments")
    history: Optional[list[SegmentHistoryEntry]] = Field(
        None, description="Historical record of segment changes"
    )
    embeddings: Optional[list[SegmentSpeakerEmbedding]] = Field(
        None, description="Speaker embeddings for segments"
    )

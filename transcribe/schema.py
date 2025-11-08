"""
Pydantic schema definitions for VTT document structure.

This module defines the data models used by the caption editor for VTT files,
including cues, metadata, and history entries. These models are shared between
the Python transcription tools and can be used by other tools that need to
work with the VTT format.

TypeScript/Python Schema Sync
==============================

IMPORTANT: This file must be kept in sync with the TypeScript schema
defined in src/types/schema.ts.

When adding or modifying fields:
1. Update both Python (this file) and TypeScript (src/types/schema.ts) schemas
2. Use snake_case in Python with Field aliases for camelCase conversion to match TypeScript
3. Ensure optional fields are marked consistently (Optional[type] in Python, readonly field?: type in TS)
4. Update serialization/parsing logic in src/utils/vttParser.ts if needed
5. Run both Python and TypeScript tests to verify compatibility
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

# Sentinel prefix for app-specific NOTE comments in VTT files
# Format: NOTE CAPTION_EDITOR:TypeName {json}
CAPTION_EDITOR_SENTINEL = "CAPTION_EDITOR"


class VTTCue(BaseModel):
    """VTT cue matching the frontend data model."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID - cue identifier")
    start_time: float = Field(description="Start time in seconds", alias="startTime")
    end_time: float = Field(description="End time in seconds", alias="endTime")
    text: str = Field(description="Caption text")
    speaker_name: Optional[str] = Field(None, description="Optional speaker name", alias="speakerName")
    rating: Optional[int] = Field(None, description="Optional rating 1-5")
    timestamp: Optional[str] = Field(None, description="ISO 8601 timestamp of when the cue was created/last modified")


class TranscriptMetadata(BaseModel):
    """Metadata for the transcript document."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID for the document")
    media_file_path: Optional[str] = Field(None, description="Optional path to the media file (relative to VTT file directory if possible)", alias="mediaFilePath")


class SegmentHistoryEntry(BaseModel):
    """Historical record of a segment modification or deletion."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID for this history entry")
    action: str = Field(description="Type of action performed: 'modified', 'deleted', or 'renameSpeaker'")
    action_timestamp: str = Field(description="ISO 8601 timestamp of when this action occurred", alias="actionTimestamp")
    cue: VTTCue = Field(description="The segment's state before the change (preserves the original timestamp)")

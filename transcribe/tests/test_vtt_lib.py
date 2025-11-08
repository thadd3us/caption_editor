"""Tests for VTT library parsing and serialization."""

from pathlib import Path
import pytest
from vtt_lib import parse_vtt_file, serialize_vtt


def test_parse_vtt_file(repo_root: Path, snapshot):
    """Test parsing VTT file with NOTE comments."""
    vtt_path = repo_root / "test_data" / "OSR_us_000_0010_8k.vtt"

    metadata, cues = parse_vtt_file(vtt_path)

    # Snapshot the parsed metadata
    assert {
        "id": metadata.id,
        "media_file_path": metadata.media_file_path,
    } == snapshot(name="metadata")

    # Snapshot the parsed cues
    assert [
        {
            "id": cue.id,
            "start_time": cue.start_time,
            "end_time": cue.end_time,
            "text": cue.text,
            "speaker_name": cue.speaker_name,
            "rating": cue.rating,
        }
        for cue in cues
    ] == snapshot(name="cues")


def test_serialize_vtt(repo_root: Path, snapshot):
    """Test serializing VTT file."""
    vtt_path = repo_root / "test_data" / "OSR_us_000_0010_8k.vtt"

    metadata, cues = parse_vtt_file(vtt_path)

    # Serialize back to VTT
    vtt_content = serialize_vtt(metadata, cues)

    # Snapshot the serialized content
    assert vtt_content == snapshot


def test_parse_vtt_no_speakers(repo_root: Path, snapshot):
    """Test parsing VTT file without speaker names."""
    vtt_path = repo_root / "test_data" / "OSR_us_000_0010_8k_no_speakers.vtt"

    metadata, cues = parse_vtt_file(vtt_path)

    # Verify no speaker names
    assert all(cue.speaker_name is None for cue in cues)

    # Snapshot the cues
    assert [
        {
            "id": cue.id,
            "start_time": cue.start_time,
            "end_time": cue.end_time,
            "text": cue.text,
            "speaker_name": cue.speaker_name,
            "rating": cue.rating,
        }
        for cue in cues
    ] == snapshot

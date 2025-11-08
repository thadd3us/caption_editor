"""Tests for speaker clustering functionality."""

import subprocess
import sys
from pathlib import Path
import pytest
from vtt_lib import parse_vtt_file


def test_embed_with_clustering(repo_root: Path, tmp_path: Path, snapshot):
    """Test speaker clustering with real embeddings."""
    # Copy test file and audio to tmp_path
    test_vtt = repo_root / "test_data" / "OSR_us_000_0010_8k_no_speakers.vtt"
    test_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"

    output_vtt = tmp_path / "test.vtt"
    output_audio = tmp_path / "OSR_us_000_0010_8k.wav"

    output_vtt.write_text(test_vtt.read_text())
    output_audio.write_bytes(test_audio.read_bytes())

    # Run embed.py with clustering
    embed_script = repo_root / "transcribe" / "embed.py"

    result = subprocess.run(
        [
            sys.executable,
            str(embed_script),
            str(output_vtt),
            "--auto_assign_speaker_clusters_to_unknown_names",
            "--num_speaker_clusters",
            "2",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    # Check that command succeeded
    assert result.returncode == 0, f"Clustering failed: {result.stderr}"

    # Parse the updated VTT
    metadata, cues = parse_vtt_file(output_vtt)

    # Check that all cues have speaker names assigned
    assert all(cue.speaker_name is not None for cue in cues)

    # Check that speaker names follow the expected format
    for cue in cues:
        assert cue.speaker_name.startswith("Unknown Speaker ")
        assert cue.speaker_name.endswith("?")
        # Extract cluster number
        cluster_num = cue.speaker_name.replace("Unknown Speaker ", "").replace("?", "")
        assert cluster_num in ["00", "01"], f"Unexpected cluster number: {cluster_num}"

    # Snapshot the assigned speakers
    assert [
        {
            "text": cue.text[:50],  # First 50 chars
            "speaker_name": cue.speaker_name,
        }
        for cue in cues
    ] == snapshot


def test_embed_preserves_existing_speakers(repo_root: Path, tmp_path: Path, snapshot):
    """Test that clustering preserves existing speaker names."""
    # Copy test file and audio to tmp_path
    test_vtt = repo_root / "test_data" / "OSR_us_000_0010_8k.vtt"
    test_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"

    output_vtt = tmp_path / "test.vtt"
    output_audio = tmp_path / "OSR_us_000_0010_8k.wav"

    output_vtt.write_text(test_vtt.read_text())
    output_audio.write_bytes(test_audio.read_bytes())

    # Run embed.py with clustering
    embed_script = repo_root / "transcribe" / "embed.py"

    result = subprocess.run(
        [
            sys.executable,
            str(embed_script),
            str(output_vtt),
            "--auto_assign_speaker_clusters_to_unknown_names",
            "--num_speaker_clusters",
            "2",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    # Check that command succeeded
    assert result.returncode == 0, f"Clustering failed: {result.stderr}"

    # Parse the updated VTT
    metadata, cues = parse_vtt_file(output_vtt)

    # Check that "Alice" and "Bob" were preserved
    speaker_names = [cue.speaker_name for cue in cues]
    assert "Alice" in speaker_names, "Alice should be preserved"
    assert "Bob" in speaker_names, "Bob should be preserved"

    # Snapshot the speaker assignments
    assert [
        {
            "text": cue.text[:50],
            "speaker_name": cue.speaker_name,
        }
        for cue in cues
    ] == snapshot

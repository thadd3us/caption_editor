"""Tests for transcription tool."""

import subprocess
from pathlib import Path


def test_transcribe_osr_audio(repo_root: Path, tmp_path: Path, snapshot):
    """Test transcribing the OSR audio file with 10s chunks and 5s overlap."""
    test_audio = repo_root / "tests" / "fixtures" / "OSR_us_000_0010_8k.wav"
    output_path = tmp_path / "output.vtt"

    # Path to transcribe script
    transcribe_script = repo_root / "transcribe" / "transcribe.py"

    # Run transcription
    result = subprocess.run(
        [
            "python3",
            str(transcribe_script),
            str(test_audio),
            "--output",
            str(output_path),
            "--chunk-size",
            "10",
            "--overlap",
            "5",
        ],
        capture_output=True,
        text=True,
    )

    # Check that command succeeded
    assert result.returncode == 0, f"Transcription failed: {result.stderr}"

    # Check that output file was created
    assert output_path.exists(), "Output VTT file was not created"

    # Read and snapshot the VTT content
    vtt_content = output_path.read_text()

    # Use syrupy to snapshot the output
    assert vtt_content == snapshot

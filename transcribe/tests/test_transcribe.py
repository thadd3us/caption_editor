"""Tests for transcription tool."""

import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.parametrize(
    "model_name",
    [
        "openai/whisper-tiny",
        "nvidia/parakeet-tdt-0.6b-v3",
    ],
)
def test_transcribe_osr_audio(repo_root: Path, tmp_path: Path, snapshot, model_name: str):
    """Test transcribing the OSR audio file with 10s chunks and 5s overlap."""
    test_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"
    output_path = tmp_path / "output.vtt"

    # Path to transcribe script
    transcribe_script = repo_root / "transcribe" / "transcribe.py"

    # Run transcription using the current Python interpreter
    result = subprocess.run(
        [
            sys.executable,
            str(transcribe_script),
            str(test_audio),
            "--output",
            str(output_path),
            "--chunk-size",
            "10",
            "--overlap",
            "5",
            "--model",
            model_name,
            "--deterministic-ids",
        ],
        capture_output=True,
        text=True,
        check=True,
    )

    # Check that command succeeded
    assert result.returncode == 0, f"Transcription failed: {result.stderr}"

    # Check that output file was created
    assert output_path.exists(), "Output VTT file was not created"

    # Read and snapshot the VTT content
    vtt_content = output_path.read_text()

    # Use syrupy to snapshot the output
    assert vtt_content == snapshot

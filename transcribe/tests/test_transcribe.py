"""
Tests for transcription tool.
"""

import subprocess
from pathlib import Path

import pytest


def test_transcribe_osr_audio():
    """
    Test transcribing the OSR_us_000_0010_8k.wav file with 10 second chunks and 5 second overlap.
    """
    # Path to test fixture
    test_audio = Path(__file__).parent.parent.parent.parent / "tests" / "fixtures" / "OSR_us_000_0010_8k.wav"

    if not test_audio.exists():
        pytest.skip(f"Test audio file not found: {test_audio}")

    # Output path
    output_path = Path("/tmp/test_transcribe_output.vtt")
    if output_path.exists():
        output_path.unlink()

    # Path to transcribe script
    transcribe_script = Path(__file__).parent.parent / "transcribe.py"

    # Run transcription
    cmd = [
        "python3",
        str(transcribe_script),
        str(test_audio),
        "--output", str(output_path),
        "--chunk-size", "10",
        "--overlap", "5"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Check that command succeeded
    assert result.returncode == 0, f"Transcription failed: {result.stderr}"

    # Check that output file was created
    assert output_path.exists(), "Output VTT file was not created"

    # Read and validate VTT content
    vtt_content = output_path.read_text()

    # Check for WEBVTT header
    assert vtt_content.startswith("WEBVTT"), "VTT file should start with WEBVTT header"

    # Check for timestamp format (HH:MM:SS.mmm --> HH:MM:SS.mmm)
    assert "-->" in vtt_content, "VTT file should contain timestamp separators"

    # Check for UUID format (8-4-4-4-12 hex characters)
    lines = vtt_content.split("\n")
    uuid_found = False
    for line in lines:
        line = line.strip()
        if line and "-" in line and len(line) == 36:
            parts = line.split("-")
            if len(parts) == 5 and len(parts[0]) == 8 and len(parts[1]) == 4:
                uuid_found = True
                break

    assert uuid_found, "VTT file should contain UUID identifiers"

    # Check that there's some transcribed text
    text_found = False
    for i, line in enumerate(lines):
        if "-->" in line and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if next_line and next_line != "WEBVTT":
                text_found = True
                break

    assert text_found, "VTT file should contain transcribed text"

    # Clean up
    if output_path.exists():
        output_path.unlink()


def test_transcribe_with_default_output():
    """
    Test that transcription creates output file with .vtt suffix when no output specified.
    """
    # Path to test fixture
    test_audio = Path(__file__).parent.parent.parent.parent / "tests" / "fixtures" / "OSR_us_000_0010_8k.wav"

    if not test_audio.exists():
        pytest.skip(f"Test audio file not found: {test_audio}")

    # Expected output path (same as input but with .vtt extension)
    output_path = test_audio.with_suffix(".vtt.test")
    if output_path.exists():
        output_path.unlink()

    # Copy test file to temp location to avoid modifying original
    import shutil
    import tempfile

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_audio = Path(temp_dir) / "test_audio.wav"
        shutil.copy(test_audio, temp_audio)

        expected_output = temp_audio.with_suffix(".vtt")

        # Path to transcribe script
        transcribe_script = Path(__file__).parent.parent / "transcribe.py"

        # Run transcription without specifying output
        cmd = [
            "python3",
            str(transcribe_script),
            str(temp_audio),
            "--chunk-size", "10",
            "--overlap", "5"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        # Check that command succeeded
        assert result.returncode == 0, f"Transcription failed: {result.stderr}"

        # Check that output file was created with .vtt suffix
        assert expected_output.exists(), f"Output VTT file was not created at expected location: {expected_output}"


def test_nonexistent_file():
    """
    Test that transcription fails gracefully with a nonexistent file.
    """
    # Path to transcribe script
    transcribe_script = Path(__file__).parent.parent / "transcribe.py"

    # Run transcription with nonexistent file
    cmd = [
        "python3",
        str(transcribe_script),
        "/nonexistent/file.wav",
        "--chunk-size", "10",
        "--overlap", "5"
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    # Check that command failed
    assert result.returncode != 0, "Transcription should fail with nonexistent file"
    assert "not found" in result.stderr.lower() or "not found" in result.stdout.lower(), \
        "Error message should indicate file not found"

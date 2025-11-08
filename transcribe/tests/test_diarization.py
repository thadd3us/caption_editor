"""Tests for speaker diarization and embedding."""

import json
import os
import tempfile
from pathlib import Path

import pytest
import subprocess

from diarize import diarize_audio
from embed import convert_to_wav

# Path to test audio file
TEST_AUDIO = Path(__file__).parent.parent.parent / "test_data" / "OSR_us_000_0010_8k.wav"


def test_diarize_osr_audio(snapshot):
    """Test speaker diarization on OSR audio file with golden output."""
    assert TEST_AUDIO.exists(), f"Test audio file not found: {TEST_AUDIO}"

    # Run diarization
    results = diarize_audio(TEST_AUDIO)

    # Format results for snapshot comparison
    # Round to 3 decimal places for stability
    formatted_results = [
        {
            "speaker": speaker,
            "start": round(start, 3),
            "end": round(end, 3),
        }
        for start, end, speaker in results
    ]

    # Compare against golden output
    assert formatted_results == snapshot


def test_convert_to_wav():
    """Test audio format conversion using ffmpeg."""
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Create a test audio file in a different format (using ffmpeg to create flac)
        test_flac = temp_path / "test.flac"

        # Create a simple 1-second sine wave as a test file
        subprocess.run(
            [
                "ffmpeg",
                "-f", "lavfi",
                "-i", "sine=frequency=440:duration=1",
                "-y",
                str(test_flac),
            ],
            check=True,
            capture_output=True,
        )

        assert test_flac.exists(), "Failed to create test FLAC file"

        # Convert to WAV
        wav_path = convert_to_wav(test_flac, temp_path)

        # Verify conversion
        assert wav_path.exists(), "WAV file was not created"
        assert wav_path.suffix == ".wav", "Output file is not a WAV"

        # Verify it's a valid WAV with correct properties (using ffprobe)
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name,sample_rate,channels",
                "-of", "json",
                str(wav_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )

        info = json.loads(result.stdout)
        stream = info["streams"][0]

        assert stream["codec_name"] == "pcm_s16le", "Incorrect codec"
        assert int(stream["sample_rate"]) == 16000, "Incorrect sample rate"
        assert int(stream["channels"]) == 1, "Incorrect channel count"

"""Tests for speaker diarization."""

import os
from pathlib import Path

import pytest
import torch
import torchaudio

from diarization.cli import diarize_audio

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

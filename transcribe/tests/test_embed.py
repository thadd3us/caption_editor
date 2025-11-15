"""Tests for speaker embedding."""

import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pytest

from embed import convert_to_wav

# Path to test files
TEST_AUDIO = Path(__file__).parent.parent.parent / "test_data" / "OSR_us_000_0010_8k.wav"
TEST_VTT = Path(__file__).parent.parent.parent / "test_data" / "OSR_us_000_0010_8k.vtt"


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


def test_embed_osr_audio(snapshot):
    """Test embedding computation with snapshot comparison."""
    # Skip test if HF_TOKEN is not set
    if not os.getenv("HF_TOKEN"):
        pytest.skip("HF_TOKEN environment variable not set")

    assert TEST_VTT.exists(), f"Test VTT file not found: {TEST_VTT}"
    assert TEST_AUDIO.exists(), f"Test audio file not found: {TEST_AUDIO}"

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Copy VTT and audio to temp directory
        test_vtt = temp_path / "test.vtt"
        test_audio = temp_path / "OSR_us_000_0010_8k.wav"

        test_vtt.write_text(TEST_VTT.read_text())
        test_audio.write_bytes(TEST_AUDIO.read_bytes())

        # Run embed.py as subprocess
        embed_script = Path(__file__).parent.parent / "embed.py"
        result = subprocess.run(
            [
                "python", str(embed_script),
                str(test_vtt),
            ],
            capture_output=True,
            text=True,
            check=True,
            env={**os.environ, "HF_TOKEN": os.getenv("HF_TOKEN", "")},
        )

        # Parse the updated VTT file to extract embeddings
        from vtt_lib import parse_vtt_file

        metadata, segments = parse_vtt_file(test_vtt)

        # Read the VTT file to extract embeddings from NOTE comments
        vtt_content = test_vtt.read_text()

        embeddings = []
        for line in vtt_content.split('\n'):
            if 'SegmentSpeakerEmbedding' in line:
                # Extract JSON from the NOTE comment
                import re
                match = re.search(r'SegmentSpeakerEmbedding (.+)$', line)
                if match:
                    embedding_data = json.loads(match.group(1))
                    # Use camelCase field name as it appears in the JSON
                    embedding_array = np.array(embedding_data['speakerEmbedding'])
                    # Round to whole numbers for snapshot stability across environments
                    rounded = np.round(embedding_array, 0).astype(int).tolist()
                    embeddings.append({
                        "segment_id": embedding_data['segmentId'],
                        "embedding": rounded[:10],  # First 10 values for compact snapshot
                        "shape": len(embedding_array),
                    })

        # Sort by segment_id for consistent comparison
        embeddings.sort(key=lambda x: x['segment_id'])

        assert embeddings == snapshot

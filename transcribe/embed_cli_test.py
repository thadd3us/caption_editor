"""Tests for speaker embedding."""

import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

from typer.testing import CliRunner
from repo_root import REPO_ROOT
from captions_json_lib import parse_captions_json_file
from embed_cli import app

import numpy as np
import pytest

from audio_utils import extract_audio_to_wav

# Path to test files
TEST_AUDIO = REPO_ROOT / "test_data" / "OSR_us_000_0010_8k.wav"


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
                *("-f", "lavfi"),
                *("-i", "sine=frequency=440:duration=1"),
                "-y",
                str(test_flac),
            ],
            check=True,
            capture_output=True,
        )

        assert test_flac.exists(), "Failed to create test FLAC file"

        # Convert to WAV
        wav_path = extract_audio_to_wav(test_flac, temp_path / "audio.wav")

        # Verify conversion
        assert wav_path.exists(), "WAV file was not created"
        assert wav_path.suffix == ".wav", "Output file is not a WAV"

        # Verify it's a valid WAV with correct properties (using ffprobe)
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-show_entries",
                "stream=codec_name,sample_rate,channels",
                "-of",
                "json",
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


@pytest.mark.expensive
def test_embed_osr_audio(snapshot, tmp_path: Path):
    """Test embedding computation with snapshot comparison.

    Note: Uses default wespeaker model which doesn't require HF_TOKEN.
    """
    assert TEST_AUDIO.exists(), f"Test audio file not found: {TEST_AUDIO}"

    # Create captions json + copy audio to temp directory.
    test_captions = tmp_path / "test.captions.json"
    test_audio = tmp_path / "OSR_us_000_0010_8k.wav"

    test_audio.write_bytes(TEST_AUDIO.read_bytes())

    # Minimal input document for embedding.
    # Keep ids/timestamps deterministic for snapshot stability.
    test_captions.write_text(
        json.dumps(
            {
                "metadata": {
                    "id": "doc_id",
                    "mediaFilePath": "OSR_us_000_0010_8k.wav",
                },
                "segments": [
                    {
                        "id": "id_00000",
                        "startTime": 0.0,
                        "endTime": 1.2,
                        "text": "The birch canoe slid.",
                        "timestamp": "2025-01-01T00:00:00.000000+00:00",
                    },
                    {
                        "id": "id_00001",
                        "startTime": 1.4,
                        "endTime": 2.6,
                        "text": "Glue the sheet.",
                        "timestamp": "2025-01-01T00:00:00.000000+00:00",
                    },
                ],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )

    # Mock embedding model so tests don't download weights and outputs are stable.
    with (
        patch("embed_cli.Model.from_pretrained") as mock_model,
        patch("embed_cli.Inference") as mock_inference,
    ):
        del mock_model
        dummy_embedding = [0.1] * 192
        mock_inference.return_value.side_effect = lambda x: dummy_embedding

        result = CliRunner().invoke(
            app,
            [
                str(test_captions),
                *("--min-segment-duration", "0.0"),
            ],
        )
    assert result.exit_code == 0
    doc = parse_captions_json_file(test_captions)
    assert doc.embeddings is not None

    embeddings = [
        {
            "segment_id": e.segment_id,
            "embedding": np.round(np.array(e.speaker_embedding), 2).tolist()[:10],
            "shape": len(e.speaker_embedding),
        }
        for e in doc.embeddings
    ]

    # Sort by segment_id for consistent comparison
    embeddings.sort(key=lambda x: x["segment_id"])

    assert embeddings == snapshot

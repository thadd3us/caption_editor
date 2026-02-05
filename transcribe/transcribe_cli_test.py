"""Tests for transcription tool."""

import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from constants import MODEL_PARAKEET, MODEL_WHISPER_TINY
from transcribe_cli import main as transcribe_main
from typer.testing import CliRunner
from transcribe_cli import app

import pytest

assert MODEL_PARAKEET
assert MODEL_WHISPER_TINY


@pytest.mark.expensive
@pytest.mark.parametrize(
    "model_name",
    [
        "openai/whisper-tiny",
        "nvidia/parakeet-tdt-0.6b-v3",
    ],
)
def test_transcribe_osr_audio(repo_root: Path, tmp_path: Path, snapshot, model_name: str):
    """Test transcribing the OSR audio file with 10s chunks and 5s overlap."""
    # Copy audio file to tmp_path to avoid absolute path in snapshots
    source_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"
    test_audio = tmp_path / "OSR_us_000_0010_8k.wav"
    test_audio.write_bytes(source_audio.read_bytes())

    output_path = tmp_path / "output.vtt"

    # Path to transcribe script
    transcribe_script = repo_root / "transcribe" / "transcribe_cli.py"

    # Use tighter gap threshold for Whisper to split on sentence boundaries
    gap_threshold = "0.2" if "whisper" in model_name.lower() else "2.0"

    result = CliRunner().invoke(
        app,
        [
            str(test_audio),
            *("--output",
            str(output_path)),
            "--chunk-size",
            "10",
            "--overlap",
            "5",
            "--model",
            model_name,
            "--max-intra-segment-gap-seconds",
            gap_threshold,
            "--deterministic-ids",
        ])

    # Check that command succeeded
    assert result.exit_code == 0, f"Transcription failed: {result.stderr}"

    # Check that output file was created
    assert output_path.exists(), "Output VTT file was not created"

    # Read and snapshot the VTT content
    vtt_content = output_path.read_text()

    # Use syrupy to snapshot the output
    assert vtt_content == snapshot


@pytest.mark.expensive
def test_transcribe_with_embed(repo_root: Path, tmp_path: Path):
    """Test that –embed flag triggers embedding and updates VTT."""
    # Copy audio file to tmp_path
    source_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"
    test_audio = tmp_path / "OSR_us_000_0010_8k.wav"
    test_audio.write_bytes(source_audio.read_bytes())

    output_path = tmp_path / "output.vtt"
    # transcribe_script = repo_root / "transcribe" / "transcribe.py"

    # We want to mock the embedding model to avoid downloading it and slow tests
    # We can mock the Inference class in embed_cli.py or the compute_embedding function
    with (patch("embed_cli.Model.from_pretrained") as mock_model, 
        patch("embed_cli.Inference") as mock_inference):
        # Mock inference to return a dummy embedding
        dummy_embedding = [0.1] * 192  # Typical embedding size
        mock_inference.return_value.side_effect = lambda x: dummy_embedding

        # Run transcription with --embed
        result = CliRunner().invoke(
            app,
            [
                str(test_audio),
                "--output",
                str(output_path),
                "--chunk-size",
                "10",
                "--overlap",
                "5",
                "--model",
                MODEL_PARAKEET,
                "--deterministic-ids",
                "--embed",
                "--min-segment-duration",
                "0.0",
            ],
        )

    assert result.exit_code == 0
    assert "Running speaker embedding..." in result.stdout
    assert output_path.exists()

    vtt_content = output_path.read_text()
    assert "SegmentSpeakerEmbedding" in vtt_content
    # JSON serialization might not have spaces
    assert "0.1,0.1,0.1" in vtt_content

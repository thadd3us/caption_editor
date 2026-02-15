"""Tests for transcription tool."""

from pathlib import Path
from unittest.mock import patch

from constants import MODEL_PARAKEET, MODEL_WHISPER_TINY
from typer.testing import CliRunner
from captions_json_lib import parse_captions_json_file
from transcribe_cli import app

import pytest

assert MODEL_PARAKEET
assert MODEL_WHISPER_TINY


def _round_floats_deep(value, *, ndigits: int):
    if isinstance(value, float):
        return round(value, ndigits)
    if isinstance(value, list):
        return [_round_floats_deep(v, ndigits=ndigits) for v in value]
    if isinstance(value, dict):
        return {k: _round_floats_deep(v, ndigits=ndigits) for k, v in value.items()}
    return value


@pytest.mark.expensive
@pytest.mark.parametrize(
    "model_name",
    [
        MODEL_WHISPER_TINY,
        MODEL_PARAKEET,
    ],
)
def test_transcribe_osr_audio(
    repo_root: Path, tmp_path: Path, snapshot, model_name: str
):
    """Test transcribing the OSR audio file and writing `.captions.json`."""
    # Copy audio file to tmp_path to avoid absolute path in snapshots
    source_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"
    test_audio = tmp_path / "OSR_us_000_0010_8k.wav"
    test_audio.write_bytes(source_audio.read_bytes())

    output_path = tmp_path / "output.captions.json"

    # Use tighter gap threshold for Whisper to split on sentence boundaries
    gap_threshold = "0.2" if "whisper" in model_name.lower() else "2.0"

    result = CliRunner().invoke(
        app,
        [
            str(test_audio),
            *("--output", str(output_path)),
            *("--chunk-size", "10"),
            *("--overlap", "5"),
            *("--model", model_name),
            *("--max-intra-segment-gap-seconds", gap_threshold),
            "--deterministic-ids",
            "--no-embed",
        ],
    )

    # Check that command succeeded
    assert result.exit_code == 0, f"Transcription failed: {result.stderr}"

    # Check that output file was created
    assert output_path.exists(), "Output captions JSON file was not created"

    doc = parse_captions_json_file(output_path)

    # Snapshot the full object (including words), but normalize float jitter so
    # minor model/runtime differences don't cause noisy diffs.
    payload = doc.model_dump(by_alias=True, exclude_none=True)
    payload = _round_floats_deep(payload, ndigits=3)
    assert payload == snapshot


@pytest.mark.expensive
def test_transcribe_with_embed(repo_root: Path, tmp_path: Path):
    """Test that `--embed` triggers embedding and updates `.captions.json`."""
    # Copy audio file to tmp_path
    source_audio = repo_root / "test_data" / "OSR_us_000_0010_8k.wav"
    test_audio = tmp_path / "OSR_us_000_0010_8k.wav"
    test_audio.write_bytes(source_audio.read_bytes())

    output_path = tmp_path / "output.captions.json"

    # We want to mock the embedding model to avoid downloading it and slow tests
    # We can mock the Inference class in embed_cli.py or the compute_embedding function
    with (
        patch("embed_cli.Model.from_pretrained") as mock_model,
        patch("embed_cli.Inference") as mock_inference,
    ):
        del mock_model
        # Mock inference to return a dummy embedding
        dummy_embedding = [0.1] * 192  # Typical embedding size
        mock_inference.return_value.side_effect = lambda x: dummy_embedding

        # Run transcription with --embed.
        result = CliRunner().invoke(
            app,
            [
                str(test_audio),
                *("--output", str(output_path)),
                *("--chunk-size", "10"),
                *("--overlap", "5"),
                *("--model", MODEL_WHISPER_TINY),
                "--deterministic-ids",
                "--embed",
                *("--min-segment-duration", "0.0"),
            ],
        )

    assert result.exit_code == 0
    assert "Running speaker embedding..." in result.stdout
    assert output_path.exists()

    doc = parse_captions_json_file(output_path)
    assert doc.embeddings is not None
    assert len(doc.embeddings) > 0
    assert all(len(e.speaker_embedding) == 192 for e in doc.embeddings)
    assert doc.embeddings[0].speaker_embedding[:3] == [0.1, 0.1, 0.1]

"""Snapshot test for Apollo-11 audio transcription."""

from pathlib import Path
import shutil

from constants import MODEL_PARAKEET
from typer.testing import CliRunner
from captions_json_lib import parse_captions_json_file
from transcribe_cli import app

import pytest


def _round_floats_deep(value, *, ndigits: int):
    if isinstance(value, float):
        return round(value, ndigits)
    if isinstance(value, list):
        return [_round_floats_deep(v, ndigits=ndigits) for v in value]
    if isinstance(value, dict):
        return {k: _round_floats_deep(v, ndigits=ndigits) for k, v in value.items()}
    return value


@pytest.mark.expensive
def test_transcribe_apollo_11(repo_root: Path, tmp_path: Path, snapshot):
    """Test transcribing a 180s Apollo-11 clip with chunk-size 60."""
    source_audio = repo_root / "test_data" / "Apollo-11_Day-05-Highlights_700s.mp3"
    test_audio = tmp_path / "Apollo-11_Day-05-Highlights_700s.mp3"
    shutil.copy2(source_audio, test_audio)

    output_path = tmp_path / "apollo.captions_json"

    result = CliRunner().invoke(
        app,
        [
            str(test_audio),
            *("--output", str(output_path)),
            *("--chunk-size", "60"),
            *("--model", MODEL_PARAKEET),
            "--deterministic-ids",
            "--no-embed",
        ],
    )

    assert result.exit_code == 0, f"Transcription failed: {result.output}"
    assert output_path.exists(), "Output captions JSON file was not created"

    doc = parse_captions_json_file(output_path)

    payload = doc.model_dump(by_alias=True, exclude_none=True)
    payload = _round_floats_deep(payload, ndigits=3)
    assert payload == snapshot

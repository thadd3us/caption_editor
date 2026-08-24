"""End-to-end smoke + parity test for the Rust transcribe-rs / embed-rs CLIs.

These tests download real models the first time and run on real audio, so
they're marked ``expensive`` and skipped by default. Triggered manually:

    TRANSCRIBE_RS_BIN=$(bazel info bazel-bin)/transcribe_rs/transcribe-rs/transcribe-rs \\
    EMBED_RS_BIN=$(bazel info bazel-bin)/transcribe_rs/embed-rs/embed-rs \\
    bazel test //transcribe:transcribe_rs_parity_test --test_tag_filters=expensive

The pure-logic post-processing port already has cross-language parity coverage
in //transcribe_rs/caption-core:post_processing_pipeline (same fixtures as
//transcribe:asr_results_to_captions_post_processing_pipeline_test). These
CLI-level tests are the complementary "does the whole stack actually run"
check that can't be unit-tested away.
"""

import json
import os
import subprocess
from pathlib import Path

import pytest

from captions_json5_lib import parse_captions_json5_file


def _rust_bin(env_var: str) -> Path:
    """Resolve the Rust binary path from env var. Skip if not set."""
    value = os.environ.get(env_var)
    if not value:
        pytest.skip(f"{env_var} not set — point it at the Rust binary path")
    p = Path(value)
    if not p.exists():
        pytest.skip(f"{env_var}={value} does not exist")
    return p


@pytest.mark.expensive
def test_transcribe_rs_on_short_wav(repo_root: Path, tmp_path: Path) -> None:
    """End-to-end: Rust transcribe-rs reads a 10s WAV, writes a parseable doc.

    `--no-embed` keeps this about transcription. Embedding is covered by
    `test_embed_rs_writes_embeddings`, and since a failed embed is now a
    warning rather than a non-zero exit, leaving it on would neither be
    asserted here nor caught by the `returncode == 0` check below.
    """
    bin_path = _rust_bin("TRANSCRIBE_RS_BIN")
    audio = repo_root / "test_data" / "test-audio-10s.wav"
    output = tmp_path / "out.captions_json5"

    result = subprocess.run(
        [
            str(bin_path),
            str(audio),
            "--output",
            str(output),
            "--chunk-size",
            "10",
            "--overlap",
            "5",
            "--deterministic-ids",
            "--no-embed",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        f"transcribe-rs failed (exit {result.returncode})\n"
        f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )
    assert output.exists(), "transcribe-rs did not write the output file"

    doc = parse_captions_json5_file(output)

    # Structural assertions only — we don't snapshot text because parakeet-rs's
    # word-level + gap-grouping path produces different sentence punctuation
    # than Python NeMo on the same audio (documented in transcribe-rs/src/main.rs).
    assert doc.metadata.id == "doc_id", "deterministic-ids should set doc_id"
    assert len(doc.segments) > 0, "expected at least one segment"
    assert all(seg.id.startswith("id_") for seg in doc.segments), (
        "deterministic-ids should produce id_NNNNN segment ids"
    )
    assert all(seg.end_time > seg.start_time for seg in doc.segments)
    assert doc.raw_asr_output is not None, "raw_asr_output snapshot must be set"
    assert len(doc.raw_asr_output.segments) >= len(doc.segments), (
        "raw_asr_output should hold at least as many pre-merge segments as final"
    )


@pytest.mark.expensive
def test_embed_rs_writes_embeddings(repo_root: Path, tmp_path: Path) -> None:
    """End-to-end: embed-rs reads a .captions_json5, writes back with embeddings."""
    transcribe_bin = _rust_bin("TRANSCRIBE_RS_BIN")
    embed_bin = _rust_bin("EMBED_RS_BIN")

    audio_src = repo_root / "test_data" / "test-audio-10s.wav"
    audio = tmp_path / "test-audio-10s.wav"  # copy so mediaFilePath is portable
    audio.write_bytes(audio_src.read_bytes())
    output = tmp_path / "out.captions_json5"

    # First transcribe (we need a captions_json5 with segments to embed).
    # `--no-embed` because this test drives embed-rs explicitly below; without
    # it transcribe-rs would auto-embed and we'd embed the same file twice.
    subprocess.run(
        [
            str(transcribe_bin),
            str(audio),
            "--output",
            str(output),
            "--chunk-size",
            "10",
            "--overlap",
            "5",
            "--deterministic-ids",
            "--no-embed",
        ],
        check=True,
    )

    # Then embed.
    embed = subprocess.run(
        [str(embed_bin), str(output)],
        check=False,
        capture_output=True,
        text=True,
    )
    assert embed.returncode == 0, (
        f"embed-rs failed (exit {embed.returncode})\nstderr:\n{embed.stderr}"
    )

    doc = parse_captions_json5_file(output)
    assert doc.embeddings is not None, "embed-rs should populate embeddings[]"
    assert len(doc.embeddings) > 0
    # Cross-check the base64 codec — every embedding decodes to >0 floats.
    from schema import decode_embedding

    for e in doc.embeddings:
        vec = decode_embedding(e.speaker_embedding)
        assert len(vec) > 0, "decoded embedding should be non-empty"
        assert all(isinstance(v, float) for v in vec)


@pytest.mark.expensive
def test_transcribe_rs_output_matches_pydantic_schema(
    repo_root: Path, tmp_path: Path
) -> None:
    """The Rust binary writes a doc that parses cleanly against the Python schema.

    This is the strongest schema-parity assertion we get without solving the
    parakeet word/sentence question: if the JSON5 here parses through the
    *Pydantic* validator without errors, the Rust serde mirror and the
    Python schema agree on field names, types, and aliases.
    """
    bin_path = _rust_bin("TRANSCRIBE_RS_BIN")
    audio = repo_root / "test_data" / "test-audio-10s.wav"
    output = tmp_path / "out.captions_json5"

    subprocess.run(
        [
            str(bin_path),
            str(audio),
            "--output",
            str(output),
            "--deterministic-ids",
            "--no-embed",
        ],
        check=True,
    )

    # Round-trip: parse with Pydantic, re-serialize, parse again.
    doc = parse_captions_json5_file(output)
    payload = doc.model_dump(by_alias=True, exclude_none=True)

    # Spot-check the camelCase aliases serde wrote actually round-trip via Pydantic.
    raw = json.loads(output.read_text().split("\n", 3)[3])
    assert "startTime" in raw["segments"][0]
    assert "endTime" in raw["segments"][0]
    # rawAsrOutput is the snake_case-on-the-wire ASR snapshot — chunkStart is camelCase.
    assert "rawAsrOutput" in raw
    assert "chunkStart" in raw["rawAsrOutput"]["segments"][0]
    assert payload["metadata"]["id"] == "doc_id"

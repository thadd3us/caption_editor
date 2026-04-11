"""Tests for bulk ASR/embedding CLI.

All tests use MockRecognizer + synthetic silent WAV files, so they run
fast without downloading any model weights.
"""

import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from typer.testing import CliRunner

from bulk_cli import (
    MEDIA_EXTENSIONS,
    app,
    atomic_write_captions_json,
    captions_path_for,
    find_media_files,
    get_audio_duration_seconds,
)
from captions_json_lib import parse_captions_json_file
from recognizer import MockRecognizer
from schema import CaptionsDocument, TranscriptMetadata, TranscriptSegment


# ── Helpers ───────────────────────────────────────────────────────────


def make_silent_wav(path: Path, duration_seconds: float = 3.0) -> None:
    """Create a silent 16 kHz mono WAV file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = int(16000 * duration_seconds)
    sf.write(str(path), np.zeros(samples, dtype=np.float32), 16000)


def make_minimal_captions_json(path: Path, media_filename: str) -> None:
    """Write a minimal valid .captions_json file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "metadata": {"id": "test-doc", "mediaFilePath": media_filename},
        "segments": [
            {
                "id": "seg-0",
                "index": 0,
                "startTime": 0.0,
                "endTime": 1.0,
                "text": "Hello world",
                "timestamp": "2025-01-01T00:00:00+00:00",
            }
        ],
    }
    path.write_text(json.dumps(doc, indent=2) + "\n")


runner = CliRunner()


# ── Tests ─────────────────────────────────────────────────────────────


class TestFindMediaFiles:
    def test_finds_all_extensions(self, tmp_path: Path):
        """All MEDIA_EXTENSIONS are discovered."""
        for ext in MEDIA_EXTENSIONS:
            # find_media_files only checks extensions, so empty files suffice.
            (tmp_path / f"test{ext}").write_bytes(b"")

        found = find_media_files(tmp_path)
        found_exts = {p.suffix.lower() for p in found}
        assert found_exts == MEDIA_EXTENSIONS

    def test_ignores_non_media(self, tmp_path: Path):
        """Non-media files (txt, py, captions_json) are ignored."""
        (tmp_path / "readme.txt").write_text("hi")
        (tmp_path / "script.py").write_text("pass")
        (tmp_path / "captions.captions_json").write_text("{}")
        make_silent_wav(tmp_path / "audio.wav")

        found = find_media_files(tmp_path)
        assert len(found) == 1
        assert found[0].name == "audio.wav"

    def test_recurses_subdirectories(self, tmp_path: Path):
        """Files in nested subdirectories are found."""
        make_silent_wav(tmp_path / "a" / "b" / "deep.mp3")
        make_silent_wav(tmp_path / "top.wav")

        found = find_media_files(tmp_path)
        names = {p.name for p in found}
        assert names == {"deep.mp3", "top.wav"}

    def test_sorted_output(self, tmp_path: Path):
        """Results are sorted for deterministic processing order."""
        make_silent_wav(tmp_path / "z.wav")
        make_silent_wav(tmp_path / "a.wav")
        make_silent_wav(tmp_path / "m.wav")

        found = find_media_files(tmp_path)
        assert found == sorted(found)


class TestCaptionsPathFor:
    def test_basic(self):
        assert captions_path_for(Path("/a/b/song.mp3")) == Path(
            "/a/b/song.captions_json"
        )


class TestGetAudioDuration:
    def test_wav_duration(self, tmp_path: Path):
        """Duration probe works on WAV files."""
        wav = tmp_path / "test.wav"
        make_silent_wav(wav, 5.0)
        dur = get_audio_duration_seconds(wav)
        assert abs(dur - 5.0) < 0.1

    def test_nonexistent_returns_zero(self, tmp_path: Path):
        """Missing file returns 0 instead of raising."""
        dur = get_audio_duration_seconds(tmp_path / "nope.wav")
        assert dur == 0.0


class TestAtomicWrite:
    def test_writes_valid_json(self, tmp_path: Path):
        """Atomic write produces a readable captions_json file."""
        doc = CaptionsDocument(  # type: ignore[reportCallIssue]
            metadata=TranscriptMetadata(id="doc-1", mediaFilePath="test.wav"),
            title="test",
            segments=[
                TranscriptSegment(  # type: ignore[reportCallIssue]
                    id="s0",
                    index=0,
                    startTime=0.0,
                    endTime=1.0,
                    text="Hello",
                    timestamp="2025-01-01T00:00:00+00:00",
                )
            ],
        )
        out = tmp_path / "out.captions_json"
        atomic_write_captions_json(out, doc)

        assert out.exists()
        parsed = parse_captions_json_file(out)
        assert parsed.metadata.id == "doc-1"

    def test_no_partial_on_error(self, tmp_path: Path):
        """If serialization fails, no file is left behind."""
        out = tmp_path / "fail.captions_json"

        class BadDoc:
            pass

        with pytest.raises(Exception):
            atomic_write_captions_json(out, BadDoc())

        assert not out.exists()
        # Also no temp files left
        assert len(list(tmp_path.glob("*.tmp"))) == 0


class TestMockRecognizer:
    def test_deterministic_output(self, tmp_path: Path):
        """MockRecognizer produces consistent segments from audio duration."""
        wav = tmp_path / "test.wav"
        make_silent_wav(wav, 9.0)

        rec = MockRecognizer()
        segs1 = rec.transcribe(wav)
        segs2 = rec.transcribe(wav)

        assert len(segs1) == 3  # 9s / 3s per segment
        assert len(segs1) == len(segs2)
        for s1, s2 in zip(segs1, segs2):
            assert s1.text == s2.text
            assert s1.start == s2.start

    def test_word_timestamps(self, tmp_path: Path):
        """Each mock segment has word-level timestamps."""
        wav = tmp_path / "test.wav"
        make_silent_wav(wav, 3.0)

        segs = MockRecognizer().transcribe(wav)
        assert len(segs) == 1
        assert segs[0].words is not None
        assert len(segs[0].words) == 4  # MOCK_WORDS_PER_SEGMENT


class TestBulkCLI:
    """Integration tests for the full bulk_cli pipeline using mock recognizer."""

    def test_processes_new_files(self, tmp_path: Path):
        """New media files get transcribed and saved."""
        make_silent_wav(tmp_path / "a.wav", 3.0)
        make_silent_wav(tmp_path / "b.wav", 3.0)

        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0, result.output

        assert (tmp_path / "a.captions_json").exists()
        assert (tmp_path / "b.captions_json").exists()

        # Verify the written files are valid
        doc = parse_captions_json_file(tmp_path / "a.captions_json")
        assert len(doc.segments) > 0

    def test_skips_existing_captions(self, tmp_path: Path):
        """Files with existing .captions_json are skipped."""
        make_silent_wav(tmp_path / "done.wav", 3.0)
        make_minimal_captions_json(tmp_path / "done.captions_json", "done.wav")

        make_silent_wav(tmp_path / "new.wav", 3.0)

        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0, result.output

        # "done" should not be re-processed — its content should be unchanged
        doc = parse_captions_json_file(tmp_path / "done.captions_json")
        assert doc.metadata.id == "test-doc"  # original, not overwritten

        # "new" should be processed
        assert (tmp_path / "new.captions_json").exists()

    def test_resume_after_partial(self, tmp_path: Path):
        """Re-running after partial completion picks up where we left off."""
        make_silent_wav(tmp_path / "a.wav", 3.0)
        make_silent_wav(tmp_path / "b.wav", 3.0)

        # Process everything
        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0

        # Both files done
        assert (tmp_path / "a.captions_json").exists()
        assert (tmp_path / "b.captions_json").exists()

        # Re-run — should skip both
        result2 = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result2.exit_code == 0
        assert "Nothing to do" in result2.output

    def test_always_update_embeddings(self, tmp_path: Path):
        """--always-update-speaker-embeddings re-embeds existing files."""
        make_silent_wav(tmp_path / "audio.wav", 3.0)
        make_minimal_captions_json(tmp_path / "audio.captions_json", "audio.wav")

        result = runner.invoke(
            app,
            [
                str(tmp_path),
                "--recognizer",
                "mock",
                "--always-update-speaker-embeddings",
            ],
        )
        assert result.exit_code == 0, result.output

        doc = parse_captions_json_file(tmp_path / "audio.captions_json")
        # The original doc had no embeddings; now it should
        assert doc.embeddings is not None
        assert len(doc.embeddings) > 0

    def test_subdirectories(self, tmp_path: Path):
        """Media in nested subdirectories is found and processed."""
        make_silent_wav(tmp_path / "sub" / "deep" / "audio.mp3", 3.0)

        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0, result.output

        assert (tmp_path / "sub" / "deep" / "audio.captions_json").exists()

    def test_empty_directory(self, tmp_path: Path):
        """Empty directory exits cleanly."""
        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0

    def test_embeddings_included(self, tmp_path: Path):
        """ASR pass also produces speaker embeddings."""
        make_silent_wav(tmp_path / "audio.wav", 6.0)

        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0, result.output

        doc = parse_captions_json_file(tmp_path / "audio.captions_json")
        assert doc.embeddings is not None
        assert len(doc.embeddings) > 0
        assert doc.embedding_model is not None

    def test_progress_by_minutes(self, tmp_path: Path):
        """Progress bar reports minutes, not file count."""
        make_silent_wav(tmp_path / "a.wav", 6.0)
        make_silent_wav(tmp_path / "b.wav", 12.0)

        result = runner.invoke(app, [str(tmp_path), "--recognizer", "mock"])
        assert result.exit_code == 0
        # Output should mention minutes
        assert "min" in result.output.lower() or "minutes" in result.output.lower()

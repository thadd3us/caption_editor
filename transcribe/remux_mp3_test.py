"""Tests for MP3 remuxing (adding Xing seek table)."""

import subprocess
from pathlib import Path

import pytest

from repo_root import REPO_ROOT
from transcribe_cli import remux_mp3_with_seek_table


def _has_xing_header(mp3_path: Path) -> bool:
    """Check if an MP3 file contains a Xing or Info header in the first 4KB."""
    data = mp3_path.read_bytes()[:4096]
    return b"Xing" in data or b"Info" in data


def _create_mp3_without_toc(wav_path: Path, output_mp3: Path) -> None:
    """Encode a WAV to MP3 without a Xing seek table using ffmpeg."""
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [
            ffmpeg_exe,
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "64k",
            "-write_xing",
            "0",
            "-y",
            str(output_mp3),
        ],
        check=True,
        capture_output=True,
    )


@pytest.fixture
def mp3_without_toc(tmp_path: Path) -> Path:
    """Create a short MP3 file without a Xing/VBRI header."""
    wav_source = REPO_ROOT / "test_data" / "full_pipeline" / "OSR_us_000_0010_8k.wav"
    mp3_path = tmp_path / "no_toc.mp3"
    _create_mp3_without_toc(wav_source, mp3_path)
    assert mp3_path.exists()
    assert not _has_xing_header(mp3_path), "Fixture MP3 should not have a Xing header"
    return mp3_path


def test_remux_adds_xing_header(mp3_without_toc: Path) -> None:
    """Remuxing an MP3 without a TOC should replace it in-place with a Xing header."""
    original_size = mp3_without_toc.stat().st_size

    result_path = remux_mp3_with_seek_table(mp3_without_toc)

    assert result_path == mp3_without_toc  # Should be the same path
    assert _has_xing_header(result_path), "Remuxed MP3 should have a Xing header"

    # A backup should have been created
    backup_path = mp3_without_toc.with_suffix(".original.mp3")
    assert backup_path.exists(), "Original file should be backed up"
    assert backup_path.stat().st_size == original_size

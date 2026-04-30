"""Tests for media-path normalization at write time.

The serializer rewrites ``mediaFilePath`` so it is meaningful relative to the
captions file's directory. CLI users typically type relative paths against
their CWD; the captions output may go anywhere. We want stored paths that
"travel" with the captions file, with no surprising ``..``-laced relpaths.
"""

from __future__ import annotations

import os

from captions_json5_lib import _normalize_media_path_for_serialization
from schema import CaptionsDocument, TranscriptMetadata


def _doc(media: str) -> CaptionsDocument:
    return CaptionsDocument(
        metadata=TranscriptMetadata(id="d", mediaFilePath=media),
        title=None,
        segments=[],
        history=None,
        embeddings=None,
        embeddingModel=None,
        uiState=None,
        rawAsrOutput=None,
    )


def test_relative_input_resolves_against_cwd_then_relpath_to_captions(
    tmp_path, monkeypatch
):
    media_dir = tmp_path / "media"
    media_dir.mkdir()
    media = media_dir / "audio.wav"
    media.write_bytes(b"")
    captions = media_dir / "audio.captions_json5"

    monkeypatch.chdir(media_dir)
    out = _normalize_media_path_for_serialization(_doc("audio.wav"), captions)
    assert out.metadata.media_file_path == "audio.wav"


def test_sibling_directories_use_absolute_not_double_dot(tmp_path, monkeypatch):
    """The original bug: media in ../test_data, captions in /tmp → '../...' is brittle."""
    src = tmp_path / "test_data"
    src.mkdir()
    media = src / "audio.wav"
    media.write_bytes(b"")
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    captions = out_dir / "audio.captions_json5"

    monkeypatch.chdir(src)
    out = _normalize_media_path_for_serialization(_doc("audio.wav"), captions)
    # Would be "../test_data/audio.wav" via relpath; we promote to absolute.
    result = out.metadata.media_file_path
    assert result == str(media.resolve())
    assert result is not None and not result.startswith("..")


def test_media_inside_captions_subdirectory_stays_relative(tmp_path):
    project = tmp_path / "project"
    sub = project / "audio"
    sub.mkdir(parents=True)
    media = sub / "clip.wav"
    media.write_bytes(b"")
    captions = project / "clip.captions_json5"

    out = _normalize_media_path_for_serialization(_doc(str(media)), captions)
    assert out.metadata.media_file_path == os.path.join("audio", "clip.wav")


def test_no_captions_path_leaves_media_untouched(tmp_path):
    out = _normalize_media_path_for_serialization(_doc("anything"), None)
    assert out.metadata.media_file_path == "anything"


def test_no_media_path_is_a_noop(tmp_path):
    captions = tmp_path / "x.captions_json5"
    out = _normalize_media_path_for_serialization(_doc(""), captions)
    assert out.metadata.media_file_path == ""

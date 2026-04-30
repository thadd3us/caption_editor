"""Shared `.captions_json5` parsing and serialization utilities."""

from __future__ import annotations

import json
import json5
import os
from pathlib import Path
from typing import Any, Optional, cast

from constants import ASR_COMMIT_HASH
from schema import CaptionsDocument


def _normalize_media_path_for_serialization(
    document: CaptionsDocument, captions_path: Optional[Path]
) -> CaptionsDocument:
    """Rewrite ``mediaFilePath`` so it is meaningful relative to the captions file.

    Rules at write time:

    - If we don't know the captions file path, leave the media path alone.
    - Otherwise, resolve the media path to absolute (interpreting any relative
      input against CWD, since that's how the user typed it on the CLI).
    - Compute it relative to the captions file's parent. If that relpath stays
      inside the captions directory (no leading ``..``), store the relpath.
    - Otherwise, store the absolute path. A ``..``-laced relpath is brittle —
      it breaks the moment either file moves — so we'd rather be explicit.
    """
    if not captions_path:
        return document

    media = document.metadata.media_file_path
    if not media:
        return document

    try:
        media_abs = Path(media).expanduser().resolve()
        captions_abs = captions_path.expanduser().resolve()
        rel = os.path.relpath(str(media_abs), start=str(captions_abs.parent))
        chosen = rel if not rel.startswith("..") else str(media_abs)
    except Exception:
        return document

    if chosen == media:
        return document
    doc = document.model_copy(deep=True)
    doc.metadata.media_file_path = chosen
    return doc


def _stable_json_dumps(obj: Any) -> str:
    return json.dumps(obj, indent=2) + "\n"


def _migrate_embedding_model(data: dict[str, Any]) -> dict[str, Any]:
    """Migrate old per-embedding ``model`` field to document-level ``embeddingModel``."""
    if data.get("embeddingModel") or data.get("embedding_model"):
        return data
    embeddings = data.get("embeddings")
    if not embeddings or not isinstance(embeddings, list):
        return data
    for emb in embeddings:
        if isinstance(emb, dict) and emb.get("model"):
            data["embeddingModel"] = emb["model"]
            break
    # Strip per-embedding model so Pydantic doesn't warn / future code doesn't see stale data
    for emb in embeddings:
        if isinstance(emb, dict):
            emb.pop("model", None)
    return data


def parse_captions_json5_file(path: Path) -> CaptionsDocument:
    data = cast(dict[str, Any], json5.loads(path.read_text()))
    return CaptionsDocument.model_validate(_migrate_embedding_model(data))


def parse_captions_json5_string(content: str) -> CaptionsDocument:
    data = cast(dict[str, Any], json5.loads(content))
    return CaptionsDocument.model_validate(_migrate_embedding_model(data))


def serialize_captions_json5(
    document: CaptionsDocument, *, captions_path: Optional[Path] = None
) -> str:
    doc_to_write = _normalize_media_path_for_serialization(document, captions_path)
    payload = doc_to_write.model_dump(by_alias=True, exclude_none=True)
    json_str = _stable_json_dumps(payload)
    header = (
        "// Caption Editor: https://github.com/thadd3us/caption_editor/\n"
        f"// File schema TypeScript: https://github.com/thadd3us/caption_editor/blob/{ASR_COMMIT_HASH}/src/types/schema.ts\n"
        f"// File schema Python: https://github.com/thadd3us/caption_editor/blob/{ASR_COMMIT_HASH}/transcribe/schema.py\n"
    )
    return header + json_str


def write_captions_json5_file(path: Path, document: CaptionsDocument) -> None:
    path.write_text(serialize_captions_json5(document, captions_path=path))

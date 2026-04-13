"""Shared `.captions_json5` parsing and serialization utilities."""

from __future__ import annotations

import json
import json5
import os
from pathlib import Path
from typing import Any, Optional

from constants import ASR_COMMIT_HASH
from schema import CaptionsDocument


def _convert_media_path_to_relative_if_possible(
    document: CaptionsDocument, captions_path: Optional[Path]
) -> CaptionsDocument:
    if not captions_path:
        return document

    media = document.metadata.media_file_path
    if not media:
        return document

    try:
        media_path = Path(media)
        if media_path.is_absolute() and captions_path.is_absolute():
            rel = os.path.relpath(str(media_path), start=str(captions_path.parent))
            doc = document.model_copy(deep=True)
            doc.metadata.media_file_path = rel
            return doc
    except Exception:
        return document

    return document


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
    data = json5.loads(path.read_text())
    return CaptionsDocument.model_validate(_migrate_embedding_model(data))


def parse_captions_json5_string(content: str) -> CaptionsDocument:
    data = json5.loads(content)
    return CaptionsDocument.model_validate(_migrate_embedding_model(data))


def serialize_captions_json5(
    document: CaptionsDocument, *, captions_path: Optional[Path] = None
) -> str:
    doc_to_write = _convert_media_path_to_relative_if_possible(document, captions_path)
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

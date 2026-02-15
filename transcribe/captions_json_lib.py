"""Shared `.captions_json` parsing and serialization utilities."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

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
    return json.dumps(obj, sort_keys=True, indent=2) + "\n"


def parse_captions_json_file(path: Path) -> CaptionsDocument:
    data = json.loads(path.read_text())
    return CaptionsDocument.model_validate(data)


def parse_captions_json_string(content: str) -> CaptionsDocument:
    data = json.loads(content)
    return CaptionsDocument.model_validate(data)


def serialize_captions_json(
    document: CaptionsDocument, *, captions_path: Optional[Path] = None
) -> str:
    doc_to_write = _convert_media_path_to_relative_if_possible(document, captions_path)
    payload = doc_to_write.model_dump(by_alias=True, exclude_none=True)
    return _stable_json_dumps(payload)


def write_captions_json_file(path: Path, document: CaptionsDocument) -> None:
    path.write_text(serialize_captions_json(document, captions_path=path))

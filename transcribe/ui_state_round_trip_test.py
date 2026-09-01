"""The editor's view state must survive a trip through the Python tooling.

``embed_cli`` rewrites the *whole* captions document, so any ``uiState`` key the
Python side fails to carry is silently erased by "Compute Speaker Embeddings".

These tests compare ``uiState`` **structurally**, against the input, rather than
checking a hand-written list of fields. That distinction is the whole point. The
previous version of this file enumerated the fields it knew about and passed
happily while ``sort``, ``sortIndex``, ``flex``, ``aggFunc``, ``pivot``,
``pivotIndex``, ``rowGroup`` and ``rowGroupIndex`` were being stripped from every
``columnState`` entry — the user's sort order and column widths, gone on every
embed. A test that lists fields can only ever catch the fields someone
remembered to list; ``schema.py`` now models ``uiState`` as an opaque mapping so
there is no list to forget.
"""

from __future__ import annotations

import json5
from pathlib import Path

from captions_json5_lib import parse_captions_json5_string, serialize_captions_json5
from schema import CaptionsDocument, TranscriptMetadata, TranscriptSegment

# Deliberately includes keys `schema.py` has never heard of, and every
# `columnState` key AG Grid's `getColumnState()` actually emits.
UI_STATE = {
    "captionHeight": 180.0,
    "leftPanelWidth": 55.0,
    "playheadSeconds": 91.5,
    "selectedSegmentId": "seg-1",
    "playbackRate": 0.75,
    "filterModel": {"text": {"type": "contains", "filter": "hi"}},
    "columnState": [
        {
            "colId": "index",
            "width": 80,
            "hide": False,
            "sort": "asc",
            "sortIndex": 0,
            "flex": 1,
            "pinned": "left",
            "aggFunc": None,
            "pivot": False,
            "pivotIndex": None,
            "rowGroup": False,
            "rowGroupIndex": None,
        }
    ],
    "aFieldInventedTomorrow": {"nested": [1, 2, 3]},
}


def _doc_with_ui_state() -> CaptionsDocument:
    return CaptionsDocument(
        metadata=TranscriptMetadata(id="doc-1", mediaFilePath=None),
        title=None,
        segments=[
            TranscriptSegment(
                id="seg-1",
                index=0,
                startTime=0.0,
                endTime=5.0,
                text="Hello",
                words=None,
                speakerName=None,
                rating=None,
                timestamp=None,
                verified=None,
                asrModel=None,
                notes=None,
            )
        ],
        history=None,
        embeddings=None,
        embeddingModel=None,
        uiState=UI_STATE,
        rawAsrOutput=None,
    )


def test_ui_state_survives_serialize_parse_round_trip(tmp_path: Path) -> None:
    captions_path = tmp_path / "a.captions_json5"
    serialized = serialize_captions_json5(
        _doc_with_ui_state(), captions_path=captions_path
    )
    parsed = parse_captions_json5_string(serialized)

    assert parsed.ui_state == UI_STATE


def test_ui_state_written_by_the_editor_is_not_dropped(tmp_path: Path) -> None:
    """Parse a file exactly as the Electron app writes it, then write it back."""
    editor_output = """
    {
      metadata: { id: 'doc-1' },
      segments: [ { id: 'seg-1', index: 0, startTime: 0, endTime: 5, text: 'Hello' } ],
      uiState: {
        captionHeight: 180,
        leftPanelWidth: 55,
        playheadSeconds: 91.5,
        selectedSegmentId: 'seg-1',
        playbackRate: 0.75,
        columnState: [
          { colId: 'index', width: 80, hide: false, sort: 'asc', sortIndex: 0,
            flex: 1, pinned: 'left', aggFunc: null, pivot: false, pivotIndex: null,
            rowGroup: false, rowGroupIndex: null },
        ],
      },
    }
    """
    loaded = json5.loads(editor_output)
    assert isinstance(loaded, dict)
    expected = loaded["uiState"]

    parsed = parse_captions_json5_string(editor_output)
    assert parsed.ui_state == expected

    rewritten = parse_captions_json5_string(
        serialize_captions_json5(parsed, captions_path=tmp_path / "a.captions_json5")
    )
    assert rewritten.ui_state is not None
    assert rewritten.ui_state == expected

    # Spot-check the two that used to be destroyed, so a regression reads clearly
    # rather than as a whole-mapping mismatch.
    col = rewritten.ui_state["columnState"][0]
    assert col["sort"] == "asc"
    assert col["flex"] == 1

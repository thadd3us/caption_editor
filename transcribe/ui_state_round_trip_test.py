"""The editor's view state must survive a trip through the Python tooling.

``embed_cli`` rewrites the *whole* captions document. Any ``uiState`` field the
Python schema does not know about is silently dropped on that rewrite — so
"Compute Speaker Embeddings" would quietly erase the user's saved playhead,
selection, and grid layout. This test pins the schema fields together with
``src/types/schema.ts``.
"""

from __future__ import annotations

from pathlib import Path

from captions_json5_lib import parse_captions_json5_string, serialize_captions_json5
from schema import CaptionsDocument, TranscriptMetadata, TranscriptSegment, UIState


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
        uiState=UIState(
            columnState=None,
            filterModel={"text": {"type": "contains", "filter": "hi"}},
            leftPanelWidth=42.5,
            captionHeight=250.0,
            playheadSeconds=12.75,
            selectedSegmentId="seg-1",
        ),
        rawAsrOutput=None,
    )


def test_ui_state_survives_serialize_parse_round_trip(tmp_path: Path) -> None:
    captions_path = tmp_path / "a.captions_json5"
    serialized = serialize_captions_json5(
        _doc_with_ui_state(), captions_path=captions_path
    )
    parsed = parse_captions_json5_string(serialized)

    assert parsed.ui_state is not None
    assert parsed.ui_state.playhead_seconds == 12.75
    assert parsed.ui_state.selected_segment_id == "seg-1"
    assert parsed.ui_state.left_panel_width == 42.5
    assert parsed.ui_state.caption_height == 250.0
    assert parsed.ui_state.filter_model == {
        "text": {"type": "contains", "filter": "hi"}
    }


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
      },
    }
    """
    parsed = parse_captions_json5_string(editor_output)
    assert parsed.ui_state is not None
    assert parsed.ui_state.playhead_seconds == 91.5
    assert parsed.ui_state.selected_segment_id == "seg-1"

    rewritten = parse_captions_json5_string(
        serialize_captions_json5(parsed, captions_path=tmp_path / "a.captions_json5")
    )
    assert rewritten.ui_state is not None
    assert rewritten.ui_state.playhead_seconds == 91.5
    assert rewritten.ui_state.selected_segment_id == "seg-1"
    assert rewritten.ui_state.left_panel_width == 55
    assert rewritten.ui_state.caption_height == 180

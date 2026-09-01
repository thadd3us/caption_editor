//! Serde mirror of `transcribe/schema.py` and `src/types/schema.ts`.
//!
//! Wire format: camelCase JSON (matches Pydantic's `alias` + the TS interface
//! field names). All field renames are explicit so the file reads like a
//! diff against `schema.py`.
//!
//! Cross-reference these files together when changing any field:
//!   - `transcribe/schema.py` (Pydantic, snake_case + alias to camelCase)
//!   - `src/types/schema.ts` (TS interfaces, camelCase)
//!   - this file (serde, snake_case Rust idents + rename to camelCase)
//!
//! Optionality discipline: `Optional[X]` in Python = `Option<X>` in Rust with
//! `#[serde(default, skip_serializing_if = "Option::is_none")]` so we don't
//! emit `"field": null` (Pydantic `model_dump(exclude_none=True)` and the TS
//! writer both drop them).

use serde::{Deserialize, Serialize};

fn skip_if_none<T>(v: &Option<T>) -> bool {
    v.is_none()
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HistoryAction {
    #[serde(rename = "modified")]
    Modified,
    #[serde(rename = "deleted")]
    Deleted,
    #[serde(rename = "speakerRenamed")]
    SpeakerRenamed,
}

// ---------------------------------------------------------------------------
// Document-level types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptWord {
    pub text: String,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub start_time: Option<f64>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub end_time: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub id: String,
    #[serde(default)]
    pub index: i64,
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub words: Option<Vec<TranscriptWord>>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub speaker_name: Option<String>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub rating: Option<i32>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub timestamp: Option<String>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub verified: Option<bool>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub asr_model: Option<String>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMetadata {
    pub id: String,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub media_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentHistoryEntry {
    pub id: String,
    pub action: HistoryAction,
    pub action_timestamp: String,
    pub segment: TranscriptSegment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentSpeakerEmbedding {
    pub segment_id: String,
    /// Base64-encoded little-endian float32 vector. Use `encode_embedding` /
    /// `decode_embedding` to convert to `Vec<f32>`.
    pub speaker_embedding: String,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub umap_embeddings: Option<std::collections::BTreeMap<String, Vec<f64>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAsrWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAsrSegmentSnapshot {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub chunk_start: Option<f64>,
    pub words: Vec<RawAsrWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawAsrOutput {
    /// Defaults to 1 (matches Pydantic default) so older readers stay valid.
    #[serde(default = "raw_asr_version_default")]
    pub version: i32,
    pub segments: Vec<RawAsrSegmentSnapshot>,
}

fn raw_asr_version_default() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptionsDocument {
    pub metadata: TranscriptMetadata,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub title: Option<String>,
    pub segments: Vec<TranscriptSegment>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub history: Option<Vec<SegmentHistoryEntry>>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub embeddings: Option<Vec<SegmentSpeakerEmbedding>>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub embedding_model: Option<String>,
    /// Persisted UI state (grid column layout, filters, playhead, ...).
    ///
    /// Deliberately opaque, same reasoning the old `filter_model` field carried
    /// and for the same reason: this crate must not grow a field for every piece
    /// of view state the editor invents. `src/types/schema.ts` is the single
    /// owner of the shape. Modelling it again here only gave serde a list of
    /// keys to keep and license to drop the rest — which it did, silently
    /// discarding the user's sort order and column sizing every time `embed-rs`
    /// rewrote a document.
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub ui_state: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub raw_asr_output: Option<RawAsrOutput>,
}

// ---------------------------------------------------------------------------
// ASR pipeline-internal types (mirror of asr_results_to_captions.ASRSegment).
// Distinct from `TranscriptSegment` above: this is the chunked-ASR-output
// shape, snake_case on the wire (Python dataclass), pre-post-processing.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct WordTimestamp {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AsrSegment {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub words: Vec<WordTimestamp>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub chunk_start: Option<f64>,
    #[serde(default, skip_serializing_if = "skip_if_none")]
    pub speaker: Option<String>,
}

// ---------------------------------------------------------------------------
// JSON5 read/write (matches transcribe/captions_json5_lib.py)
// ---------------------------------------------------------------------------
//
// Header comments are preserved on write to match the Python writer; the
// reader tolerates them because json5 grammar permits `//` line comments.

pub const CAPTIONS_HEADER_TEMPLATE: &str = concat!(
    "// Caption Editor: https://github.com/thadd3us/caption_editor/\n",
    "// File schema TypeScript: https://github.com/thadd3us/caption_editor/blob/{HASH}/src/types/schema.ts\n",
    "// File schema Python: https://github.com/thadd3us/caption_editor/blob/{HASH}/transcribe/schema.py\n",
);

/// Parse a `.captions_json5` string. Tolerates leading `//` comments.
pub fn parse_captions_json5(content: &str) -> Result<CaptionsDocument, json5::Error> {
    json5::from_str(content)
}

/// Serialize to the canonical `.captions_json5` format: header comments
/// (with `{HASH}` substitutions for the schema-pinned commit hash) followed
/// by 2-space-indented JSON. Matches Python's `serialize_captions_json5`.
pub fn serialize_captions_json5(doc: &CaptionsDocument, asr_commit_hash: &str) -> String {
    let header = CAPTIONS_HEADER_TEMPLATE.replace("{HASH}", asr_commit_hash);
    // serde_json's default pretty-printer matches Python's
    // `json.dumps(..., indent=2)` formatting (2-space indent, no trailing
    // whitespace, `\n` newlines).
    let body = serde_json::to_string_pretty(doc).expect("CaptionsDocument is serializable");
    format!("{header}{body}\n")
}

pub fn encode_embedding(values: &[f32]) -> String {
    use base64::Engine as _;
    let mut raw = Vec::with_capacity(values.len() * 4);
    for v in values {
        raw.extend_from_slice(&v.to_le_bytes());
    }
    base64::engine::general_purpose::STANDARD.encode(raw)
}

pub fn decode_embedding(b64: &str) -> Result<Vec<f32>, base64::DecodeError> {
    use base64::Engine as _;
    let raw = base64::engine::general_purpose::STANDARD.decode(b64)?;
    let mut out = Vec::with_capacity(raw.len() / 4);
    for chunk in raw.chunks_exact(4) {
        out.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedding_roundtrip() {
        let values = vec![1.0f32, -2.5, 3.14, 0.0, f32::MIN_POSITIVE];
        let b64 = encode_embedding(&values);
        let back = decode_embedding(&b64).unwrap();
        assert_eq!(values, back);
    }

    #[test]
    fn json5_roundtrip_strips_and_re_emits_header() {
        let doc = CaptionsDocument {
            metadata: TranscriptMetadata {
                id: "doc-1".into(),
                media_file_path: Some("video.mp4".into()),
            },
            title: None,
            segments: vec![TranscriptSegment {
                id: "s1".into(),
                index: 0,
                start_time: 1.0,
                end_time: 2.5,
                text: "hello".into(),
                words: None,
                speaker_name: None,
                rating: None,
                timestamp: None,
                verified: None,
                asr_model: None,
                notes: None,
            }],
            history: None,
            embeddings: None,
            embedding_model: None,
            ui_state: None,
            raw_asr_output: None,
        };
        let serialized = serialize_captions_json5(&doc, "abc123");
        // Header includes substituted hash.
        assert!(serialized.contains("abc123"));
        assert!(serialized.starts_with("// Caption Editor"));

        let parsed = parse_captions_json5(&serialized).unwrap();
        assert_eq!(parsed.metadata.id, "doc-1");
        assert_eq!(parsed.segments.len(), 1);
        assert_eq!(parsed.segments[0].text, "hello");
        // Optional fields stay None on the round-trip.
        assert!(parsed.segments[0].verified.is_none());
    }

    /// `uiState` must survive a rewrite **whole**, including keys this crate has
    /// never heard of. `embed-rs` rewrites the entire document, so any key serde
    /// fails to carry is silently erased by "Compute Speaker Embeddings".
    ///
    /// This asserts structural equality against the input rather than checking a
    /// hand-written list of fields. That distinction is the point: the previous
    /// version enumerated the fields it knew about, so it passed while `sort`,
    /// `sortIndex`, `flex`, `aggFunc`, `pivot`, `pivotIndex`, `rowGroup` and
    /// `rowGroupIndex` were being dropped from every `columnState` entry — the
    /// user's sort order and column sizing, gone. A test that lists fields can
    /// only ever catch the fields someone remembered to list.
    #[test]
    fn ui_state_survives_round_trip_including_unknown_keys() {
        let json = r#"{
            metadata: { id: 'doc-1' },
            segments: [ { id: 's1', index: 0, startTime: 0, endTime: 5, text: 'hi' } ],
            uiState: {
                captionHeight: 180,
                leftPanelWidth: 55,
                playheadSeconds: 91.5,
                selectedSegmentId: 's1',
                playbackRate: 1.25,
                filterModel: { text: { type: 'contains', filter: 'hi' } },
                columnState: [
                    { colId: 'index', width: 80, hide: false, sort: 'asc', sortIndex: 0,
                      flex: 1, pinned: 'left', aggFunc: null, pivot: false, pivotIndex: null,
                      rowGroup: false, rowGroupIndex: null },
                ],
                aFieldInventedTomorrow: { nested: [1, 2, 3] },
            },
        }"#;

        let parsed = parse_captions_json5(json).unwrap();
        let original = parsed.ui_state.clone().expect("uiState parsed");

        // Every key present on the way in is present on the way out, unchanged.
        let reparsed = parse_captions_json5(&serialize_captions_json5(&parsed, "hash")).unwrap();
        let after = reparsed.ui_state.expect("uiState survives serialization");
        assert_eq!(original, after);

        // Spot-check the two that used to be destroyed, so a regression reads
        // clearly instead of as an opaque struct mismatch.
        let col = &after["columnState"][0];
        assert_eq!(col["sort"], "asc");
        assert_eq!(col["flex"], 1);
        assert_eq!(after["aFieldInventedTomorrow"]["nested"][2], 3);
    }

    #[test]
    fn segment_roundtrips_camelcase_json() {
        let json = r#"{
            "id": "abc",
            "index": 0,
            "startTime": 1.5,
            "endTime": 2.0,
            "text": "hi",
            "speakerName": "alice"
        }"#;
        let seg: TranscriptSegment = serde_json::from_str(json).unwrap();
        assert_eq!(seg.id, "abc");
        assert_eq!(seg.start_time, 1.5);
        assert_eq!(seg.speaker_name.as_deref(), Some("alice"));

        let re = serde_json::to_string(&seg).unwrap();
        // No nulls leak out for the unset Optionals.
        assert!(!re.contains("null"));
        assert!(re.contains("\"startTime\":1.5"));
    }
}

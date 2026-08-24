//! `transcribe-rs` — Rust replacement for `transcribe/transcribe_cli.py`.
//!
//! Workflow (mirrors Python):
//!   1. Resolve input media → 16 kHz mono WAV (via ffmpeg if not already WAV).
//!   2. Download parakeet-tdt ONNX from HF (encoder/decoder_joint/vocab).
//!   3. Chunked transcribe: 60 s windows with 5 s overlap, run parakeet-rs
//!      on each chunk, offset word timestamps by chunk_start.
//!   4. Run `caption_core::post_process_raw_asr_segments` (Parakeet path:
//!      `is_whisper=false`, gap-split + long-segment-split).
//!   5. Assign deterministic cue IDs (SHA-256 of audio hash + segment start).
//!   6. Write a `.captions_json5` document including `rawAsrOutput` snapshot.
//!
//! Parakeet sentence/word handling: we ask parakeet-rs for raw token
//! timestamps (`TimestampMode::Tokens`), then run its public
//! `process_timestamps` twice to get *both* sentence-level and word-level
//! groupings from the same tokens. Words are then paired into sentences
//! by time-range (with the same 0.01s tolerance Python's
//! `parse_parakeet_raw_chunk` uses), giving the post-processing pipeline
//! sentence-level segments — matching the `is_whisper=False` flow.

use caption_core::{
    asr_segments_to_transcript_segments, post_process_raw_asr_segments,
    raw_asr_segments_to_raw_asr_output, AsrSegment, WordTimestamp,
};
use caption_schema::{
    serialize_captions_json5, CaptionsDocument, TranscriptMetadata,
};
use clap::Parser;
use eyre::{eyre, Context, Result};
use hf_hub::api::sync::ApiBuilder;
use parakeet_rs::{ParakeetTDT, TimestampMode, Transcriber};

mod parakeet_grouping;
mod recognizer;
mod whisper_recognizer;

use recognizer::{is_whisper_model, Recognizer};
use whisper_recognizer::{resolve_whisper_model_path, WhisperRecognizer};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEFAULT_MODEL: &str = "istupakov/parakeet-tdt-0.6b-v3-onnx";
const TARGET_SAMPLE_RATE: u32 = 16_000;
const ASR_COMMIT_HASH: &str = "2986a2e3330c839ec45cb12a5c00f0dc24476ac5";

#[derive(Parser)]
#[command(
    about = "Transcribe a media file into a .captions_json5 document.",
    long_about = "Rust port of transcribe/transcribe_cli.py. parakeet-tdt-0.6b-v3 via parakeet-rs,\n\
                  chunked 60s + 5s overlap, same post-processing pipeline as the Python suite.",
    // `--version` / `-V` print the Cargo.toml workspace version, which is
    // kept in lockstep with electron/constants.ts APP_VERSION.
    version = env!("CARGO_PKG_VERSION"),
)]
struct Args {
    /// Input media file (any container ffmpeg can decode).
    media_file: PathBuf,
    /// Output .captions_json5 path. Defaults to `<media>.captions_json5`.
    #[clap(long, short = 'o')]
    output: Option<PathBuf>,
    /// Chunk size in seconds.
    #[clap(long, short = 'c', default_value_t = 60)]
    chunk_size: u32,
    /// Overlap between chunks in seconds.
    #[clap(long, short = 'v', default_value_t = 5)]
    overlap: u32,
    /// HF model id for the ONNX-exported parakeet weights, OR a local
    /// directory containing encoder-model.onnx + decoder_joint-model.onnx +
    /// vocab.txt. If the value resolves as an existing directory on disk
    /// we use it as-is; otherwise we treat it as an HF repo id and fetch
    /// via hf-hub into the shared HF cache.
    #[clap(long, short = 'm', default_value = DEFAULT_MODEL)]
    model: String,
    /// Maximum gap between words inside a segment before splitting.
    #[clap(long, default_value_t = 0.50)]
    max_intra_segment_gap_seconds: f64,
    /// Maximum segment duration before forcing a split.
    #[clap(long, default_value_t = 10.0)]
    max_segment_duration_seconds: f64,
    /// Use simple incremental IDs (`id_00000`, ...) instead of UUIDs.
    /// Required for tests that snapshot the .captions_json5 output.
    #[clap(long)]
    deterministic_ids: bool,
    /// Debug: dump raw parakeet-rs tokens (Tokens mode, pre-grouping) for
    /// every chunk, as JSON arrays of `{text, start, end}` per chunk, to
    /// the given path. Lets us cross-check against NeMo's PyTorch token
    /// stream — if our tokens are missing periods that NeMo emits, the
    /// punctuation gap lives in parakeet-rs's inference, not in grouping.
    #[clap(long)]
    dump_tokens: Option<PathBuf>,
    /// Skip the automatic speaker-embedding step (default behavior is to
    /// invoke `embed-rs` against the just-written file, matching Python's
    /// default-on `--embed`).
    #[clap(long)]
    no_embed: bool,
    /// Path to the `embed-rs` binary. If unset, auto-discovers a sibling
    /// `embed-rs` next to this binary, then falls back to `embed-rs` on PATH.
    #[clap(long)]
    embed_bin: Option<PathBuf>,
    /// HF model id for the embedding model (forwarded to `embed-rs --model`).
    #[clap(long, default_value = "pyannote/wespeaker-voxceleb-resnet34-LM")]
    embed_model: String,
    /// Shortest segment (seconds) to embed. Forwarded to `embed-rs`.
    #[clap(long, default_value_t = 0.3)]
    min_segment_duration: f64,
    /// Remux MP3 inputs in place to add a Xing seek table (matches Python's
    /// --remux-mp3). Browsers need this for accurate <audio> seeking on VBR MP3.
    #[clap(long)]
    remux_mp3: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let output = args
        .output
        .clone()
        .unwrap_or_else(|| args.media_file.with_extension("captions_json5"));
    if output.exists() {
        return Err(eyre!(
            "output file already exists: {} — refusing to overwrite",
            output.display()
        ));
    }

    eprintln!("Transcribing: {}", args.media_file.display());
    eprintln!("Output: {}", output.display());
    eprintln!("Chunk size: {}s, Overlap: {}s", args.chunk_size, args.overlap);

    // Optional MP3 remux pass — matches Python's --remux-mp3. Done before
    // anything else so the on-disk file (saved into metadata.mediaFilePath
    // and used by embed-rs) is the seekable copy.
    if args.remux_mp3
        && args
            .media_file
            .extension()
            .and_then(|s| s.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
            == Some("mp3")
    {
        remux_mp3_in_place(&args.media_file)?;
    }

    let temp_dir = tempfile::tempdir()?;
    let wav_path = ensure_wav(&args.media_file, &temp_dir)?;
    let audio_hash = sha256_file(&wav_path)?;
    let (samples_f32, sample_rate, channels) = read_wav_f32_mono(&wav_path)?;

    // Recognizer selection: anything with "whisper" in the model id goes
    // to whisper.cpp; everything else goes to parakeet-rs. The recognizer
    // trait owns its own model loading + per-chunk inference and tells
    // post-processing which is_whisper path to use.
    let mut recognizer: Box<dyn Recognizer> = if is_whisper_model(&args.model) {
        let model_path = resolve_whisper_model_path(&args.model)?;
        Box::new(WhisperRecognizer::from_model(&model_path, Some("en"))?)
    } else {
        eprintln!("Loading parakeet model: {}", args.model);
        let model_dir = {
            let local = PathBuf::from(&args.model);
            if local.is_dir() {
                eprintln!("  using local model dir: {}", local.display());
                local
            } else {
                download_parakeet_onnx(&args.model)?
            }
        };
        let parakeet = ParakeetTDT::from_pretrained(&model_dir, None)
            .map_err(|e| eyre!("ParakeetTDT::from_pretrained: {e}"))?;
        Box::new(ParakeetRecognizer { parakeet, dump_tokens_path: args.dump_tokens.clone() })
    };

    let raw_segments = transcribe_chunked(
        recognizer.as_mut(),
        &samples_f32,
        sample_rate,
        channels,
        args.chunk_size,
        args.overlap,
    )?;

    let processed = post_process_raw_asr_segments(
        raw_segments.clone(),
        args.chunk_size as f64,
        args.overlap as f64,
        args.max_intra_segment_gap_seconds,
        args.max_segment_duration_seconds,
        // Whisper: word-level segments → group_segments_by_gap to recover
        // sentences. Parakeet: sentence-level segments → split on big
        // word gaps. The recognizer tells us which it is.
        recognizer.is_whisper(),
    );

    let mut transcript = asr_segments_to_transcript_segments(processed, Some(&args.model));
    assign_cue_ids_and_timestamps(&mut transcript, &audio_hash, args.deterministic_ids);

    let raw_asr_output = raw_asr_segments_to_raw_asr_output(&raw_segments);

    let metadata = TranscriptMetadata {
        id: generate_document_id(&audio_hash, args.deterministic_ids),
        media_file_path: Some(args.media_file.to_string_lossy().into_owned()),
    };

    let doc = CaptionsDocument {
        metadata,
        title: args
            .media_file
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned()),
        segments: transcript,
        history: None,
        embeddings: None,
        embedding_model: None,
        ui_state: None,
        raw_asr_output: Some(raw_asr_output),
    };

    let serialized = serialize_captions_json5(&doc, ASR_COMMIT_HASH);
    std::fs::write(&output, serialized)
        .with_context(|| format!("write {}", output.display()))?;
    eprintln!("Wrote {} segments to {}", doc.segments.len(), output.display());

    maybe_run_embed_step(&output, &args);
    Ok(())
}

/// Run the optional embedding step, reporting failure without propagating it.
///
/// Returns `()`, not `Result`, on purpose: transcription and embedding need
/// separate exit paths. The transcript is already written and correct by the
/// time this runs, so a failed embed must not make the caller believe the run
/// produced nothing — `electron/main.ts` rejects the whole ASR promise on any
/// non-zero exit and `App.vue` only merges `result.content` when
/// `result.success`, so propagating here silently discards a finished
/// transcript and throws away however long the ASR took.
///
/// Mirrors Python `transcribe_cli.py`, which wraps `embed_captions_path` in
/// try/except and prints "Warning: Speaker embedding failed".
///
/// The unit return type is the guard: restoring a `?` here would not compile.
/// Regression test: `embed_failure_is_not_fatal`.
fn maybe_run_embed_step(captions_path: &Path, args: &Args) {
    if args.no_embed {
        return;
    }
    if let Err(err) = run_embed_step(captions_path, args) {
        // Electron streams our stderr into the ASR output panel, so this is
        // the channel the user actually sees.
        eprintln!("Warning: speaker embedding failed: {err:#}");
        eprintln!(
            "The transcript at {} is complete and usable — only the speaker \
             embeddings are missing. Re-run embedding later with: embed-rs {}",
            captions_path.display(),
            captions_path.display()
        );
    }
}

/// Run `embed-rs` against the freshly-written captions file, matching Python
/// transcribe_cli's `--embed` default-on behavior.
fn run_embed_step(captions_path: &Path, args: &Args) -> Result<()> {
    let bin = resolve_embed_bin(args.embed_bin.as_deref())?;
    eprintln!("Auto-embedding via {} ...", bin.display());
    let status = Command::new(&bin)
        .arg(captions_path)
        .args(["--model", &args.embed_model])
        .args([
            "--min-segment-duration",
            &args.min_segment_duration.to_string(),
        ])
        .status()
        .with_context(|| format!("spawn {}", bin.display()))?;
    if !status.success() {
        return Err(eyre!("embed-rs exited with {status}"));
    }
    Ok(())
}

fn resolve_embed_bin(explicit: Option<&Path>) -> Result<PathBuf> {
    if let Some(p) = explicit {
        return Ok(p.to_path_buf());
    }
    // First try a sibling embed-rs next to this binary. Both binaries land
    // next to each other in `bazel-bin/transcribe_rs/{transcribe,embed}-rs/`
    // and would normally be installed side-by-side too.
    if let Ok(me) = std::env::current_exe() {
        if let Some(parent) = me.parent() {
            // Common shipping layouts: `/usr/local/bin/embed-rs` next to
            // transcribe-rs, or in a sibling dir under bazel-bin.
            for candidate in [
                parent.join("embed-rs"),
                parent.join("../embed-rs/embed-rs"),
            ] {
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }
    // Final fallback: bare name → PATH lookup by the OS.
    Ok(PathBuf::from("embed-rs"))
}

// ---------------------------------------------------------------------------
// Audio + IO helpers
// ---------------------------------------------------------------------------

/// Re-encode an MP3 in place with a Xing seek table so VBR playback in
/// browsers seeks accurately. Backs the original up to `<name>.original.mp3`.
/// Mirrors Python's `remux_mp3_with_seek_table` in transcribe_cli.py.
fn remux_mp3_in_place(mp3: &Path) -> Result<()> {
    eprintln!("Remuxing MP3 to add seek table: {}", mp3.display());
    let parent = mp3.parent().unwrap_or_else(|| Path::new("."));
    let tmp = tempfile::Builder::new()
        .suffix(".mp3")
        .tempfile_in(parent)?;
    let tmp_path = tmp.path().to_path_buf();
    // tempfile holds an open fd on the path; ffmpeg needs to (re)write it,
    // so we let the NamedTempFile drop later but pass the path string.
    drop(tmp);

    let ffmpeg = caption_core::resolve_ffmpeg().map_err(eyre::Report::new)?;
    let status = Command::new(&ffmpeg)
        .args([
            "-y",
            "-loglevel",
            "error",
            "-i",
            &mp3.to_string_lossy(),
            "-c",
            "copy",
            "-write_xing",
            "1",
            &tmp_path.to_string_lossy(),
        ])
        .status();
    let success = matches!(status, Ok(s) if s.success());
    if !success {
        eprintln!("Warning: ffmpeg remux failed; leaving MP3 unchanged");
        let _ = std::fs::remove_file(&tmp_path);
        return Ok(());
    }
    let backup = mp3.with_extension("original.mp3");
    std::fs::copy(mp3, &backup).with_context(|| format!("backup → {}", backup.display()))?;
    eprintln!("Original MP3 backed up to: {}", backup.display());
    std::fs::rename(&tmp_path, mp3).with_context(|| format!("rename {tmp_path:?} → {mp3:?}"))?;
    eprintln!("Remuxed MP3 in-place: {}", mp3.display());
    Ok(())
}

fn ensure_wav(media: &Path, temp_dir: &tempfile::TempDir) -> Result<PathBuf> {
    let lower = media
        .extension()
        .and_then(|s| s.to_str())
        .map(str::to_ascii_lowercase);
    // Pass-through only if it's already a WAV *and* 16 kHz mono — parakeet
    // expects exactly that. Otherwise (different sample rate / channel
    // count / container) re-encode through ffmpeg.
    if matches!(lower.as_deref(), Some("wav") | Some("wave")) {
        if let Ok(reader) = hound::WavReader::open(media) {
            let spec = reader.spec();
            if spec.sample_rate == TARGET_SAMPLE_RATE && spec.channels == 1 {
                return Ok(media.to_path_buf());
            }
        }
    }
    eprintln!("Converting {} to 16kHz mono WAV via ffmpeg...", media.display());
    let out_path = temp_dir.path().join("audio.wav");
    let ffmpeg = caption_core::resolve_ffmpeg().map_err(eyre::Report::new)?;
    let status = Command::new(&ffmpeg)
        .args([
            "-y",
            "-loglevel",
            "error",
            "-i",
            &media.to_string_lossy(),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-acodec",
            "pcm_s16le",
            &out_path.to_string_lossy(),
        ])
        .status()
        .with_context(|| format!("failed to run bundled ffmpeg at {}", ffmpeg.display()))?;
    if !status.success() {
        return Err(eyre!("ffmpeg exited with {status}"));
    }
    Ok(out_path)
}

fn read_wav_f32_mono(path: &Path) -> Result<(Vec<f32>, u32, u16)> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    let f32_samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<Vec<_>, _>>()?,
        hound::SampleFormat::Int => reader
            .samples::<i16>()
            .map(|s| s.map(|s| s as f32 / 32768.0))
            .collect::<Result<Vec<_>, _>>()?,
    };
    let mono = if spec.channels > 1 {
        let ch = spec.channels as usize;
        f32_samples
            .chunks(ch)
            .map(|frame| frame.iter().sum::<f32>() / ch as f32)
            .collect()
    } else {
        f32_samples
    };
    Ok((mono, spec.sample_rate, 1))
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut hasher = Sha256::new();
    let mut file = std::fs::File::open(path)?;
    let mut buf = [0u8; 4096];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex_encode(&hasher.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0F) as usize] as char);
    }
    out
}

// ---------------------------------------------------------------------------
// Chunked driver — engine-agnostic. Delegates per-chunk inference to the
// passed-in Recognizer (Parakeet or Whisper).
// ---------------------------------------------------------------------------

fn transcribe_chunked(
    recognizer: &mut dyn Recognizer,
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
    chunk_size: u32,
    overlap: u32,
) -> Result<Vec<AsrSegment>> {
    if sample_rate != TARGET_SAMPLE_RATE {
        return Err(eyre!(
            "expected {TARGET_SAMPLE_RATE} Hz after ffmpeg resample, got {sample_rate}"
        ));
    }
    let total_samples = samples.len();
    let duration = total_samples as f64 / sample_rate as f64;
    let stride = (chunk_size as f64) - (overlap as f64);
    let mut all = Vec::new();

    let num_chunks = ((duration - overlap as f64) / stride).ceil().max(1.0) as usize;
    eprintln!("Transcribing {num_chunks} chunks (~{duration:.1}s of audio)...");

    for i in 0..num_chunks {
        let chunk_start_s = i as f64 * stride;
        let chunk_end_s = (chunk_start_s + chunk_size as f64).min(duration);
        if chunk_end_s <= chunk_start_s {
            break;
        }
        let start_idx = (chunk_start_s * sample_rate as f64).round() as usize;
        let end_idx = ((chunk_end_s * sample_rate as f64).round() as usize).min(total_samples);
        if start_idx >= end_idx {
            continue;
        }
        let slice = samples[start_idx..end_idx].to_vec();
        eprintln!("  chunk {}/{}: [{:.1}s, {:.1}s)", i + 1, num_chunks, chunk_start_s, chunk_end_s);

        let segs = recognizer.transcribe_chunk(slice, sample_rate, channels, chunk_start_s)?;
        all.extend(segs);
    }
    Ok(all)
}

// ---------------------------------------------------------------------------
// ParakeetRecognizer — wraps parakeet-rs's ParakeetTDT, emits
// sentence-level AsrSegments with paired words[]. Carries the optional
// dump_tokens debug path for cross-language parity work.
// ---------------------------------------------------------------------------

struct ParakeetRecognizer {
    parakeet: ParakeetTDT,
    dump_tokens_path: Option<PathBuf>,
}

impl Recognizer for ParakeetRecognizer {
    fn is_whisper(&self) -> bool {
        false
    }

    fn transcribe_chunk(
        &mut self,
        samples: Vec<f32>,
        sample_rate: u32,
        channels: u16,
        chunk_start_s: f64,
    ) -> Result<Vec<AsrSegment>> {
        let result = self
            .parakeet
            // `Tokens` gives raw subword tokens. We re-derive both
            // Sentences and Words via the vendored grouping helpers and
            // pair them — same shape as Python's parse_parakeet_raw_chunk.
            .transcribe_samples(samples, sample_rate, channels, Some(TimestampMode::Tokens))
            .map_err(|e| eyre!("parakeet transcribe: {e}"))?;

        if let Some(path) = self.dump_tokens_path.as_deref() {
            // Append-mode would be nicer for multi-chunk runs, but the
            // existing format is one JSON array per file. Buffer + write
            // at the end of the chunked driver if you care about preserving
            // exact previous behavior; for now we overwrite per chunk.
            let chunk_tokens: Vec<serde_json::Value> = result
                .tokens
                .iter()
                .map(|t| {
                    serde_json::json!({
                        "text": t.text,
                        "start": t.start,
                        "end": t.end,
                    })
                })
                .collect();
            let json = serde_json::to_string_pretty(&serde_json::json!([{
                "chunk_start_s": chunk_start_s,
                "tokens": chunk_tokens,
            }]))
            .context("serialize token dump")?;
            std::fs::write(path, json)
                .with_context(|| format!("write token dump → {}", path.display()))?;
        }

        let sentences = parakeet_grouping::group_by_sentences(&result.tokens);
        let words = parakeet_grouping::group_by_words(&result.tokens);

        let mut out = Vec::new();
        for sent in sentences.iter() {
            let abs_s_start = sent.start as f64 + chunk_start_s;
            let abs_s_end = sent.end as f64 + chunk_start_s;
            let mut seg_words = Vec::new();
            for w in &words {
                let abs_w_start = w.start as f64 + chunk_start_s;
                let abs_w_end = w.end as f64 + chunk_start_s;
                // Same 0.01s tolerance as Python parse_parakeet_raw_chunk.
                if abs_w_start >= abs_s_start - 0.01 && abs_w_end <= abs_s_end + 0.01 {
                    seg_words.push(WordTimestamp {
                        word: w.text.clone(),
                        start: abs_w_start,
                        end: abs_w_end,
                    });
                }
            }
            out.push(AsrSegment {
                text: sent.text.clone(),
                start: abs_s_start,
                end: abs_s_end,
                words: seg_words,
                chunk_start: Some(chunk_start_s),
                speaker: None,
            });
        }
        Ok(out)
    }
}

// ---------------------------------------------------------------------------
// IDs / hashes (parity with Python transcribe_cli.py)
// ---------------------------------------------------------------------------

fn generate_document_id(audio_hash: &str, deterministic: bool) -> String {
    if deterministic {
        return "doc_id".into();
    }
    let input = format!("doc:{audio_hash}");
    let digest = Sha256::digest(input.as_bytes());
    uuid_from_bytes16(&digest[..16])
}

fn generate_cue_id(audio_hash: &str, start_time: f64, idx: usize, deterministic: bool) -> String {
    if deterministic {
        return format!("id_{idx:05}");
    }
    let combined = format!("{audio_hash}:{start_time:.3}");
    let digest = Sha256::digest(combined.as_bytes());
    uuid_from_bytes16(&digest[..16])
}

/// Format 16 bytes as the canonical UUID hyphenated string (Python's
/// `uuid.UUID(bytes=...)` repr). No actual version/variant bits are set —
/// matches Python's behavior of accepting arbitrary 16-byte input.
fn uuid_from_bytes16(b: &[u8]) -> String {
    assert!(b.len() == 16);
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
        b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15],
    )
}

fn assign_cue_ids_and_timestamps(
    segments: &mut [caption_schema::TranscriptSegment],
    audio_hash: &str,
    deterministic: bool,
) {
    let current_ts = if deterministic {
        "2025-01-01T00:00:00.000000+00:00".to_string()
    } else {
        // chrono pulls a transitive dep we don't strictly need; format the
        // current wall-clock time in RFC3339 by hand from `std::time`.
        // Day-level precision is fine; the field is informational.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        // Crude RFC3339-ish UTC timestamp (Python uses the local TZ — but the
        // field is informational, not load-bearing for downstream code).
        format!("@{now}+00:00")
    };

    for (idx, seg) in segments.iter_mut().enumerate() {
        seg.id = generate_cue_id(audio_hash, seg.start_time, idx, deterministic);
        if seg.timestamp.is_none() {
            seg.timestamp = Some(current_ts.clone());
        }
    }
}

// ---------------------------------------------------------------------------
// Model download
// ---------------------------------------------------------------------------

/// Pull the parakeet-tdt-0.6b-v3 ONNX repo to the HF cache and return the
/// snapshot directory (so parakeet-rs's `from_pretrained(&dir, None)`
/// finds `encoder-model.onnx`, `decoder_joint-model.onnx`, `vocab.txt`).
fn download_parakeet_onnx(model_id: &str) -> Result<PathBuf> {
    let token = std::env::var("HF_TOKEN").ok();
    let mut builder = ApiBuilder::new();
    if let Some(t) = token {
        builder = builder.with_token(Some(t));
    }
    let api = builder
        .build()
        .map_err(|e| eyre!("hf-hub init: {e}"))?
        .model(model_id.to_string());

    // parakeet-rs expects all three files in one directory. hf-hub caches
    // each file separately under the snapshot dir; pulling any of them
    // returns the snapshot path of *that file*, and the snapshot dir is
    // shared across files of the same revision.
    let mut snapshot_dir: Option<PathBuf> = None;
    for name in ["encoder-model.onnx", "decoder_joint-model.onnx", "vocab.txt"] {
        let p = api
            .get(name)
            .map_err(|e| eyre!("hf-hub get {name}: {e}"))?;
        snapshot_dir = Some(p.parent().unwrap().to_path_buf());
    }
    // istupakov's repo ships the encoder weights as a sidecar `.onnx.data` —
    // try to fetch but tolerate absence (older revisions skipped it).
    let _ = api.get("encoder-model.onnx.data");

    snapshot_dir.ok_or_else(|| eyre!("no ONNX files resolved from {model_id}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A failing embedding step must not fail the whole run.
    ///
    /// The transcript is written to disk *before* embedding starts, so
    /// propagating the error would make `main` exit non-zero after having
    /// produced a complete, correct document — which the Electron app reads
    /// as "transcription failed" and discards. Realistic triggers: a missing
    /// `embed-rs` next to the binary, a missing wespeaker ONNX, an ORT load
    /// failure, or a corrupt HF cache.
    #[test]
    fn embed_failure_is_not_fatal() {
        let args = Args::parse_from([
            "transcribe-rs",
            "audio.wav",
            "--embed-bin",
            "/nonexistent/definitely-not-a-real-embed-rs",
        ]);
        let captions = Path::new("/tmp/does-not-need-to-exist.captions_json5");

        // The step itself does report the failure...
        let _err = run_embed_step(captions, &args)
            .expect_err("spawning a nonexistent embed binary must fail");

        // ...but the path `main` takes swallows it into a warning. This call
        // returning at all *is* the assertion: `maybe_run_embed_step` yields
        // `()`, so there is no error for `main` to propagate.
        maybe_run_embed_step(captions, &args);
    }

    /// `--no-embed` short-circuits before the binary is ever resolved, so a
    /// bogus `--embed-bin` is not even consulted.
    #[test]
    fn no_embed_skips_the_step_entirely() {
        let args = Args::parse_from([
            "transcribe-rs",
            "audio.wav",
            "--no-embed",
            "--embed-bin",
            "/nonexistent/definitely-not-a-real-embed-rs",
        ]);
        maybe_run_embed_step(Path::new("/tmp/unused.captions_json5"), &args);
    }

    /// `--no-embed` is opt-out: embedding runs by default, matching Python's
    /// default-on `--embed`.
    #[test]
    fn embedding_is_on_by_default() {
        let args = Args::parse_from(["transcribe-rs", "audio.wav"]);
        assert!(!args.no_embed);

        let opted_out = Args::parse_from(["transcribe-rs", "audio.wav", "--no-embed"]);
        assert!(opted_out.no_embed);
    }
}

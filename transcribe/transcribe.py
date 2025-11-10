#!/usr/bin/env python3
"""
Media transcription tool using NVIDIA Parakeet TDT model.
Converts media files to VTT format with segment-level transcription.
"""

import hashlib
import json
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

import numpy as np
import soundfile as sf
import torch
import typer
from tqdm import tqdm

from asr_results_to_vtt import (
    asr_segments_to_vtt_cues,
    group_segments_by_gap,
    parse_nemo_result_with_words,
    parse_transformers_result_with_words,
    resolve_overlap_conflicts,
    split_long_segments,
    split_segments_by_word_gap,
)
from schema import CAPTION_EDITOR_SENTINEL, SegmentHistoryEntry, TranscriptMetadata, VTTCue
from vtt_lib import serialize_vtt

try:
    import nemo.collections.asr as nemo_asr
    NEMO_AVAILABLE = True
except ImportError:
    NEMO_AVAILABLE = False

try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

app = typer.Typer()


def extract_audio(media_file: Path, temp_dir: Path) -> Path:
    """Extract audio from media file using ffmpeg."""
    output_path = temp_dir / "audio.wav"

    cmd = [
        "ffmpeg",
        *("-i",
        str(media_file)),
        *("-ar",
        "16000"),  # 16kHz sample rate
        *("-ac",
        "1"),  # Mono
        *("-f",
        "wav"),
        "-y",  # Overwrite
        str(output_path),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        typer.echo(f"Error extracting audio: {e.stderr.decode()}", err=True)
        raise typer.Exit(1)

    return output_path


def load_audio_chunk(
    audio_path: Path, start_time: float, duration: float
) -> tuple[np.ndarray, int]:
    """Load a chunk of audio from a file."""
    info = sf.info(audio_path)
    sample_rate = info.samplerate
    start_frame = int(start_time * sample_rate)
    num_frames = int(duration * sample_rate)

    if start_frame >= info.frames:
        # todo:  just raise exception
        return np.array([]), sample_rate

    num_frames = min(num_frames, info.frames - start_frame)
    audio, sr = sf.read(audio_path, start=start_frame, frames=num_frames, dtype="float32")
    return audio, sr


def transcribe_chunk(audio: np.ndarray, asr_pipeline, chunk_start: float, sample_rate: int, is_nemo: bool = False):
    """Transcribe a single audio chunk and return ASR segments with word-level timestamps.

    Both NEMO and HuggingFace models now use a unified file-based input approach.

    Args:
        audio: Audio data as numpy array
        asr_pipeline: The ASR model pipeline
        chunk_start: Start time of this chunk in seconds
        sample_rate: Sample rate of the audio
        is_nemo: Whether this is a NeMo model

    Returns:
        List of ASRSegment objects with word-level timestamps
    """
    if len(audio) == 0:
        return []

    # Save audio chunk to temporary file (unified approach for both models)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp_file:
        tmp_path = tmp_file.name
        sf.write(tmp_path, audio, sample_rate)

        # Get transcription with word-level timestamps
        if is_nemo:
            result = asr_pipeline.transcribe([tmp_path], timestamps=True)
            segments = parse_nemo_result_with_words(result, chunk_start)
        else:
            # HuggingFace transformers pipeline with word-level timestamps
            result = asr_pipeline(tmp_path, return_timestamps="word")
            segments = parse_transformers_result_with_words(result, chunk_start)

        return segments


def generate_cue_id(audio_hash: str, start_time: float, deterministic_index: Optional[int] = None) -> str:
    """Generate deterministic UUID based on audio hash and timestamp.

    Args:
        audio_hash: Hash of the audio file
        start_time: Start time of the cue
        deterministic_index: If provided, generates simple incremental ID like 'id_00000'
    """
    if deterministic_index is not None:
        return f"id_{deterministic_index:05d}"

    combined = f"{audio_hash}:{start_time:.3f}"
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    return str(uuid.UUID(bytes=hash_bytes[:16]))


def generate_document_id(audio_hash: str, deterministic: bool = False) -> str:
    """Generate document ID based on audio hash.

    Args:
        audio_hash: Hash of the audio file
        deterministic: If True, use simple 'doc_id' for testing

    Returns:
        Document ID string
    """
    if deterministic:
        return "doc_id"
    hash_bytes = hashlib.sha256(f"doc:{audio_hash}".encode()).digest()
    return str(uuid.UUID(bytes=hash_bytes[:16]))


def assign_cue_ids_and_timestamps(
    cues: List[VTTCue],
    audio_hash: str,
    deterministic_ids: bool = False
) -> List[VTTCue]:
    """Assign IDs and timestamps to cues in-place.

    Args:
        cues: List of VTT cues to modify
        audio_hash: Hash of the audio file
        deterministic_ids: If True, use simple incremental IDs for testing

    Returns:
        The same cues list (modified in-place)
    """
    # Get current timestamp for all cues (local timezone)
    if deterministic_ids:
        current_timestamp = "2025-01-01T00:00:00.000000+00:00"
    else:
        current_timestamp = datetime.now().astimezone().isoformat()

    for idx, cue in enumerate(cues):
        # Generate ID and set timestamp if not already set
        if deterministic_ids:
            cue_id = generate_cue_id(audio_hash, cue.start_time, deterministic_index=idx)
        else:
            cue_id = generate_cue_id(audio_hash, cue.start_time)

        cue_timestamp = cue.timestamp if cue.timestamp else current_timestamp

        # Update the cue with id and timestamp
        cue.id = cue_id
        cue.timestamp = cue_timestamp

    return cues


def compute_audio_hash(audio_path: Path) -> str:
    """Compute SHA256 hash of audio file."""
    hasher = hashlib.sha256()
    with open(audio_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


@app.command()
def main(
    media_file: Path = typer.Argument(..., help="Input media file to transcribe", 
    exists=True, file_okay=True, dir_okay=False, readable=True,
    ),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="Output VTT file path",
        exists=False, file_okay=True, dir_okay=False, writable=True,
    ),
    chunk_size: int = typer.Option(
        60, "--chunk-size", "-c", help="Chunk size in seconds"
    ),
    overlap: int = typer.Option(
        5, "--overlap", "-v", help="Overlap interval in seconds"
    ),
    model_name: str = typer.Option(
        "nvidia/parakeet-tdt-0.6b-v3",
        "--model",
        "-m",
        help="Hugging Face model name",
    ),
    max_intra_segment_gap_seconds: float = typer.Option(
        0.20,
        "--max-intra-segment-gap-seconds",
        help="Maximum gap between words before splitting segment",
    ),
    max_segment_duration_seconds: float = typer.Option(
        10.0,
        "--max-segment-duration-seconds",
        help="Maximum segment duration before splitting",
    ),
    deterministic_ids: bool = typer.Option(
        False,
        "--deterministic-ids",
        help="Use simple incremental IDs (id_00000, id_00001, etc.) for testing instead of UUIDs",
    ),
):
    """
    Transcribe media files to VTT format using NVIDIA Parakeet TDT model.

    Supports long media files by processing in chunks with overlap to avoid
    cutting off words at boundaries.

    TODO: Add speaker identification to segments.
    """
    # Determine output path
    if output is None:
        output = media_file.with_suffix(".vtt")

    typer.echo(f"Transcribing: {media_file}")
    typer.echo(f"Output: {output}")
    typer.echo(f"Chunk size: {chunk_size}s, Overlap: {overlap}s")

    # Set device
    device = "cuda" if torch.cuda.is_available() else "cpu"
    typer.echo(f"Using device: {device}")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Extract audio
        typer.echo("Extracting audio...")
        audio_path = extract_audio(media_file, temp_path)

        # Get audio info
        info = sf.info(audio_path)
        duration = info.duration
        typer.echo(f"Audio duration: {duration:.2f}s")

        # Compute audio hash
        audio_hash = compute_audio_hash(audio_path)

        # Detect if this is a NeMo model (Parakeet models use NeMo)
        is_nemo = "parakeet" in model_name.lower() or "nvidia" in model_name.lower()

        # Load model
        typer.echo(f"Loading model: {model_name}")

        if is_nemo:
            if not NEMO_AVAILABLE:
                typer.echo(
                    "Error: NeMo toolkit not installed. Install with: pip install nemo_toolkit['asr']",
                    err=True,
                )
                raise typer.Exit(1)

            typer.echo("Using NeMo ASR model...")
            asr_pipeline = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)

            # Move to appropriate device
            if device == "cuda":
                asr_pipeline = asr_pipeline.to(device)
        else:
            if not TRANSFORMERS_AVAILABLE:
                typer.echo(
                    "Error: Transformers library not installed. Install with: pip install transformers",
                    err=True,
                )
                raise typer.Exit(1)

            typer.echo("Using Hugging Face Transformers model...")
            asr_pipeline = pipeline(
                "automatic-speech-recognition",
                model=model_name,
                device=0 if device == "cuda" else -1,

            )

        # Process chunks - get ASR segments with word-level timestamps
        all_segments = []
        num_chunks = int(np.ceil((duration - overlap) / (chunk_size - overlap)))

        typer.echo(f"Processing {num_chunks} chunks...")
        for i in tqdm(range(num_chunks), desc="Transcribing chunks", unit="chunk"):
            chunk_start = i * (chunk_size - overlap)
            chunk_duration = min(chunk_size, duration - chunk_start)

            if chunk_duration <= 0:
                break

            # Load audio chunk
            audio, sr = load_audio_chunk(audio_path, chunk_start, chunk_duration)

            if len(audio) == 0:
                continue

            # Transcribe - returns ASRSegment objects with word-level timestamps
            chunk_segments = transcribe_chunk(audio, asr_pipeline, chunk_start, sr, is_nemo=is_nemo)
            all_segments.extend(chunk_segments)

        # Three-pass segment processing pipeline:
        # 1. Resolve overlaps from chunked processing (deduplicate at word level)
        typer.echo("Resolving overlaps from chunked processing...")
        after_overlap = resolve_overlap_conflicts(all_segments, chunk_size, overlap)

        # 2a. For Whisper (word-level segments), group by gaps to form sentences
        # 2b. For Parakeet (sentence-level segments), split by word gaps if needed
        if "whisper" in model_name.lower():
            typer.echo(f"Grouping word segments with gaps < {max_intra_segment_gap_seconds}s...")
            after_grouping = group_segments_by_gap(after_overlap, max_intra_segment_gap_seconds)
        else:
            typer.echo(f"Splitting segments with gaps > {max_intra_segment_gap_seconds}s...")
            after_grouping = split_segments_by_word_gap(after_overlap, max_intra_segment_gap_seconds)

        # 3. Split long segments
        typer.echo(f"Splitting segments longer than {max_segment_duration_seconds}s...")
        final_segments = split_long_segments(after_grouping, max_segment_duration_seconds)

        # Convert ASRSegments to VTTCues
        typer.echo("Converting segments to VTT cues...")
        final_cues = asr_segments_to_vtt_cues(final_segments)

        # Assign IDs and timestamps to cues
        typer.echo("Assigning IDs and timestamps...")
        assign_cue_ids_and_timestamps(final_cues, audio_hash, deterministic_ids=deterministic_ids)

        # Generate document metadata
        doc_id = generate_document_id(audio_hash, deterministic=deterministic_ids)
        metadata = TranscriptMetadata(id=doc_id, media_file_path=str(media_file))

        # Copy media file to output directory to keep VTT and media together
        import shutil
        output_dir = output.resolve().parent
        output_dir.mkdir(parents=True, exist_ok=True)

        # Generate VTT
        typer.echo("Generating VTT...")
        vtt_content = serialize_vtt(metadata, final_cues)

        # Write output
        output.write_text(vtt_content)
        typer.echo(f"Transcription complete: {output}")
        typer.echo(f"Generated {len(final_cues)} cues")


if __name__ == "__main__":
    app()

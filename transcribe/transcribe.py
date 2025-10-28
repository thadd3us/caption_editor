#!/usr/bin/env python3
"""
Media transcription tool using NVIDIA Parakeet TDT model.
Converts media files to VTT format with segment-level transcription.
"""

import hashlib
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import List, Optional

import numpy as np
import soundfile as sf
import torch
import typer
from pydantic import BaseModel, ConfigDict, Field
from tqdm import tqdm

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


class VTTCue(BaseModel):
    """VTT cue matching the frontend data model."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="UUID - cue identifier")
    start_time: float = Field(description="Start time in seconds", alias="startTime")
    end_time: float = Field(description="End time in seconds", alias="endTime")
    text: str = Field(description="Caption text")
    rating: Optional[int] = Field(None, description="Optional rating 1-5")


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


def parse_nemo_result(result, chunk_start: float, audio_duration: float) -> List[VTTCue]:
    """Parse NeMo transcription result into VTT cues."""
    cues = []

    if not result or len(result) == 0:
        return cues

    output = result[0]

    # Check if we have segment timestamps
    if hasattr(output, 'timestamp') and 'segment' in output.timestamp:
        for segment in output.timestamp['segment']:
            if not segment['segment'].strip():
                continue

            cues.append(
                VTTCue(
                    id="",  # Will be set later with hash
                    start_time=chunk_start + segment['start'],
                    end_time=chunk_start + segment['end'],
                    text=segment['segment'].strip(),
                )
            )
    else:
        # No timestamps available, create single cue for entire chunk
        if hasattr(output, 'text') and output.text.strip():
            cues.append(
                VTTCue(
                    id="",
                    start_time=chunk_start,
                    end_time=chunk_start + audio_duration,
                    text=output.text.strip(),
                )
            )

    return cues


def parse_transformers_result(result, chunk_start: float, audio_duration: float) -> List[VTTCue]:
    """Parse Transformers pipeline result into VTT cues."""
    cues = []

    # Process chunks from the model
    if isinstance(result, dict) and "chunks" in result:
        for chunk in result["chunks"]:
            if not chunk["text"].strip():
                continue

            timestamp = chunk.get("timestamp", (0.0, None))
            start = chunk_start + (timestamp[0] if timestamp[0] is not None else 0.0)
            end = chunk_start + (
                timestamp[1] if timestamp[1] is not None else audio_duration
            )

            cues.append(
                VTTCue(
                    id="",  # Will be set later with hash
                    start_time=start,
                    end_time=end,
                    text=chunk["text"].strip(),
                )
            )

    return cues


def transcribe_chunk(audio: np.ndarray, asr_pipeline, chunk_start: float, is_nemo: bool = False) -> List[VTTCue]:
    """Transcribe a single audio chunk using the model's native segment-level timestamps.

    Both NEMO and HuggingFace models now use a unified file-based input approach.
    """
    if len(audio) == 0:
        return []

    # Calculate audio duration
    audio_duration = len(audio) / 16000

    # Save audio chunk to temporary file (unified approach for both models)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp_file:
        tmp_path = tmp_file.name
        sf.write(tmp_path, audio, 16000)

        # Get transcription with timestamps
        if is_nemo:
            result = asr_pipeline.transcribe([tmp_path], timestamps=True)
            cues = parse_nemo_result(result, chunk_start, audio_duration)
        else:
            # HuggingFace transformers pipeline accepts file paths
            result = asr_pipeline(tmp_path, return_timestamps=True)
            cues = parse_transformers_result(result, chunk_start, audio_duration)

        return cues


def resolve_overlap_conflicts(
    all_cues: List[VTTCue], chunk_size: float, overlap: float
) -> List[VTTCue]:
    """
    Resolve overlapping cues by keeping those with greater distance to chunk edge.
    """
    if not all_cues:
        return []

    # Sort by start time
    sorted_cues = sorted(all_cues, key=lambda c: c.start_time)
    result = []

    for cue in sorted_cues:
        if not result:
            result.append(cue)
            continue

        prev_cue = result[-1]

        # Check if they overlap
        if cue.start_time < prev_cue.end_time:
            # Determine which chunk each cue belongs to
            prev_chunk_idx = int(prev_cue.start_time / (chunk_size - overlap))
            curr_chunk_idx = int(cue.start_time / (chunk_size - overlap))

            prev_chunk_start = prev_chunk_idx * (chunk_size - overlap)
            curr_chunk_start = curr_chunk_idx * (chunk_size - overlap)

            prev_chunk_end = prev_chunk_start + chunk_size
            curr_chunk_end = curr_chunk_start + chunk_size

            # Calculate distance to edges
            prev_dist = min(
                prev_cue.start_time - prev_chunk_start,
                prev_chunk_end - prev_cue.end_time,
            )
            curr_dist = min(
                cue.start_time - curr_chunk_start, curr_chunk_end - cue.end_time
            )

            # Keep the one with greater distance (more reliable)
            if curr_dist > prev_dist:
                result[-1] = cue
        else:
            result.append(cue)

    return result


def generate_cue_id(audio_hash: str, start_time: float) -> str:
    """Generate deterministic UUID based on audio hash and timestamp."""
    combined = f"{audio_hash}:{start_time:.3f}"
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    return str(uuid.UUID(bytes=hash_bytes[:16]))


def cues_to_vtt(cues: List[VTTCue], audio_hash: str) -> str:
    """Convert cues to VTT format string."""
    lines = ["WEBVTT\n"]

    for cue in cues:
        # Generate ID
        cue_id = generate_cue_id(audio_hash, cue.start_time)

        # Format timestamps
        start = format_timestamp(cue.start_time)
        end = format_timestamp(cue.end_time)

        lines.append(f"\n{cue_id}")
        lines.append(f"{start} --> {end}")
        lines.append(f"{cue.text}\n")

    return "\n".join(lines)


def format_timestamp(seconds: float) -> str:
    """Format seconds as VTT timestamp (HH:MM:SS.mmm)."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def compute_audio_hash(audio_path: Path) -> str:
    """Compute SHA256 hash of audio file."""
    hasher = hashlib.sha256()
    with open(audio_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


@app.command()
def main(
    media_file: Path = typer.Argument(..., help="Input media file to transcribe"),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="Output VTT file path"
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
):
    """
    Transcribe media files to VTT format using NVIDIA Parakeet TDT model.

    Supports long media files by processing in chunks with overlap to avoid
    cutting off words at boundaries.

    TODO: Add speaker identification to segments.
    """
    if not media_file.exists():
        typer.echo(f"Error: Media file not found: {media_file}", err=True)
        raise typer.Exit(1)

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

        # Process chunks
        all_cues = []
        num_chunks = int(np.ceil((duration - overlap) / (chunk_size - overlap)))

        typer.echo(f"Processing {num_chunks} chunks...")
        for i in tqdm(range(num_chunks), desc="Transcribing chunks", unit="chunk"):
            chunk_start = i * (chunk_size - overlap)
            chunk_duration = min(chunk_size, duration - chunk_start)

            if chunk_duration <= 0:
                break

            # Load audio chunk
            audio, _ = load_audio_chunk(audio_path, chunk_start, chunk_duration)

            if len(audio) == 0:
                continue

            # Transcribe
            chunk_cues = transcribe_chunk(audio, asr_pipeline, chunk_start, is_nemo=is_nemo)
            all_cues.extend(chunk_cues)

        # Resolve overlaps
        typer.echo("Resolving overlaps...")
        final_cues = resolve_overlap_conflicts(all_cues, chunk_size, overlap)

        # Generate VTT
        typer.echo("Generating VTT...")
        vtt_content = cues_to_vtt(final_cues, audio_hash)

        # Write output
        output.write_text(vtt_content)
        typer.echo(f"Transcription complete: {output}")
        typer.echo(f"Generated {len(final_cues)} cues")


if __name__ == "__main__":
    app()

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
from typing import List, Optional, Tuple

import numpy as np
import soundfile as sf
import torch
import typer
from transformers import AutoModelForCTC, AutoProcessor
import webvtt

app = typer.Typer()


class TranscriptSegment:
    """Represents a single transcript segment with timing information."""

    def __init__(self, text: str, start_time: float, end_time: float, chunk_start: float = 0.0):
        self.text = text
        self.start_time = start_time  # Absolute time in the full audio
        self.end_time = end_time      # Absolute time in the full audio
        self.chunk_start = chunk_start  # Start time of the chunk this segment is from

    def distance_to_edge(self, chunk_start: float, chunk_end: float) -> float:
        """
        Calculate distance to the nearest chunk edge.
        For segments near the start of chunk, use start_time - chunk_start.
        For segments near the end of chunk, use chunk_end - end_time.
        Return the minimum distance to either edge.
        """
        dist_to_start = self.start_time - chunk_start
        dist_to_end = chunk_end - self.end_time
        return min(dist_to_start, dist_to_end)

    def overlaps_with(self, other: "TranscriptSegment") -> bool:
        """Check if this segment overlaps with another segment."""
        return not (self.end_time <= other.start_time or self.start_time >= other.end_time)


def extract_audio(media_file: Path, temp_dir: Path) -> Path:
    """
    Extract audio from media file using ffmpeg.

    Args:
        media_file: Input media file path
        temp_dir: Temporary directory for output

    Returns:
        Path to extracted WAV file
    """
    output_path = temp_dir / "audio.wav"

    cmd = [
        "ffmpeg",
        "-i", str(media_file),
        "-ar", "16000",  # 16kHz sample rate (standard for ASR)
        "-ac", "1",       # Mono
        "-f", "wav",
        "-y",             # Overwrite output file
        str(output_path)
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        typer.echo(f"Error extracting audio: {e.stderr.decode()}", err=True)
        raise typer.Exit(1)

    return output_path


def load_audio_chunk(audio_path: Path, start_time: float, duration: float) -> Tuple[np.ndarray, int]:
    """
    Load a chunk of audio from a file.

    Args:
        audio_path: Path to audio file
        start_time: Start time in seconds
        duration: Duration in seconds

    Returns:
        Tuple of (audio data, sample rate)
    """
    info = sf.info(audio_path)
    sample_rate = info.samplerate
    start_frame = int(start_time * sample_rate)
    num_frames = int(duration * sample_rate)

    # Handle edge case where we might read past the end
    if start_frame >= info.frames:
        return np.array([]), sample_rate

    num_frames = min(num_frames, info.frames - start_frame)

    audio, sr = sf.read(audio_path, start=start_frame, frames=num_frames, dtype='float32')
    return audio, sr


def transcribe_chunk(
    audio: np.ndarray,
    sample_rate: int,
    processor: AutoProcessor,
    model: AutoModelForCTC,
    device: str
) -> List[dict]:
    """
    Transcribe a single audio chunk.

    Args:
        audio: Audio data as numpy array
        sample_rate: Sample rate of audio
        processor: Hugging Face processor
        model: Hugging Face model
        device: Device to run on ('cpu' or 'cuda')

    Returns:
        List of segment dictionaries with 'text', 'start_time', 'end_time'
    """
    if len(audio) == 0:
        return []

    # Process audio
    inputs = processor(audio, sampling_rate=sample_rate, return_tensors="pt", padding=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    # Run inference
    with torch.no_grad():
        logits = model(**inputs).logits

    # Decode with timestamps
    predicted_ids = torch.argmax(logits, dim=-1)
    transcription = processor.batch_decode(predicted_ids)[0]

    # Get word-level timestamps if available
    # For now, we'll create a single segment for the chunk
    # TODO: Use a more sophisticated method to get word-level timestamps
    segments = []
    if transcription.strip():
        segments.append({
            'text': transcription.strip(),
            'start_time': 0.0,
            'end_time': len(audio) / sample_rate
        })

    return segments


def resolve_overlaps(all_segments: List[TranscriptSegment], overlap_duration: float) -> List[TranscriptSegment]:
    """
    Resolve overlapping segments by keeping the one with greater distance to chunk edge.

    Args:
        all_segments: List of all segments from all chunks
        overlap_duration: Duration of overlap between chunks

    Returns:
        List of non-overlapping segments
    """
    if not all_segments:
        return []

    # Sort segments by start time
    sorted_segments = sorted(all_segments, key=lambda s: s.start_time)

    result = [sorted_segments[0]]

    for segment in sorted_segments[1:]:
        prev_segment = result[-1]

        if segment.overlaps_with(prev_segment):
            # Get the chunk boundaries for each segment
            # Estimate chunk boundaries based on segment times and overlap
            prev_chunk_start = prev_segment.chunk_start
            prev_chunk_end = prev_chunk_start + (prev_segment.end_time - prev_segment.start_time) + overlap_duration

            curr_chunk_start = segment.chunk_start
            curr_chunk_end = curr_chunk_start + (segment.end_time - segment.start_time) + overlap_duration

            prev_dist = prev_segment.distance_to_edge(prev_chunk_start, prev_chunk_end)
            curr_dist = segment.distance_to_edge(curr_chunk_start, curr_chunk_end)

            # Keep segment with greater distance to edge
            if curr_dist > prev_dist:
                result[-1] = segment
            # If equal distance or prev is better, keep previous (already in result)
        else:
            result.append(segment)

    return result


def generate_segment_id(audio_hash: str, start_time: float) -> str:
    """
    Generate a UUID for a segment based on audio hash and start time.

    Args:
        audio_hash: Hash of the input audio
        start_time: Absolute start time in seconds

    Returns:
        UUID string
    """
    # Create a deterministic UUID based on audio hash and timestamp
    combined = f"{audio_hash}:{start_time:.3f}"
    hash_bytes = hashlib.sha256(combined.encode()).digest()
    return str(uuid.UUID(bytes=hash_bytes[:16]))


def segments_to_vtt(segments: List[TranscriptSegment], audio_hash: str) -> str:
    """
    Convert segments to VTT format.

    Args:
        segments: List of transcript segments
        audio_hash: Hash of the input audio for UUID generation

    Returns:
        VTT formatted string
    """
    vtt_lines = ["WEBVTT\n"]

    for segment in segments:
        # Generate UUID for this segment
        segment_id = generate_segment_id(audio_hash, segment.start_time)

        # Format timestamps
        start_time = format_timestamp(segment.start_time)
        end_time = format_timestamp(segment.end_time)

        # Add segment to VTT
        vtt_lines.append(f"\n{segment_id}")
        vtt_lines.append(f"{start_time} --> {end_time}")
        vtt_lines.append(f"{segment.text}\n")

    return "\n".join(vtt_lines)


def format_timestamp(seconds: float) -> str:
    """
    Format seconds as VTT timestamp (HH:MM:SS.mmm).

    Args:
        seconds: Time in seconds

    Returns:
        Formatted timestamp string
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def compute_audio_hash(audio_path: Path) -> str:
    """
    Compute SHA256 hash of audio file.

    Args:
        audio_path: Path to audio file

    Returns:
        Hex string of hash
    """
    hasher = hashlib.sha256()
    with open(audio_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            hasher.update(chunk)
    return hasher.hexdigest()


@app.command()
def main(
    media_file: Path = typer.Argument(..., help="Input media file to transcribe"),
    output: Optional[Path] = typer.Option(None, "--output", "-o", help="Output VTT file path"),
    chunk_size: int = typer.Option(60, "--chunk-size", "-c", help="Chunk size in seconds"),
    overlap: int = typer.Option(5, "--overlap", "-v", help="Overlap interval in seconds"),
    model_name: str = typer.Option("nvidia/parakeet-tdt-0.6b-v3", "--model", "-m", help="Hugging Face model name"),
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

    # Create temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Extract audio to WAV
        typer.echo("Extracting audio...")
        audio_path = extract_audio(media_file, temp_path)

        # Get audio duration
        info = sf.info(audio_path)
        duration = info.duration
        typer.echo(f"Audio duration: {duration:.2f}s")

        # Compute audio hash for UUID generation
        audio_hash = compute_audio_hash(audio_path)

        # Load model
        typer.echo(f"Loading model: {model_name}")
        processor = AutoProcessor.from_pretrained(model_name)
        model = AutoModelForCTC.from_pretrained(model_name).to(device)
        model.eval()

        # Process audio in chunks
        all_segments = []
        num_chunks = int(np.ceil((duration - overlap) / (chunk_size - overlap)))

        typer.echo(f"Processing {num_chunks} chunks...")
        for i in range(num_chunks):
            chunk_start = i * (chunk_size - overlap)
            chunk_duration = chunk_size

            # Avoid reading past the end
            if chunk_start + chunk_duration > duration:
                chunk_duration = duration - chunk_start

            if chunk_duration <= 0:
                break

            typer.echo(f"  Chunk {i+1}/{num_chunks}: {chunk_start:.1f}s - {chunk_start + chunk_duration:.1f}s")

            # Load audio chunk
            audio, sample_rate = load_audio_chunk(audio_path, chunk_start, chunk_duration)

            if len(audio) == 0:
                continue

            # Transcribe chunk
            chunk_segments = transcribe_chunk(audio, sample_rate, processor, model, device)

            # Convert to TranscriptSegment objects with absolute times
            for seg in chunk_segments:
                segment = TranscriptSegment(
                    text=seg['text'],
                    start_time=chunk_start + seg['start_time'],
                    end_time=chunk_start + seg['end_time'],
                    chunk_start=chunk_start
                )
                all_segments.append(segment)

        # Resolve overlaps
        typer.echo("Resolving overlaps...")
        final_segments = resolve_overlaps(all_segments, overlap)

        # Generate VTT
        typer.echo("Generating VTT...")
        vtt_content = segments_to_vtt(final_segments, audio_hash)

        # Write output
        output.write_text(vtt_content)
        typer.echo(f"Transcription complete: {output}")
        typer.echo(f"Generated {len(final_segments)} segments")


if __name__ == "__main__":
    app()

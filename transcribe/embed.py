"""Command-line interface for computing speaker embeddings from VTT files."""

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
import typer
from pyannote.audio import Inference, Model
from tqdm import tqdm

from schema import CAPTION_EDITOR_SENTINEL, SegmentSpeakerEmbedding, TranscriptMetadata, TranscriptSegment
from vtt_lib import parse_vtt_file, serialize_vtt

app = typer.Typer(help="Compute speaker embeddings from VTT files")


def get_hf_token() -> str:
    """Get HuggingFace token from environment."""
    token = os.getenv("HF_TOKEN")
    if not token:
        raise ValueError(
            "HF_TOKEN environment variable not set. "
            "Please set it with your HuggingFace token."
        )
    return token


def convert_to_wav(media_file: Path, temp_dir: Path) -> Path:
    """Convert media file to WAV format using ffmpeg.

    Args:
        media_file: Path to the input media file
        temp_dir: Temporary directory for output

    Returns:
        Path to the converted WAV file
    """
    output_path = temp_dir / "audio.wav"

    cmd = [
        "ffmpeg",
        "-i", str(media_file),
        "-ar", "16000",  # 16kHz sample rate
        "-ac", "1",      # Mono
        "-f", "wav",
        "-y",            # Overwrite
        str(output_path),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if e.stderr else "Unknown error"
        raise ValueError(f"Error converting audio: {stderr}")

    return output_path


def extract_audio_segment(
    audio_path: Path, start_time: float, end_time: float
) -> tuple[np.ndarray, int]:
    """Extract a segment of audio from a file.

    Args:
        audio_path: Path to the audio file
        start_time: Start time in seconds
        end_time: End time in seconds

    Returns:
        Tuple of (audio_data, sample_rate)
    """
    info = sf.info(audio_path)
    sample_rate = info.samplerate

    start_frame = int(start_time * sample_rate)
    end_frame = int(end_time * sample_rate)
    num_frames = end_frame - start_frame

    # Clamp to file bounds
    if start_frame >= info.frames:
        return np.array([]), sample_rate

    num_frames = min(num_frames, info.frames - start_frame)

    audio, sr = sf.read(
        audio_path, start=start_frame, frames=num_frames, dtype="float32"
    )
    return audio, sr


def compute_embedding(
    inference: Inference, audio: np.ndarray, sample_rate: int
) -> np.ndarray:
    """Compute embedding for an audio segment.

    Args:
        inference: Pyannote Inference object
        audio: Audio data as numpy array
        sample_rate: Sample rate of the audio

    Returns:
        Embedding vector as numpy array
    """
    # Convert audio to torch tensor for in-memory processing
    # pyannote expects (channel, time) shape
    if audio.ndim == 1:
        # Mono audio - add channel dimension
        waveform = torch.from_numpy(audio).unsqueeze(0)
    else:
        # Multi-channel - transpose to (channel, time)
        waveform = torch.from_numpy(audio.T)

    # Create audio dict for pyannote
    audio_dict = {
        "waveform": waveform,
        "sample_rate": sample_rate,
    }

    # Compute embedding using the inference model
    embedding = inference(audio_dict)

    # Convert to numpy array if needed
    if not isinstance(embedding, np.ndarray):
        embedding = np.array(embedding)

    return embedding


@app.command()
def main(
    vtt_path: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Path to the VTT file",
    ),
    model: str = typer.Option(
        "pyannote/embedding",
        "--model",
        "-m",
        help="Pyannote embedding model to use",
    ),
) -> None:
    """
    Compute speaker embeddings for each segment in a VTT file.

    Requires HF_TOKEN environment variable to be set.
    Writes embeddings as NOTE comments in the VTT file.
    """
    # Use a temporary directory that persists through the whole function
    temp_dir_obj = tempfile.TemporaryDirectory()
    temp_dir = Path(temp_dir_obj.name)

    try:
        # Get HuggingFace token
        token = get_hf_token()

        # Parse VTT file
        typer.echo(f"Parsing VTT file: {vtt_path}")
        metadata, segments = parse_vtt_file(vtt_path)

        # Get media file path (relative to VTT directory)
        if not metadata.media_file_path:
            raise ValueError("No media file path found in VTT metadata")

        vtt_dir = vtt_path.parent
        media_path = vtt_dir / metadata.media_file_path

        if not media_path.exists():
            raise ValueError(f"Media file not found: {media_path}")

        typer.echo(f"Media file: {media_path}")
        typer.echo(f"Found {len(segments)} segments")

        # Check if media file needs conversion
        audio_path = media_path
        if media_path.suffix.lower() not in ['.wav', '.wave']:
            typer.echo(f"Converting {media_path.suffix} to WAV format...")
            try:
                audio_path = convert_to_wav(media_path, temp_dir)
                typer.echo(f"Conversion complete")
            except ValueError as e:
                raise ValueError(f"Failed to convert audio file: {e}")

        # Load embedding model
        typer.echo(f"Loading embedding model: {model}")
        embedding_model = Model.from_pretrained(model, use_auth_token=token)
        inference = Inference(embedding_model, window="whole")

        # Process each segment
        typer.echo(f"Computing embeddings...")
        # Map from segment ID to embedding
        segment_id_to_embedding = {}
        skipped_count = 0

        for segment in tqdm(segments, desc="Processing segments", unit="segment"):
            # Skip segments shorter than 0.5 seconds
            duration = segment.end_time - segment.start_time
            if duration < 0.5:
                tqdm.write(f"Skipping short segment {segment.id} (duration: {duration:.3f}s)")
                skipped_count += 1
                continue

            # Extract audio segment
            audio, sample_rate = extract_audio_segment(
                audio_path, segment.start_time, segment.end_time
            )

            if len(audio) == 0:
                tqdm.write(f"Warning: Empty audio for segment {segment.id}")
                continue

            # Compute embedding
            embedding = compute_embedding(inference, audio, sample_rate)

            # Store in map
            segment_id_to_embedding[segment.id] = embedding

        typer.echo(f"Skipped {skipped_count} segments shorter than 0.5s")
        typer.echo(f"Computed {len(segment_id_to_embedding)} embeddings")

        # Create SegmentSpeakerEmbedding objects
        embeddings = []
        for segment_id, embedding in segment_id_to_embedding.items():
            # Convert numpy array to list of floats
            embedding_list = embedding.tolist()
            embeddings.append(
                SegmentSpeakerEmbedding(
                    segment_id=segment_id,
                    speaker_embedding=embedding_list
                )
            )

        # Write updated VTT file with embeddings
        typer.echo(f"Writing embeddings to VTT file: {vtt_path}")
        vtt_content = serialize_vtt(metadata, segments, embeddings=embeddings)
        vtt_path.write_text(vtt_content)
        typer.echo(f"Done! Wrote {len(embeddings)} embeddings to VTT file")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)
    finally:
        # Clean up temporary directory
        temp_dir_obj.cleanup()


if __name__ == "__main__":
    app()

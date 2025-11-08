"""Command-line interface for computing speaker embeddings from VTT files."""

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import libsql_client as libsql
import numpy as np
import pandas as pd
import soundfile as sf
import torch
import typer
from pyannote.audio import Inference, Model
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_distances
from tqdm import tqdm

from schema import CAPTION_EDITOR_SENTINEL, TranscriptMetadata, VTTCue
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
    output: Optional[Path] = typer.Option(
        None,
        "--output",
        "-o",
        help="Output libsql database path (default: <vtt_file>.embeddings.db)",
    ),
    model: str = typer.Option(
        "pyannote/embedding",
        "--model",
        "-m",
        help="Pyannote embedding model to use",
    ),
    auto_assign_speaker_clusters_to_unknown_names: bool = typer.Option(
        False,
        "--auto_assign_speaker_clusters_to_unknown_names",
        help="Automatically cluster speakers and assign names like 'Unknown Speaker 00?'",
    ),
    num_speaker_clusters: int = typer.Option(
        2,
        "--num_speaker_clusters",
        help="Number of speaker clusters to create (only used with --auto_assign_speaker_clusters_to_unknown_names)",
    ),
) -> None:
    """
    Compute speaker embeddings for each segment in a VTT file.

    Requires HF_TOKEN environment variable to be set.
    Outputs to libsql database with speaker_embedding table.
    """
    # Use a temporary directory that persists through the whole function
    temp_dir_obj = tempfile.TemporaryDirectory()
    temp_dir = Path(temp_dir_obj.name)

    try:
        # Get HuggingFace token
        token = get_hf_token()

        # Parse VTT file
        typer.echo(f"Parsing VTT file: {vtt_path}")
        metadata, cues = parse_vtt_file(vtt_path)

        # Get media file path (relative to VTT directory)
        if not metadata.media_file_path:
            raise ValueError("No media file path found in VTT metadata")

        vtt_dir = vtt_path.parent
        media_path = vtt_dir / metadata.media_file_path

        if not media_path.exists():
            raise ValueError(f"Media file not found: {media_path}")

        typer.echo(f"Media file: {media_path}")
        typer.echo(f"Found {len(cues)} segments")

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

        # Determine output path
        if output is None:
            output = vtt_path.with_suffix(".embeddings.db")

        # Process each segment
        typer.echo(f"Computing embeddings...")
        data = []

        for cue in tqdm(cues, desc="Processing segments", unit="segment"):
            # Extract audio segment
            audio, sample_rate = extract_audio_segment(
                audio_path, cue.start_time, cue.end_time
            )

            if len(audio) == 0:
                tqdm.write(f"Warning: Empty audio for segment {cue.id}")
                continue

            # Compute embedding
            embedding = compute_embedding(inference, audio, sample_rate)

            # Convert embedding to bytes for VECTOR storage
            data.append({
                "segment_id": cue.id,
                "embedding": embedding.tobytes(),
                "embedding_array": embedding  # Keep array for clustering
            })

        # Perform speaker clustering if requested
        if auto_assign_speaker_clusters_to_unknown_names:
            typer.echo(f"Clustering speakers into {num_speaker_clusters} groups...")

            # Extract embeddings as matrix
            embeddings_matrix = np.array([d["embedding_array"] for d in data])

            # Normalize embeddings for cosine similarity
            # After normalization, Euclidean distance equals cosine distance
            norms = np.linalg.norm(embeddings_matrix, axis=1, keepdims=True)
            embeddings_normalized = embeddings_matrix / norms

            # Perform k-means clustering on normalized embeddings
            # With normalized vectors, Euclidean distance = cosine distance
            kmeans = KMeans(
                n_clusters=num_speaker_clusters,
                random_state=42,
                n_init=10
            )
            cluster_labels = kmeans.fit_predict(embeddings_normalized)

            # Assign speaker names based on clusters
            cue_idx = 0
            for i, cue in enumerate(cues):
                # Skip cues that don't have embeddings (e.g., empty audio)
                if cue_idx >= len(data):
                    break

                if data[cue_idx]["segment_id"] != cue.id:
                    # This cue was skipped (empty audio), don't assign speaker
                    continue

                # Only assign speaker name if it's currently empty
                if not cue.speaker_name:
                    cluster_id = cluster_labels[cue_idx]
                    cue.speaker_name = f"Unknown Speaker {cluster_id:02d}?"

                cue_idx += 1

            # Write updated VTT file back
            typer.echo(f"Updating VTT file with speaker assignments: {vtt_path}")
            vtt_content = serialize_vtt(metadata, cues)
            vtt_path.write_text(vtt_content)
            typer.echo(f"Updated {cue_idx} segments with speaker names")

        # Write to libsql database
        typer.echo(f"Writing embeddings to database: {output}")
        client = libsql.create_client_sync(f"file:{output}")

        # Create table
        client.execute("""
            CREATE TABLE IF NOT EXISTS speaker_embedding (
                segment_id TEXT PRIMARY KEY,
                embedding BLOB
            )
        """)

        # Insert embeddings
        for row in data:
            client.execute(
                "INSERT OR REPLACE INTO speaker_embedding (segment_id, embedding) VALUES (?, ?)",
                [row["segment_id"], row["embedding"]]
            )

        client.close()
        typer.echo(f"Done! Computed {len(data)} embeddings")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)
    finally:
        # Clean up temporary directory
        temp_dir_obj.cleanup()


if __name__ == "__main__":
    app()

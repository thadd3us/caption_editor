"""Command-line interface for computing speaker embeddings from VTT files."""

import os
import tempfile
from pathlib import Path
from typing import Optional

import numpy as np
import torch
import typer
from pyannote.audio import Inference, Model
from tqdm import tqdm

from audio_utils import extract_audio_to_wav, load_audio_segment
from schema import SegmentSpeakerEmbedding
from vtt_lib import parse_vtt_file, serialize_vtt

app = typer.Typer(help="Compute speaker embeddings from VTT files")


def get_hf_token() -> Optional[str]:
    """Get HuggingFace token from environment (optional for public models)."""
    return os.getenv("HF_TOKEN")


def compute_embedding(
    inference: Inference, audio: np.ndarray, sample_rate: int
) -> np.ndarray:
    """Compute speaker embedding vector for an audio segment."""
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
        "pyannote/wespeaker-voxceleb-resnet34-LM",
        "--model",
        "-m",
        help="Pyannote embedding model to use",
    ),
    min_segment_duration: float = typer.Option(
        0.3,
        help="Shortest segment to embed",
    ),
) -> None:
    """
    Compute speaker embeddings for each segment in a VTT file.

    HF_TOKEN environment variable is optional (only needed for gated models).
    Writes embeddings as NOTE comments in the VTT file.
    """
    # Use a temporary directory that persists through the whole function
    temp_dir_obj = tempfile.TemporaryDirectory()
    temp_dir = Path(temp_dir_obj.name)

    try:
        # Get HuggingFace token (optional for public models)
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
        if media_path.suffix.lower() not in [".wav", ".wave"]:
            typer.echo(f"Converting {media_path.suffix} to WAV format...")
            try:
                audio_path = extract_audio_to_wav(media_path, temp_dir / "audio.wav")
                typer.echo(f"Conversion complete")
            except ValueError as e:
                raise ValueError(f"Failed to convert audio file: {e}")

        # Load embedding model
        typer.echo(f"Loading embedding model: {model}")
        model_path = (
            Path.home() / f".cache/huggingface/hub/models--{model.replace('/', '--')}"
        )
        snapshots = list((model_path / "snapshots").rglob("pytorch_model.bin"))
        if len(snapshots) == 1:
            typer.echo(f"Loading model from {snapshots[0]=}")
            embedding_model = Model.from_pretrained(snapshots[0].parent)
        else:
            typer.echo(f"Downloading {model=}")
            # Use token if available, otherwise download public model without auth
            if token:
                embedding_model = Model.from_pretrained(model, use_auth_token=token)
            else:
                embedding_model = Model.from_pretrained(model)
        if not embedding_model:
            raise ValueError(f"Failed to load embedding model: {model}")
        inference = Inference(embedding_model, window="whole")

        # Process each segment
        typer.echo(f"Computing embeddings...")
        # Map from segment ID to embedding
        segment_id_to_embedding = {}
        skipped_count = 0

        for segment in tqdm(segments, desc="Processing segments", unit="segment"):
            # Skip segments shorter than 0.5 seconds
            duration = segment.end_time - segment.start_time
            if duration < min_segment_duration:
                tqdm.write(
                    f"Skipping short segment {segment.id} (duration: {duration:.3f}s)"
                )
                skipped_count += 1
                continue

            # Extract audio segment
            audio, sample_rate = load_audio_segment(
                audio_path, segment.start_time, segment.end_time
            )

            if len(audio) == 0:
                tqdm.write(f"Warning: Empty audio for segment {segment.id}")
                continue

            # Compute embedding
            embedding = compute_embedding(inference, audio, sample_rate)

            # Store in map
            segment_id_to_embedding[segment.id] = embedding

        typer.echo(
            f"Skipped {skipped_count} segments shorter than {min_segment_duration}s"
        )
        typer.echo(f"Computed {len(segment_id_to_embedding)} embeddings")

        # Create SegmentSpeakerEmbedding objects
        embeddings = []
        for segment_id, embedding in segment_id_to_embedding.items():
            # Convert numpy array to list of floats
            embedding_list = embedding.tolist()
            embeddings.append(
                SegmentSpeakerEmbedding(
                    segment_id=segment_id, speaker_embedding=embedding_list
                )
            )

        # Write updated VTT file with embeddings
        typer.echo(f"Writing embeddings to VTT file: {vtt_path}")
        vtt_content = serialize_vtt(
            metadata, segments, embeddings=embeddings, vtt_path=vtt_path
        )
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

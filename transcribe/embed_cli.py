"""Command-line interface for computing speaker embeddings for `.captions_json5` files.

Example usage:
uv run embed_cli path/to/captions.captions_json5
"""

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
from captions_json5_lib import parse_captions_json5_file, write_captions_json5_file
from schema import CaptionsDocument, SegmentSpeakerEmbedding, encode_embedding

app = typer.Typer(help="Compute speaker embeddings for .captions_json5 files")


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


def load_embedding_model(model_name: str) -> Inference:
    """Load a speaker embedding model and return an Inference wrapper.

    Checks HuggingFace cache first for fast local loading.
    Extracted from main() so bulk processing can load once and reuse.

    Args:
        model_name: Pyannote/wespeaker model name.

    Returns:
        pyannote Inference object ready for embedding computation.
    """
    token = get_hf_token()

    model_path = (
        Path.home() / f".cache/huggingface/hub/models--{model_name.replace('/', '--')}"
    )
    snapshots = list((model_path / "snapshots").rglob("pytorch_model.bin"))
    if len(snapshots) == 1:
        embedding_model = Model.from_pretrained(snapshots[0].parent)
    else:
        if token:
            embedding_model = Model.from_pretrained(model_name, use_auth_token=token)
        else:
            embedding_model = Model.from_pretrained(model_name)

    if not embedding_model:
        raise ValueError(f"Failed to load embedding model: {model_name}")

    return Inference(embedding_model, window="whole")


def embed_document(
    document: CaptionsDocument,
    audio_path: Path,
    inference: Inference,
    model_name: str,
    min_segment_duration: float = 0.3,
    umap_dimensions: Optional[list[int]] = None,
) -> CaptionsDocument:
    """Compute speaker embeddings for all segments in a document.

    Uses a pre-loaded Inference model. The audio_path should be a WAV file
    (caller handles conversion).
    Extracted from main() so bulk processing can reuse a loaded model.

    Args:
        document: CaptionsDocument with segments to embed.
        audio_path: Path to 16kHz mono WAV file.
        inference: Pre-loaded pyannote Inference object.
        model_name: Embedding model name (stored in document).
        min_segment_duration: Skip segments shorter than this (seconds).
        umap_dimensions: Optional list of integer dimensions for UMAP reduction.

    Returns:
        Updated CaptionsDocument with embeddings populated.
    """
    segment_id_to_embedding: dict[str, np.ndarray] = {}
    skipped_count = 0

    for segment in tqdm(document.segments, desc="Embedding segments", unit="seg"):
        duration = segment.end_time - segment.start_time
        if duration < min_segment_duration:
            skipped_count += 1
            continue

        audio, sample_rate = load_audio_segment(
            audio_path, segment.start_time, segment.end_time
        )

        if len(audio) == 0:
            continue

        embedding = compute_embedding(inference, audio, sample_rate)
        segment_id_to_embedding[segment.id] = embedding

    # Compute UMAP reductions if requested and enough segments
    umap_embeddings_map = {sid: {} for sid in segment_id_to_embedding.keys()}
    segment_ids = list(segment_id_to_embedding.keys())
    
    if umap_dimensions and len(segment_ids) > 1:
        import umap
        
        # Stack all embeddings into (num_segments, embedding_dim)
        X = np.stack([segment_id_to_embedding[sid] for sid in segment_ids])
        
        for dim in umap_dimensions:
            # Number of neighbors must be less than number of samples
            # default n_neighbors is 15.
            n_neighbors = min(15, len(segment_ids) - 1)
            # Spectral initialization fails if number of samples is too small relative to components
            init_method = 'spectral' if len(segment_ids) > dim + 2 else 'random'
            
            try:
                reducer = umap.UMAP(
                    n_components=dim, 
                    metric="cosine", 
                    n_neighbors=n_neighbors, 
                    init=init_method
                )
                reduced = reducer.fit_transform(X)
                
                for i, sid in enumerate(segment_ids):
                    umap_embeddings_map[sid][str(dim)] = [float(val) for val in reduced[i]]
            except Exception as e:
                # If UMAP fails (e.g. edge cases with too few samples or identical points)
                # just skip this dimensionality
                print(f"Warning: UMAP computation failed for dim {dim}: {e}")

    embeddings = []
    for segment_id, embedding in segment_id_to_embedding.items():
        embedding_b64 = encode_embedding(embedding.tolist())
        umap_data = umap_embeddings_map.get(segment_id)
        
        embeddings.append(
            SegmentSpeakerEmbedding(
                segmentId=segment_id,
                speakerEmbedding=embedding_b64,
                umapEmbeddings=umap_data if umap_data else None,
            )
        )

    document.embeddings = embeddings
    document.embedding_model = model_name
    return document


def embed_captions_path(
    captions_path: Path,
    *,
    model: str = "pyannote/wespeaker-voxceleb-resnet34-LM",
    min_segment_duration: float = 0.3,
    umap_dimensions: Optional[list[int]] = None,
) -> None:
    """Load ``captions_path``, compute speaker embeddings (and optional UMAP), write in place.

    Plain Python API for programmatic use. Typer does not process this function; optional
    arguments use normal defaults (unlike calling a ``@app.command()`` handler directly).
    """
    if umap_dimensions is None:
        umap_dimensions = [1, 2]

    temp_dir_obj = tempfile.TemporaryDirectory()
    temp_dir = Path(temp_dir_obj.name)

    try:
        typer.echo(f"Parsing captions JSON: {captions_path}")
        document = parse_captions_json5_file(captions_path)
        metadata = document.metadata

        if not metadata.media_file_path:
            raise ValueError("No media file path found in document metadata")

        captions_dir = captions_path.parent
        media_path = Path(os.path.normpath(captions_dir / metadata.media_file_path))

        if not media_path.exists():
            raise ValueError(f"Media file not found: {media_path}")

        typer.echo(f"Media file: {media_path}")
        typer.echo(f"Found {len(document.segments)} segments")

        # Convert to WAV if needed
        audio_path = media_path
        if media_path.suffix.lower() not in [".wav", ".wave"]:
            typer.echo(f"Converting {media_path.suffix} to WAV format...")
            audio_path = extract_audio_to_wav(media_path, temp_dir / "audio.wav")
            typer.echo("Conversion complete")

        typer.echo(f"Loading embedding model: {model}")
        inference = load_embedding_model(model)

        typer.echo(f"Computing embeddings (with UMAP dims {umap_dimensions})...")
        embed_document(
            document,
            audio_path,
            inference,
            model,
            min_segment_duration,
            umap_dimensions,
        )

        typer.echo(f"Writing embeddings to captions JSON: {captions_path}")
        write_captions_json5_file(captions_path, document)
        n = len(document.embeddings) if document.embeddings else 0
        typer.echo(f"Done! Wrote {n} embeddings to captions JSON")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)
    finally:
        temp_dir_obj.cleanup()


@app.command()
def main(
    captions_path: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Path to the .captions_json5 file",
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
    umap_dimensions: list[int] = typer.Option(
        [1, 2],
        "--umap-dimensions",
        help="List of dimensionalities to compute UMAP embeddings for (e.g., --umap-dimensions 1 --umap-dimensions 2)",
    ),
) -> None:
    """
    Compute speaker embeddings for each segment in a captions JSON document.

    HF_TOKEN environment variable is optional (only needed for gated models).
    Writes embeddings into the `embeddings` field of the captions JSON document.
    """
    embed_captions_path(
        captions_path,
        model=model,
        min_segment_duration=min_segment_duration,
        umap_dimensions=umap_dimensions,
    )


if __name__ == "__main__":
    app()

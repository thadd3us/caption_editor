"""Command-line interface for computing speaker embeddings from VTT files."""

import json
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

from schema import CAPTION_EDITOR_SENTINEL, TranscriptMetadata, VTTCue

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


def parse_vtt_file(vtt_path: Path) -> tuple[TranscriptMetadata, list[VTTCue]]:
    """Parse VTT file and extract metadata and cues from NOTE comments.

    Args:
        vtt_path: Path to the VTT file

    Returns:
        Tuple of (metadata, cues)
    """
    content = vtt_path.read_text()
    lines = content.split("\n")

    metadata = None
    cues = []

    # Pattern to match NOTE CAPTION_EDITOR: lines
    pattern = re.compile(
        rf"^NOTE {CAPTION_EDITOR_SENTINEL}:(\w+)\s+(.+)$"
    )

    for line in lines:
        match = pattern.match(line.strip())
        if match:
            data_type = match.group(1)
            json_data = match.group(2)

            if data_type == "TranscriptMetadata":
                metadata = TranscriptMetadata.model_validate_json(json_data)
            elif data_type == "VTTCue":
                cue = VTTCue.model_validate_json(json_data)
                cues.append(cue)

    if metadata is None:
        raise ValueError(
            f"No TranscriptMetadata found in VTT file: {vtt_path}"
        )

    if not cues:
        raise ValueError(f"No VTTCue entries found in VTT file: {vtt_path}")

    return metadata, cues


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
        help="Output JSONL file path (default: <vtt_file>.embeddings.jsonl)",
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
    Outputs a JSONL file with segment IDs and embedding vectors.
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
            output = vtt_path.with_suffix(".embeddings.jsonl")

        # Process each segment
        typer.echo(f"Computing embeddings...")
        results = []

        for cue in tqdm(cues, desc="Processing segments", unit="segment"):
            # Extract audio segment
            audio, sample_rate = extract_audio_segment(
                audio_path, cue.start_time, cue.end_time
            )

            if len(audio) == 0:
                tqdm.write(
                    f"Warning: Empty audio for segment {cue.id}"
                )
                continue

            # Compute embedding
            embedding = compute_embedding(inference, audio, sample_rate)

            # Store result
            result = {
                "segment_id": cue.id,
                "start_time": cue.start_time,
                "end_time": cue.end_time,
                "embedding": embedding.tolist(),
            }
            results.append(result)

        # Write output as JSONL
        typer.echo(f"Writing embeddings to: {output}")
        with open(output, "w") as f:
            for result in results:
                f.write(json.dumps(result) + "\n")

        typer.echo(f"Done! Computed {len(results)} embeddings")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)
    finally:
        # Clean up temporary directory
        temp_dir_obj.cleanup()


if __name__ == "__main__":
    app()

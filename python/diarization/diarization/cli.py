"""Command-line interface for speaker diarization."""

import os
from pathlib import Path

import typer
from pyannote.audio import Pipeline

app = typer.Typer(help="Speaker diarization using pyannote.audio")


def get_hf_token() -> str:
    """Get HuggingFace token from environment."""
    token = os.getenv("HF_TOKEN")
    if not token:
        raise ValueError(
            "HF_TOKEN environment variable not set. "
            "Please set it with your HuggingFace token."
        )
    return token


def diarize_audio(
    audio_path: Path,
    model: str = "pyannote/speaker-diarization-community-1",
) -> list[tuple[float, float, str]]:
    """
    Perform speaker diarization on an audio file.

    Args:
        audio_path: Path to the audio file (WAV format)
        model: Name of the pyannote model to use

    Returns:
        List of tuples (start_time, end_time, speaker_label)
    """
    # Ensure HF_TOKEN is set
    token = get_hf_token()

    # Load the pipeline - pass token explicitly since pyannote v4 doesn't
    # always auto-detect HF_TOKEN from environment
    pipeline = Pipeline.from_pretrained(model, token=token)

    # Run diarization
    output = pipeline(str(audio_path))

    # Extract speaker turns from the speaker_diarization annotation
    # (pyannote v4 returns a DiarizeOutput object with speaker_diarization attribute)
    results = []
    for turn, _, speaker in output.speaker_diarization.itertracks(yield_label=True):
        results.append((turn.start, turn.end, speaker))

    return results


@app.command()
def main(
    audio_path: Path = typer.Argument(
        ...,
        exists=True,
        file_okay=True,
        dir_okay=False,
        readable=True,
        help="Path to the audio file (WAV format)",
    ),
    model: str = typer.Option(
        "pyannote/speaker-diarization-community-1",
        "--model",
        "-m",
        help="Pyannote model to use",
    ),
) -> None:
    """
    Perform speaker diarization on an audio file.

    Requires HF_TOKEN environment variable to be set.
    Prints speaker turns with timestamps to stdout.
    """
    try:
        results = diarize_audio(audio_path, model=model)

        # Print results
        for start, end, speaker in results:
            print(f"{speaker} speaks between t={start:.3f}s and t={end:.3f}s")

    except Exception as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()

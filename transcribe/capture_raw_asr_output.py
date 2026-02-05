#!/usr/bin/env python3
"""
Capture raw ASR output in JSON format for test fixtures.

This script uses the actual production code from transcribe.py to process audio
and captures the raw ASR output for use in unit tests.

Supports both Whisper (transformers) and Parakeet (NeMo) models.

TODO: Add sample usage commands.
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf
import typer

# Import production code
from transcribe import (
    load_audio_chunk,
    transcribe_chunk,
    NEMO_AVAILABLE,
    TRANSFORMERS_AVAILABLE,
)

app = typer.Typer()


def serialize_asr_segments(segments: list) -> dict:
    """Convert ASRSegment objects to JSON-serializable format."""
    if not segments:
        return {"segments": [], "words": []}

    # For compatibility with existing fixtures, return in the format expected by tests
    result_segments = []
    result_words = []

    for seg in segments:
        result_segments.append(
            {
                "text": seg.text,
                "start": float(seg.start),
                "end": float(seg.end),
            }
        )

        for word in seg.words:
            result_words.append(
                {
                    "word": word.word,
                    "start": float(word.start),
                    "end": float(word.end),
                }
            )

    return {
        "text": " ".join(seg.text for seg in segments),
        "segments": result_segments,
        "words": result_words,
    }


def load_asr_model(model_name: str):
    """Load the appropriate ASR model based on model name."""
    is_nemo = "parakeet" in model_name.lower() or "nvidia" in model_name.lower()

    if is_nemo:
        if not NEMO_AVAILABLE:
            typer.echo(
                "Error: NeMo not available. Install with: pip install nemo_toolkit[asr]",
                err=True,
            )
            raise typer.Exit(1)

        import nemo.collections.asr as nemo_asr

        typer.echo(f"Loading NeMo model: {model_name}")
        asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name)
        asr_model.eval()
        return asr_model, True
    else:
        if not TRANSFORMERS_AVAILABLE:
            typer.echo(
                "Error: transformers not available. Install with: pip install transformers",
                err=True,
            )
            raise typer.Exit(1)

        from transformers import pipeline

        typer.echo(f"Loading Transformers model: {model_name}")
        asr_pipeline = pipeline(
            "automatic-speech-recognition",
            model=model_name,
            device=-1,  # CPU
        )
        return asr_pipeline, False


@app.command()
def capture(
    audio_file: Path = typer.Argument(
        ..., help="Path to audio file (e.g., test_data/OSR_us_000_0010_8k.wav)"
    ),
    model: str = typer.Option(
        "openai/whisper-tiny",
        "--model",
        "-m",
        help="Model name (e.g., openai/whisper-tiny, nvidia/parakeet-tdt-0.6b-v3)",
    ),
    chunk_size: float = typer.Option(60, "--chunk-size", help="Chunk size in seconds"),
    overlap: float = typer.Option(
        5.0, "--overlap", help="Overlap in seconds for chunked processing"
    ),
    output: Path = typer.Option(
        ...,
        "--output",
        "-o",
        help="Output JSON file path (auto-generated if not provided)",
    ),
):
    """Capture raw ASR output from audio file using production transcription pipeline."""

    if not audio_file.exists():
        typer.echo(f"Error: Audio file not found: {audio_file}", err=True)
        raise typer.Exit(1)

    # Load model
    asr_pipeline, is_nemo = load_asr_model(model)

    # Get audio info
    info = sf.info(audio_file)
    duration = info.duration
    sample_rate = info.samplerate

    typer.echo(f"Audio file: {audio_file}")
    typer.echo(f"Duration: {duration:.2f}s")
    typer.echo(f"Sample rate: {sample_rate}Hz")
    typer.echo()

    # Chunked processing
    typer.echo(f"Processing in {chunk_size}s chunks with {overlap}s overlap...")

    num_chunks = int(np.ceil((duration - overlap) / (chunk_size - overlap)))
    typer.echo(f"  Number of chunks: {num_chunks}")
    typer.echo()

    chunk_results = []

    for i in range(num_chunks):
        chunk_start = i * (chunk_size - overlap)
        chunk_duration = min(chunk_size, duration - chunk_start)

        if chunk_duration <= 0:
            break

        typer.echo(f"  Processing chunk {i} ({chunk_start:.1f}s)...")
        audio, sr = load_audio_chunk(audio_file, chunk_start, chunk_duration)

        if len(audio) == 0:
            continue

        # Use production transcribe_chunk with chunk_start=0 to get relative times
        segments = transcribe_chunk(
            audio, asr_pipeline, chunk_start=0.0, sample_rate=sr, is_nemo=is_nemo
        )

        serialized = serialize_asr_segments(segments)
        chunk_results.append(serialized)

        # chunk_result = {
        #     "chunk_index": i,
        #     "chunk_start_time": chunk_start,
        #     "chunk_duration": chunk_duration,
        #     # "text": serialized["text"],
        #     "segments": serialized["segments"],
        #     "words": serialized["words"],
        # }

        # # For Whisper compatibility, also include "chunks" key (word list)
        # if not is_nemo:
        #     chunk_result["chunks"] = [
        #         {"text": w["word"], "timestamp": [w["start"], w["end"]]}
        #         for w in serialized["words"]
        #     ]

        # chunk_results.append(chunk_result)
        # typer.echo(f"    Segments: {len(serialized['segments'])}, Words: {len(serialized['words'])}")

    with open(output, "w") as f:
        json.dump(chunk_results, f, indent=2)

    typer.echo()
    typer.echo(f"Saved to: {output}")


if __name__ == "__main__":
    app()

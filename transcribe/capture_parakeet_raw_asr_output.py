#!/usr/bin/env python3
"""
Capture raw ASR output from Parakeet (NeMo) in JSON format for analysis.

This script captures the EXACT output from Parakeet's ASR pipeline in two ways:
1. Processing the full file in one pass
2. Processing in chunks (using the same chunking logic as transcribe.py)

The raw outputs are saved as JSON files for inspection and use in unit tests.
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

# Import NeMo
try:
    import nemo.collections.asr as nemo_asr
except ImportError:
    print("Error: NeMo not installed. Please install with: pip install nemo_toolkit[asr]")
    sys.exit(1)

# Import the actual functions from transcribe.py
sys.path.insert(0, str(Path(__file__).parent))
from transcribe import load_audio_chunk


def serialize_nemo_result(result) -> dict:
    """Convert NeMo result to JSON-serializable format."""
    if not result or len(result) == 0:
        return {"segments": [], "words": []}

    output = result[0]

    # Extract text
    text = output.text if hasattr(output, 'text') else ""

    # Extract timestamps if available
    segments = []
    words = []

    if hasattr(output, 'timestamp') and output.timestamp:
        if 'segment' in output.timestamp:
            segments = [
                {
                    "segment": seg['segment'],
                    "start": float(seg['start']),
                    "end": float(seg['end']),
                }
                for seg in output.timestamp['segment']
            ]

        if 'word' in output.timestamp:
            words = [
                {
                    "word": w['word'],
                    "start": float(w['start']),
                    "end": float(w['end']),
                }
                for w in output.timestamp['word']
            ]

    return {
        "text": text,
        "segments": segments,
        "words": words,
    }


def capture_full_file_output(audio_path: Path, model_name: str) -> dict:
    """Capture Parakeet output when processing the entire file at once."""
    print(f"Processing full file: {audio_path}")

    # Load Parakeet model
    asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name)
    asr_model.eval()

    # Process full audio with word-level timestamps
    result = asr_model.transcribe(
        audio=[str(audio_path)],
        batch_size=1,
        return_hypotheses=True,
        timestamps=True,
    )

    serialized = serialize_nemo_result(result)

    print(f"  Full text: {serialized['text'][:100]}...")
    print(f"  Number of segments: {len(serialized['segments'])}")
    print(f"  Number of words: {len(serialized['words'])}")

    return serialized


def capture_chunked_output(audio_path: Path, model_name: str, chunk_size: float = 10.0, overlap: float = 5.0) -> list:
    """Capture Parakeet output when processing in chunks with overlap.

    Uses the exact same chunking logic as transcribe.py.
    """
    print(f"Processing in {chunk_size}s chunks with {overlap}s overlap: {audio_path}")

    # Get audio info
    info = sf.info(audio_path)
    duration = info.duration
    print(f"  Audio duration: {duration:.2f}s")

    # Load Parakeet model
    asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name)
    asr_model.eval()

    # Process chunks using same logic as transcribe.py
    num_chunks = int(np.ceil((duration - overlap) / (chunk_size - overlap)))
    print(f"  Processing {num_chunks} chunks...")

    chunk_results = []

    for i in range(num_chunks):
        chunk_start = i * (chunk_size - overlap)
        chunk_duration = min(chunk_size, duration - chunk_start)

        if chunk_duration <= 0:
            break

        # Use transcribe.py's load_audio_chunk function
        audio, sr = load_audio_chunk(audio_path, chunk_start, chunk_duration)

        if len(audio) == 0:
            continue

        # Save chunk to temp file for Parakeet (it needs a file path)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_path = tmp_file.name
            sf.write(tmp_path, audio, sr)

        try:
            # Process with Parakeet
            result = asr_model.transcribe(
                audio=[tmp_path],
                batch_size=1,
                return_hypotheses=True,
                timestamps=True,
            )

            serialized = serialize_nemo_result(result)

            chunk_result = {
                "chunk_index": i,
                "chunk_start_time": chunk_start,
                "chunk_duration": chunk_duration,
                "text": serialized["text"],
                "segments": serialized["segments"],
                "words": serialized["words"],
            }
            chunk_results.append(chunk_result)

            print(f"    Chunk {i} ({chunk_start:.1f}s): {len(serialized['segments'])} segments, {len(serialized['words'])} words")

        finally:
            # Clean up temp file
            import os
            os.unlink(tmp_path)

    return chunk_results


def main():
    test_audio = Path(__file__).parent.parent / "test_data" / "OSR_us_000_0010_8k.wav"
    model_name = "nvidia/parakeet-tdt-0.6b-v3"

    if not test_audio.exists():
        print(f"Error: Test audio not found: {test_audio}")
        return

    print("=" * 80)
    print("CAPTURING RAW PARAKEET (NeMo) ASR OUTPUT")
    print("=" * 80)
    print()

    # Capture full-file output
    print("1. FULL FILE PROCESSING")
    print("-" * 80)
    full_result = capture_full_file_output(test_audio, model_name)

    # Save to JSON
    output_dir = Path(__file__).parent / "test_fixtures"
    output_dir.mkdir(exist_ok=True)

    full_output_path = output_dir / "parakeet_full_file_raw_output.json"
    with open(full_output_path, "w") as f:
        json.dump(full_result, f, indent=2)
    print(f"  Saved to: {full_output_path}")
    print()

    # Capture chunked output with 10s chunks
    print("2. CHUNKED PROCESSING (10s chunks, 5s overlap)")
    print("-" * 80)
    chunked_10s = capture_chunked_output(test_audio, model_name, chunk_size=10.0, overlap=5.0)

    chunked_10s_path = output_dir / "parakeet_chunked_10s_raw_output.json"
    with open(chunked_10s_path, "w") as f:
        json.dump(chunked_10s, f, indent=2)
    print(f"  Saved to: {chunked_10s_path}")
    print()

    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Full file: {len(full_result['segments'])} segments, {len(full_result['words'])} words")
    print(f"Chunked (10s): {sum(len(c['segments']) for c in chunked_10s)} total segments, {sum(len(c['words']) for c in chunked_10s)} total words across {len(chunked_10s)} chunks")
    print()
    print("Files saved to:", output_dir)


if __name__ == "__main__":
    main()

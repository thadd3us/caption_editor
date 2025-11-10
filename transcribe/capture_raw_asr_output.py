#!/usr/bin/env python3
"""
Capture raw ASR output from Whisper in JSON format for analysis.

This script captures the EXACT output from Whisper's ASR pipeline in two ways:
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
from transformers import pipeline

# Import the actual functions from transcribe.py
sys.path.insert(0, str(Path(__file__).parent))
from transcribe import load_audio_chunk, transcribe_chunk


def capture_full_file_output(audio_path: Path, model_name: str) -> dict:
    """Capture Whisper output when processing the entire file at once."""
    print(f"Processing full file: {audio_path}")

    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=-1,  # CPU
    )

    # Process full audio with word-level timestamps
    result = asr_pipeline(str(audio_path), return_timestamps="word")

    print(f"  Full text: {result['text'][:100]}...")
    print(f"  Number of chunks (words): {len(result['chunks'])}")

    return result


def capture_chunked_output(audio_path: Path, model_name: str, chunk_size: float = 10.0, overlap: float = 5.0) -> list:
    """Capture Whisper output when processing in chunks with overlap.

    Uses the exact same chunking logic as transcribe.py.
    """
    print(f"Processing in {chunk_size}s chunks with {overlap}s overlap: {audio_path}")

    # Get audio info
    info = sf.info(audio_path)
    duration = info.duration
    print(f"  Audio duration: {duration:.2f}s")

    # Set device
    device = "cuda" if torch.cuda.is_available() else "cpu"

    # Load model (using transformers pipeline like transcribe.py does for Whisper)
    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=0 if device == "cuda" else -1,
    )

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

        # Use transcribe.py's transcribe_chunk function to get ASR segments
        # This returns ASRSegment objects with word-level timestamps
        asr_segments = transcribe_chunk(audio, asr_pipeline, chunk_start, sr, is_nemo=False)

        # Convert ASRSegments back to raw format for comparison
        # Each segment has words with timestamps
        chunk_words = []
        for seg in asr_segments:
            for word in seg.words:
                chunk_words.append({
                    "text": word.word,
                    "timestamp": [word.start, word.end]
                })

        # Reconstruct text from words
        chunk_text = " ".join(w["text"] for w in chunk_words)

        chunk_result = {
            "chunk_index": i,
            "chunk_start_time": chunk_start,
            "chunk_duration": chunk_duration,
            "text": chunk_text,
            "chunks": chunk_words,
        }
        chunk_results.append(chunk_result)

        print(f"    Chunk {i} ({chunk_start:.1f}s): {len(chunk_words)} words")

    return chunk_results


def main():
    test_audio = Path(__file__).parent.parent / "test_data" / "OSR_us_000_0010_8k.wav"
    model_name = "openai/whisper-tiny"

    if not test_audio.exists():
        print(f"Error: Test audio not found: {test_audio}")
        return

    print("=" * 80)
    print("CAPTURING RAW WHISPER ASR OUTPUT")
    print("=" * 80)
    print()

    # Capture full-file output
    print("1. FULL FILE PROCESSING")
    print("-" * 80)
    full_result = capture_full_file_output(test_audio, model_name)

    # Save to JSON
    output_dir = Path(__file__).parent / "test_fixtures"
    output_dir.mkdir(exist_ok=True)

    full_output_path = output_dir / "whisper_full_file_raw_output.json"
    with open(full_output_path, "w") as f:
        json.dump(full_result, f, indent=2)
    print(f"  Saved to: {full_output_path}")
    print()

    # Capture chunked output with 10s chunks
    print("2. CHUNKED PROCESSING (10s chunks, 5s overlap)")
    print("-" * 80)
    chunked_10s = capture_chunked_output(test_audio, model_name, chunk_size=10.0, overlap=5.0)

    chunked_10s_path = output_dir / "whisper_chunked_10s_raw_output.json"
    with open(chunked_10s_path, "w") as f:
        json.dump(chunked_10s, f, indent=2)
    print(f"  Saved to: {chunked_10s_path}")
    print()

    # Capture chunked output with 20s chunks
    print("3. CHUNKED PROCESSING (20s chunks, 5s overlap)")
    print("-" * 80)
    chunked_20s = capture_chunked_output(test_audio, model_name, chunk_size=20.0, overlap=5.0)

    chunked_20s_path = output_dir / "whisper_chunked_20s_raw_output.json"
    with open(chunked_20s_path, "w") as f:
        json.dump(chunked_20s, f, indent=2)
    print(f"  Saved to: {chunked_20s_path}")
    print()

    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Full file: {len(full_result['chunks'])} words")
    print(f"Chunked (10s): {sum(len(c['chunks']) for c in chunked_10s)} total words across {len(chunked_10s)} chunks")
    print(f"Chunked (20s): {sum(len(c['chunks']) for c in chunked_20s)} total words across {len(chunked_20s)} chunks")
    print()
    print("Files saved to:", output_dir)


if __name__ == "__main__":
    main()

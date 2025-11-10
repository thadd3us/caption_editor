#!/usr/bin/env python3
"""
Capture raw ASR output from Whisper in JSON format for analysis.

This script captures the EXACT output from Whisper's ASR pipeline in two ways:
1. Processing the full file in one pass
2. Processing in 10-second chunks (simulating the chunked approach)

The raw outputs are saved as JSON files for inspection and use in unit tests.
"""

import json
import tempfile
from pathlib import Path

import soundfile as sf
from transformers import pipeline


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
    """Capture Whisper output when processing in chunks with overlap."""
    print(f"Processing in {chunk_size}s chunks with {overlap}s overlap: {audio_path}")

    # Load audio
    audio, sr = sf.read(audio_path, dtype='float32')
    info = sf.info(audio_path)
    duration = info.duration
    sample_rate = 16000  # Whisper expects 16kHz

    print(f"  Audio duration: {duration:.2f}s")

    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=-1,  # CPU
    )

    # Process chunks (limit to first 3 for debugging)
    import numpy as np
    num_chunks = min(3, int(np.ceil((duration - overlap) / (chunk_size - overlap))))
    print(f"  Processing {num_chunks} chunks (limited to first 3)...")

    chunk_results = []

    for i in range(num_chunks):
        chunk_start = i * (chunk_size - overlap)
        chunk_duration = min(chunk_size, duration - chunk_start)

        if chunk_duration <= 0:
            break

        # Extract chunk
        start_frame = int(chunk_start * sample_rate)
        num_frames = int(chunk_duration * sample_rate)
        num_frames = min(num_frames, len(audio) - start_frame)
        chunk_audio = audio[start_frame:start_frame + num_frames]

        # Transcribe chunk
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_path = tmp_file.name
            sf.write(tmp_path, chunk_audio, sample_rate)

        try:
            result = asr_pipeline(tmp_path, return_timestamps="word")

            # Add chunk metadata
            chunk_result = {
                "chunk_index": i,
                "chunk_start_time": chunk_start,
                "chunk_duration": chunk_duration,
                "text": result["text"],
                "chunks": result["chunks"],
            }
            chunk_results.append(chunk_result)

            print(f"    Chunk {i} ({chunk_start:.1f}s): {len(result['chunks'])} words")
        finally:
            # Clean up temp file
            import os
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

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

    # Capture chunked output
    print("2. CHUNKED PROCESSING (10s chunks, 5s overlap)")
    print("-" * 80)
    chunked_results = capture_chunked_output(test_audio, model_name, chunk_size=10.0, overlap=5.0)

    # Save to JSON
    chunked_output_path = output_dir / "whisper_chunked_raw_output.json"
    with open(chunked_output_path, "w") as f:
        json.dump(chunked_results, f, indent=2)
    print(f"  Saved to: {chunked_output_path}")
    print()

    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Full file: {len(full_result['chunks'])} words")
    print(f"Chunked: {sum(len(c['chunks']) for c in chunked_results)} total words across {len(chunked_results)} chunks")
    print()
    print("Files saved to:", output_dir)


if __name__ == "__main__":
    main()

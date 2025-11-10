#!/usr/bin/env python3
"""Inspect word-level timestamp formats from different ASR models."""

import json
import sys
import tempfile
from pathlib import Path

import soundfile as sf
import torch

# Test audio file
test_audio = Path(__file__).parent.parent / "test_data" / "OSR_us_000_0010_8k.wav"

print(f"Testing with audio: {test_audio}")
print(f"Audio exists: {test_audio.exists()}")
print()

# Test Parakeet (NeMo)
print("=" * 80)
print("PARAKEET (NeMo) WORD-LEVEL TIMESTAMPS")
print("=" * 80)

try:
    import nemo.collections.asr as nemo_asr

    model_name = "nvidia/parakeet-tdt-0.6b-v3"
    print(f"Loading model: {model_name}")
    asr_pipeline = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        asr_pipeline = asr_pipeline.to(device)

    print(f"Device: {device}")
    print()

    # Transcribe with word timestamps
    result = asr_pipeline.transcribe([str(test_audio)], timestamps=True)

    print("Result type:", type(result))
    print("Result length:", len(result))
    print()

    if result and len(result) > 0:
        output = result[0]
        print("Output type:", type(output))
        print("Output attributes:", dir(output))
        print()

        if hasattr(output, 'timestamp'):
            print("Timestamp keys:", output.timestamp.keys() if hasattr(output.timestamp, 'keys') else type(output.timestamp))
            print()

            # Check for word-level timestamps
            if 'word' in output.timestamp:
                print("WORD-LEVEL TIMESTAMPS FOUND!")
                print("Number of words:", len(output.timestamp['word']))
                print()
                print("First 5 words:")
                for i, word in enumerate(output.timestamp['word'][:5]):
                    print(f"  {i}: {word}")
                print()
            else:
                print("No 'word' key in timestamp")
                print()

            # Check segment-level timestamps
            if 'segment' in output.timestamp:
                print("SEGMENT-LEVEL TIMESTAMPS:")
                print("Number of segments:", len(output.timestamp['segment']))
                print()
                print("First 3 segments:")
                for i, seg in enumerate(output.timestamp['segment'][:3]):
                    print(f"  {i}: {seg}")
                print()

        if hasattr(output, 'text'):
            print("Full text:", output.text)
            print()

except Exception as e:
    print(f"Error with Parakeet: {e}")
    import traceback
    traceback.print_exc()

print()

# Test Whisper (Transformers)
print("=" * 80)
print("WHISPER (Transformers) WORD-LEVEL TIMESTAMPS")
print("=" * 80)

try:
    from transformers import pipeline

    model_name = "openai/whisper-tiny"
    print(f"Loading model: {model_name}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=0 if device == "cuda" else -1,
    )

    print(f"Device: {device}")
    print()

    # Transcribe with word timestamps
    result = asr_pipeline(str(test_audio), return_timestamps="word")

    print("Result type:", type(result))
    print("Result keys:", result.keys() if isinstance(result, dict) else "not a dict")
    print()

    if isinstance(result, dict):
        if "text" in result:
            print("Full text:", result["text"])
            print()

        if "chunks" in result:
            print("CHUNKS FOUND (word-level):")
            print("Number of chunks:", len(result["chunks"]))
            print()
            print("First 5 chunks:")
            for i, chunk in enumerate(result["chunks"][:5]):
                print(f"  {i}: {chunk}")
            print()

    # Also try with regular timestamps (not word-level)
    print("--- Testing with return_timestamps=True (not 'word') ---")
    result2 = asr_pipeline(str(test_audio), return_timestamps=True)

    print("Result type:", type(result2))
    print()

    if isinstance(result2, dict) and "chunks" in result2:
        print("CHUNKS (segment-level):")
        print("Number of chunks:", len(result2["chunks"]))
        print()
        print("First 3 chunks:")
        for i, chunk in enumerate(result2["chunks"][:3]):
            print(f"  {i}: {chunk}")
        print()

except Exception as e:
    print(f"Error with Whisper: {e}")
    import traceback
    traceback.print_exc()

# NVIDIA Parakeet Model Integration

## Summary

Successfully integrated support for the NVIDIA Parakeet TDT-0.6b-v3 model into the transcription tool. The implementation now supports both NeMo-based models (like Parakeet) and Hugging Face Transformers models (like Whisper).

## What Was Done

### 1. Problem Identified

The original code attempted to load the Parakeet model using the Hugging Face `transformers.pipeline()` API, but the Parakeet model uses NVIDIA's NeMo framework, which has a different architecture (`DiaConfig`) that is incompatible with the standard Transformers pipeline.

**Error encountered:**
```
ValueError: Could not load model nvidia/parakeet-tdt-0.6b-v3 with any of the following classes:
(<class 'transformers.models.auto.modeling_auto.AutoModelForCTC'>,
 <class 'transformers.models.auto.modeling_auto.AutoModelForSpeechSeq2Seq'>)
```

### 2. Solution Implemented

Modified the code to support both frameworks:

#### a. Dual Framework Support (`transcribe/transcribe.py`)

- Added optional imports for both `nemo_toolkit` and `transformers`
- Implemented automatic detection of model type based on model name
- Models containing "parakeet" or "nvidia" are treated as NeMo models
- Other models use the Transformers pipeline

#### b. Updated `transcribe_chunk()` Function

- Added `is_nemo` parameter to handle both model types
- For NeMo models:
  - Saves audio chunks to temporary WAV files (NeMo expects file paths)
  - Calls `model.transcribe([path], timestamps=True)`
  - Extracts segment-level timestamps from the result
  - Cleans up temporary files
- For Transformers models:
  - Uses the original pipeline approach
  - Processes audio arrays directly

#### c. Model Loading Logic

```python
if is_nemo:
    # Load NeMo model
    asr_pipeline = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
    if device == "cuda":
        asr_pipeline = asr_pipeline.to(device)
else:
    # Load Transformers model
    asr_pipeline = pipeline(
        "automatic-speech-recognition",
        model=model_name,
        device=0 if device == "cuda" else -1,
    )
```

### 3. Dependencies Updated (`transcribe/pyproject.toml`)

Added required dependencies:
- `nemo-toolkit[asr]>=2.5.0` - NVIDIA NeMo framework
- `megatron-core>=0.10.0` - Required by NeMo
- `transformers>=4.53.0,<4.54` - Compatible version with NeMo
- `numpy>=1.24,<2.0` - NeMo requires numpy <2.0

Also updated Python version constraint:
- `requires-python = ">=3.11,<3.13"` - NeMo compatibility

### 4. Documentation Updated (`transcribe/README.md`)

Added comprehensive documentation covering:
- Both NeMo and Transformers model support
- Model selection and automatic detection
- Examples for using different models
- Parakeet model features and capabilities
- How the tool determines which framework to use

## Key Features of the Integration

1. **Automatic Framework Detection**: No need for users to specify which framework to use
2. **Backward Compatible**: Existing Transformers models (like Whisper) continue to work
3. **Graceful Error Handling**: Clear error messages if required dependencies are missing
4. **Unified Interface**: Same CLI regardless of model type

## Usage Examples

### Using the Parakeet Model (Default)

```bash
# Uses NeMo framework automatically
python transcribe.py audio.mp4 --model nvidia/parakeet-tdt-0.6b-v3
```

### Using Whisper Models

```bash
# Uses Transformers framework automatically
python transcribe.py audio.mp4 --model openai/whisper-small
```

### Using the Default

```bash
# Defaults to nvidia/parakeet-tdt-0.6b-v3
python transcribe.py audio.mp4
```

## Technical Details

### NeMo Model Output Format

NeMo models return results with the following structure:

```python
result = model.transcribe([audio_path], timestamps=True)
output = result[0]

# Access timestamps
for segment in output.timestamp['segment']:
    text = segment['segment']
    start = segment['start']
    end = segment['end']
```

### Transformers Model Output Format

Transformers pipeline returns:

```python
result = pipeline(audio, return_timestamps=True)

# result is a dict with "chunks"
for chunk in result['chunks']:
    text = chunk['text']
    start, end = chunk['timestamp']
```

## Testing

The implementation was tested with:
- ✅ Transformers model loading (openai/whisper-tiny)
- ✅ Automatic framework detection
- ✅ Error handling for missing dependencies

Note: Full testing of the Parakeet model requires:
- GPU for optimal performance (CPU is very slow)
- Model download (~600MB)
- Actual speech audio (not just tones)

## Known Limitations

1. **Temporary Files**: NeMo requires file paths, so audio chunks are written to temporary files
2. **Python Version**: Limited to Python 3.11-3.12 due to NeMo compatibility
3. **Numpy Version**: Must use numpy <2.0 for NeMo compatibility

## Future Improvements

- [ ] Add support for NeMo's local attention for very long audio
- [ ] Implement batch processing for multiple chunks
- [ ] Add configuration for NeMo model parameters
- [ ] Support for additional NeMo models (e.g., Canary, FastConformer)

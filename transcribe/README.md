# Media Transcription and Speaker Diarization

A unified Python environment providing:
- **Transcription**: Convert media files to the caption editor native `.captions.json` format using NVIDIA's Parakeet TDT ASR model
- **Speaker Diarization**: Identify and label different speakers in audio using pyannote.audio

## Features

### Transcription
- **Multi-format support**: Converts nearly any media format to `.captions.json` using ffmpeg
- **Chunked processing**: Handles long audio files (hours) by processing in configurable chunks
- **Overlap handling**: Prevents word cutoffs at chunk boundaries with intelligent overlap resolution
- **Segment-level transcripts**: Produces sentence-level segments with timestamps
- **Deterministic UUIDs**: Generates consistent segment IDs based on audio hash and timestamps
- **Multi-language support**: Uses NVIDIA Parakeet TDT 0.6b v3 with multi-language capabilities

### Speaker Diarization
- **Speaker identification**: Detects and labels different speakers in audio
- **Speaker embeddings**: Compute embedding vectors for each segment in a VTT file
- **Powered by pyannote.audio v4**: State-of-the-art speaker diarization
- **Simple CLI interface**: Easy to use command-line tools

## Installation

This project uses `uv` for fast Python dependency management.

```bash
# Install dependencies
cd transcribe
uv sync

# Or run directly with uvx
uvx --from . transcribe --help
```

## Usage

### Transcription

```bash
# Transcribe a media file
uv run python transcribe_cli.py input.mp4

# Specify output location
uv run python transcribe_cli.py input.mp4 --output output.captions.json

# Adjust chunk size and overlap
uv run python transcribe_cli.py long_audio.wav --chunk-size 120 --overlap 10
```

### Speaker Diarization

**Prerequisites:**

1. **Accept the model terms on HuggingFace:**
   - Visit https://huggingface.co/pyannote/speaker-diarization-community-1
   - Click "Agree and access repository"
   - Accept the user agreement
   - Wait a few minutes for access to propagate

2. **Set your HuggingFace token:**
   ```bash
   export HF_TOKEN=your_huggingface_token_here
   ```

**Run diarization:**

```bash
# Basic usage
uv run diarize path/to/audio.wav

# Use a specific model
uv run diarize audio.wav --model pyannote/speaker-diarization-3.1
```

**Output example:**
```
SPEAKER_00 speaks between t=0.000s and t=3.500s
SPEAKER_01 speaks between t=3.500s and t=7.200s
SPEAKER_00 speaks between t=7.200s and t=10.000s
```

### Speaker Embeddings

Compute speaker embedding vectors for each segment in a `.captions.json` file. This is useful for speaker clustering, comparison, and identification tasks.

**Prerequisites:**

1. **Have a `.captions.json` file with media metadata:**
   - Captions file must include `metadata.mediaFilePath` pointing to the media file
   - Media file path is relative to the captions file directory

**Run embedding computation:**

```bash
# Basic usage (writes embeddings into `embeddings[]` in the captions JSON file)
uv run embed_cli path/to/transcript.captions.json

# Use a different model
uv run embed_cli transcript.captions.json --model pyannote/embedding
```

**Output format:**

The embeddings are written back to the `.captions.json` file in the `embeddings[]` array. Each embedding contains:
- `segmentId`: UUID of the segment
- `speakerEmbedding`: 512-dimensional vector (for default wespeaker model)

**Note:** The default model (`pyannote/wespeaker-voxceleb-resnet34-LM`) is publicly accessible and doesn't require a HuggingFace token. Some alternative models (like `pyannote/embedding`) are gated and require accepting terms and setting `HF_TOKEN`.

### Options

- `media_file`: Input media file to transcribe (required)
- `--output`, `-o`: Output captions JSON file path (default: input file with `.captions.json` extension)
- `--chunk-size`, `-c`: Chunk size in seconds (default: 60)
- `--overlap`, `-v`: Overlap interval in seconds (default: 5)
- `--model`, `-m`: Hugging Face model name (default: nvidia/parakeet-tdt-0.6b-v3)

### Example

```bash
# Transcribe a 2-hour podcast with 2-minute chunks and 10-second overlap
python transcribe_cli.py podcast.mp3 --chunk-size 120 --overlap 10 --output podcast_transcript.captions.json
```

## How It Works

1. **Audio Extraction**: Uses ffmpeg to extract audio from the input media file to WAV format (16kHz mono)

2. **Chunked Processing**: Splits long audio into overlapping chunks to avoid cutting off words at boundaries

3. **Transcription**: Uses ASR model (NeMo for Parakeet, Transformers for others)
   - For NeMo models: Gets segment-level timestamps directly from the model
   - For Transformers models: Uses the pipeline with return_timestamps=True
   - Automatically handles framework-specific output formats

4. **Overlap Resolution**: For segments in overlapping regions between chunks:
   - Calculates each segment's distance to the nearest chunk edge
   - Keeps the segment with greater distance (more reliable transcription)

5. **VTT Generation**:
   - Converts segments to WebVTT format
   - Assigns deterministic UUIDs based on audio hash + timestamp
   - Formats timestamps as `HH:MM:SS.mmm`

## Output Format

The tool generates WebVTT files with the following structure:

```vtt
WEBVTT

uuid-for-segment-1
00:00:00.000 --> 00:00:03.500
First sentence of transcription.

uuid-for-segment-2
00:00:03.500 --> 00:00:07.200
Second sentence continues here.
```

Each segment has:
- A unique, deterministic UUID (consistent across runs for same audio)
- Start and end timestamps
- Transcribed text

## Testing

```bash
# Run all tests
uv run pytest -v

# Update snapshots after intentional changes
uv run pytest tests/ -v --snapshot-update
```

## Requirements

- Python 3.11+
- ffmpeg (for audio extraction)
- CUDA-compatible GPU (optional, for faster processing)

## TODO

- [ ] Integrate diarization with transcription (speaker-attributed transcripts)
- [ ] Support custom vocabulary or language hints
- [ ] Add confidence scores to segments
- [ ] Batch processing of multiple files
- [ ] Progress bar for long transcriptions

## Model Information

This tool supports two types of ASR models:

### 1. NVIDIA NeMo Models (Default)

The default model is [NVIDIA Parakeet TDT 0.6b v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), a state-of-the-art multilingual ASR model that supports:

- **25 European languages** with automatic language detection
- **600M parameters** with FastConformer-TDT architecture
- **Segment-level timestamps** for accurate timing
- **Automatic punctuation and capitalization**
- **Average WER of 6.34%** on HuggingFace Open ASR Leaderboard

The tool automatically detects NeMo models (models containing "parakeet" or "nvidia" in the name) and loads them using the NeMo toolkit.

**Example:**
```bash
python transcribe_cli.py audio.wav --model nvidia/parakeet-tdt-0.6b-v3
```

### 2. Hugging Face Transformers Models

The tool also supports any model compatible with the Hugging Face `automatic-speech-recognition` pipeline, such as:

- `openai/whisper-tiny` - Fast, lightweight model
- `openai/whisper-base` - Good balance of speed and accuracy
- `openai/whisper-small` - Better accuracy
- `openai/whisper-medium` - High accuracy
- `openai/whisper-large-v3` - Best accuracy

**Example:**
```bash
python transcribe_cli.py audio.wav --model openai/whisper-small
```

### Model Selection

The tool automatically determines which framework to use:
- **NeMo models**: Loaded via `nemo_toolkit` (for Parakeet and other NVIDIA models)
- **Other models**: Loaded via Hugging Face `transformers` pipeline

To use a different model, simply specify it with the `--model` flag:
```bash
python transcribe_cli.py input.mp4 --model your/favorite-model
```

## License

See the main project LICENSE file.

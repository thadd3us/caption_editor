# Media Transcription Tool

A Python CLI tool for transcribing media files to VTT (WebVTT) format using NVIDIA's Parakeet TDT ASR model.

## Features

- **Multi-format support**: Converts nearly any media format to transcribed VTT using ffmpeg
- **Chunked processing**: Handles long audio files (hours) by processing in configurable chunks
- **Overlap handling**: Prevents word cutoffs at chunk boundaries with intelligent overlap resolution
- **Segment-level transcripts**: Produces sentence-level segments with timestamps
- **Deterministic UUIDs**: Generates consistent segment IDs based on audio hash and timestamps
- **Multi-language support**: Uses NVIDIA Parakeet TDT 0.6b v3 with multi-language capabilities

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

### Basic usage

```bash
# Transcribe a media file
python transcribe.py input.mp4

# Specify output location
python transcribe.py input.mp4 --output output.vtt

# Adjust chunk size and overlap
python transcribe.py long_audio.wav --chunk-size 120 --overlap 10
```

### Options

- `media_file`: Input media file to transcribe (required)
- `--output`, `-o`: Output VTT file path (default: input file with .vtt extension)
- `--chunk-size`, `-c`: Chunk size in seconds (default: 60)
- `--overlap`, `-v`: Overlap interval in seconds (default: 5)
- `--model`, `-m`: Hugging Face model name (default: nvidia/parakeet-tdt-0.6b-v3)

### Example

```bash
# Transcribe a 2-hour podcast with 2-minute chunks and 10-second overlap
python transcribe.py podcast.mp3 --chunk-size 120 --overlap 10 --output podcast_transcript.vtt
```

## How It Works

1. **Audio Extraction**: Uses ffmpeg to extract audio from the input media file to WAV format (16kHz mono)

2. **Chunked Processing**: Splits long audio into overlapping chunks to avoid cutting off words at boundaries

3. **Transcription**: Uses NVIDIA Parakeet TDT model via Hugging Face transformers pipeline
   - Attempts to get word-level timestamps when available
   - Falls back to sentence-level segmentation with estimated timing

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
# Run tests
uv run pytest

# Run specific test
uv run pytest tests/test_transcribe.py::test_transcribe_osr_audio
```

## Requirements

- Python 3.11+
- ffmpeg (for audio extraction)
- CUDA-compatible GPU (optional, for faster processing)

## TODO

- [ ] Add speaker identification to segments
- [ ] Support custom vocabulary or language hints
- [ ] Add confidence scores to segments
- [ ] Batch processing of multiple files
- [ ] Progress bar for long transcriptions

## Model Information

This tool uses [NVIDIA Parakeet TDT 0.6b v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3), a multilingual automatic speech recognition model that supports:

- Multiple languages
- Fast inference
- Reasonable accuracy for general transcription tasks

To use a different model, specify it with the `--model` flag. The model must be compatible with the Hugging Face ASR pipeline.

## License

See the main project LICENSE file.

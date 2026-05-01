# Media Transcription and Speaker Diarization

A unified Python environment providing:
- **Transcription**: Convert media files to the caption editor native `.captions_json5` format using NVIDIA's Parakeet TDT ASR model
- **Speaker Diarization**: Identify and label different speakers in audio using pyannote.audio

## Features

### Transcription
- **Multi-format support**: Converts nearly any media format to `.captions_json5` using ffmpeg
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
uv run python transcribe_cli.py input.mp4 --output output.captions_json5

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

Compute speaker embedding vectors for each segment in a `.captions_json5` file. This is useful for speaker clustering, comparison, and identification tasks.

**Prerequisites:**

1. **Have a `.captions_json5` file with media metadata:**
   - Captions file must include `metadata.mediaFilePath` pointing to the media file
   - Media file path is relative to the captions file directory

**Run embedding computation:**

```bash
# Basic usage (writes embeddings into `embeddings[]` in the captions JSON file)
uv run embed_cli path/to/transcript.captions_json5

# Use a different model
uv run embed_cli transcript.captions_json5 --model pyannote/embedding
```

**Output format:**

The embeddings are written back to the `.captions_json5` file in the `embeddings[]` array. Each embedding contains:
- `segmentId`: UUID of the segment
- `speakerEmbedding`: 512-dimensional vector (for default wespeaker model)

**Note:** The default model (`pyannote/wespeaker-voxceleb-resnet34-LM`) is publicly accessible and doesn't require a HuggingFace token. Some alternative models (like `pyannote/embedding`) are gated and require accepting terms and setting `HF_TOKEN`.

### Options

- `media_file`: Input media file to transcribe (required)
- `--output`, `-o`: Output captions JSON file path (default: input file with `.captions_json5` extension)
- `--chunk-size`, `-c`: Chunk size in seconds (default: 60)
- `--overlap`, `-v`: Overlap interval in seconds (default: 5)
- `--model`, `-m`: Hugging Face model name (default: nvidia/parakeet-tdt-0.6b-v3)

### Example

```bash
# Transcribe a 2-hour podcast with 2-minute chunks and 10-second overlap
python transcribe_cli.py podcast.mp3 --chunk-size 120 --overlap 10 --output podcast_transcript.captions_json5
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

### 1b. microsoft/VibeVoice-ASR-HF (remote, via Modal)

VibeVoice-ASR is a 9B-parameter speech LLM with native speaker diarization. The
weights are too large for a typical laptop, so we run it on a Modal-hosted GPU
worker (`transcribe/vibevoice_modal.py`). Word timestamps come from a
torchaudio MMS-FA forced-alignment pass on the same worker.

#### How timing works (and why it isn't VibeVoice's timing)

VibeVoice emits utterance-level JSON of the form
`[{"Start", "End", "Speaker", "Content"}, ...]`. Its **content grouping** and
**speaker labels** are good — they decide which sentences belong together
and who said what. Its **timestamps are unreliable for read-speech**:
on the Harvard-sentences fixture (`test_data/OSR_us_000_0010_8k.wav`,
~33s, single speaker) it claimed 10 sentences spanned only ~26.5s with a
fake 7s `[Silence]` tail. Parakeet (golden, 0.6B NeMo TDT) shows the speech
actually runs 0.24s → 32.48s. We confirmed the time-axis compression at
8 kHz, 16 kHz, and 24 kHz inputs — the model produces the same wrong times
regardless of sample rate, so it isn't a resampling bug.

So the worker:

1. Calls VibeVoice for content + speaker labels; **discards** its `Start`/`End`
   (kept on each segment as `raw_start`/`raw_end` for debugging).
2. Drops segments whose text is contained in the previous segment (VibeVoice
   sometimes hallucinates a duplicate "tail" segment with bogus timing).
3. Runs **one global** torchaudio MMS-FA forced-alignment pass over the entire
   audio against the concatenated transcript, producing real word-level
   timestamps.
4. Re-derives each segment's `start`/`end` from the first/last word in that
   segment.

Result on the Harvard fixture, FA-derived vs Parakeet golden:

| | Raw VibeVoice | After global FA | Parakeet |
|--|--|--|--|
| Sentences 1-7 | 0.00 – 13.00 | **0.50 – 22.40** | 0.24 – 22.88 |
| Sentences 8-10 | 13.27 – 26.52 | **23.76 – 32.12** | 23.44 – 32.48 |

FA-derived times are within ~0.4s of Parakeet, with real per-word timing.
Segmentation (which sentences cluster together) still comes from VibeVoice;
the standard `split_long_segments` post-processing can further split using
the (now real) word boundaries.

**One-time setup** (Modal account + token, then deploy):

```bash
cd transcribe
uv sync                                          # installs `modal` locally
uv run modal token new                           # opens browser for auth
uv run modal deploy vibevoice_modal.py           # ~3 min image build
```

**Smoke test against a known-speech fixture** (matches what CI would run):

```bash
cd transcribe
uv run modal run vibevoice_modal.py::smoke \
    --audio-path ../test_data/OSR_us_000_0010_8k.wav
```

Expected: 33s of Harvard sentences in, 2-3 segments out (Speaker 0), real
per-word timestamps. First call cold-starts in ~15-30s with cached weights;
each subsequent call within 5 min reuses the warm container.

**Through the normal CLI** (writes a `.captions_json5` file like Parakeet):

```bash
cd transcribe
uv run python transcribe_cli.py ../test_data/OSR_us_000_0010_8k.wav \
    --model microsoft/VibeVoice-ASR-HF \
    --output /tmp/harvard.captions_json5 \
    --no-embed
```

The recognizer ignores `--chunk-size` / `--overlap` for this model — VibeVoice
ingests the whole file in one request (up to 60 minutes).

**Lifecycle and cost:** `scaledown_window=300` in the worker means the
container shuts down 5 min after the last call; the deployment itself
persists. To fully tear down: `uv run modal app stop caption-editor-vibevoice-asr`.
A few smoke runs cost about $0.50-1.00 of L40S time; the 18 GB HF cache
Volume costs ~$0.10/month while it exists (`modal volume delete
caption-editor-hf-cache` to reclaim).

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

# Speaker Diarization

Speaker diarization tool using [pyannote.audio](https://github.com/pyannote/pyannote-audio).

## Version Note

This project now uses **pyannote-audio v4.x**! 🎉

We built `torchcodec` from source for aarch64 Linux (ARM64) since pre-built wheels weren't available. The wheel is included in the project setup.

### Building torchcodec for aarch64 Linux

If you need to rebuild torchcodec (e.g., after updating PyTorch):

```bash
# Install build dependencies
sudo apt-get install -y cmake libavcodec-dev libavformat-dev libavutil-dev \
  libavdevice-dev libavfilter-dev libswscale-dev libswresample-dev \
  pkg-config pybind11-dev

# Clone and build
cd /tmp
git clone https://github.com/pytorch/torchcodec.git
cd torchcodec
export I_CONFIRM_THIS_IS_NOT_A_LICENSE_VIOLATION=1
/path/to/your/venv/bin/python setup.py bdist_wheel

# The wheel will be in dist/
# Update pyproject.toml [tool.uv.sources] to point to your new wheel
```

## Setup

This project uses `uv` for Python dependency management. Install dependencies:

```bash
cd python/diarization
uv sync
```

## Usage

**Prerequisites:**

1. **Accept the model terms on HuggingFace:**
   - Visit https://huggingface.co/pyannote/speaker-diarization-community-1
   - Click "Agree and access repository"
   - Accept the user agreement
   - **Important:** Wait a few minutes after accepting - access grants may take time to propagate

2. **Set your HuggingFace token:**

```bash
export HF_TOKEN=your_huggingface_token_here
```

The token must be from the account that accepted the model terms.

Run diarization on an audio file:

```bash
uv run diarize path/to/audio.wav
```

Or use the Python API:

```python
from diarization.cli import diarize_audio
from pathlib import Path

results = diarize_audio(Path("audio.wav"))
for start, end, speaker in results:
    print(f"{speaker} speaks between t={start:.3f}s and t={end:.3f}s")
```

## Testing

Run tests:

```bash
uv run pytest tests/ -v
```

Update snapshots after intentional changes:

```bash
uv run pytest tests/ -v --snapshot-update
```

## Model

By default, uses the `pyannote/speaker-diarization-community-1` model. You can specify a different model with `--model`:

```bash
uv run diarize audio.wav --model pyannote/speaker-diarization-3.1
```

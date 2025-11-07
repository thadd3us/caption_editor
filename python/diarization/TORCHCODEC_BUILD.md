# Building TorchCodec for aarch64 Linux

This document explains how we successfully built `torchcodec` from source for aarch64 Linux (ARM64) to enable pyannote-audio v4.

## Background

Pyannote-audio v4 requires `torchcodec` for audio/video I/O, but the PyPI wheels only support:
- `manylinux_2_28_x86_64` (Intel/AMD Linux)
- `macosx_11_0_arm64` (Apple Silicon Mac)
- `win_amd64` (Windows)

There are no pre-built wheels for `manylinux_aarch64` (ARM64 Linux), which is what we're running on.

## Solution

We built torchcodec from source! The process was surprisingly straightforward.

## Build Steps

### 1. Install System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  cmake \
  libavcodec-dev \
  libavformat-dev \
  libavutil-dev \
  libavdevice-dev \
  libavfilter-dev \
  libswscale-dev \
  libswresample-dev \
  pkg-config \
  pybind11-dev
```

### 2. Clone torchcodec Repository

```bash
cd /tmp
git clone https://github.com/pytorch/torchcodec.git
cd torchcodec
```

### 3. Build the Wheel

**Important:** You must have PyTorch already installed in your environment before building torchcodec, as it links against torch libraries.

```bash
# Activate your environment with torch installed
# For uv-managed projects:
cd /your/project/directory

# Build the wheel (using the Python from your venv)
cd /tmp/torchcodec
export I_CONFIRM_THIS_IS_NOT_A_LICENSE_VIOLATION=1
/path/to/your/venv/bin/python setup.py bdist_wheel
```

The `I_CONFIRM_THIS_IS_NOT_A_LICENSE_VIOLATION` flag is required because torchcodec's build system wants to ensure you're aware of FFmpeg licensing when distributing wheels.

### 4. Install the Wheel

The wheel will be created in `/tmp/torchcodec/dist/`:
- `torchcodec-0.9.0a0-cp312-cp312-linux_aarch64.whl`

To use it in a uv project, add to your `pyproject.toml`:

```toml
[project]
dependencies = [
    "torchcodec",
    # ... other deps
]

[tool.uv.sources]
torchcodec = { path = "/tmp/torchcodec/dist/torchcodec-0.9.0a0-cp312-cp312-linux_aarch64.whl" }
```

## ABI Compatibility Note

**Important:** The torchcodec wheel is built against the specific version of PyTorch in your environment. If you upgrade PyTorch, you'll need to rebuild torchcodec to match!

For example:
- We initially built with torch 2.6.0
- After upgrading to torch 2.9.0 for pyannote v4, we got `std::length_error` crashes
- Rebuilding torchcodec with torch 2.9.0 fixed the issue

## Build Time

The entire build process takes about 2-3 minutes on a modern system (mostly compilation time for the C++ extensions).

## Verification

After installation, verify it works:

```python
import torch
import torchcodec
print(f"torchcodec version: {torchcodec.__version__}")
```

## Result

With locally-built torchcodec, we can now use pyannote-audio v4.0.1 on aarch64 Linux! 🎉

## References

- [TorchCodec GitHub](https://github.com/pytorch/torchcodec)
- [Pyannote-audio v4 Release Notes](https://github.com/pyannote/pyannote-audio/releases/tag/4.0.0)

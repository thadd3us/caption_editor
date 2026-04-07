#!/usr/bin/env bash
# Package the transcribe Python project for uvx distribution
# This creates a source distribution that uvx can install with dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TRANSCRIBE_DIR="$PROJECT_ROOT/transcribe"
OUTPUT_DIR="$PROJECT_ROOT/dist-uvx"

echo "==> Packaging transcribe for uvx distribution"
echo "    Transcribe dir: $TRANSCRIBE_DIR"
echo "    Output dir: $OUTPUT_DIR"

# Clean previous build
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Navigate to transcribe directory
cd "$TRANSCRIBE_DIR"

# Build the package using uv
echo "==> Building Python package..."
uv build --out-dir "$OUTPUT_DIR"

# Create overrides.txt for uvx users
echo "==> Creating overrides.txt for uvx users..."
cat > "$OUTPUT_DIR/overrides.txt" << 'EOF'
# Override nemo-toolkit's conservative numpy<2.0 constraint
# NeMo 2.5.2+ works fine with numpy 2.x in practice
numpy>=2.0

# Torchcodec is optional and platform-specific
# pyannote.audio will fall back to torchaudio if not available
torchcodec>=0.6.0; (sys_platform == 'darwin') or (sys_platform == 'win32') or (sys_platform == 'linux' and platform_machine == 'x86_64')
EOF

# List the created artifacts
echo "==> Created artifacts:"
ls -lh "$OUTPUT_DIR"

# Show the artifact that uvx will use
WHEEL=$(find "$OUTPUT_DIR" -name "*.whl" -type f | head -n 1)
SDIST=$(find "$OUTPUT_DIR" -name "*.tar.gz" -type f | head -n 1)

echo ""
echo "==> Package built successfully!"
echo "    Wheel: $(basename "$WHEEL")"
echo "    Source: $(basename "$SDIST")"
echo ""
echo "==> Usage with uvx:"
echo "    # From local file (with overrides):"
echo "    uvx --from $WHEEL --overrides $OUTPUT_DIR/overrides.txt transcribe --help"
echo ""
echo "    # From GitHub release (download overrides.txt first):"
echo "    curl -O https://github.com/YOUR_ORG/YOUR_REPO/releases/download/v1.0.0/overrides.txt"
echo "    uvx --from 'https://github.com/YOUR_ORG/YOUR_REPO/releases/download/v1.0.0/$(basename "$WHEEL")' --overrides overrides.txt transcribe audio.wav"
echo ""
echo "==> Available commands:"
echo "    - transcribe: Audio/video transcription with ASR"
echo "    - embed: Compute speaker embeddings from VTT files"
echo ""
echo "==> Note: overrides.txt is needed because nemo-toolkit has a conservative"
echo "    numpy<2.0 constraint but works fine with numpy 2.x in practice"

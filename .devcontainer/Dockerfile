# Use Ubuntu 24.04 LTS as base image
FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Essential build tools
    build-essential \
    git \
    curl \
    ca-certificates \
    gnupg \
    # Playwright browser dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    # libasound2 \
    libxshmfence1 \
    # Electron-specific dependencies
    libgtk-3-0 \
    libnotify4 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libwayland-client0 \
    # X virtual framebuffer for headless testing
    xvfb \
    # Media processing
    ffmpeg \
    # Python and ML dependencies
    python3 \
    python3-pip \
    python3-venv \
    # Additional dependencies for NeMo toolkit
    libsndfile1 \
    sox \
    # Disk usage analyzer
    ncdu \
    # Sudo for non-root user
    sudo

# Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

# Verify Node.js and npm installation
RUN node --version && npm --version

# Update npm to latest version (as root before creating dev user)
RUN npm install -g npm@latest

# Create non-root user 'dev' with sudo access
RUN useradd -m dev \
    && echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Switch to dev user for subsequent operations
USER dev
WORKDIR /home/dev

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/home/dev/.local/bin:${PATH}"

# Pre-install Playwright with headless Chromium only (for CI/CD)
# Using --only-shell to install just the headless shell, saving ~450MB
RUN mkdir -p /tmp/playwright-install && \
    cd /tmp/playwright-install && \
    npm init -y && \
    npm install @playwright/test@^1.42.1 && \
    npx playwright install --with-deps --only-shell chromium && \
    cd / && \
    rm -rf /tmp/playwright-install

# Create directories for caching with proper ownership
RUN mkdir -p /tmp/deps /tmp/node_modules_cache /tmp/python-deps /home/dev/models
ENV HF_HOME=/home/dev/models
ENV NEMO_MODEL_CACHE=/home/dev/models

# ============================================================================
# PYTHON & ML MODELS - Do these FIRST so Node.js changes don't invalidate them
# ============================================================================

# Pre-create uv virtual environment for transcribe project at a fixed location
# This creates the actual .venv that pytest will use
COPY --chown=dev:dev transcribe/pyproject.toml transcribe/uv.lock /tmp/python-deps/
ENV UV_PROJECT_ENVIRONMENT=/home/dev/venv
RUN cd /tmp/python-deps && \
    uv sync --frozen && \
    echo "Python virtual environment created successfully at $UV_PROJECT_ENVIRONMENT"

# Pre-download ASR models for transcription
RUN cd /tmp/python-deps && \
    uv run python -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='openai/whisper-tiny')" && \
    rm -rf /home/dev/models/xet && \
    echo "Whisper-tiny model downloaded successfully"

# Pre-download NVIDIA Parakeet model (default model for production)
# Note: This is a ~2.4GB download and may take time during build
RUN cd /tmp/python-deps && \
    uv run python -c "import nemo.collections.asr as nemo_asr; model = nemo_asr.models.ASRModel.from_pretrained(model_name='nvidia/parakeet-tdt-0.6b-v3'); print('Parakeet model downloaded successfully')" && \
    rm -rf /home/dev/models/xet && \
    echo "Parakeet TDT model downloaded successfully"

# Brief pause to ensure models are properly cached
RUN echo "Finalizing model downloads..." && sleep 30 && echo "Model downloads complete"

# ============================================================================
# NODE.JS DEPENDENCIES - Do these LAST so changes only rebuild from here
# ============================================================================

# Pre-install common dependencies based on package.json structure
# This creates a layer that can be cached when only package.json changes
COPY --chown=dev:dev package.json package-lock.json* /tmp/deps/
RUN cd /tmp/deps && \
    if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi && \
    # Move node_modules to a cache location
    mv node_modules /tmp/node_modules_cache || true

# Switch back to root to install Xvfb script with SUID bit
USER root

# Copy Xvfb startup script and set SUID bit so non-root users can run it
# Note: This script must be manually run to start Xvfb for Electron tests
# See CLAUDE.md for instructions
COPY .devcontainer/start-xvfb.sh /usr/local/bin/start-xvfb.sh
RUN chmod 4755 /usr/local/bin/start-xvfb.sh

# Switch back to dev user
USER dev

# Environment variables
ENV NODE_ENV=development
# Disable OneLogger telemetry in development
ENV ONE_LOGGER_DISABLE=1

# Set working directory to the workspace mount point
WORKDIR /workspace

# Default command
CMD ["bash"]

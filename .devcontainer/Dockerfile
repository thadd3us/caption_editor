FROM node:20-bookworm

# Install system dependencies for Playwright, Electron, and Python ML
RUN apt-get update && apt-get install -y \
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
    libasound2 \
    libxshmfence1 \
    # Electron-specific dependencies
    libgtk-3-0 \
    libnotify4 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libwayland-client0 \
    # Additional tools
    git \
    curl \
    xvfb \
    ffmpeg \
    # Python and ML dependencies
    python3 \
    python3-pip \
    python3-venv \
    # Additional dependencies for NeMo toolkit
    libsndfile1 \
    sox 

RUN apt install -y ncdu

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Install global npm packages
RUN npm install -g npm@latest

# Pre-install Playwright with headless Chromium only (for CI/CD)
# Using --only-shell to install just the headless shell, saving ~450MB
RUN mkdir -p /tmp/playwright-install && \
    cd /tmp/playwright-install && \
    npm init -y && \
    npm install @playwright/test@^1.42.1 && \
    npx playwright install --with-deps --only-shell chromium && \
    cd / && \
    rm -rf /tmp/playwright-install

# Pre-install common dependencies based on package.json structure
# This creates a layer (~155MB) that can be cached when only package.json changes
# The postCreateCommand in devcontainer.json will copy this to node_modules
COPY package.json package-lock.json* /tmp/deps/
RUN cd /tmp/deps && \
    if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi && \
    # Move node_modules to a cache location
    mv node_modules /tmp/node_modules_cache || true

# Pre-create uv virtual environment for transcribe project at a fixed location
# This creates the actual .venv (~1.8GB) that pytest will use
COPY transcribe/pyproject.toml transcribe/uv.lock /tmp/python-deps/
ENV UV_PROJECT_ENVIRONMENT=/venv
RUN cd /tmp/python-deps && \
    uv sync --frozen && \
    echo "Python virtual environment created successfully at $UV_PROJECT_ENVIRONMENT"

# Pre-download ASR models for transcription
# Set HF_HOME before downloading models
ENV HF_HOME=/models

# TODO: Does this do anything?
# NeMo toolkit environment variables
ENV NEMO_MODEL_CACHE=/models

RUN mkdir -p /models

RUN cd /tmp/python-deps && \
    uv run python -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='openai/whisper-tiny')" && \
    rm -rf /models/xet && \
    echo "Whisper-tiny model downloaded successfully"
    # Pre-download NVIDIA Parakeet model (default model for production)
    # Note: This is a ~2.4GB download and may take time during build
    
RUN cd /tmp/python-deps && \
    uv run python -c "import nemo.collections.asr as nemo_asr; model = nemo_asr.models.ASRModel.from_pretrained(model_name='nvidia/parakeet-tdt-0.6b-v3'); print('Parakeet model downloaded successfully')" && \
    rm -rf /models/xet && \
    echo "Parakeet TDT model downloaded successfully"

RUN echo "2) sleeping for 30 seconds" && sleep 30 && echo "done sleeping"

# Environment variables
ENV NODE_ENV=development
# Disable OneLogger telemetry in development
ENV ONE_LOGGER_DISABLE=1
# Set DISPLAY for Xvfb
ENV DISPLAY=:99

# Create startup script to launch Xvfb
RUN echo '#!/bin/bash\n\
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 &\n\
exec "$@"' > /usr/local/bin/start-with-xvfb.sh && \
    chmod +x /usr/local/bin/start-with-xvfb.sh

# Default command - start Xvfb then bash
ENTRYPOINT ["/usr/local/bin/start-with-xvfb.sh"]
CMD ["bash"]

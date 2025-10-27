FROM node:20-bookworm

# Install system dependencies for Playwright and Python ML
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

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Install global npm packages
RUN npm install -g npm@latest

# Pre-install Playwright with browsers
# We'll do this with a temporary package.json to cache the installation
RUN mkdir -p /tmp/playwright-install && \
    cd /tmp/playwright-install && \
    npm init -y && \
    npm install @playwright/test@^1.42.1 && \
    npx playwright install --with-deps chromium && \
    cd / && \
    rm -rf /tmp/playwright-install

# TODO: Delete me.
# Set working directory
WORKDIR /workspace

# Pre-install common dependencies based on package.json structure
# This creates a layer that can be cached when only package.json changes
COPY package.json package-lock.json* /tmp/deps/
RUN cd /tmp/deps && \
    if [ -f package-lock.json ]; then \
        npm ci; \
    else \
        npm install; \
    fi && \
    # Move node_modules to a cache location
    mv node_modules /tmp/node_modules_cache || true

# Pre-install Python packages from transcribe project
# This creates a cached virtual environment that uv will reuse
COPY transcribe/pyproject.toml transcribe/uv.lock /tmp/python-deps/
RUN cd /tmp/python-deps && \
    uv sync --frozen && \
    echo "Python packages cached successfully"

# Pre-download ASR models for transcription using the cached environment
RUN mkdir -p /models && \
    cd /tmp/python-deps && \
    # Download Whisper-tiny for testing (fast, small model)
    uv run python -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='openai/whisper-tiny', cache_dir='/models')" && \
    echo "Whisper-tiny model downloaded successfully" && \
    # Pre-download NVIDIA Parakeet model (default model for production)
    # Note: This is a ~600MB download and may take time during build
    uv run python -c "import nemo.collections.asr as nemo_asr; model = nemo_asr.models.ASRModel.from_pretrained(model_name='nvidia/parakeet-tdt-0.6b-v3'); print('Parakeet model downloaded successfully')" && \
    echo "Parakeet TDT model downloaded successfully"

# Environment variables
ENV NODE_ENV=development
ENV HF_HOME=/models
# NeMo toolkit environment variables
ENV NEMO_MODEL_CACHE=/models
# Disable OneLogger telemetry in development
ENV ONE_LOGGER_DISABLE=1

# Default command
CMD ["bash"]

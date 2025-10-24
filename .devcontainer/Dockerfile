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
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:${PATH}"

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

# Pre-download ASR model for transcription
RUN mkdir -p /models && \
    python3 -m pip install --no-cache-dir transformers torch torchaudio huggingface_hub && \
    python3 -c "from huggingface_hub import snapshot_download; snapshot_download('nvidia/parakeet-tdt-0.6b-v3', cache_dir='/models')"

# Environment variables
ENV NODE_ENV=development
ENV HF_HOME=/models

# Default command
CMD ["bash"]

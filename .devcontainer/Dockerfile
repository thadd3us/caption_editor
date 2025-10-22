FROM node:20-bookworm

# Install system dependencies for Playwright
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
    && rm -rf /var/lib/apt/lists/*

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

# Environment variables
ENV NODE_ENV=development

# Default command
CMD ["bash"]

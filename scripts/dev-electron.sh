#!/bin/bash
# Development helper script for Electron

set -e

echo "🔨 Building Electron main process..."
npm run build:electron

echo ""
echo "🚀 Starting Electron app..."
echo "   Press Ctrl+C to stop"
echo ""

# Set environment variable for Vite dev server
export VITE_DEV_SERVER_URL="http://localhost:3000"

# Run electron (assumes vite dev server is already running)
electron . --trace-warnings

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Build the released app
echo "Building released app..."

# Load signing environment variables (.envrc sources .envrc.private)
source .envrc

# Apple Team ID required for code signing
export APPLE_TEAM_ID="RWVMRK3723"

# Ensure dependencies are up to date
echo "Installing dependencies..."
npm install

# Run the package script
echo "Running package:mac..."
npm run package:mac

echo "Build complete! Check release/ directory for artifacts."

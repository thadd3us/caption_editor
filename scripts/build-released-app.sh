#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Build the released app
echo "Building released app..."

# Load signing environment variables (.envrc sources .envrc.private)
source .envrc

# Disable notarization for now (unset the vars that trigger it)
unset APPLE_ID
unset APPLE_APP_SPECIFIC_PASSWORD

# Apple Team ID required for code signing
export APPLE_TEAM_ID="RWVMRK3723"

# Enable verbose electron-builder logging
export DEBUG=electron-builder

# Ensure dependencies are up to date
echo "Installing dependencies..."
npm install

# Run the package script
echo ""
echo "Running package:mac..."
echo "(Note: Code signing can take 3-5 minutes — this is normal.)"
echo "(Notarization, if enabled, can take 10+ minutes.)"
echo ""
npm run package:mac

echo ""
echo "Build complete! Check release/ directory for artifacts."

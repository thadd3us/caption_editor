#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_FILE="$PROJECT_DIR/docs/macos-release-build.md"

# --help: print full docs and exit
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
  if [[ -f "$DOCS_FILE" ]]; then
    cat "$DOCS_FILE"
  else
    echo "Docs not found: $DOCS_FILE"
    exit 1
  fi
  exit 0
fi

cd "$PROJECT_DIR"

# Build the released app
echo "=============================================="
echo "  Caption Editor — macOS release build"
echo "=============================================="
echo ""
echo "This script builds a signed and notarized Mac app for distribution."
echo "Requirements: Xcode 13+, Developer ID Application cert, APPLE_ID and"
echo "APPLE_APP_SPECIFIC_PASSWORD in .envrc.private (for notarization)."
echo ""
echo "Full documentation:  ./scripts/build-released-app.sh --help"
echo "                     or see docs/macos-release-build.md"
echo "=============================================="
echo ""

# Load signing environment variables (.envrc sources .envrc.private)
source .envrc

# For notarization, set in .envrc.private: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD
# (See docs/macos-release-build.md or run this script with --help.)

# Apple Team ID required for code signing
export APPLE_TEAM_ID="RWVMRK3723"

# Enable verbose electron-builder logging
export DEBUG=electron-builder

# If notarization will run, ensure notarytool is available (requires Xcode 13+)
if [[ -n "$APPLE_ID" && -n "$APPLE_APP_SPECIFIC_PASSWORD" ]]; then
  if ! xcrun --find notarytool &>/dev/null; then
    echo "Error: notarytool not found. Notarization requires Xcode 13 or later."
    echo ""
    echo "Fix:"
    echo "  1. Install Xcode from the App Store (or ensure it's up to date)."
    echo "  2. Run:  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    echo "  3. If prompted:  sudo xcodebuild -license accept"
    echo ""
    exit 1
  fi
fi

# Ensure dependencies are up to date
echo "Installing dependencies..."
npm install

# Run the package script
echo ""
echo "Running package:mac..."
echo "(Note: Code signing can take 3-5 minutes — this is normal.)"
echo "(Notarization runs when APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD are set; can take 5–10 min.)"
echo ""
npm run package:mac

echo ""
echo "Build complete! Check release/ directory for artifacts."

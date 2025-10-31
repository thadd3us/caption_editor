#!/bin/bash
# Run all tests: unit, E2E browser, E2E Electron, and Python
# Works on both macOS and Linux

set -e  # Exit on error

PLATFORM=$(uname)
COVERAGE=false
SKIP_ELECTRON=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --coverage)
      COVERAGE=true
      shift
      ;;
    --skip-electron)
      SKIP_ELECTRON=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --coverage        Run unit tests with coverage"
      echo "  --skip-electron   Skip Electron tests"
      echo "  --help            Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run with --help for usage"
      exit 1
      ;;
  esac
done

echo "🧪 Running complete test suite on $PLATFORM..."
echo ""

# 1. TypeScript unit tests
echo "📝 Running TypeScript unit tests..."
if [ "$COVERAGE" = true ]; then
  npm test -- --coverage
else
  npm test
fi
echo ""

# 2. Browser E2E tests
echo "🌐 Running browser E2E tests..."
npx playwright test --grep-invert "electron"
echo ""

# 3. Electron E2E tests
if [ "$SKIP_ELECTRON" = false ]; then
  echo "⚡ Building and running Electron tests..."

  # Build both apps
  npm run build
  npm run build:electron

  # Platform-specific Electron test execution
  if [ "$PLATFORM" = "Darwin" ]; then
    # macOS - no Xvfb needed
    npx playwright test tests/electron/
  else
    # Linux - need Xvfb
    echo "🖥️  Starting Xvfb for headless Electron testing..."

    # Check if Xvfb is already running
    if ! pgrep -x "Xvfb" > /dev/null; then
      start-xvfb.sh || {
        echo "⚠️  Warning: start-xvfb.sh not found or failed"
        echo "Attempting to start Xvfb manually..."
        Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 &
        sleep 1
      }
    else
      echo "✓ Xvfb already running"
    fi

    DISPLAY=:99 npx playwright test tests/electron/
  fi
  echo ""
else
  echo "⏭️  Skipping Electron tests (--skip-electron flag set)"
  echo ""
fi

# 4. Python tests
echo "🐍 Running Python tests..."
cd transcribe
uv run pytest tests/ -v
cd ..
echo ""

echo "✅ Test suite complete!"
echo ""
echo "📊 Summary:"
echo "  - TypeScript unit tests: Check output above"
echo "  - Browser E2E tests: Check output above"
if [ "$SKIP_ELECTRON" = false ]; then
  echo "  - Electron E2E tests: Check output above"
fi
echo "  - Python tests: Check output above"

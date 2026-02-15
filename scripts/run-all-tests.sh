#!/bin/bash
# Run all tests: unit, E2E browser, E2E Electron, and Python
# Works on both macOS and Linux

set -e  # Exit on error

PLATFORM=$(uname)
COVERAGE=false
SKIP_ELECTRON=false
SKIP_EXPENSIVE=true  # Default: skip expensive ASR tests

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
    --run-expensive-tests)
      SKIP_EXPENSIVE=false
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --coverage             Run unit tests with coverage"
      echo "  --skip-electron        Skip Electron tests"
      echo "  --run-expensive-tests  Include expensive ASR tests (default: skipped)"
      echo "  --help                 Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Run with --help for usage"
      exit 1
      ;;
  esac
done

# Export for playwright and pytest
if [ "$SKIP_EXPENSIVE" = true ]; then
  export SKIP_EXPENSIVE_TESTS=true
  echo "⏭️  Skipping expensive ASR tests (use --run-expensive-tests to include)"
fi

echo "🧪 Running complete test suite on $PLATFORM..."
echo ""

# 1. TypeScript type checking
echo "🔍 Running TypeScript type checking..."
npx tsc --noEmit
echo ""

# 2. TypeScript unit tests
echo "📝 Running TypeScript unit tests..."
if [ "$COVERAGE" = true ]; then
  npm run test:unit:coverage
else
  npm run test:unit
fi
echo ""

# 3. E2E tests (all run in Electron)
if [ "$SKIP_ELECTRON" = false ]; then
  echo "⚡ Building app for Electron E2E tests..."

  # Build both apps
  npm run build
  npm run build:electron

  echo "🧪 Running E2E tests in Electron..."
  export HEADLESS=true

  # Platform-specific Electron test execution
  if [ "$PLATFORM" = "Darwin" ]; then
    # macOS - no Xvfb needed
    npx playwright test
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

    DISPLAY=:99 npx playwright test
  fi
  echo ""
else
  echo "⏭️  Skipping E2E tests (--skip-electron flag set)"
  echo ""
fi

# 5. Python tests
echo "🐍 Running Python tests..."
cd transcribe
uv run pytest . -sv --snapshot-warn-unused
cd ..
echo ""

echo "✅ Test suite complete!"
echo ""
echo "📊 Summary:"
echo "  - TypeScript type checking: Check output above"
echo "  - TypeScript unit tests: Check output above"
if [ "$SKIP_ELECTRON" = false ]; then
  echo "  - E2E tests (Electron): Check output above"
fi
echo "  - Python tests: Check output above"

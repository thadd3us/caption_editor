#!/bin/bash
# Kill any dangling Electron processes from tests

echo "🧹 Cleaning up dangling Electron processes..."

# Kill Electron helper processes and the main process
# Be careful not to kill other Electron apps if possible, 
# but in a dev environment this is usually fine.
pkill -f "node_modules/electron/dist/Electron.app" || true
pkill -f "dist-electron/main.cjs" || true

echo "✅ Cleanup complete."

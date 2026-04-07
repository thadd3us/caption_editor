#!/bin/bash
# Start Xvfb (X Virtual Framebuffer) for headless Electron testing
# This script starts Xvfb on display :99 and sets the DISPLAY environment variable
# Note: This script has the SUID bit set, so it runs with elevated privileges

# Start Xvfb in the background
Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 &

# Store the PID
XVFB_PID=$!

# Wait a moment for Xvfb to start
sleep 1

# Check if Xvfb is running
if ps -p $XVFB_PID > /dev/null 2>&1; then
    echo "Xvfb started successfully on display :99 (PID: $XVFB_PID)"
    echo "Set DISPLAY=:99 in your shell to use it"
    echo "export DISPLAY=:99"
else
    echo "Failed to start Xvfb"
    exit 1
fi

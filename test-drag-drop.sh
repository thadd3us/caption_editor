#!/bin/bash

# Test script for drag-and-drop functionality
# This script helps verify that webUtils.getPathForFile() is working correctly

echo "=========================================="
echo "Drag-and-Drop Test Script"
echo "=========================================="
echo ""

# Build the app
echo "Step 1: Building app..."
npm run build && npm run build:electron

if [ $? -ne 0 ]; then
  echo "✗ Build failed!"
  exit 1
fi

echo "✓ Build successful"
echo ""

# Create a test VTT file
TEST_FILE="tests/fixtures/drag-drop-test.vtt"
echo "Step 2: Creating test VTT file..."
cat > "$TEST_FILE" << 'EOF'
WEBVTT

1
00:00:01.000 --> 00:00:02.000
This is a test caption for drag-and-drop

2
00:00:03.000 --> 00:00:04.000
If you can see this, the file loaded correctly!
EOF

if [ $? -ne 0 ]; then
  echo "✗ Failed to create test file!"
  exit 1
fi

echo "✓ Test file created: $TEST_FILE"
echo ""

# Instructions
echo "=========================================="
echo "MANUAL TEST INSTRUCTIONS"
echo "=========================================="
echo ""
echo "1. The app will launch momentarily"
echo ""
echo "2. Drag and drop this file into the app:"
echo "   $TEST_FILE"
echo ""
echo "3. Check the console (DevTools) for these messages:"
echo "   [preload] ✓ Got path using webUtils.getPathForFile(): /path/to/file"
echo "   [preload] ✓ Sending to main process: [...]"
echo ""
echo "4. You should see the captions appear in the table"
echo ""
echo "5. Make an edit to one of the captions"
echo ""
echo "6. Click the Save button (should NOT prompt for location)"
echo ""
echo "7. Close the app"
echo ""
echo "8. Verify the file was updated:"
echo "   cat $TEST_FILE"
echo ""
echo "=========================================="
echo "Press Enter to launch the app..."
read

# Launch the app
echo "Launching app..."
npm start

# Cleanup
echo ""
echo "Cleaning up test file..."
rm -f "$TEST_FILE"
echo "✓ Done!"

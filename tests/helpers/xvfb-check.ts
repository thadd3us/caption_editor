/**
 * Helper to check if Xvfb is available on Linux systems
 * This prevents long timeouts when Xvfb is not running
 */
export function checkXvfbAvailable() {
  // Only check on Linux (not needed on macOS/Windows)
  if (process.platform !== 'linux') {
    return
  }

  const display = process.env.DISPLAY

  if (!display) {
    throw new Error(
      'DISPLAY environment variable not set. On Linux, E2E tests require Xvfb.\n' +
      'Run: start-xvfb.sh && DISPLAY=:99 npx playwright test'
    )
  }

  // Check if the display is accessible
  // We can't directly check if Xvfb is running without executing shell commands,
  // but we can at least verify DISPLAY is set
  console.log(`[Xvfb Check] DISPLAY=${display} (Linux platform detected)`)
}

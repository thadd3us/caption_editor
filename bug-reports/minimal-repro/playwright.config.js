module.exports = {
  testDir: '.',
  timeout: 30000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
}

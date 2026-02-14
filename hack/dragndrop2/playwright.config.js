module.exports = {
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 30000,
  use: {
    trace: 'on-first-retry',
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ]
}

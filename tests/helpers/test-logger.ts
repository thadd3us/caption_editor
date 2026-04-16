import winston from 'winston'

const levelFromEnv = (process.env.TEST_LOG_LEVEL ?? '').trim()
const silent = levelFromEnv === 'silent'

/**
 * Winston logger for the Playwright / Vitest Node process (not the Electron renderer).
 * Tune with `TEST_LOG_LEVEL` (Winston levels: `error`, `warn`, `info`, `verbose`, `debug`, `silly`, or `silent` to mute).
 */
export const testProcessLogger = winston.createLogger({
  silent,
  level: silent || !levelFromEnv ? 'debug' : levelFromEnv,
  format: winston.format.combine(
    winston.format.timestamp({ format: () => new Date().toISOString() }),
    winston.format.printf(({ level, message, timestamp }) => {
      const lvl = level.toUpperCase()
      return `[${timestamp}] [${lvl}] ${message}`
    })
  ),
  transports: [new winston.transports.Console()],
})

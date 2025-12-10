import * as path from 'path'
import * as fs from 'fs'

/**
 * Find the project root by looking for package.json
 * Works from any test directory depth
 */
export function getProjectRoot(): string {
  let dir = process.cwd()

  // Search up to 5 levels
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break // reached root
    dir = parent
  }

  // Fallback: assume we're in tests/ or tests/electron/
  return path.join(process.cwd(), '../..').replace(/tests\/electron$/, '').replace(/tests$/, '')
}

/**
 * Get absolute path to dist-electron/main.cjs
 */
export function getElectronMainPath(): string {
  return path.join(getProjectRoot(), 'dist-electron/main.cjs')
}

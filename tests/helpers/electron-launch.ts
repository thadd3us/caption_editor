import { _electron as electron, ElectronApplication } from '@playwright/test'
import { getElectronMainPath } from './project-root'

/**
 * Standard options for launching the Electron app in tests
 */
export interface LaunchOptions {
    args?: string[]
    env?: Record<string, string>
    executablePath?: string
    headless?: boolean
}

/**
 * Launch the Electron application with standard configuration
 */
export async function launchElectron(options: LaunchOptions = {}): Promise<ElectronApplication> {
    const isHeadless = process.env.HEADLESS === 'true'

    const defaultEnv: any = {
        ...process.env,
        NODE_ENV: 'test',
        ...options.env
    }

    // Ensure HEADLESS is set in the environment for the main process
    if (isHeadless) {
        defaultEnv.HEADLESS = 'true'
    }

    const launchOptions: any = {
        args: options.args || [getElectronMainPath(), '--no-sandbox'],
        env: defaultEnv,
        headless: options.headless !== undefined ? options.headless : isHeadless
    }

    if (options.executablePath) {
        launchOptions.executablePath = options.executablePath
    }

    return await electron.launch(launchOptions)
}

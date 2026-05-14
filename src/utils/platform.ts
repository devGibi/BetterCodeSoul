import path from 'node:path'
import os from 'node:os'

export const paths = {
  opencodeConfig(): string {
    switch (process.platform) {
      case 'win32':
        return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'opencode', 'opencode.json')
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'opencode', 'opencode.json')
      default:
        return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
    }
  },

  hubData(): string {
    return path.join(os.homedir(), '.better-code-soul')
  },

  hubDb(): string {
    return path.join(paths.hubData(), 'data.db')
  },

  hubLogs(): string {
    return path.join(paths.hubData(), 'logs')
  },

  python(): string {
    return process.platform === 'win32' ? 'python' : 'python3'
  },

  pip(): string {
    return process.platform === 'win32' ? 'pip' : 'pip3'
  },
}

export function isWindows(): boolean {
  return process.platform === 'win32'
}

export function isMac(): boolean {
  return process.platform === 'darwin'
}

export function isLinux(): boolean {
  return process.platform === 'linux'
}

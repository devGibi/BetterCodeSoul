import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

export type BcsDataScope = 'auto' | 'global' | 'project'

export const paths = {
  opencodeConfig(): string {
    return path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  },

  hubData(): string {
    return path.join(os.homedir(), '.better-code-soul')
  },

  hubDb(): string {
    return path.join(paths.hubData(), 'data.db')
  },

  globalConfig(): string {
    return path.join(paths.hubData(), 'config.json')
  },

  hubLogs(): string {
    return path.join(paths.hubData(), 'logs')
  },

  projectConfig(projectPath = process.cwd()): string {
    return path.join(projectPath, '.bcs.json')
  },

  projectDir(projectPath = process.cwd()): string {
    return path.join(projectPath, '.bcs')
  },

  projectDb(projectPath = process.cwd()): string {
    return path.join(paths.projectDir(projectPath), 'history.db')
  },

  projectCheckpoints(projectPath = process.cwd()): string {
    return path.join(paths.projectDir(projectPath), 'checkpoints')
  },

  projectReports(projectPath = process.cwd()): string {
    return path.join(paths.projectDir(projectPath), 'reports')
  },

  activeDb(projectPath = process.cwd(), scope: BcsDataScope = 'auto'): string {
    if (scope === 'global') return paths.hubDb()
    if (scope === 'project') return paths.projectDb(projectPath)

    return fs.existsSync(paths.projectConfig(projectPath)) || fs.existsSync(paths.projectDb(projectPath))
      ? paths.projectDb(projectPath)
      : paths.hubDb()
  },

  activeCheckpointDir(projectPath = process.cwd(), scope: BcsDataScope = 'auto'): string {
    if (scope === 'global') return path.join(paths.hubData(), 'checkpoints')
    if (scope === 'project') return paths.projectCheckpoints(projectPath)

    return fs.existsSync(paths.projectConfig(projectPath)) || fs.existsSync(paths.projectDir(projectPath))
      ? paths.projectCheckpoints(projectPath)
      : path.join(paths.hubData(), 'checkpoints')
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

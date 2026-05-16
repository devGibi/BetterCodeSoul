import crypto from 'node:crypto'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export interface RepositoryIdentity {
  key: string
  label: string
  source: 'git-remote' | 'local-path'
}

export class RepositoryIdentityService {
  identify(projectPath: string): RepositoryIdentity {
    const remote = this.readRemote(projectPath)
    if (remote) {
      const normalized = normalizeRemote(remote)
      return {
        key: `git:${hash(normalized)}`,
        label: normalized,
        source: 'git-remote',
      }
    }

    const normalizedPath = path.resolve(projectPath).toLowerCase()
    return {
      key: `local:${hash(normalizedPath)}`,
      label: path.basename(normalizedPath) || normalizedPath,
      source: 'local-path',
    }
  }

  getRepoKey(projectPath: string): string {
    return this.identify(projectPath).key
  }

  private readRemote(projectPath: string): string | null {
    try {
      const output = execFileSync('git', ['-C', projectPath, 'config', '--get', 'remote.origin.url'], {
        encoding: 'utf-8',
        timeout: 1000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return output || null
    } catch {
      return null
    }
  }
}

function normalizeRemote(remote: string): string {
  return remote
    .trim()
    .replace(/^https?:\/\/[^@/]+@/i, 'https://')
    .replace(/^git@([^:]+):/i, 'https://$1/')
    .replace(/\.git$/i, '')
    .toLowerCase()
}

function hash(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16)
}

export const repositoryIdentityService = new RepositoryIdentityService()

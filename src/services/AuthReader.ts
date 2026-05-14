import fs from 'node:fs'
import { runCommand } from '../utils/spawn.js'
import { paths } from '../utils/platform.js'
import { logger } from '../utils/logger.js'

export interface AuthProvider {
  name: string
  connected: boolean
  method: 'oauth' | 'apikey' | 'unknown'
  email?: string
  plan?: string
  models?: string[]
}

export class AuthReader {
  private cachedProviders: AuthProvider[] | null = null

  async getProviders(): Promise<AuthProvider[]> {
    if (this.cachedProviders) {
      return this.cachedProviders
    }

    const providers = await this.readProviders()
    this.cachedProviders = providers
    return providers
  }

  async getConnectedModels(): Promise<string[]> {
    const providers = await this.getProviders()
    const models: string[] = []
    for (const p of providers) {
      if (p.connected && p.models) {
        models.push(...p.models)
      }
    }
    return models
  }

  private async readProviders(): Promise<AuthProvider[]> {
    const fromCommand = await this.tryCommand()
    if (fromCommand.length > 0) return fromCommand

    const fromConfig = this.tryConfigFile()
    if (fromConfig.length > 0) return fromConfig

    logger.warn('Could not read auth providers from any source')
    return []
  }

  private async tryCommand(): Promise<AuthProvider[]> {
    try {
      const result = await runCommand('opencode', ['auth', 'status', '--json'], { timeout: 5000 })
      if (result.exitCode !== 0 || !result.stdout.trim()) return []

      const data = JSON.parse(result.stdout)
      const providers: AuthProvider[] = []

      if (Array.isArray(data.providers)) {
        for (const p of data.providers) {
          providers.push({
            name: p.name || p.provider || 'unknown',
            connected: !!p.connected,
            method: p.method || (p.email ? 'oauth' : 'unknown'),
            email: p.email,
            plan: p.plan,
            models: p.models || [],
          })
        }
      } else if (typeof data === 'object') {
        for (const [name, info] of Object.entries(data)) {
          if (typeof info === 'object' && info !== null) {
            const infoObj = info as Record<string, unknown>
            providers.push({
              name,
              connected: !!infoObj.connected,
              method: infoObj.method as 'oauth' | 'apikey' | 'unknown' || 'unknown',
              email: infoObj.email as string | undefined,
              plan: infoObj.plan as string | undefined,
              models: infoObj.models as string[] || [],
            })
          }
        }
      }

      return providers
    } catch {
      return []
    }
  }

  private tryConfigFile(): AuthProvider[] {
    try {
      const configPath = paths.opencodeConfig()
      if (!fs.existsSync(configPath)) return []

      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const providers: AuthProvider[] = []
      const authData = config.providers || config.auth || {}

      for (const [name, info] of Object.entries(authData)) {
        if (typeof info === 'object' && info !== null) {
          const infoObj = info as Record<string, unknown>
          providers.push({
            name,
            connected: !!infoObj.connected || !!infoObj.apiKey || !!infoObj.token,
            method: infoObj.apiKey ? 'apikey' : infoObj.token ? 'oauth' : 'unknown',
            email: infoObj.email as string | undefined,
            plan: infoObj.plan as string | undefined,
          })
        }
      }

      return providers
    } catch {
      return []
    }
  }

  clearCache(): void {
    this.cachedProviders = null
  }
}

export const authReader = new AuthReader()

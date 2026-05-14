import fs from 'node:fs'
import path from 'node:path'
import { paths } from './platform.js'

let logFilePath: string | null = null

function ensureLogDir(): string {
  const dir = paths.hubLogs()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getLogFile(): string {
  if (!logFilePath) {
    const dir = ensureLogDir()
    const date = new Date().toISOString().slice(0, 10)
    logFilePath = path.join(dir, `bcs-${date}.log`)
  }
  return logFilePath
}

function writeLog(level: string, message: string, data?: unknown): void {
  try {
    const timestamp = new Date().toISOString()
    const entry = data
      ? `${timestamp} [${level}] ${message} ${JSON.stringify(data)}\n`
      : `${timestamp} [${level}] ${message}\n`
    fs.appendFileSync(getLogFile(), entry, 'utf-8')
  } catch {
    // Silently fail - logging should never break the plugin
  }
}

export const logger = {
  info(message: string, data?: unknown): void {
    writeLog('INFO', message, data)
  },

  warn(message: string, data?: unknown): void {
    writeLog('WARN', message, data)
  },

  error(message: string, data?: unknown): void {
    writeLog('ERROR', message, data)
  },

  debug(message: string, data?: unknown): void {
    if (process.env.BCS_DEBUG) {
      writeLog('DEBUG', message, data)
    }
  },
}

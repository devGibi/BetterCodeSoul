import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bcsConfigService } from '../src/services/BcsConfigService'
import { paths } from '../src/utils/platform'

const tmpDirs: string[] = []

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-config-'))
  tmpDirs.push(dir)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    scripts: {
      lint: 'tsc --noEmit',
      'test:run': 'vitest run',
      build: 'tsup',
    },
  }, null, 2), 'utf-8')
  return dir
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('BcsConfigService', () => {
  it('initializes project config and storage directories', () => {
    const projectPath = makeProject()
    const result = bcsConfigService.initProject(projectPath, { defaultTool: 'opencode' })

    expect(result.created).toBe(true)
    expect(fs.existsSync(paths.projectConfig(projectPath))).toBe(true)
    expect(fs.existsSync(paths.projectDir(projectPath))).toBe(true)
    expect(fs.existsSync(paths.projectCheckpoints(projectPath))).toBe(true)
    expect(fs.existsSync(paths.projectReports(projectPath))).toBe(true)
    expect(result.config.defaultTool).toBe('opencode')
    expect(result.config.quality.lint).toBe('npm run lint')
    expect(result.config.quality.test).toBe('npm run test:run')
    expect(result.config.quality.build).toBe('npm run build')
  })

  it('uses project database path when project is initialized', () => {
    const projectPath = makeProject()
    bcsConfigService.initProject(projectPath, { defaultTool: 'opencode' })

    expect(paths.activeDb(projectPath)).toBe(paths.projectDb(projectPath))
  })
})

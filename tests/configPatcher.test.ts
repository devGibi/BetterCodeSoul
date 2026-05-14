import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ConfigPatcher } from '../src/services/ConfigPatcher'

describe('ConfigPatcher', () => {
  const patcher = new ConfigPatcher()
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcs-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('patchOpencodeJson', () => {
    it('creates a new config file if it does not exist', () => {
      const filePath = path.join(tmpDir, 'opencode.json')
      patcher.patchOpencodeJson(filePath, { plugin: ['better-code-soul'] })

      expect(fs.existsSync(filePath)).toBe(true)
      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      expect(config.plugin).toEqual(['better-code-soul'])
    })

    it('merges with existing config', () => {
      const filePath = path.join(tmpDir, 'opencode.json')
      fs.writeFileSync(filePath, JSON.stringify({ existing: 'value', plugin: ['other'] }, null, 2))

      patcher.patchOpencodeJson(filePath, { plugin: ['better-code-soul'] })

      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      expect(config.existing).toBe('value')
      expect(config.plugin).toContain('other')
      expect(config.plugin).toContain('better-code-soul')
    })

    it('creates a backup before patching', () => {
      const filePath = path.join(tmpDir, 'opencode.json')
      fs.writeFileSync(filePath, JSON.stringify({ original: true }, null, 2))

      patcher.patchOpencodeJson(filePath, { new: 'data' })

      expect(fs.existsSync(filePath + '.bak')).toBe(true)
      const backup = JSON.parse(fs.readFileSync(filePath + '.bak', 'utf-8'))
      expect(backup.original).toBe(true)
    })
  })

  describe('removeFromOpencodeJson', () => {
    it('removes a value from an array', () => {
      const filePath = path.join(tmpDir, 'opencode.json')
      fs.writeFileSync(filePath, JSON.stringify({ plugin: ['a', 'b', 'c'] }, null, 2))

      patcher.removeFromOpencodeJson(filePath, [{ key: 'plugin', value: 'b' }])

      const config = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      expect(config.plugin).toEqual(['a', 'c'])
    })
  })

  describe('appendToAgentsMd', () => {
    it('creates AGENTS.md if it does not exist', () => {
      const filePath = path.join(tmpDir, 'AGENTS.md')
      patcher.appendToAgentsMd(filePath, 'Test Section', 'Test content')

      expect(fs.existsSync(filePath)).toBe(true)
      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content).toContain('## Test Section')
      expect(content).toContain('Test content')
    })

    it('does not duplicate content', () => {
      const filePath = path.join(tmpDir, 'AGENTS.md')
      patcher.appendToAgentsMd(filePath, 'Test Section', 'Test content')
      patcher.appendToAgentsMd(filePath, 'Test Section', 'Test content')

      const content = fs.readFileSync(filePath, 'utf-8')
      const matches = content.match(/Test content/g)
      expect(matches?.length).toBe(1)
    })
  })
})

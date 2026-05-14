import { describe, it, expect } from 'vitest'
import { parseTokensFromOutput } from '../src/services/TokenTracker'

describe('parseTokensFromOutput', () => {
  it('parses token count from output', () => {
    const output = 'tokens: 1500'
    const result = parseTokensFromOutput(output)
    expect(result.input).toBeGreaterThan(0)
  })

  it('parses input/output tokens', () => {
    const output = 'input: 1000 tokens, output: 500 tokens'
    const result = parseTokensFromOutput(output)
    expect(result.input).toBe(1000)
    expect(result.output).toBe(500)
  })

  it('parses model from output', () => {
    const output = 'model: claude-sonnet-4-5 tokens: 100'
    const result = parseTokensFromOutput(output)
    expect(result.model).toBe('claude-sonnet-4-5')
  })

  it('estimates tokens when no pattern matches', () => {
    const output = 'A'.repeat(4000) // ~1000 tokens estimated
    const result = parseTokensFromOutput(output)
    expect(result.input).toBeGreaterThan(0)
    expect(result.output).toBeGreaterThan(0)
  })

  it('handles empty output', () => {
    const result = parseTokensFromOutput('')
    expect(result.input).toBeGreaterThanOrEqual(0)
    expect(result.output).toBeGreaterThanOrEqual(0)
  })

  it('handles object output', () => {
    const result = parseTokensFromOutput({ text: 'some output' })
    expect(result.input).toBeGreaterThanOrEqual(0)
  })
})

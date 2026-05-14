import { describe, it, expect } from 'vitest'
import { formatTokens, formatCost, formatDuration, formatRelativeTime, formatBytes } from '../src/utils/format'

describe('formatTokens', () => {
  it('formats small numbers', () => {
    expect(formatTokens(100)).toBe('100')
  })

  it('formats thousands', () => {
    expect(formatTokens(1500)).toBe('1.5K')
  })

  it('formats millions', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })

  it('handles zero', () => {
    expect(formatTokens(0)).toBe('0')
  })
})

describe('formatCost', () => {
  it('formats very small costs', () => {
    expect(formatCost(0.0012)).toBe('$0.0012')
  })

  it('formats small costs', () => {
    expect(formatCost(0.05)).toBe('$0.050')
  })

  it('formats larger costs', () => {
    expect(formatCost(1.23)).toBe('$1.23')
  })

  it('formats whole dollar amounts', () => {
    expect(formatCost(5)).toBe('$5.00')
  })
})

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
  })

  it('formats seconds', () => {
    expect(formatDuration(3000)).toBe('3s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(3_660_000)).toBe('1h 1m')
  })
})

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(2_621_440)).toBe('2.5 MB')
  })
})

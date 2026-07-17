import { describe, it, expect } from 'vitest'
import {
  formatPoints,
  pluralize,
  formatArmiesMeta,
  formatCreatedLabel,
} from './format'

describe('formatPoints', () => {
  it('appends " pts"', () => {
    expect(formatPoints(120)).toBe('120 pts')
    expect(formatPoints(0)).toBe('0 pts')
  })
})

describe('pluralize', () => {
  it('uses the singular for a count of 1', () => {
    expect(pluralize(1, 'unit')).toBe('1 unit')
  })

  it('appends "s" by default for non-1 counts', () => {
    expect(pluralize(3, 'unit')).toBe('3 units')
    expect(pluralize(0, 'unit')).toBe('0 units')
  })

  it('uses an explicit plural when given', () => {
    expect(pluralize(1, 'army', 'armies')).toBe('1 army')
    expect(pluralize(2, 'army', 'armies')).toBe('2 armies')
  })
})

describe('formatArmiesMeta', () => {
  it('joins the three counts with a middot', () => {
    expect(formatArmiesMeta(2, 14, 1980)).toBe('2 armies · 14 units · 1980 pts')
  })

  it('handles singular armies/units', () => {
    expect(formatArmiesMeta(1, 1, 500)).toBe('1 army · 1 unit · 500 pts')
  })
})

describe('formatCreatedLabel', () => {
  it('formats an ISO date into a "Created …" label', () => {
    expect(formatCreatedLabel('2026-07-17T12:00:00Z')).toMatch(/^Created /)
    expect(formatCreatedLabel('2026-07-17T12:00:00Z')).toContain('2026')
  })

  it('accepts a Date instance', () => {
    const label = formatCreatedLabel(new Date('2026-01-15T00:00:00Z'))
    expect(label).toContain('2026')
    expect(label).toContain('Jan')
  })

  it('returns an empty string for an unparseable input', () => {
    expect(formatCreatedLabel('not-a-date')).toBe('')
  })
})

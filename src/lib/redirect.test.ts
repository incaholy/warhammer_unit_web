import { describe, it, expect } from 'vitest'
import { redirectTarget } from './redirect'

describe('redirectTarget', () => {
  it('returns an internal path unchanged', () => {
    expect(redirectTarget('/armies/a1')).toBe('/armies/a1')
    expect(redirectTarget('/units?faction_id=x#top')).toBe('/units?faction_id=x#top')
  })

  it('falls back home when there is nothing to return to', () => {
    expect(redirectTarget(undefined)).toBe('/')
    expect(redirectTarget(null)).toBe('/')
    expect(redirectTarget({ pathname: '/armies' })).toBe('/')
  })

  it('refuses external destinations (open redirect)', () => {
    expect(redirectTarget('https://evil.example/phish')).toBe('/')
    expect(redirectTarget('//evil.example/phish')).toBe('/') // protocol-relative
    expect(redirectTarget('javascript:alert(1)')).toBe('/')
  })
})

import { describe, it, expect } from 'vitest'
import { returnTo } from './notFound'

describe('returnTo', () => {
  it('sends a missing battle back to the battles, not to the top of the app', () => {
    expect(returnTo('/kill-team/games/ktg-1')).toEqual({ to: '/kill-team/games', label: 'Battles' })
  })

  it('sends a missing roster back to the rosters', () => {
    expect(returnTo('/kill-team/rosters/ktr-1').to).toBe('/kill-team/rosters')
  })

  it('matches the more specific section first', () => {
    // The ordering is the whole implementation. `/kill-team/games/x` starts with
    // `/kill-team` too, so a looser order would land every Kill Team miss on the
    // catalog -- a destination, and practically a shrug.
    expect(returnTo('/kill-team/games/ktg-1').to).not.toBe('/kill-team')
    expect(returnTo('/kill-team/rosters/ktr-1').to).not.toBe('/kill-team')
  })

  it('keeps the Kill Team catalog for everything else under it', () => {
    expect(returnTo('/kill-team/teams/kt-1').to).toBe('/kill-team')
    expect(returnTo('/kill-team').to).toBe('/kill-team')
  })

  it('sends the whole 40k half back to the army list', () => {
    for (const p of ['/army-list', '/army-list/armies/a1', '/army-list/units/u1', '/army-list/catalog']) {
      expect(returnTo(p).to).toBe('/army-list')
    }
  })

  it('falls through to the top only when the path says nothing', () => {
    // The honest answer: an unrecognised path carries no hint about where they meant
    // to be, so guessing a section would be worse than offering the chooser.
    expect(returnTo('/nonsense')).toEqual({ to: '/', label: 'Muster' })
    expect(returnTo('/').to).toBe('/')
  })
})

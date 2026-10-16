import { describe, it, expect } from 'vitest'
import {
  GAME_STATUSES,
  gameStateLabel,
  gameStatusLabel,
  hasActivated,
  initiativeLabel,
  totalVictoryPoints,
} from './killTeamGame'

describe('totalVictoryPoints', () => {
  it('sums every source, including ones the app has never heard of', () => {
    // The keys are free (#1, #21): the backend stores what the client sends and no
    // enum constrains them. A lookup of known sources would silently drop the rest.
    expect(totalVictoryPoints({ 'Crit op: Hold': 3, 'Tunnel network': 2, 'Something new': 1 })).toBe(6)
  })

  it('is 0 for a game that has scored nothing', () => {
    expect(totalVictoryPoints({})).toBe(0)
  })
})

describe('hasActivated', () => {
  it('is a comparison against the CURRENT turning point, not a non-null check', () => {
    // #61: `advance` clears nothing, so last turning point's stamp stays on the row.
    // A non-null check would mark this operative activated for the rest of the battle.
    expect(hasActivated(1, 2)).toBe(false)
    expect(hasActivated(2, 2)).toBe(true)
    expect(hasActivated(null, 2)).toBe(false)
  })

  it('does not treat a LATER stamp as activated either', () => {
    // Not reachable through the API — the server stamps from the game's own turning
    // point — but `=== turningPoint` and `>= turningPoint` differ only here, and the
    // weaker one would also accept a stamp an undo had left behind.
    expect(hasActivated(3, 2)).toBe(false)
  })
})

describe('initiativeLabel', () => {
  it('says "Not rolled" for null, never the opponent', () => {
    // #62: null is "not yet rolled", reset on every advance. A falsy check that fell
    // through to the opponent would show them holding initiative by default.
    expect(initiativeLabel(null)).toBe('Not rolled')
  })

  it('shows whoever holds it', () => {
    // The real tokens: `ck_kt_game_initiative` allows NULL, 'player' or 'opponent'.
    // They pass through as the server's own words for now; KF4c decides whether the
    // header says "You" and the opponent's name instead, since nothing renders them
    // yet and that is a copy decision rather than a correctness one.
    expect(initiativeLabel('player')).toBe('player')
    expect(initiativeLabel('opponent')).toBe('opponent')
  })
})

describe('gameStatusLabel', () => {
  it('has copy for every status the backend can store', () => {
    // `Record<GameStatus, string>` already makes a missing one a compile error; this
    // catches the other direction -- a token added to the array with no copy written,
    // which would read back as the raw word and look deliberate.
    for (const status of GAME_STATUSES) {
      expect(gameStatusLabel(status)).not.toBe(status)
    }
  })

  it('falls back to the raw token for a status it has never seen', () => {
    // The field is a bare `string` in the published schema, so a status added on the
    // backend arrives before any frontend change does. The raw word beats a blank.
    expect(gameStatusLabel('abandoned')).toBe('abandoned')
  })
})

describe('gameStateLabel', () => {
  it('shows the turning point and phase only while a battle is in progress', () => {
    // SNAKE_CASE. This read `'in progress'` and so did the fixture, so the comparison
    // agreed with a value the backend's CHECK constraint forbids -- and a real
    // in-progress battle rendered the raw token in the list.
    expect(gameStateLabel({ status: 'in_progress', turning_point: 2, phase: 'firefight' })).toBe(
      'TP 2 · firefight',
    )
  })

  it('names the status instead for a game not being played', () => {
    // A game in setup is at turning point 1 having played none of it, and a finished
    // game keeps the turning point it ended in. Both would read as mid-battle.
    expect(gameStateLabel({ status: 'setup', turning_point: 1, phase: 'strategy' })).toBe(
      'Not started',
    )
    expect(gameStateLabel({ status: 'finished', turning_point: 4, phase: 'firefight' })).toBe(
      'Finished',
    )
  })

  it('does not treat the space-separated spelling as in progress', () => {
    // The exact defect this commit fixes, pinned so it cannot come back: a value the
    // backend cannot store must not be special-cased into working.
    expect(gameStateLabel({ status: 'in progress', turning_point: 2, phase: 'firefight' })).toBe(
      'in progress',
    )
  })
})

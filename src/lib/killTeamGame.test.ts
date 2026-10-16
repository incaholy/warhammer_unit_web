import { describe, it, expect } from 'vitest'
import {
  advanceLabel,
  GAME_STATUSES,
  gameStateLabel,
  gameStatusLabel,
  hasActivated,
  initiativeLabel,
  LAST_TURNING_POINT,
  ploysUsedThisTurningPoint,
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

  it('names the player as "You" and the opponent by their name', () => {
    // `ck_kt_game_initiative` allows NULL, 'player' or 'opponent'. Neither token is
    // copy: "player" on a scoreboard the player is holding reads as somebody else.
    expect(initiativeLabel('player', 'Kesh')).toBe('You')
    expect(initiativeLabel('opponent', 'Kesh')).toBe('Kesh')
  })

  it('falls back to "Opponent" when the game records no name', () => {
    // `opponent_name` is nullable: the common case is an opponent with no account.
    expect(initiativeLabel('opponent', null)).toBe('Opponent')
    expect(initiativeLabel('opponent', '   ')).toBe('Opponent')
    expect(initiativeLabel('opponent')).toBe('Opponent')
  })

  it('does not call a null initiative the opponent even with a name to hand', () => {
    // The defect this guards: `initiative || opponentName` reads as the opponent
    // holding a roll-off that has not happened.
    expect(initiativeLabel(null, 'Kesh')).toBe('Not rolled')
  })

  it('falls back to a token it has never seen', () => {
    expect(initiativeLabel('nobody', 'Kesh')).toBe('nobody')
  })
})

describe('advanceLabel', () => {
  // Every state a game can be in, because this MIRRORS the server's state machine and
  // the point of the label is that it predicts correctly. A table rather than three
  // examples: the firefight branch differs only at the last turning point, so a
  // version that always said "next turning point" would pass a sparse test.
  const cases: [number, string, string][] = [
    [1, 'strategy', 'Advance to firefight'],
    [1, 'firefight', 'Advance to next turning point'],
    [2, 'strategy', 'Advance to firefight'],
    [2, 'firefight', 'Advance to next turning point'],
    [3, 'strategy', 'Advance to firefight'],
    [3, 'firefight', 'Advance to next turning point'],
    [4, 'strategy', 'Advance to firefight'],
    [4, 'firefight', 'Finish battle'],
  ]

  it.each(cases)('turning point %i in %s advances to: %s', (turning_point, phase, expected) => {
    expect(advanceLabel({ status: 'in_progress', turning_point, phase })).toBe(expected)
  })

  it('offers nothing once the battle is finished', () => {
    // `advance` refuses a finished game with its own message, so the control says so
    // rather than inviting the 400.
    expect(advanceLabel({ status: 'finished', turning_point: 4, phase: 'firefight' })).toBe(
      'Battle finished',
    )
  })

  it('labels a game still in setup, which advance also moves', () => {
    // A game in setup is at turning point 1 phase strategy, and advancing puts it
    // in_progress. So the label is about the PHASE, not the status.
    expect(advanceLabel({ status: 'setup', turning_point: 1, phase: 'strategy' })).toBe(
      'Advance to firefight',
    )
  })

  it('agrees with the turning point the backend caps at', () => {
    // `LAST_TURNING_POINT` is 4 in the service and in `ck_kt_game_turning_point`. If
    // this ever disagrees, the finish label lands on the wrong turning point.
    expect(LAST_TURNING_POINT).toBe(4)
  })
})

describe('ploysUsedThisTurningPoint', () => {
  it('keeps only the ploys spent in the turning point being played', () => {
    // #1: the screen reports that a ploy was spent and WHEN. A strategy ploy chosen
    // this turning point is still standing; last turning point's is not, and the
    // entry stays in the log either way.
    const used = ploysUsedThisTurningPoint({
      turning_point: 2,
      ploys_used: [
        { name: 'Old Trick', turning_point: 1 },
        { name: 'Sudden Surge', turning_point: 2 },
        { name: 'Second Wind', turning_point: 2 },
      ],
    })
    // `index` is the position in the RAW array, not in the filtered result -- which is
    // what makes removal exact when the same name appears twice.
    expect(used).toEqual([
      { name: 'Sudden Surge', turningPoint: 2, index: 1 },
      { name: 'Second Wind', turningPoint: 2, index: 2 },
    ])
  })

  it('keeps the order the log recorded, so the newest is last', () => {
    const used = ploysUsedThisTurningPoint({
      turning_point: 1,
      ploys_used: [
        { name: 'First', turning_point: 1 },
        { name: 'Second', turning_point: 1 },
      ],
    })
    expect(used.map((p) => p.name)).toEqual(['First', 'Second'])
  })

  it('drops an entry whose shape is wrong rather than rendering undefined', () => {
    // `ploys_used` is `array<object>` in the schema, so the entries are
    // `{ [key: string]: unknown }[]` and NOTHING checks either field -- not tsc, not
    // zod. Unreachable through the API today, which is exactly why it is unguarded.
    const used = ploysUsedThisTurningPoint({
      turning_point: 1,
      ploys_used: [
        { name: 'Good', turning_point: 1 },
        { turning_point: 1 },
        { name: 'No turning point' },
        { name: 42, turning_point: 1 },
      ],
    })
    expect(used).toEqual([{ name: 'Good', turningPoint: 1, index: 0 }])
  })

  it('is empty for a battle that has spent none', () => {
    expect(ploysUsedThisTurningPoint({ turning_point: 1, ploys_used: [] })).toEqual([])
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

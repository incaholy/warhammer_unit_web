/* Things the game screen DERIVES rather than reads. See ROADMAP.md → KF4, and
 * KILLTEAM.md #1, #5, #61, #62.
 *
 * The tracker records that things exist and leaves the players to apply what they do
 * (#1), which means several facts a screen wants are not columns. They are
 * comparisons over columns, and getting one wrong is a silent wrong number rather
 * than an error — so each lives here with a test, not inline in a view. */

import type { KTGame_Read } from '../api/types'

/** The caller's victory points, totalled across their sources.
 *
 * `victory_points` is a `Record<string, number>` keyed by source, and the backend
 * stores whatever keys the client sends — there is no enum, and nothing on the server
 * would ever correct a typo'd key. So the total is a sum over values, never a lookup
 * of known sources, and a source the app has never heard of still counts.
 *
 * The asymmetry with the opponent is deliberate and is not a shape to unify:
 * `opponent_victory_points` is a plain integer, because the opponent's score is
 * entered by hand while the player's is built from what they scored it for. */
export function totalVictoryPoints(victoryPoints: Record<string, number>): number {
  return Object.values(victoryPoints).reduce((sum, n) => sum + n, 0)
}

/** Has this operative already activated in the turning point being played?
 *
 * A COMPARISON, not a flag (#61). `advance` deliberately clears nothing: an
 * activation is stamped with the turning point it happened in, so last turning
 * point's value stays on the row and is simply no longer current. Checking
 * `activated_in_turning_point !== null` would mark every operative that has ever
 * activated as activated for the rest of the battle. */
export function hasActivated(
  activatedInTurningPoint: number | null,
  turningPoint: number,
): boolean {
  return activatedInTurningPoint === turningPoint
}

/** What the initiative line says, for a value that is three-valued.
 *
 * `null` is "not yet rolled" (#62) — `advance` resets it every turning point for the
 * new roll-off. It MUST NOT render as the opponent holding initiative, which is what
 * a falsy check produces and what a scoreboard showing the opponent's name by default
 * would mean at a table. */
export function initiativeLabel(initiative: string | null): string {
  return initiative ?? 'Not rolled'
}

/** The one-line state of a game, for a list row or a header.
 *
 * Turning point and phase are only meaningful while a battle is being played: a game
 * in `setup` is at turning point 1 having played none of it, and a `finished` game
 * keeps the turning point it ended in. Showing "TP 1 · Strategy" for a battle nobody
 * has started reads as a battle in progress. */
export function gameStateLabel(game: Pick<KTGame_Read, 'status' | 'turning_point' | 'phase'>): string {
  if (game.status !== 'in progress') return game.status
  return `TP ${game.turning_point} · ${game.phase}`
}

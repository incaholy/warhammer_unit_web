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

/** The values `ck_kt_game_status` allows, verbatim.
 *
 * SNAKE_CASE, and the underscore is the whole point of writing them down. The
 * constraint lives in the backend's DDL
 * (`app/core/db/models_killteam.py`: `status IN ('setup', 'in_progress', 'finished')`)
 * and `openapi.json` publishes the field as a bare `string`. So `schema.d.ts` types it
 * `string`, `schemas.gen.ts` validates it as `z.string()`, and NOTHING -- not `tsc`,
 * not zod, not the typed fixture union -- can reject a literal that is merely wrong.
 *
 * This slice shipped `'in progress'` with a space, in a fixture and in a comparison
 * that therefore agreed with it. Keeping the tokens here as a `const` array, with the
 * label map typed `Record<GameStatus, string>`, is what turns the next wrong one into
 * a compile error instead of a green test. */
export const GAME_STATUSES = ['setup', 'in_progress', 'finished'] as const
export type GameStatus = (typeof GAME_STATUSES)[number]

/** Display copy per status. `setup` is worded as what the player sees rather than as
 *  the token: "setup" is the server's word for a battle nobody has started yet. */
const GAME_STATUS_LABELS: Record<GameStatus, string> = {
  setup: 'Not started',
  in_progress: 'In progress',
  finished: 'Finished',
}

/** A status as a person reads it, falling back to the raw token.
 *
 * The fallback is deliberate rather than defensive. The field is a `string` in the
 * published schema, so a status added on the backend reaches this screen before any
 * frontend change does -- and showing the raw word is strictly better than showing
 * nothing, crashing, or claiming a battle is finished when the server did not say so. */
export function gameStatusLabel(status: string): string {
  return GAME_STATUS_LABELS[status as GameStatus] ?? status
}

/** The one-line state of a game, for a list row or a header.
 *
 * Turning point and phase are only meaningful while a battle is being played: a game
 * in `setup` is at turning point 1 having played none of it, and a `finished` game
 * keeps the turning point it ended in. Showing "TP 1 · strategy" for a battle nobody
 * has started reads as a battle in progress.
 *
 * `phase` is left as the server's own word. `strategy` and `firefight` are the terms
 * printed in the rules, and the one place this renders applies `text-transform:
 * uppercase` anyway, so mapping them would add a table that changes nothing. */
export function gameStateLabel(game: Pick<KTGame_Read, 'status' | 'turning_point' | 'phase'>): string {
  if (game.status !== 'in_progress') return gameStatusLabel(game.status)
  return `TP ${game.turning_point} · ${game.phase}`
}

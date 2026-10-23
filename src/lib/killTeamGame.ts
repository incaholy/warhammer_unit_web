/* Things the game screen DERIVES rather than reads. See ROADMAP.md → KF4, and
 * KILLTEAM.md #1, #5, #61, #62.
 *
 * The tracker records that things exist and leaves the players to apply what they do
 * (#1), which means several facts a screen wants are not columns. They are
 * comparisons over columns, and getting one wrong is a silent wrong number rather
 * than an error — so each lives here with a test, not inline in a view. */

import type { KTGame_Read, KTGameOperative_Read } from '../api/types'

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
 * would mean at a table.
 *
 * `ck_kt_game_initiative` allows NULL, `player` or `opponent`. The player's own side
 * reads as "You" and the opponent's as their name, falling back to "Opponent" when the
 * game records none — `opponent_name` is nullable because the common case is an
 * opponent with no account.
 *
 * REVISIT. This shape is worth looking over again rather than built on, for two
 * reasons. A three-valued field carrying one side's identity is already awkward to
 * word, and KILLTEAM.md #67 (K8) drops `opponent_name` outright: a game gains two SIDE
 * rows each with their own display name, so "whose initiative" becomes a reference to a
 * side rather than a token meaning "not me". There may be a simpler formulation once
 * that lands, and this function is deliberately the only place that would change. */
export function initiativeLabel(initiative: string | null, opponentName?: string | null): string {
  if (initiative === null) return 'Not rolled'
  if (initiative === 'player') return 'You'
  if (initiative === 'opponent') return opponentName?.trim() || 'Opponent'
  // A value this build has never seen, for the reason `gameStatusLabel` gives: the
  // field is a bare `string` in the published schema.
  return initiative
}

/** The two sides `ck_kt_game_initiative` allows beside NULL, verbatim.
 *
 * Written down for the reason `GAME_STATUSES` gives below: the column is CHECK'd in the
 * backend's DDL, `openapi.json` publishes `initiative` as a bare `string`, and so nothing
 * in this repo -- not `tsc`, not zod -- can reject a literal that is merely wrong. This
 * slice already shipped four invented literals once. */
export const INITIATIVE_SIDES = ['player', 'opponent'] as const
export type InitiativeSide = (typeof INITIATIVE_SIDES)[number]

/** The control's stand-in for `null`, which is NOT a third allowed value but the absence
 *  of one (#62).
 *
 *  `SegmentedToggle` is generic over `T extends string`, so it cannot hold `null` and a
 *  three-state control needs a token for the empty state. It is converted back to `null`
 *  at the one place that writes it, and never leaves the client -- sending the string
 *  `'none'` would violate `ck_kt_game_initiative`. */
export const NO_INITIATIVE = 'none'

/** What an amount of damage or healing leaves an operative on (KF10).
 *
 * `ck_kt_game_operative_current_wounds` is `current_wounds >= 0 AND <= wounds`, so nine
 * damage to an operative on five is ZERO rather than a 400, and healing past the
 * datacard's maximum stops there. Clamped here rather than left to the service, because
 * the difference is a number that moves versus an error toast in the middle of a turn.
 *
 * The caller asks in DAMAGE, not in the remainder: the damage is the number a player has
 * in front of them, and "12 - 7" done in the head at a table is where a wrong value comes
 * from. */
export function applyWounds(
  current: number,
  max: number,
  mode: 'damage' | 'heal',
  amount: number,
): number {
  const next = mode === 'damage' ? current - amount : current + amount
  return Math.max(0, Math.min(max, next))
}

/** The values `ck_kt_ploy_kind` allows, verbatim.
 *
 * Written down for the reason `GAME_STATUSES` gives: the column is CHECK'd in the
 * backend's DDL and `openapi.json` publishes `kind` as a bare `string`, so nothing here
 * can reject a wrong literal. This slice already shipped `'strategic'` once, in a
 * fixture, where the allowed value is `strategy`.
 *
 * Ordered strategy-then-firefight because that is the order a turning point runs in
 * (#62: `advance` goes strategy -> firefight -> the next turning point). */
export const PLOY_KINDS = ['strategy', 'firefight'] as const
export type PloyKind = (typeof PLOY_KINDS)[number]

const PLOY_KIND_LABELS: Record<PloyKind, string> = {
  strategy: 'Strategy ploy',
  firefight: 'Firefight ploy',
}

/** A ploy kind as a person reads it, falling back to the raw token for the reason
 *  `gameStatusLabel` gives. */
export function ployKindLabel(kind: string): string {
  return PLOY_KIND_LABELS[kind as PloyKind] ?? kind
}

/** The values `ck_kt_game_operative_status` allows, verbatim. Same argument as
 *  `GAME_STATUSES`, and `on_board` carries the same underscore trap. */
export const OPERATIVE_STATUSES = ['reserve', 'on_board', 'incapacitated'] as const
export type OperativeStatus = (typeof OPERATIVE_STATUSES)[number]

/** The two a player may SET.
 *
 * `incapacitated` is derived and deliberately absent: the service couples zero wounds to
 * it in BOTH directions, and its own comment warns that automating one half is worse than
 * automating neither. Offering it here would let a player mark a model incapacitated with
 * wounds left, or on the board with none, and the service would overrule them either way.
 * The wounds stepper is how that state is entered and left. */
export const SETTABLE_OPERATIVE_STATUSES = ['reserve', 'on_board'] as const

const OPERATIVE_STATUS_LABELS: Record<OperativeStatus, string> = {
  reserve: 'In reserve',
  on_board: 'On the board',
  incapacitated: 'Incapacitated',
}

/** An operative's board status as a person reads it, falling back to the raw token for
 *  the reason `gameStatusLabel` gives. */
export function operativeStatusLabel(status: string): string {
  return OPERATIVE_STATUS_LABELS[status as OperativeStatus] ?? status
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

/** The next thing `advance` will do, named.
 *
 * MIRRORS the server's state machine rather than guessing at it
 * (`app/core/services/service_killteam_game.py`, `advance`): `strategy` → `firefight`
 * within a turning point; `firefight` → the next turning point's `strategy`, which puts
 * initiative back to nobody for its roll-off (#62); and out of the LAST turning point's
 * firefight phase, the game FINISHES. `LAST_TURNING_POINT` is 4, which
 * `ck_kt_game_turning_point` also enforces.
 *
 * Duplicated logic, knowingly. A button reading only "Advance" is honest and useless at
 * a table — the one control that moves a game through every state including its end
 * should say which of the three it is about to do. The duplication is bounded (one
 * function, three branches, both constants fixed by a CHECK constraint) and it is
 * PREDICTIVE rather than authoritative: the server still decides, this only labels the
 * button, and a test covers every phase of every turning point so a drift shows up
 * here rather than in the player's hands.
 *
 * It is not a game rule being applied, which #1 forbids. It is the game's own state
 * machine, which the server owns and the screen reports. */
export function advanceLabel(
  game: Pick<KTGame_Read, 'status' | 'turning_point' | 'phase'>,
): string {
  if (game.status === 'finished') return 'Battle finished'
  if (game.phase === 'strategy') return 'Advance to firefight'
  if (game.turning_point < LAST_TURNING_POINT) return 'Advance to next turning point'
  return 'Finish battle'
}

/** Will the next `advance` END the battle? (KF7 group A.)
 *
 * A PREDICATE rather than a comparison against `advanceLabel`'s output, which is the
 * obvious implementation and a trap: branching on the string `'Finish battle'` would make
 * the button's copy load-bearing, so rewording it would silently turn the confirmation
 * off without failing a test.
 *
 * Both functions read the same condition and a test asserts they agree across every phase
 * of every turning point, which is what keeps two functions over one rule honest.
 *
 * Why the caller needs this at all: #66 closes a finished game to edits -- the loader
 * refuses one by default and only the shallow read, `delete_game`, `advance` and `undo`
 * opt out -- so a victory-point write after the finish answers 400. Any adjustment has to
 * happen BEFORE the write that closes the record, which means this advance, alone among
 * the three, has to ask first. */
export function advanceFinishes(
  game: Pick<KTGame_Read, 'status' | 'turning_point' | 'phase'>,
): boolean {
  if (game.status === 'finished') return false
  return game.phase !== 'strategy' && game.turning_point >= LAST_TURNING_POINT
}

/** The last turning point a battle has, per `ck_kt_game_turning_point`. */
export const LAST_TURNING_POINT = 4

/** One entry in `ploys_used` or `actions_used`: what was used, and when.
 *
 * Both columns hold the SAME shape -- the backend writes
 * `{"name": ..., "turning_point": ...}` in `use_ploy` and the client writes it for
 * `actions_used` -- and both are `array<object>` in the published schema, therefore
 * `{ [key: string]: unknown }[]` in the generated types. So nothing checks that an
 * entry has either field, and one narrowing serves both.
 *
 * `index` is the entry's position in the RAW array, which is what makes removal exact:
 * the same name can legitimately appear twice (how often an action may be used is a
 * rule, so #23 records each use rather than counting), so "remove this one" cannot be
 * expressed by name. */
export interface UsageEntry {
  name: string
  turningPoint: number
  index: number
}

/** Narrow a `{name, turning_point}` list, dropping entries that are neither.
 *
 * Not reachable through the API today; the shape is unenforced by both the schema and
 * zod, so a wrong entry would otherwise render as `undefined`. */
export function usageEntries(raw: { [key: string]: unknown }[]): UsageEntry[] {
  const out: UsageEntry[] = []
  raw.forEach((entry, index) => {
    const name = entry.name
    const turningPoint = entry.turning_point
    if (typeof name !== 'string' || typeof turningPoint !== 'number') return
    out.push({ name, turningPoint, index })
  })
  return out
}

/** One row per distinct name, with how many times it appears, in first-seen order.
 *
 * Since KF12 a ploy cannot be spent twice in a turning point, so the only thing that can
 * repeat is COMMAND RE-ROLL — the one repeatable ploy — plus anything written directly
 * into `ploys_used`, which stays writable for a custom game. Listing it three times made
 * the section read as three different ploys at a glance; a count says the same thing in
 * one row.
 *
 * The count is kept rather than deduplicated away, because it IS the record: three
 * re-rolls is three CP, and this list is where a player checks what the turning point
 * cost them. */
export function tallyByName<T extends { name: string }>(entries: T[]): { name: string; count: number }[] {
  const rows: { name: string; count: number }[] = []
  for (const entry of entries) {
    const existing = rows.find((row) => row.name === entry.name)
    if (existing) existing.count += 1
    else rows.push({ name: entry.name, count: 1 })
  }
  return rows
}

/** The ploys spent in the turning point being played, newest last.
 *
 * What the screen can honestly say. After the strategy phase a player has chosen their
 * strategy ploys, and those last the turning point — but that DURATION is a rule, and
 * #1 is that the tracker records while the players apply. So this reports the two facts
 * it holds: the ploy was spent, and it was spent in THIS turning point. Pairing that
 * with the `kind` on the game's own ploy snapshot lets a player tell a strategy ploy
 * that is still standing from a firefight ploy already resolved, without the app
 * claiming to know how long either lasts.
 *
 * Entries missing a usable `name` or `turning_point` are dropped rather than rendered
 * as `undefined`. Not reachable through the API today; the shape is unenforced by both
 * the schema and zod, so a wrong entry would otherwise reach the screen. */
export function ploysUsedThisTurningPoint(
  game: Pick<KTGame_Read, 'ploys_used' | 'turning_point'>,
): UsageEntry[] {
  return usageEntries(game.ploys_used).filter((e) => e.turningPoint === game.turning_point)
}

/** Every action an operative has used, across the whole battle, oldest first.
 *
 * NOT filtered to the current turning point, unlike the ploys. #23's reasoning is that
 * unique actions are abilities on the datacard whose limits differ -- once per battle,
 * once per turning point -- so recording what was used AND WHEN lets the screen show
 * both without the tracker knowing either rule. Filtering here would throw away the
 * half that answers "once per battle". */
export function actionsUsed(
  operative: Pick<KTGameOperative_Read, 'actions_used'>,
): UsageEntry[] {
  return usageEntries(operative.actions_used)
}

/** The STRATEGY ploys spent in the turning point being played (KF5).
 *
 * The quick reference the game screen keeps visible: a strategy ploy is chosen in the
 * strategy phase and its effect runs on, so "which ones are we playing under?" is the
 * question a player asks most often between activations.
 *
 * What this reports is still a FACT and not a duration. The ploy was spent, it was spent
 * in this turning point, and its `kind` is `strategy` -- all three from data the game
 * already carries. How long a strategy ploy lasts is a rule, and #1 leaves rules to the
 * players, which is why the screen labels this "spent this turning point" rather than
 * "active": the two are the same set in practice, and only one of them is a claim the
 * tracker is entitled to make.
 *
 * `kind` comes from the game's own ploy snapshot (#24), so this needs no catalog read. A
 * spent ploy the snapshot does not list is dropped rather than guessed at -- the service
 * refuses one on the way in (`_validate_ploys_used`), so it means the snapshot changed
 * under a row, which is not something to render. */
export function strategyPloysThisTurningPoint(
  game: Pick<KTGame_Read, 'ploys_used' | 'turning_point' | 'ploys'>,
): UsageEntry[] {
  const strategy = new Set(
    game.ploys.filter((ploy) => ploy.kind === 'strategy').map((ploy) => ploy.name),
  )
  return ploysUsedThisTurningPoint(game).filter((entry) => strategy.has(entry.name))
}

/** One per-game pick the rules leave to the players: a label and what was chosen. */
export interface GameChoice {
  label: string
  value: string
}

/** The game's `choices`, as named notes (KF5).
 *
 * The last of KF4/KF5's open shapes, and the only writable field on a game that the
 * service does not validate AT ALL. `victory_points` gets a validator, `ploys_used` gets
 * one, `actions_used` gets one; `choices` gets none, and `additionalProperties: true` in
 * the schema accepts any object. That is not an oversight: #59 keeps Tac Ops and
 * archetypes out of the project entirely -- neither is scraped, stored or gated -- so
 * nothing here could enumerate either the labels or the values.
 *
 * So the client is the sole author of the shape, and the shape is a label to a line of
 * text: the Accursed Gift a Chaos Cult took, the Tac Op a player drew. Structurally the
 * same keyed document as `victory_points`, with strings where that has numbers.
 *
 * Being the sole author is exactly why the READ is narrowed. Nothing on the server would
 * refuse `{"Tac Op": {"nested": true}}`, so a value that is not a string is dropped
 * rather than rendered as `[object Object]`. Not reachable through this client, which is
 * the same reason `usageEntries` guards its two lists. */
export function gameChoices(game: Pick<KTGame_Read, 'choices'>): GameChoice[] {
  return Object.entries(game.choices)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

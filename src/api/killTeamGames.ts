/* Kill Team game resource functions — the two reads and twelve writes under
 * `/me/kill-team/games`. See ROADMAP.md → KF4, and KILLTEAM.md #7, #9, #17, #18,
 * #19, #22, #24, #57, #58, #61, #62, #63, #78, #79.
 *
 * User-owned like the rosters, and separate from `killTeamRosters.ts` for the same
 * reason that module is separate from `killTeam.ts`: a roster is a list a player
 * composes once, a game is state that changes every few minutes at a table. They
 * share a prefix and nothing else.
 *
 * Three properties of this surface shape every function below:
 *
 *   - **The detail read is the whole snapshot** (#22, #24). `KTGame_Read` carries
 *     every datacard, the team's rules, its ploys and the universal ones, and the
 *     text of each piece of equipment taken — and the snapshot is static for the
 *     game's life. So nothing here ever calls the catalog.
 *   - **Every write sends an absolute value, never a delta** (#7) — `current_wounds: 7`,
 *     not `-2`. That is what makes a duplicate delivery of a request harmless. It
 *     says nothing about a SECOND writer, which is what `version` is for.
 *   - **Activate, transform and reveal are operations, not field sets** (#63). The
 *     server reads the turning point off the game, so `activated_in_turning_point`
 *     is not a value a caller can supply — and once activation had to be its own
 *     path, giving transform a field instead would have left two operations in two
 *     shapes. `PATCH …/equipment/{row_id}` takes no body at all. */

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  KTGame_Create,
  KTGame_ListRead,
  KTGame_Read,
  KTGame_Update,
  KTGameEquipment_Read,
  KTGameOperative_Read,
  KTGameOperative_Update,
  Page,
  UUID,
} from './types'
import { toQueryString, type PageParams } from './paging'
import * as S from './schemas.gen'

/** A game update with `version` taken out, because `versioned()` owns it.
 *
 * The generated `KTGame_Update` declares `version` as an ordinary optional field, so
 * nothing in the types stops a caller putting it in the body by hand. Omitting it
 * here is what makes the single seam below actually single. */
export type GameUpdate = Omit<KTGame_Update, 'version'>

/** An operative update with `version` taken out. See `GameUpdate`. */
export type OperativeUpdate = Omit<KTGameOperative_Update, 'version'>

/** The one place `version` is attached to a write.
 *
 * TODAY it is a body field, and only two of the twelve nested writes accept one —
 * `PATCH /{game_id}` and `PATCH …/operatives/{row_id}`. KILLTEAM.md #79 moves it to
 * an `If-Match` header on all twelve. Routing every version through this function
 * means that migration is this function plus header support in `client.ts`, rather
 * than twelve call sites.
 *
 * It MUST NOT be written as a header before the backend declares one. Undeclared
 * parameters are ignored rather than rejected (backend `docs/api/conventions.md`),
 * so an `If-Match` sent today would be dropped in silence and every write would
 * apply blind — a guard that reads as wired up and protects nothing.
 *
 * `undefined` omits it, which the backend accepts as a blind write. A genuine race
 * still loses at flush, because the column is the row's SQLAlchemy `version_id_col`,
 * so a stale `UPDATE` matches zero rows and answers the same 409. Omitting the
 * version costs the better message, not the protection. */
function versioned<T extends object>(body: T, version?: number): T & { version?: number } {
  return version === undefined ? body : { ...body, version }
}

/** `GET /me/kill-team/games` — the caller's games, newest first (paged).
 *
 * The list row is `KTGame_ListRead`, which is deliberately not the snapshot: it
 * carries the team and faction names, status, turning point, phase and both scores,
 * and none of the operatives, rules or ploys. So a list of twenty games is twenty
 * short rows rather than twenty whole battles. */
export function listGames(params: PageParams = {}): Promise<Page<KTGame_ListRead>> {
  return apiGet(`/me/kill-team/games${toQueryString(params)}`, S.Page_KTGame_ListRead_)
}

/** `GET /me/kill-team/games/{id}` — one game whole, snapshot included.
 *
 * Fetch-once for the static half and re-read for the live half, which is the same
 * body — so this cannot be cached with `staleTime: Infinity` even though #24 says
 * the snapshot never invalidates. `useGame` explains how that is reconciled. */
export function getGame(gameId: UUID): Promise<KTGame_Read> {
  return apiGet(`/me/kill-team/games/${gameId}`, S.KTGame_Read)
}

/** `POST /me/kill-team/games` — start a battle from one of the caller's rosters.
 *
 * A roster that is not theirs is a 404, not a 403: the service writes the caller's
 * id and the composite foreign key refuses a stranger's roster, so an id reveals
 * nothing. Returns the game whole, so the screen needs no follow-up read. */
export function createGame(body: KTGame_Create): Promise<KTGame_Read> {
  return apiPost('/me/kill-team/games', S.KTGame_Read, body)
}

/** `PATCH /me/kill-team/games/{id}` — CP, VP, markers, the ploys spent.
 *
 * Not the turning point or the phase: those move through `advance`, which applies
 * what goes with the move. Sends `version` when given one; a 409 means re-read and
 * **re-decide**, never retry (#78) — the stale value is exactly the overwrite the
 * guard exists to stop. */
export function updateGame(
  gameId: UUID,
  body: GameUpdate,
  version?: number,
): Promise<KTGame_Read> {
  return apiPatch(`/me/kill-team/games/${gameId}`, S.KTGame_Read, versioned(body, version))
}

/** `DELETE /me/kill-team/games/{id}` — discard a battle. */
export function deleteGame(gameId: UUID): Promise<void> {
  return apiDelete(`/me/kill-team/games/${gameId}`)
}

/** `POST .../games/{id}/advance` — next phase, next turning point, or finish.
 *
 * The server decides which of the three this is and applies what follows: initiative
 * back to nobody for the new turning point's roll-off (#62), and **nothing at all**
 * for activations. Those are stamped with the turning point they happened in (#61),
 * so advancing makes them stale rather than clearing them. */
export function advanceGame(gameId: UUID): Promise<KTGame_Read> {
  return apiPost(`/me/kill-team/games/${gameId}/advance`, S.KTGame_Read)
}

/** `POST .../games/{id}/undo` — revert the newest change that still stands (#58).
 *
 * Returns the game whole rather than the compensating event, because an undo can
 * move anything — a wound, a turning point, a row that existed — and a client handed
 * only the event would have to know how to apply each kind. */
export function undoGame(gameId: UUID): Promise<KTGame_Read> {
  return apiPost(`/me/kill-team/games/${gameId}/undo`, S.KTGame_Read)
}

/** `POST .../games/{id}/ploys` — spend a ploy: record it and deduct its CP at once.
 *
 * The cost comes from the game's own snapshot, so a caller does not supply it and
 * cannot forget to. One operation because it is one event, which is also what lets
 * `undo` restore the CP and remove the entry together. */
export function useGamePloy(gameId: UUID, name: string): Promise<KTGame_Read> {
  return apiPost(`/me/kill-team/games/${gameId}/ploys`, S.KTGame_Read, { name })
}

/** `POST .../games/{id}/operatives` — field a datacard the battle produced (#18).
 *
 * Gellerpox's vermin, or a rule's grant. `source` records which, so the screen can
 * tell a roster operative from one the battle added. */
export function addGameOperative(
  gameId: UUID,
  operativeId: UUID,
  source: string,
): Promise<KTGameOperative_Read> {
  return apiPost(`/me/kill-team/games/${gameId}/operatives`, S.KTGameOperative_Read, {
    operative_id: operativeId,
    source,
  })
}

/** `PATCH .../operatives/{row_id}` — wounds, order, status, tokens, actions used.
 *
 * The state a client genuinely SETS (#63), all of it absolute (#7). Zero wounds takes
 * the operative out of the battle, and the service couples the two directions — so a
 * screen does not send `status` alongside a wound change to keep them agreeing.
 *
 * Addressed by the ROW's id, never the operative's: two rows can hold the same
 * datacard (#50), and a transform keeps the row's id while its card changes (#19). */
export function updateGameOperative(
  gameId: UUID,
  rowId: UUID,
  body: OperativeUpdate,
  version?: number,
): Promise<KTGameOperative_Read> {
  return apiPatch(
    `/me/kill-team/games/${gameId}/operatives/${rowId}`,
    S.KTGameOperative_Read,
    versioned(body, version),
  )
}

/** `POST .../operatives/{row_id}/activate` — mark it activated in THIS turning point.
 *
 * Takes no body: the server reads the turning point off the game (#61), so an
 * activation cannot be recorded in one that is not happening. A second activation in
 * the same turning point is a 400, which is bookkeeping rather than a rule the app
 * enforces (#1) — the copy MUST read that way. */
export function activateGameOperative(
  gameId: UUID,
  rowId: UUID,
): Promise<KTGameOperative_Read> {
  return apiPost(
    `/me/kill-team/games/${gameId}/operatives/${rowId}/activate`,
    S.KTGameOperative_Read,
  )
}

/** `POST .../operatives/{row_id}/transform` — one card becomes another, in place (#19).
 *
 * The same model on the table: the row keeps its id, tokens, actions used and
 * position, only the catalog pointer moves, and the datacard is re-snapshotted. How
 * many transforms a turning point allows is the players' to apply (#1). */
export function transformGameOperative(
  gameId: UUID,
  rowId: UUID,
  becomesOperativeId: UUID,
): Promise<KTGameOperative_Read> {
  return apiPost(
    `/me/kill-team/games/${gameId}/operatives/${rowId}/transform`,
    S.KTGameOperative_Read,
    { becomes_operative_id: becomesOperativeId },
  )
}

/** `POST .../games/{id}/equipment` — take a piece into this battle (#17).
 *
 * Its text is copied, so the screen reads the snapshot. The same piece twice is a
 * 409, which is integrity. The ALLOWANCE is NOT checked (#57): the detail read
 * reports `equipment_limit` and a fifth piece is accepted anyway, so a custom game
 * can be built — the screen SHOULD show the count against the limit and MUST NOT
 * block on it. */
export function addGameEquipment(
  gameId: UUID,
  equipmentId: UUID,
): Promise<KTGameEquipment_Read> {
  return apiPost(`/me/kill-team/games/${gameId}/equipment`, S.KTGameEquipment_Read, {
    equipment_id: equipmentId,
  })
}

/** `PATCH .../equipment/{row_id}` — reveal a piece.
 *
 * An operation, not a field set: it takes no body, and revealing can change what is
 * on the table (Gellerpox's vermin, #18). There is no un-reveal. */
export function revealGameEquipment(
  gameId: UUID,
  rowId: UUID,
): Promise<KTGameEquipment_Read> {
  return apiPatch(
    `/me/kill-team/games/${gameId}/equipment/${rowId}`,
    S.KTGameEquipment_Read,
  )
}

/** `DELETE .../equipment/{row_id}` — take a piece back out of the battle. */
export function removeGameEquipment(gameId: UUID, rowId: UUID): Promise<void> {
  return apiDelete(`/me/kill-team/games/${gameId}/equipment/${rowId}`)
}

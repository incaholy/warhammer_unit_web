/* Kill Team roster resource functions — the eight writes and reads under
 * `/me/kill-team/rosters`. See ROADMAP.md → KF3, and KILLTEAM.md #50, #52, #53,
 * #60, #64.
 *
 * User-owned, unlike the catalog: every one of these needs a token, and another
 * player's roster is a 404 rather than a 403, so an id reveals nothing.
 *
 * Separate from `killTeam.ts` because the two halves answer to different rules —
 * the catalog is read-only reference data (#21) and this is the half a player
 * writes. Keeping them apart is also what keeps the catalog module free of
 * mutations to review. */

import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type {
  KTRoster_Create,
  KTRoster_ListRead,
  KTRoster_Read,
  KTRoster_Update,
  KTRosterOperative_Read,
  Page,
  UUID,
} from './types'
import { toQueryString, type PageParams } from './paging'
import * as S from './schemas.gen'

/** `GET /me/kill-team/rosters` — the caller's rosters, newest first (paged).
 *
 * The list row carries `kill_team_name` and `faction_name` outright, unlike the
 * catalog's `KillTeam_Read` which carries only `faction_id` — so nothing here needs
 * the name lookup `KillTeamCatalogView` does. */
export function listRosters(params: PageParams = {}): Promise<Page<KTRoster_ListRead>> {
  return apiGet(`/me/kill-team/rosters${toQueryString(params)}`, S.Page_KTRoster_ListRead_)
}

/** `GET /me/kill-team/rosters/{id}` — one roster whole.
 *
 * Carries its operatives with their datacards, the team's rules, ploys and
 * equipment, and both universal lists (#52) — the pool a game will choose from. So
 * a roster screen needs no catalog request, the same property the team detail has. */
export function getRoster(rosterId: UUID): Promise<KTRoster_Read> {
  return apiGet(`/me/kill-team/rosters/${rosterId}`, S.KTRoster_Read)
}

/** `POST /me/kill-team/rosters` — start a roster for one kill team.
 *
 * The team is fixed at creation and not updatable: every operative is held to it by
 * a composite foreign key, so changing it later would mean emptying the roster.
 *
 * Answers 409 naming `name` if the player already has a roster by that name — unique
 * per OWNER, so two players may both have a "Raveners" (#64). The backend's message
 * is written for a person and carries no id, so it reaches the toast verbatim. */
export function createRoster(body: KTRoster_Create): Promise<KTRoster_Read> {
  return apiPost('/me/kill-team/rosters', S.KTRoster_Read, body)
}

/** `PATCH /me/kill-team/rosters/{id}` — rename, or change the description. */
export function updateRoster(rosterId: UUID, body: KTRoster_Update): Promise<KTRoster_Read> {
  return apiPatch(`/me/kill-team/rosters/${rosterId}`, S.KTRoster_Read, body)
}

/** `DELETE /me/kill-team/rosters/{id}` — refused once a game has been played from it.
 *
 * 409, with a message that counts the games (#60). Not a soft delete and not a
 * cascade: a game keeps the roster it was played from. */
export function deleteRoster(rosterId: UUID): Promise<void> {
  return apiDelete(`/me/kill-team/rosters/${rosterId}`)
}

/** `POST .../rosters/{id}/operatives` — field one more datacard.
 *
 * ONE operative per row, and the body says so: `operative_id` and nothing else, no
 * amount (#50). Adding the same datacard twice APPENDS a second row rather than
 * answering 409, because the question a player asks is "which of my two Warriors is
 * on 4 wounds?". The server assigns `position` one past the last, so an add appends.
 */
export function addRosterOperative(
  rosterId: UUID,
  operativeId: UUID,
): Promise<KTRosterOperative_Read> {
  return apiPost(
    `/me/kill-team/rosters/${rosterId}/operatives`,
    S.KTRosterOperative_Read,
    { operative_id: operativeId },
  )
}

/** `PATCH .../rosters/{id}/operatives/{row_id}` — move a row.
 *
 * Sets `position` ABSOLUTELY and shifts nothing (#53): values are neither contiguous
 * nor distinct, and every reader breaks a tie on `id`. So a caller that wants a
 * definite order swaps two rows' positions rather than nudging one — see
 * `useMoveRosterOperative`.
 *
 * Addressed by the ROW's own id, not by the operative's: two rows can hold the same
 * datacard (#50). */
export function moveRosterOperative(
  rosterId: UUID,
  rowId: UUID,
  position: number,
): Promise<KTRosterOperative_Read> {
  return apiPatch(
    `/me/kill-team/rosters/${rosterId}/operatives/${rowId}`,
    S.KTRosterOperative_Read,
    { position },
  )
}

/** `DELETE .../rosters/{id}/operatives/{row_id}` — take a row off the roster. */
export function removeRosterOperative(rosterId: UUID, rowId: UUID): Promise<void> {
  return apiDelete(`/me/kill-team/rosters/${rosterId}/operatives/${rowId}`)
}

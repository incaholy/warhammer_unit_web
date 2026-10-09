/* Kill Team catalog resource functions — the six reads under `/kill-team`.
 * See ROADMAP.md → KF2, and KILLTEAM.md decisions #11, #21, #47, #48.
 *
 * All six are PUBLIC: no `Authorization` header is required, because the catalog is
 * reference data. `apiGet` attaches a token when one is stored, which is harmless —
 * the point is that these work for a signed-out visitor.
 *
 * The catalog is READ-ONLY (#21). There is deliberately no create, update or delete
 * here, and none to write: no path under `/api/v1/kill-team` declares a method other
 * than `get` (#49). An admin edit would be undone by the next seed anyway. */

import { apiGet } from './client'
import type {
  KTOperative_ListRead,
  KillTeam_Detail,
  KillTeam_Read,
  KTFaction_Read,
  KTSelectionRule_Read,
  Page,
  Universal_Read,
  UUID,
} from './types'
import { toQueryString, type PageParams } from './paging'
import * as S from './schemas.gen'

/** `GET /kill-team/factions` — the Kill Team factions, alphabetically (paged).
 *
 * A flat list of their own: no Imperium/Chaos/Xenos tier and no link to the 40k
 * factions (#12). They come from the source's own navigation, so the rows are the
 * whole truth and there is no constant to publish. */
export function listKTFactions(params: PageParams = {}): Promise<Page<KTFaction_Read>> {
  return apiGet(`/kill-team/factions${toQueryString(params)}`, S.Page_KTFaction_Read_)
}

export interface ListKillTeamsParams extends PageParams {
  faction_id?: UUID
}

/** `GET /kill-team/teams` — the kill teams, alphabetically, optionally one faction's.
 *
 * Each row carries `faction_id` and NOT a faction name (#46), so a listing that
 * labels or groups by faction resolves the name itself from `listKTFactions`. */
export function listKillTeams(params: ListKillTeamsParams = {}): Promise<Page<KillTeam_Read>> {
  const { faction_id, ...page } = params
  const search = toQueryString(page)
  const qs = faction_id
    ? `${search ? `${search}&` : '?'}faction_id=${encodeURIComponent(faction_id)}`
    : search
  return apiGet(`/kill-team/teams${qs}`, S.Page_KillTeam_Read_)
}

/** `GET /kill-team/teams/{id}` — one team whole: its datacards, rules, ploys,
 * equipment and composition, nested (#47; 16–46 KB, median 24).
 *
 * Everything a team page shows arrives in this one request, which is why the detail
 * view needs no second call for the composition tab — `selection_rules` is here. */
export function getKillTeam(killTeamId: UUID): Promise<KillTeam_Detail> {
  return apiGet(`/kill-team/teams/${killTeamId}`, S.KillTeam_Detail)
}

/** `GET /kill-team/teams/{id}/composition` — the printed composition alone.
 *
 * Not used by the team page, which already has `selection_rules` from the detail
 * read. Kept because it is the cheap read for a client that wants the composition
 * without the datacards. */
export function listComposition(killTeamId: UUID): Promise<KTSelectionRule_Read[]> {
  return apiGet(`/kill-team/teams/${killTeamId}/composition`, S.KTSelectionRule_Read.array())
}

export interface ListKTOperativesParams extends PageParams {
  kill_team_id?: UUID
  keyword?: string
}

/** `GET /kill-team/operatives` — datacards across teams, optionally filtered.
 *
 * The cross-team view the nested form cannot give ("every operative with LEADER").
 * Ordered by team then printed position, and each card arrives with its weapons and
 * abilities, so a row is a whole datasheet rather than a name. */
export function listKTOperatives(
  params: ListKTOperativesParams = {},
): Promise<Page<KTOperative_ListRead>> {
  const { kill_team_id, keyword, ...page } = params
  const search = new URLSearchParams()
  if (page.limit !== undefined) search.set('limit', String(page.limit))
  if (page.offset !== undefined) search.set('offset', String(page.offset))
  if (kill_team_id) search.set('kill_team_id', kill_team_id)
  if (keyword) search.set('keyword', keyword)
  const qs = search.toString()
  return apiGet(
    `/kill-team/operatives${qs ? `?${qs}` : ''}`,
    S.Page_KTOperative_ListRead_,
  )
}

/** `GET /kill-team/universal` — the ploys and equipment that belong to no team.
 *
 * One route for both lists, and unpaged: there are a handful of rows. Meant to be
 * fetched once and kept for the session (#48). */
export function getUniversal(): Promise<Universal_Read> {
  return apiGet('/kill-team/universal', S.Universal_Read)
}

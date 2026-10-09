/* Query hooks for the Kill Team catalog. See ROADMAP.md → KF2.
 *
 * A file of its own rather than more of `queries.ts`, which already holds every hook
 * for every resource at ~290 lines. Lint allows it: the rule that matters bans
 * `@tanstack/react-query` inside `src/views/` and `src/ui/`, not a second module
 * here, and keeping Kill Team's keys beside its hooks is what stops the monolith
 * growing a fifth resource's worth of keys.
 *
 * Read-only throughout. The catalog has no write routes (KILLTEAM.md #21), so there
 * are no mutations here and nothing to invalidate. */

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import * as killTeamApi from './killTeam'
import type { ListKillTeamsParams, ListKTOperativesParams } from './killTeam'
import type {
  KillTeam_Detail,
  KillTeam_Read,
  KTFaction_Read,
  KTOperative_ListRead,
  Page,
  Universal_Read,
  UUID,
} from './types'
import { fetchAllPages } from './paging'

/** `[resource, kind, ...]`, the shape `queries.ts` established — the explicit
 *  `list`/`detail` segment is what lets a prefix invalidate in both directions. */
export const killTeamKeys = {
  /** Prefix matching every Kill Team catalog query. */
  all: ['killTeam'] as const,
  factions: ['killTeam', 'factions', 'list'] as const,
  /** Prefix matching every team LIST, whatever its filters. */
  allTeamLists: ['killTeam', 'teams', 'list'] as const,
  teams: (filters: ListKillTeamsParams = {}) => ['killTeam', 'teams', 'list', filters] as const,
  team: (id: UUID) => ['killTeam', 'teams', 'detail', id] as const,
  /** Prefix matching every operative LIST, whatever its filters. */
  allOperativeLists: ['killTeam', 'operatives', 'list'] as const,
  operatives: (filters: ListKTOperativesParams = {}) =>
    ['killTeam', 'operatives', 'list', filters] as const,
  universal: ['killTeam', 'universal'] as const,
}

/** The Kill Team factions, fetched COMPLETE.
 *
 * Fetched whole rather than paged, like the 40k factions: the list is bounded (22
 * rows) and its consumer is a filter and a `Map<UUID, string>` for resolving a
 * team's faction name (#46), both of which need the whole set to be correct. */
export function useKTFactions(): UseQueryResult<Page<KTFaction_Read>> {
  return useQuery({
    queryKey: killTeamKeys.factions,
    queryFn: () => fetchAllPages(killTeamApi.listKTFactions),
  })
}

/** Kill teams, PAGED.
 *
 * Paged rather than fetched whole, following the split `paging.ts` already draws: a
 * shared catalog is paged, a user's own collection is fetched complete. The rule is
 * about ownership rather than size — 48 teams would fit in one request.
 */
export function useKillTeams(params: ListKillTeamsParams = {}): UseQueryResult<Page<KillTeam_Read>> {
  return useQuery({
    queryKey: killTeamKeys.teams(params),
    queryFn: () => killTeamApi.listKillTeams(params),
  })
}

/** One team whole. Carries its own composition, so a team page needs nothing else. */
export function useKillTeam(killTeamId: UUID): UseQueryResult<KillTeam_Detail> {
  return useQuery({
    queryKey: killTeamKeys.team(killTeamId),
    queryFn: () => killTeamApi.getKillTeam(killTeamId),
    enabled: Boolean(killTeamId),
  })
}

/** Datacards across teams, PAGED — the largest collection the catalog serves. */
export function useKTOperatives(
  params: ListKTOperativesParams = {},
): UseQueryResult<Page<KTOperative_ListRead>> {
  return useQuery({
    queryKey: killTeamKeys.operatives(params),
    queryFn: () => killTeamApi.listKTOperatives(params),
  })
}

/** The ploys and equipment no team owns. Fetch once, keep for the session (#48). */
export function useUniversal(): UseQueryResult<Universal_Read> {
  return useQuery({
    queryKey: killTeamKeys.universal,
    queryFn: () => killTeamApi.getUniversal(),
    staleTime: Infinity,
  })
}

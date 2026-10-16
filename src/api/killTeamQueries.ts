/* Query hooks for the Kill Team catalog. See ROADMAP.md → KF2.
 *
 * A file of its own rather than more of `queries.ts`, which already holds every hook
 * for every resource at ~290 lines. Lint allows it: the rule that matters bans
 * `@tanstack/react-query` inside `src/views/` and `src/ui/`, not a second module
 * here, and keeping Kill Team's keys beside its hooks is what stops the monolith
 * growing a fifth resource's worth of keys.
 *
 * Two halves, which is why the file is worth keeping together. The CATALOG hooks
 * are read-only and always will be: no path under `/api/v1/kill-team` declares a
 * method other than `get` (KILLTEAM.md #21, #49), so there is nothing to invalidate
 * and no mutation to review. The ROSTER hooks below are the half a player writes. */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import * as killTeamApi from './killTeam'
import * as rostersApi from './killTeamRosters'
import type { ListKillTeamsParams, ListKTOperativesParams } from './killTeam'
import type {
  KillTeam_Detail,
  KillTeam_Read,
  KTFaction_Read,
  KTOperative_ListRead,
  KTRoster_Create,
  KTRoster_ListRead,
  KTRoster_Read,
  KTRoster_Update,
  KTRosterOperative_Read,
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
  allTeams: ['killTeam', 'teams', 'list', 'all'] as const,
  team: (id: UUID) => ['killTeam', 'teams', 'detail', id] as const,
  /** Prefix matching every operative LIST, whatever its filters. */
  allOperativeLists: ['killTeam', 'operatives', 'list'] as const,
  operatives: (filters: ListKTOperativesParams = {}) =>
    ['killTeam', 'operatives', 'list', filters] as const,
  universal: ['killTeam', 'universal'] as const,
  /** Prefix matching every roster query — the list and every detail. */
  allRosters: ['killTeam', 'rosters'] as const,
  rosters: ['killTeam', 'rosters', 'list'] as const,
  roster: (id: UUID) => ['killTeam', 'rosters', 'detail', id] as const,
}

/** The Kill Team factions, fetched COMPLETE.
 *
 * Fetched whole rather than paged, like the 40k factions: the list is bounded (22
 * rows) and its consumer is a filter and a `Map<UUID, string>` for resolving a
 * team's faction name (#46), both of which need the whole set to be correct. */
export function useKTFactions(enabled = true): UseQueryResult<Page<KTFaction_Read>> {
  return useQuery({
    queryKey: killTeamKeys.factions,
    queryFn: () => fetchAllPages(killTeamApi.listKTFactions),
    enabled,
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

/** EVERY kill team, fetched complete — for a picker rather than for browsing.
 *
 * The browse list above is paged, which is the right shape for a page of rows the
 * reader scrolls. A picker is the other case: a dropdown that offered the first 25
 * of 48 teams would simply be missing half of them, and the player cannot page a
 * `<select>`. So this is the one catalog read that goes whole, and it is a separate
 * hook rather than a flag so that the two intents keep their own cache entries.
 */
export function useAllKillTeams(enabled = true): UseQueryResult<Page<KillTeam_Read>> {
  return useQuery({
    queryKey: killTeamKeys.allTeams,
    queryFn: () => fetchAllPages(killTeamApi.listKillTeams),
    // `enabled` because a picker's data belongs to a dialog: `Modal` stays MOUNTED
    // while closed so it can restore focus, so its hooks run on every render of the
    // page behind it. Without this the roster list fetched 48 teams and 22 factions
    // for a dialog the player may never open.
    enabled,
  })
}

/** One team whole. Carries its own composition, so a team page needs nothing else. */
export function useKillTeam(
  killTeamId: UUID,
  /** Gated so a caller that only MIGHT need the team does not fetch it. KF4g opens the
   *  equipment, add-operative and transform pickers from this read, each behind its own
   *  disclosure, so the battle screen stays true to "renders without the catalog". */
  enabled = true,
): UseQueryResult<KillTeam_Detail> {
  return useQuery({
    queryKey: killTeamKeys.team(killTeamId),
    queryFn: () => killTeamApi.getKillTeam(killTeamId),
    // Cached for the session, like `useUniversal`. Not an optimisation but a statement
    // of fact: the Kill Team catalog has NO write route at all (#21), and #49 proves it
    // with a test asserting no path under `/api/v1/kill-team` declares any method but
    // `get`. So a team's datacards, rules, ploys and equipment cannot change while the
    // app is open, and re-reading them is work with no possible result.
    //
    // It matters most where this is read as a POOL rather than as a page: KF4g opens
    // the equipment, add-operative and transform pickers from it, so without this a
    // battle would re-read 16-46 KB (median 24, measured over all 48 teams in #52)
    // every time a player opened one of them.
    staleTime: Infinity,
    enabled: enabled && Boolean(killTeamId),
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
export function useUniversal(enabled = true): UseQueryResult<Universal_Read> {
  return useQuery({
    queryKey: killTeamKeys.universal,
    queryFn: () => killTeamApi.getUniversal(),
    staleTime: Infinity,
    enabled,
  })
}

// ---- Rosters: the half a player writes (ROADMAP KF3) ----

/** The caller's rosters, fetched COMPLETE.
 *
 * User-scoped, so whole rather than paged — the split `paging.ts` draws, and a
 * player has a handful. */
export function useRosters(): UseQueryResult<Page<KTRoster_ListRead>> {
  return useQuery({
    queryKey: killTeamKeys.rosters,
    queryFn: () => fetchAllPages(rostersApi.listRosters),
  })
}

/** One roster whole: its rows with their datacards, plus the team's reference and
 *  both universal lists (#52). One request for the entire screen. */
export function useRoster(rosterId: UUID): UseQueryResult<KTRoster_Read> {
  return useQuery({
    queryKey: killTeamKeys.roster(rosterId),
    queryFn: () => rostersApi.getRoster(rosterId),
    enabled: Boolean(rosterId),
  })
}

export function useCreateRoster(): UseMutationResult<KTRoster_Read, Error, KTRoster_Create> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KTRoster_Create) => rostersApi.createRoster(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: killTeamKeys.rosters })
    },
    meta: { successMessage: 'Roster created' },
  })
}

export function useUpdateRoster(
  rosterId: UUID,
): UseMutationResult<KTRoster_Read, Error, KTRoster_Update> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KTRoster_Update) => rostersApi.updateRoster(rosterId, body),
    onSuccess: () => {
      // Both: a rename changes the detail AND the row in the list.
      qc.invalidateQueries({ queryKey: killTeamKeys.allRosters })
    },
    meta: { successMessage: 'Roster saved' },
  })
}

export function useDeleteRoster(): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rosterId: UUID) => rostersApi.deleteRoster(rosterId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: killTeamKeys.allRosters })
    },
    meta: { successMessage: 'Roster deleted' },
    // No `onError`: a 409 here means a game was played from it (#60), and the
    // backend's message counts the games and carries no id, so the central toast
    // shows it verbatim. Nothing to word here.
  })
}

export function useAddRosterOperative(
  rosterId: UUID,
): UseMutationResult<KTRosterOperative_Read, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (operativeId: UUID) => rostersApi.addRosterOperative(rosterId, operativeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: killTeamKeys.roster(rosterId) })
    },
    meta: {
      successMessage: 'Operative added',
      // The one Kill Team write whose failure needs copy written here. The backend
      // refuses a withdrawn or cross-team datacard with `operative {uuid} is no
      // longer in the catalog` — and that message EMBEDS AN ID, so `messageForError`
      // rightly refuses to show it and falls back to `CODE_MESSAGES.NOT_FOUND`,
      // which is the bare string "Not found."
      //
      // Reachable: the picker never offers a withdrawn row (#55), but a page left
      // open while the catalog is re-seeded has a stale one, and "+ Add" then says
      // "Not found." about a card the player can see. Every other roster failure
      // arrives as prose written for a person, which is why only this one is worded.
      errorMessage: 'That datacard is no longer in the catalog. Reload to see what is.',
    },
  })
}

export function useRemoveRosterOperative(
  rosterId: UUID,
): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rowId: UUID) => rostersApi.removeRosterOperative(rosterId, rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: killTeamKeys.roster(rosterId) })
    },
    meta: { successMessage: 'Operative removed' },
  })
}

/** Swap two rows' positions, which is how a roster is reordered.
 *
 * A SWAP rather than one nudge, because `PATCH position` sets the value absolutely
 * and shifts nothing (#53). Giving a row its neighbour's position alone would leave
 * the two tied, and a tie is broken by `id` — so the player would see an order they
 * did not choose, about half the time. Swapping leaves no tie to break.
 *
 * Two requests, sequential and not concurrent: both write `position` on the same
 * roster, and the second has to read the first's target value, which the caller has
 * already computed. Invalidated on `onSettled` rather than `onSuccess` precisely
 * because of the partial failure — if the second PATCH fails the two rows really do
 * share a position, and the screen must show that rather than the order it hoped for.
 */
export function useMoveRosterOperative(
  rosterId: UUID,
): UseMutationResult<void, Error, { row: KTRosterOperative_Read; swapWith: KTRosterOperative_Read }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ row, swapWith }) => {
      await rostersApi.moveRosterOperative(rosterId, row.id, swapWith.position)
      await rostersApi.moveRosterOperative(rosterId, swapWith.id, row.position)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: killTeamKeys.roster(rosterId) })
    },
    meta: { successMessage: 'Order saved' },
  })
}

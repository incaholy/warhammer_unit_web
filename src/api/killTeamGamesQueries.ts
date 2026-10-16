/* Query hooks for a Kill Team game — the live battle. See ROADMAP.md → KF4.
 *
 * A third Kill Team module rather than more of `killTeamQueries.ts`, which already
 * holds the catalog's read-only hooks beside the rosters' writes. The reason is the
 * same one that split the rosters off the catalog: these hooks answer to a different
 * rule. Every one of them can fail with a 409 that means the screen is stale, and
 * `afterGameWrite` below is the shared answer to it — a thing none of the roster
 * hooks need and none of the catalog hooks can have.
 *
 * The keys still nest under the `killTeam` root, so `killTeamKeys.all` keeps matching
 * every Kill Team query including these. */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import * as gamesApi from './killTeamGames'
import type { GameUpdate, OperativeUpdate } from './killTeamGames'
import { isStaleVersion } from '../lib/errors'
import type {
  KTGame_Create,
  KTGame_ListRead,
  KTGame_Read,
  KTGameEquipment_Read,
  KTGameOperative_Read,
  Page,
  UUID,
} from './types'

/** `[resource, kind, ...]`, the shape `queries.ts` established. */
export const killTeamGameKeys = {
  /** Prefix matching every game query — the list and every detail. */
  allGames: ['killTeam', 'games'] as const,
  games: ['killTeam', 'games', 'list'] as const,
  game: (id: UUID) => ['killTeam', 'games', 'detail', id] as const,
}

/** What a game write does to the cache, including when it loses a race.
 *
 * Two halves, and the second is the whole reason this file exists:
 *
 * **On success**, invalidate at the given breadth. Not every write touches the list:
 * `KTGame_ListRead` carries status, turning point, phase and both scores, so
 * `updateGame`, `advance` and `undo` change a row in it while an operative's wounds
 * do not. A row-level write therefore invalidates the detail alone.
 *
 * **On a stale 409**, re-read the game — unconditionally, whatever the write was.
 * KILLTEAM.md #78 is that a 409 means re-read and re-DECIDE, never retry, and #9 is
 * that EVERY mutation moves the version, including a write to a child row. Put
 * together, a 409 is proof that the screen is rendering state that no longer exists,
 * so refusing the write without refreshing would leave the player deciding against
 * the same stale numbers. The toast says what happened (`lib/errors.ts`
 * `STALE_VERSION`); this makes the screen agree with it.
 *
 * What it deliberately does NOT do is retry. The write that lost is exactly the
 * overwrite the guard exists to stop, so re-sending it is the bug, not the fix. */
/** The scope every GAME-level write shares, so they run one at a time.
 *
 * React Query runs mutations with the same `scope.id` serially. That is what makes
 * `versionFrom` below sound: when a write's `mutationFn` runs, no earlier game write of
 * ours is still unacknowledged, so the cache holds everything the player has caused.
 *
 * Only the game-level writes. The row writes keep their own debounce and must not queue
 * behind a scoreboard edit -- a wounds tap that waited on someone else's request would
 * feel broken at a table. The cost is stated on `versionFrom`. */
function gameScope(gameId: UUID) {
  return { id: `kt-game-${gameId}` }
}

/** The version to assert, read at SEND time rather than captured at `mutate()` time.
 *
 * This revises the reasoning `useUpdateGame` carried in KF4a, which argued the version
 * must be the one the PLAYER SAW. That protects a narrow case -- a refetch landing
 * between the render a player read and the tap they made -- at the cost of a guaranteed
 * one: with the version captured at `mutate()` time, a second edit inside one
 * round-trip asserts a version the player's own first edit has already moved, so the
 * screen says "Someone changed this game since you loaded it" about nobody.
 *
 * With `gameScope` serialising the writes and `applyGame` putting each response
 * straight into the cache, the freshest cached version IS everything this player has
 * caused and been shown. So a mismatch means somebody else moved, which is exactly what
 * the 409 is for.
 *
 * The residual, stated rather than hidden: a write to a ROW (wounds, tokens, equipment)
 * also moves the game's version (#9) and answers a row, so it cannot refresh the cache.
 * Editing an operative and then the scoreboard inside one round-trip therefore still
 * asserts a stale version and still 409s falsely. It is self-healing -- the handler
 * re-reads -- and it closes for good when a write response carries the new version, the
 * `ETag` noted on ROADMAP KF4. */
function versionFrom(qc: QueryClient, gameId: UUID): number | undefined {
  return qc.getQueryData<KTGame_Read>(killTeamGameKeys.game(gameId))?.version
}

/** Apply a write's own answer to the cache instead of re-reading the game.
 *
 * Only for the writes whose response IS `KTGame_Read` -- create, the game `PATCH`,
 * `advance`, `undo` and `use_ploy`. The shape match is the precondition, not
 * convenience: the operative and equipment writes answer a ROW, so they cannot do this
 * and keep `afterGameWrite`.
 *
 * Safe to write straight in, for three reasons that were each checked rather than
 * assumed. The backend sets no `response_model_exclude_*`, so the body is a complete
 * `KTGame_Read`. `apiPatch`/`apiPost` require a zod schema and parse before resolving,
 * so what arrives here is already validated. And `version` is bumped at exactly one
 * site (`_write`), through which every event passes, so it is strictly monotonic.
 *
 * That last fact is what the guard rests on: an out-of-order response from an earlier
 * write always carries a LOWER version, so `>` is exact rather than a heuristic. If
 * `version` were ever reset, reused, or bumped somewhere other than `_write`, this would
 * start silently dropping good writes.
 *
 * What it does NOT do is skip the list. `KTGame_ListRead` is a different shape -- status,
 * turning point, phase and both scores -- so the list is still invalidated. */
function applyGame(qc: QueryClient, game: KTGame_Read) {
  qc.setQueryData<KTGame_Read>(killTeamGameKeys.game(game.id), (cached) =>
    cached && cached.version > game.version ? cached : game,
  )
  qc.invalidateQueries({ queryKey: killTeamGameKeys.games })
}

/** What a game-level write does to the cache: apply the answer, re-read on a stale 409. */
function afterGameRead(qc: QueryClient, gameId: UUID) {
  return {
    scope: gameScope(gameId),
    onSuccess: (game: KTGame_Read) => {
      applyGame(qc, game)
    },
    onError: (err: Error) => {
      if (isStaleVersion(err)) qc.invalidateQueries({ queryKey: killTeamGameKeys.game(gameId) })
    },
  }
}

function afterGameWrite(qc: QueryClient, gameId: UUID, breadth: readonly unknown[]) {
  return {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: breadth })
    },
    onError: (err: Error) => {
      if (isStaleVersion(err)) qc.invalidateQueries({ queryKey: killTeamGameKeys.game(gameId) })
    },
  }
}

/** The caller's games, newest first (paged).
 *
 * Paged rather than fetched complete, unlike the rosters: nothing aggregates over
 * every game a player has ever played, so a page is the right shape and the list
 * grows without bound. */
export function useGames(): UseQueryResult<Page<KTGame_ListRead>> {
  return useQuery({
    queryKey: killTeamGameKeys.games,
    queryFn: () => gamesApi.listGames(),
  })
}

/** One game whole: the static snapshot and the live state, in one body.
 *
 * **No `staleTime`, deliberately.** #24 says the snapshot never invalidates, which
 * invites `staleTime: Infinity` — and it would be wrong, because the snapshot is not
 * a separate response. `KTGame_Read` carries the datacards AND the wounds, the CP, the
 * turning point and the scores, so caching it forever caches the live half forever
 * too. What #22 and #24 actually buy is that the screen makes no CATALOG request,
 * ever; they say nothing about re-reading the game itself.
 *
 * The cost of re-fetching the snapshot on every refetch is real and is the one worth
 * paying: the alternative is a phone at a table showing wounds from five minutes ago. */
export function useGame(gameId: UUID): UseQueryResult<KTGame_Read> {
  return useQuery({
    queryKey: killTeamGameKeys.game(gameId),
    queryFn: () => gamesApi.getGame(gameId),
    enabled: Boolean(gameId),
    // Keep the cache MONOTONIC whoever writes it. `applyGame` guards the mutation
    // path; this guards the query path, which is the one a refetch or a poll uses. A
    // GET issued before a write and landing after it would otherwise regress the cache
    // to an older version -- and since `versionFrom` reads that cache, the regression
    // would be asserted on the next write and 409 falsely.
    //
    // This matters more once two clients converge by polling (KILLTEAM.md #72, K9):
    // every 3 seconds is another chance for a read to land out of order. Guarding here
    // rather than there means the rule holds before that code exists.
    structuralSharing: (cached, incoming) => {
      const before = cached as KTGame_Read | undefined
      const after = incoming as KTGame_Read
      return before && before.version > after.version ? before : after
    },
  })
}

/** Start a battle from one of the caller's rosters. */
export function useCreateGame(): UseMutationResult<KTGame_Read, Error, KTGame_Create> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KTGame_Create) => gamesApi.createGame(body),
    // Seeds the detail cache from the response, so navigating straight into the new
    // battle renders it with NO request at all. No `scope`: there is no game id to
    // scope by until this resolves, and nothing of ours can be racing a game that did
    // not exist a moment ago.
    onSuccess: (game) => {
      applyGame(qc, game)
    },
    meta: { successMessage: 'Battle started' },
  })
}

/** CP, VP, markers, the ploys spent — and the version the caller read.
 *
 * `version` is a variable rather than something the hook reads out of the cache,
 * which mirrors `useMoveRosterOperative`: a hook whose variables carry server-read
 * values has the caller compute them. Here it matters more than ergonomics, because
 * the version that belongs in the write is the one the PLAYER SAW when they decided,
 * not the freshest one the cache happens to hold. Reading it here would defeat the
 * guard by always sending a current value. */
export function useUpdateGame(
  gameId: UUID,
): UseMutationResult<KTGame_Read, Error, GameUpdate> {
  const qc = useQueryClient()
  return useMutation({
    // The version is NOT a variable. `versionFrom` reads it at send time, which is what
    // makes a rapid second edit assert the version the first one produced rather than
    // the one the screen happened to be showing when it was tapped.
    mutationFn: (body: GameUpdate) => gamesApi.updateGame(gameId, body, versionFrom(qc, gameId)),
    ...afterGameRead(qc, gameId),
  })
}

/** Discard a battle. */
export function useDeleteGame(): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (gameId: UUID) => gamesApi.deleteGame(gameId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: killTeamGameKeys.allGames })
    },
    meta: { successMessage: 'Battle deleted' },
  })
}

/** Next phase, next turning point, or finish — the server decides which.
 *
 * No success toast: the screen's own turning point and phase are the feedback, and a
 * toast on the most-pressed control at the table is noise. */
export function useAdvanceGame(gameId: UUID): UseMutationResult<KTGame_Read, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => gamesApi.advanceGame(gameId),
    ...afterGameRead(qc, gameId),
  })
}

/** Revert the newest change that still stands (#58).
 *
 * Broad invalidation because an undo can move anything — a wound, a turning point, a
 * row that existed — so narrowing it would mean predicting what was undone. */
export function useUndoGame(gameId: UUID): UseMutationResult<KTGame_Read, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => gamesApi.undoGame(gameId),
    ...afterGameRead(qc, gameId),
    meta: { successMessage: 'Undone' },
  })
}

/** Spend a ploy: recorded and its CP deducted in one operation.
 *
 * Detail only — CP is not a column in `KTGame_ListRead`. */
export function useUseGamePloy(gameId: UUID): UseMutationResult<KTGame_Read, Error, string> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => gamesApi.useGamePloy(gameId, name),
    ...afterGameRead(qc, gameId),
    meta: { successMessage: 'Ploy used' },
  })
}

/** Field a datacard the battle produced (#18). */
export function useAddGameOperative(
  gameId: UUID,
): UseMutationResult<KTGameOperative_Read, Error, { operativeId: UUID; source: string }> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ operativeId, source }) =>
      gamesApi.addGameOperative(gameId, operativeId, source),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
    meta: { successMessage: 'Operative added' },
  })
}

/** Wounds, order, status, tokens, actions used — all absolute (#7).
 *
 * No success toast: this is the write a player makes most, and the number changing on
 * the card is better feedback than a toast stack. */
export function useUpdateGameOperative(
  gameId: UUID,
): UseMutationResult<
  KTGameOperative_Read,
  Error,
  { rowId: UUID; body: OperativeUpdate; version?: number }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rowId, body, version }) =>
      gamesApi.updateGameOperative(gameId, rowId, body, version),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
  })
}

/** Mark an operative activated in the game's CURRENT turning point (#61). */
export function useActivateGameOperative(
  gameId: UUID,
): UseMutationResult<KTGameOperative_Read, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rowId: UUID) => gamesApi.activateGameOperative(gameId, rowId),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
  })
}

/** One card becomes another, in place (#19). */
export function useTransformGameOperative(
  gameId: UUID,
): UseMutationResult<
  KTGameOperative_Read,
  Error,
  { rowId: UUID; becomesOperativeId: UUID }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ rowId, becomesOperativeId }) =>
      gamesApi.transformGameOperative(gameId, rowId, becomesOperativeId),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
    meta: { successMessage: 'Operative transformed' },
  })
}

/** Take a piece of equipment into this battle (#17). */
export function useAddGameEquipment(
  gameId: UUID,
): UseMutationResult<KTGameEquipment_Read, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (equipmentId: UUID) => gamesApi.addGameEquipment(gameId, equipmentId),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
    meta: { successMessage: 'Equipment added' },
  })
}

/** Reveal a piece of equipment, which can change what is on the table (#18). */
export function useRevealGameEquipment(
  gameId: UUID,
): UseMutationResult<KTGameEquipment_Read, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rowId: UUID) => gamesApi.revealGameEquipment(gameId, rowId),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
    meta: { successMessage: 'Equipment revealed' },
  })
}

/** Take a piece of equipment back out of the battle. */
export function useRemoveGameEquipment(
  gameId: UUID,
): UseMutationResult<void, Error, UUID> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rowId: UUID) => gamesApi.removeGameEquipment(gameId, rowId),
    ...afterGameWrite(qc, gameId, killTeamGameKeys.game(gameId)),
    meta: { successMessage: 'Equipment removed' },
  })
}

/* Hook tests for the game slice. The suite normally exercises hooks through a view;
 * these hooks get their own file for the reason `killTeamQueries.test.tsx` gives, and
 * one more that is specific to KF4.
 *
 * `afterGameWrite` is the only piece of real logic in this layer, and the behaviour
 * that matters is a NON-event from the view's side: a 409 whose `field` is `version`
 * re-reads the game, and a 409 that is a duplicate does not. No view assertion can
 * tell those apart, because both end with a toast and an unchanged screen.
 *
 * These also arrive before any view consumes them, so without this file they ship
 * unexercised. */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  killTeamGameKeys,
  useAdvanceGame,
  useCreateGame,
  useGame,
  useUpdateGame,
  useUpdateGameOperative,
  useUseGamePloy,
} from './killTeamGamesQueries'
import { killTeamKeys } from './killTeamQueries'
import { jsonResponse, makeKTGame, makeKTGameOperative } from '../test/fixtures'
import type { KTGame_Read } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
})

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** A fresh `Response` per call: one instance cannot have its body read twice, and
 *  `mockResolvedValue` hands back the same one (the gotcha `killTeamQueries.test.tsx`
 *  documents). */
function stubGame() {
  const seen: string[] = []
  const fetchMock = vi.fn(async (url: string | URL) => {
    seen.push(String(url))
    return jsonResponse(makeKTGame())
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, seen }
}

/** A non-2xx in the one shape every backend error carries (R9). */
function stubError(status: number, code: string, field: string | null) {
  const fetchMock = vi.fn(async () =>
    jsonResponse(
      { detail: 'a message', code, field, request_id: 'rq-1' },
      { status },
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('killTeamGameKeys', () => {
  it('nests a game detail under the games prefix, so a prefix invalidates both ways', () => {
    expect(killTeamGameKeys.allGames).toEqual(['killTeam', 'games'])
    expect(killTeamGameKeys.games).toEqual(['killTeam', 'games', 'list'])
    expect(killTeamGameKeys.game('ktg-1')).toEqual(['killTeam', 'games', 'detail', 'ktg-1'])
  })

  it('stays under the killTeam root, so killTeamKeys.all still matches a game', () => {
    // The keys live in a second file; a different root would silently exclude games
    // from the one prefix that is meant to match every Kill Team query.
    expect(killTeamGameKeys.allGames.slice(0, 1)).toEqual(killTeamKeys.all)
  })
})

describe('useGame', () => {
  it('reads the whole snapshot in ONE request, with no catalog call', async () => {
    const { seen } = stubGame()
    const { result } = renderHook(() => useGame('ktg-1'), { wrapper: wrapper(freshClient()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // #22 and #24: the datacards, rules and ploys travel with the game, so the screen
    // never asks `/api/v1/kill-team/*` for anything. Asserting the WHOLE list of urls
    // is what makes that falsifiable -- a count of one plus a check of the first would
    // pass a stub that also called the catalog.
    expect(seen).toEqual(['/api/v1/me/kill-team/games/ktg-1'])
    expect(result.current.data?.operatives[0].weapons.length).toBeGreaterThan(0)
  })

  it('is stale as soon as it resolves, because the live state shares the body', async () => {
    stubGame()
    const { result } = renderHook(() => useGame('ktg-1'), { wrapper: wrapper(freshClient()) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The tempting read of #24 ("the snapshot never invalidates") is
    // `staleTime: Infinity`. It would be wrong: `KTGame_Read` carries the wounds, the
    // CP and the turning point in the SAME body as the datacards, so caching it
    // forever caches the live half forever. This pins that choice.
    expect(result.current.isStale).toBe(true)
  })

  it('does not fire without an id', () => {
    const { seen } = stubGame()
    renderHook(() => useGame(''), { wrapper: wrapper(freshClient()) })
    expect(seen).toEqual([])
  })
})

describe('afterGameWrite: what a 409 does', () => {
  it('re-reads the game when a write loses on `version`', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    stubError(409, 'CONFLICT', 'version')

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isError).toBe(true))

    // #78: a 409 is proof the screen is rendering state that no longer exists, so the
    // player MUST be shown the real state before deciding again. Refusing the write
    // without refreshing would leave them re-deciding against the same stale numbers.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: killTeamGameKeys.game('ktg-1') })
  })

  it('does NOT re-read when the 409 is an ordinary duplicate', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    // CONFLICT is three situations, and `field` is the only thing separating them
    // (backend `docs/api/conventions.md`). Taking the same piece of equipment twice
    // is a duplicate: the screen is not stale and a re-read would be noise.
    stubError(409, 'CONFLICT', 'equipment_id')

    const { result } = renderHook(() => useUseGamePloy('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate('Sudden Surge')
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does NOT re-read on a 400, which is bookkeeping rather than staleness', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    // A second activation in one turning point, or wounds past the maximum (#1). The
    // screen is correct; the input was not.
    stubError(400, 'VALIDATION', 'current_wounds')

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(invalidate).not.toHaveBeenCalled()
  })
})

describe('a game-level write applies its own answer (KF4f)', () => {
  /** A write that answers the whole game, at a version the caller chooses. */
  function stubWrite(version: number) {
    const seen: { url: string; method: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(url),
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return jsonResponse(makeKTGame({ version, command_points: version }))
    })
    vi.stubGlobal('fetch', fetchMock)
    return seen
  }

  it('puts the response in the cache instead of re-reading the game', async () => {
    const qc = freshClient()
    const seen = stubWrite(8)

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The whole point: the detail is up to date WITHOUT a GET. Before this, the screen
    // showed the pre-write values for a full round-trip.
    expect(qc.getQueryData<KTGame_Read>(killTeamGameKeys.game('ktg-1'))?.version).toBe(8)
    expect(seen.filter((c) => c.method === 'GET')).toEqual([])
  })

  it('still invalidates the LIST, which is a different shape', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    stubWrite(8)

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // `KTGame_ListRead` carries status, turning point, phase and both scores, and the
    // response is not that shape -- so the row still has to be re-read.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: killTeamGameKeys.games })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: killTeamGameKeys.game('ktg-1') })
  })

  it('refuses a response that is OLDER than what the cache holds', async () => {
    const qc = freshClient()
    qc.setQueryData(killTeamGameKeys.game('ktg-1'), makeKTGame({ version: 9, command_points: 9 }))
    stubWrite(7)

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Two writes can resolve out of order. `version` is bumped at exactly one site in
    // the service, so an earlier write's answer always carries a lower number -- which
    // makes `>` exact rather than a guess.
    expect(qc.getQueryData<KTGame_Read>(killTeamGameKeys.game('ktg-1'))?.version).toBe(9)
  })

  it('asserts the version the cache holds, not one captured at tap time', async () => {
    const qc = freshClient()
    qc.setQueryData(killTeamGameKeys.game('ktg-1'), makeKTGame({ version: 11 }))
    const seen = stubWrite(12)

    const { result } = renderHook(() => useUpdateGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate({ command_points: 3 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // `versionFrom` reads at SEND time. With the writes serialised and each response
    // applied, the freshest cached version is everything this player has caused -- so a
    // mismatch means somebody else moved, which is what the 409 is for.
    expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
      command_points: 3,
      version: 11,
    })
  })

  it('sends no version when the cache holds no game yet', async () => {
    const qc = freshClient()
    const seen = stubWrite(2)

    const { result } = renderHook(() => useUpdateGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate({ command_points: 3 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // A blind write rather than `version: undefined` in the body. The `version_id_col`
    // still refuses a genuine race at flush.
    expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ command_points: 3 })
  })

  it('seeds the detail cache on create, so the battle screen needs no read', async () => {
    const qc = freshClient()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(makeKTGame({ id: 'ktg-new' }))))

    const { result } = renderHook(() => useCreateGame(), { wrapper: wrapper(qc) })
    result.current.mutate({ roster_id: 'ktr-1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(qc.getQueryData<KTGame_Read>(killTeamGameKeys.game('ktg-new'))?.id).toBe('ktg-new')
  })
})

describe('useGame keeps the cache monotonic (KF4f)', () => {
  it('refuses a READ that would regress the version', async () => {
    const qc = freshClient()
    qc.setQueryData(killTeamGameKeys.game('ktg-1'), makeKTGame({ version: 9, command_points: 9 }))
    // A GET issued before a write and landing after it. Once two clients converge by
    // polling (#72) this is a chance every three seconds, not a rarity.
    const fetchMock = vi.fn(async () =>
      jsonResponse(makeKTGame({ version: 6, command_points: 6 })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useGame('ktg-1'), { wrapper: wrapper(qc) })
    // The fetch must have RESOLVED before the assertion means anything. An earlier
    // version of this waited on `isFetched`, which the seeded cache satisfies, so it
    // passed whether or not the guard existed -- the exact false green a mutation check
    // is for.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(result.current.isFetching).toBe(false))

    expect(result.current.data?.version).toBe(9)
    expect(result.current.data?.command_points).toBe(9)
  })

  it('serialises the game\'s writes, so one cannot overtake another', async () => {
    // `scope` is what makes `versionFrom` sound: when a write is sent, no earlier write
    // of ours is unacknowledged, so the cached version is everything the player caused.
    // Without it a second tap sends the version the first tap has already moved.
    const qc = freshClient()
    const release: ((value: Response) => void)[] = []
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => release.push(resolve)),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    result.current.mutate()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // The second is QUEUED, not in flight.
    expect(fetchMock).toHaveBeenCalledTimes(1)

    release[0](jsonResponse(makeKTGame({ version: 8 })))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('accepts a read that moves forward', async () => {
    const qc = freshClient()
    qc.setQueryData(killTeamGameKeys.game('ktg-1'), makeKTGame({ version: 5, command_points: 5 }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(makeKTGame({ version: 7, command_points: 7 }))))

    const { result } = renderHook(() => useGame('ktg-1'), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.data?.version).toBe(7))
    expect(result.current.data?.command_points).toBe(7)
  })
})

describe('afterGameWrite: how wide a ROW write invalidates', () => {

  it('an operative write invalidates the DETAIL only', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(makeKTGameOperative())))

    const { result } = renderHook(() => useUpdateGameOperative('ktg-1'), {
      wrapper: wrapper(qc),
    })
    result.current.mutate({ rowId: 'ktgo-1', body: { current_wounds: 7 }, version: 7 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // `KTGame_ListRead` carries status, turning point, phase and the scores — not
    // wounds. Invalidating the list here would refetch every row on every wound.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: killTeamGameKeys.game('ktg-1') })
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: killTeamGameKeys.allGames })
  })
})

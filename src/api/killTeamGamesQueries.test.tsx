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
  useGame,
  useUpdateGameOperative,
  useUseGamePloy,
} from './killTeamGamesQueries'
import { killTeamKeys } from './killTeamQueries'
import { jsonResponse, makeKTGame, makeKTGameOperative } from '../test/fixtures'

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

describe('afterGameWrite: how wide a success invalidates', () => {
  it('advance invalidates the list too, because the row shows the turning point', async () => {
    const qc = freshClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    stubGame()

    const { result } = renderHook(() => useAdvanceGame('ktg-1'), { wrapper: wrapper(qc) })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: killTeamGameKeys.allGames })
  })

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

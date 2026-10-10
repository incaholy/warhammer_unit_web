/* Hook tests, which this suite otherwise does not have — hooks are normally
 * exercised through a view. Two reasons to make an exception here.
 *
 * `useMoveRosterOperative` is the only piece of real logic in the Kill Team data
 * layer: it issues TWO requests in a deliberate order to swap two rows' positions,
 * and invalidates on `onSettled` rather than `onSuccess` because a half-completed
 * swap is a state the screen has to show. A view test would exercise it, but it
 * could not say *why* two requests, nor pin their order.
 *
 * And the roster hooks arrive one commit before any view consumes them, so without
 * this they would ship unexercised. */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  killTeamKeys,
  useAddRosterOperative,
  useMoveRosterOperative,
  useRosters,
} from './killTeamQueries'
import { jsonResponse, makeKTRoster, makeKTRosterOperative, page } from '../test/fixtures'
import type { KTRoster_ListRead } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
})

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function freshClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

describe('killTeamKeys', () => {
  it('nests a roster detail under the rosters prefix, so a prefix invalidates both ways', () => {
    // The `list`/`detail` segment is what makes `allRosters` match the list AND
    // every detail — a rename has to invalidate both.
    expect(killTeamKeys.allRosters).toEqual(['killTeam', 'rosters'])
    expect(killTeamKeys.rosters).toEqual(['killTeam', 'rosters', 'list'])
    expect(killTeamKeys.roster('ktr-1')).toEqual(['killTeam', 'rosters', 'detail', 'ktr-1'])
  })
})

describe('useRosters', () => {
  it('fetches every page, not just the first', async () => {
    // User-scoped collections are fetched COMPLETE (`paging.ts`), so a player with
    // more rosters than one page holds still sees all of them.
    const fetchMock = vi.fn(async (url: string | URL) => {
      const offset = new URL(String(url), 'http://x').searchParams.get('offset')
      const rows = offset === '0' || offset === null ? [{ id: 'a' }] : [{ id: 'b' }]
      return jsonResponse(
        page<KTRoster_ListRead>(
          rows.map((r) => makeKTRosterListRowFor(r.id)),
          { total: 2, limit: 1 },
        ),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRosters(), { wrapper: wrapper(freshClient()) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
  })
})

describe('useAddRosterOperative', () => {
  it('sends only the operative id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(makeKTRosterOperative()))
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAddRosterOperative('ktr-1'), {
      wrapper: wrapper(freshClient()),
    })
    result.current.mutate('kto2')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ operative_id: 'kto2' })
  })
})

describe('useMoveRosterOperative', () => {
  const row = makeKTRosterOperative({ id: 'ktro-2', position: 1 })
  const above = makeKTRosterOperative({ id: 'ktro-1', position: 0 })

  it('swaps two positions in two requests, each absolute', async () => {
    // The stub records each call rather than being read back through
    // `fetchMock.mock.calls`, for two reasons found the hard way. A fresh `Response`
    // has to be built PER CALL — `mockResolvedValue` hands back the same instance,
    // and a response body can only be read once, so the second request fails on an
    // already-consumed body and the failure looks like the swap being broken. And
    // `mock.calls` is awkward to read with `strict` on, since `init` is optional.
    const seen: { url: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      return jsonResponse(makeKTRosterOperative())
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useMoveRosterOperative('ktr-1'), {
      wrapper: wrapper(freshClient()),
    })
    result.current.mutate({ row, swapWith: above })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Two PATCHes, and each one takes the OTHER row's position. Nudging one row
    // alone would leave the pair tied, and a tie is broken by `id` (#53) — so the
    // player would see an order they did not choose.
    expect(seen).toHaveLength(2)
    expect(seen[0].url).toContain('/operatives/ktro-2')
    expect(seen[0].body).toEqual({ position: 0 })
    expect(seen[1].url).toContain('/operatives/ktro-1')
    expect(seen[1].body).toEqual({ position: 1 })
  })

  it('re-reads the roster even when the second request fails', async () => {
    // The partial failure is the reason this invalidates on `onSettled`. If the
    // second PATCH fails the two rows really do share a position, and the screen has
    // to show that rather than the order it hoped for.
    // Two `...Once` stubs, so each call gets its own `Response` — see the note above.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(makeKTRosterOperative()))
      .mockResolvedValueOnce(jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const queryClient = freshClient()
    queryClient.setQueryData(killTeamKeys.roster('ktr-1'), makeKTRoster())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useMoveRosterOperative('ktr-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate({ row, swapWith: above })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: killTeamKeys.roster('ktr-1') })
  })
})

// Local helper: the shared fixture takes overrides, and this test only varies the id.
function makeKTRosterListRowFor(id: string): KTRoster_ListRead {
  return {
    id,
    name: `Roster ${id}`,
    description: null,
    created_at: '2026-01-01T00:00:00Z',
    kill_team_id: 'kt1',
    kill_team_name: 'Raveners',
    faction_name: 'Tyranids',
  }
}

import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { queryKeys, useUnits, useCreateArmy } from './queries'
import { jsonResponse, makeArmy, makeUnit, page } from '../test/fixtures'


function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** True when `prefix` would match `key` under TanStack Query's partial matching. */
function matches(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  return prefix.every((segment, i) => JSON.stringify(segment) === JSON.stringify(key[i]))
}

describe('query keys', () => {
  it('are stable', () => {
    expect(queryKeys.armies).toEqual(['armies', 'list'])
    expect(queryKeys.army('a1')).toEqual(['armies', 'detail', 'a1'])
    expect(queryKeys.unit('u1')).toEqual(['units', 'detail', 'u1'])
    expect(queryKeys.factions).toEqual(['factions', 'list'])
    expect(queryKeys.inventory).toEqual(['inventory', 'list'])
    expect(queryKeys.units({ q: 'x' })).toEqual(['units', 'list', { q: 'x' }])
  })

  it('are hierarchical: one prefix reaches a resource and everything under it', () => {
    // This is the property the old shape lacked -- `['armies']` and `['army', id]`
    // were siblings, so no prefix reached both and every mutation had to name each
    // key by hand. Asserted as a relationship rather than as literals, so it keeps
    // holding when a key is added.
    for (const key of [
      queryKeys.armies,
      queryKeys.army('a1'),
      queryKeys.armyShortfall('a1'),
      queryKeys.armyValidation('a1'),
    ]) {
      expect(matches(queryKeys.allArmies, key)).toBe(true)
    }

    // A single army's derived queries hang off its detail key...
    expect(matches(queryKeys.army('a1'), queryKeys.armyShortfall('a1'))).toBe(true)
    expect(matches(queryKeys.army('a1'), queryKeys.armyValidation('a1'))).toBe(true)
    // ...but not off another army's, and not off the list.
    expect(matches(queryKeys.army('a1'), queryKeys.armyShortfall('a2'))).toBe(false)
    expect(matches(queryKeys.armies, queryKeys.army('a1'))).toBe(false)
  })
})

describe('invalidation reaches what it should', () => {
  it('one prefix invalidates an army and everything derived from it', async () => {
    // The assertions above compare key shapes with a helper of our own, which
    // proves nothing about TanStack Query. This drives the real client: seed four
    // queries, invalidate one prefix, and check which ones actually went stale.
    const { client } = makeWrapper()
    client.setQueryData(queryKeys.armies, { items: [] })
    client.setQueryData(queryKeys.army('a1'), { id: 'a1' })
    client.setQueryData(queryKeys.armyShortfall('a1'), [])
    client.setQueryData(queryKeys.armyValidation('a1'), { ok: true })
    client.setQueryData(queryKeys.armyShortfall('a2'), [])

    await client.invalidateQueries({ queryKey: queryKeys.army('a1') })

    expect(client.getQueryState(queryKeys.army('a1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(queryKeys.armyShortfall('a1'))?.isInvalidated).toBe(true)
    expect(client.getQueryState(queryKeys.armyValidation('a1'))?.isInvalidated).toBe(true)
    // ...and nothing else: not another army, and not the list.
    expect(client.getQueryState(queryKeys.armyShortfall('a2'))?.isInvalidated).toBe(false)
    expect(client.getQueryState(queryKeys.armies)?.isInvalidated).toBe(false)
  })

  it('the allArmies prefix reaches the list too', async () => {
    const { client } = makeWrapper()
    client.setQueryData(queryKeys.armies, { items: [] })
    client.setQueryData(queryKeys.armyShortfall('a1'), [])

    await client.invalidateQueries({ queryKey: queryKeys.allArmies })

    expect(client.getQueryState(queryKeys.armies)?.isInvalidated).toBe(true)
    expect(client.getQueryState(queryKeys.armyShortfall('a1'))?.isInvalidated).toBe(true)
  })
})

describe('invalidation covers the edges F10 added', () => {
  it('an inventory change invalidates units, which are now filtered by ownership', async () => {
    // F10 made useUnits({owned:true}) and the facets rail server-filtered by
    // inventory membership, so what the user owns became an INPUT to those
    // queries. That edge went into the data graph without going into the
    // invalidation graph.
    const { client } = makeWrapper()
    client.setQueryData(queryKeys.units({ owned: true }), page([makeUnit()]))
    client.setQueryData(queryKeys.unitFacets({ owned: true }), { total: 1, by_faction: {} })
    client.setQueryData(queryKeys.inventory, page([]))

    await client.invalidateQueries({ queryKey: queryKeys.allUnits })

    expect(client.getQueryState(queryKeys.units({ owned: true }))?.isInvalidated).toBe(true)
    expect(client.getQueryState(queryKeys.unitFacets({ owned: true }))?.isInvalidated).toBe(true)
  })
})

describe('useUnits', () => {
  it('resolves with the paged result including total from the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(page([makeUnit({ id: 'u1' })], { total: 42, limit: 25 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useUnits(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(42)
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useCreateArmy', () => {
  it('invalidates the armies key on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(makeArmy({ id: 'a1', name: 'Vigil' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { client, wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateArmy(), { wrapper })
    await result.current.mutateAsync({ name: 'Vigil', faction_id: 'f1' })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.armies })
  })
})

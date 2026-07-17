import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { queryKeys, useUnits, useCreateArmy } from './queries'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

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

describe('query keys', () => {
  it('are stable and hierarchical', () => {
    expect(queryKeys.me).toEqual(['me'])
    expect(queryKeys.armies).toEqual(['armies'])
    expect(queryKeys.army('a1')).toEqual(['army', 'a1'])
    expect(queryKeys.unit('u1')).toEqual(['unit', 'u1'])
    expect(queryKeys.factions).toEqual(['factions'])
    expect(queryKeys.inventory).toEqual(['inventory'])
    expect(queryKeys.units({ q: 'x' })).toEqual(['units', { q: 'x' }])
  })
})

describe('useUnits', () => {
  it('resolves with the paged result including total from X-Total-Count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 'u1' }], {
        headers: { 'Content-Type': 'application/json', 'X-Total-Count': '42' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useUnits(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.total).toBe(42)
  })
})

describe('useCreateArmy', () => {
  it('invalidates the armies key on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'a1', name: 'Vigil' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { client, wrapper } = makeWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateArmy(), { wrapper })
    await result.current.mutateAsync({ name: 'Vigil', faction_id: 'f1' })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.armies })
  })
})

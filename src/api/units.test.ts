import { describe, it, expect, vi, afterEach } from 'vitest'
import { listUnits, unitFacets, getUnit } from './units'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('units resource', () => {
  it('listUnits returns the paged envelope with items and total from the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [{ id: 'u1' }], total: 137, limit: 25, offset: 0 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listUnits()

    expect(result.total).toBe(137)
    expect(result.items).toHaveLength(1)
  })

  it('reads total from the body even when it exceeds the returned page', async () => {
    // total counts the whole filter, not just this page's rows.
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ items: [{ id: 'u1' }, { id: 'u2' }], total: 58, limit: 2, offset: 0 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listUnits()

    expect(result.total).toBe(58)
    expect(result.items).toHaveLength(2)
  })

  it('builds the query string from filter params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await listUnits({ faction_id: 'f1', subfaction_id: 's2', q: 'termi', limit: 20, offset: 40 })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/units?')
    expect(url).toContain('faction_id=f1')
    expect(url).toContain('subfaction_id=s2')
    expect(url).toContain('q=termi')
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=40')
  })

  it('omits the query string entirely when no filters are given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await listUnits()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/units')
  })

  it('unitFacets GETs /units/facets and returns per-faction counts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ total: 5, by_faction: { f1: 3, f2: 2 } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await unitFacets()

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/units/facets')
    expect(result.total).toBe(5)
    expect(result.by_faction).toEqual({ f1: 3, f2: 2 })
  })

  it('unitFacets carries the q search term in the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ total: 1, by_faction: { f2: 1 } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await unitFacets({ q: 'hive' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/units/facets?')
    expect(url).toContain('q=hive')
  })

  it('getUnit GETs /units/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'u9' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUnit('u9')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/units/u9')
  })
})

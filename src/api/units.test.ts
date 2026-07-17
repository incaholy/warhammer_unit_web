import { describe, it, expect, vi, afterEach } from 'vitest'
import { listUnits, getUnit } from './units'

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
  it('listUnits reads X-Total-Count into total', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([{ id: 'u1' }], {
        headers: { 'Content-Type': 'application/json', 'X-Total-Count': '137' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listUnits()

    expect(result.total).toBe(137)
    expect(result.units).toHaveLength(1)
  })

  it('falls back to the row count when X-Total-Count is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 'u1' }, { id: 'u2' }]))
    vi.stubGlobal('fetch', fetchMock)

    const result = await listUnits()

    expect(result.total).toBe(2)
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

  it('getUnit GETs /units/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'u9' }))
    vi.stubGlobal('fetch', fetchMock)

    await getUnit('u9')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/units/u9')
  })
})

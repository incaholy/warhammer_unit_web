import { describe, it, expect, vi, afterEach } from 'vitest'
import { listFactions, factionTaxonomy } from './factions'

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

describe('factions resource', () => {
  it('listFactions GETs /factions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await listFactions()
    expect(fetchMock.mock.calls[0][0]).toBe('/factions')
  })

  it('factionTaxonomy GETs /factions/taxonomy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await factionTaxonomy()
    expect(fetchMock.mock.calls[0][0]).toBe('/factions/taxonomy')
  })
})

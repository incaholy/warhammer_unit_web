import { describe, it, expect, vi, afterEach } from 'vitest'
import { listFactions, factionTaxonomy } from './factions'
import type { Faction_Read, FactionTaxonomy } from './types'
import { jsonResponse, page } from '../test/fixtures'


afterEach(() => {
  vi.unstubAllGlobals()
})

describe('factions resource', () => {
  it('listFactions GETs /factions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page<Faction_Read>([])))
    vi.stubGlobal('fetch', fetchMock)
    await listFactions()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/factions')
  })

  it('factionTaxonomy GETs /taxonomy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse<FactionTaxonomy>({}))
    vi.stubGlobal('fetch', fetchMock)
    await factionTaxonomy()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/taxonomy')
  })
})

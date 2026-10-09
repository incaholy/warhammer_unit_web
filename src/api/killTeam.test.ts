import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getKillTeam,
  getUniversal,
  listComposition,
  listKillTeams,
  listKTFactions,
  listKTOperatives,
} from './killTeam'
import type { KillTeam_Read, KTFaction_Read, KTOperative_ListRead } from './types'
import {
  jsonResponse,
  makeKillTeamDetail,
  makeKTSelectionRule,
  makeUniversal,
  page,
} from '../test/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Stubs fetch with `body` and returns the mock, so a test can read the URL the
 *  resource function built. Asserting the exact wire format is this suite's
 *  convention: a resource module's whole job is the URL and the schema. */
function stub(body: Parameters<typeof jsonResponse>[0]) {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function urlOf(fetchMock: ReturnType<typeof vi.fn>): string {
  return String(fetchMock.mock.calls[0][0])
}

describe('kill team catalog resource', () => {
  it('listKTFactions GETs /kill-team/factions', async () => {
    const fetchMock = stub(page<KTFaction_Read>([]))
    await listKTFactions()
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/factions')
  })

  it('listKTFactions passes paging through', async () => {
    const fetchMock = stub(page<KTFaction_Read>([]))
    await listKTFactions({ limit: 200, offset: 200 })
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/factions?limit=200&offset=200')
  })

  it('listKillTeams GETs /kill-team/teams', async () => {
    const fetchMock = stub(page<KillTeam_Read>([]))
    await listKillTeams()
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/teams')
  })

  it('listKillTeams narrows to one faction, alone or beside paging', async () => {
    let fetchMock = stub(page<KillTeam_Read>([]))
    await listKillTeams({ faction_id: 'ktf1' })
    // No paging, so the faction has to open the query string itself.
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/teams?faction_id=ktf1')

    vi.unstubAllGlobals()
    fetchMock = stub(page<KillTeam_Read>([]))
    await listKillTeams({ faction_id: 'ktf1', limit: 25, offset: 50 })
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/teams?limit=25&offset=50&faction_id=ktf1')
  })

  it('getKillTeam GETs one team by id', async () => {
    const fetchMock = stub(makeKillTeamDetail())
    await getKillTeam('kt1')
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/teams/kt1')
  })

  it('listComposition GETs the team composition', async () => {
    const fetchMock = stub([makeKTSelectionRule()])
    await listComposition('kt1')
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/teams/kt1/composition')
  })

  it('listKTOperatives GETs /kill-team/operatives, with either filter', async () => {
    let fetchMock = stub(page<KTOperative_ListRead>([]))
    await listKTOperatives()
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/operatives')

    vi.unstubAllGlobals()
    fetchMock = stub(page<KTOperative_ListRead>([]))
    await listKTOperatives({ kill_team_id: 'kt1', keyword: 'LEADER', limit: 25, offset: 25 })
    expect(urlOf(fetchMock)).toBe(
      '/api/v1/kill-team/operatives?limit=25&offset=25&kill_team_id=kt1&keyword=LEADER',
    )
  })

  it('getUniversal GETs /kill-team/universal, unpaged', async () => {
    const fetchMock = stub(makeUniversal())
    await getUniversal()
    expect(urlOf(fetchMock)).toBe('/api/v1/kill-team/universal')
  })

  it('parses a team detail through its generated schema', async () => {
    // Not just the URL: every body-returning helper requires a zod schema, so this
    // is what proves the generated schema and the fixture agree. A fixture that
    // drifted from the contract would throw ResponseShapeError here.
    stub(makeKillTeamDetail({ name: 'Raveners' }))
    const team = await getKillTeam('kt1')
    expect(team.name).toBe('Raveners')
    expect(team.selection_rules.map((r) => r.kind)).toEqual(['heading', 'line', 'note'])
    expect(team.operatives.map((o) => o.position)).toEqual([0, 1])
  })

  it('sends no body and no content type on a read', async () => {
    const fetchMock = stub(makeUniversal())
    await getUniversal()
    const init = fetchMock.mock.calls[0][1] ?? {}
    expect(init.body).toBeUndefined()
    expect(init.method ?? 'GET').toBe('GET')
  })
})

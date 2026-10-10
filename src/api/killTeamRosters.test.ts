import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  addRosterOperative,
  createRoster,
  deleteRoster,
  getRoster,
  listRosters,
  moveRosterOperative,
  removeRosterOperative,
  updateRoster,
} from './killTeamRosters'
import type { KTRoster_ListRead } from './types'
import { jsonResponse, makeKTRoster, makeKTRosterOperative, page } from '../test/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub(body?: Parameters<typeof jsonResponse>[0], init: ResponseInit = {}) {
  const fetchMock = vi.fn().mockResolvedValue(
    body === undefined ? new Response(null, { status: 204 }) : jsonResponse(body, init),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callOf(fetchMock: ReturnType<typeof vi.fn>, n = 0) {
  const [url, init] = fetchMock.mock.calls[n]
  return {
    url: String(url),
    method: (init?.method ?? 'GET') as string,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('kill team roster resource', () => {
  it('listRosters GETs the caller\'s rosters', async () => {
    const fetchMock = stub(page<KTRoster_ListRead>([]))
    await listRosters()
    expect(callOf(fetchMock).url).toBe('/api/v1/me/kill-team/rosters')
  })

  it('getRoster GETs one roster by id', async () => {
    const fetchMock = stub(makeKTRoster())
    await getRoster('ktr-1')
    expect(callOf(fetchMock).url).toBe('/api/v1/me/kill-team/rosters/ktr-1')
  })

  it('createRoster POSTs the team, name and description', async () => {
    const fetchMock = stub(makeKTRoster())
    await createRoster({ kill_team_id: 'kt1', name: 'My Raveners', description: 'For Tuesday' })
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/rosters')
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({
      kill_team_id: 'kt1',
      name: 'My Raveners',
      description: 'For Tuesday',
    })
  })

  it('updateRoster PATCHes only what it is given', async () => {
    const fetchMock = stub(makeKTRoster())
    await updateRoster('ktr-1', { name: 'Renamed' })
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/rosters/ktr-1')
    expect(call.method).toBe('PATCH')
    // Not `{name, description: undefined}`: a PATCH that sent `description: null`
    // would blank a description the player never touched.
    expect(call.body).toEqual({ name: 'Renamed' })
  })

  it('deleteRoster DELETEs and expects no body back', async () => {
    const fetchMock = stub()
    await expect(deleteRoster('ktr-1')).resolves.toBeUndefined()
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/rosters/ktr-1')
    expect(call.method).toBe('DELETE')
  })

  it('addRosterOperative POSTs the operative id and nothing else', async () => {
    const fetchMock = stub(makeKTRosterOperative())
    await addRosterOperative('ktr-1', 'kto2')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/rosters/ktr-1/operatives')
    expect(call.method).toBe('POST')
    // No `amount`. A row is ONE operative (#50), and adding the same datacard twice
    // appends a second row rather than answering 409 — so there is no quantity to
    // send and no "already added" to avoid.
    expect(call.body).toEqual({ operative_id: 'kto2' })
  })

  it('moveRosterOperative PATCHes an absolute position, addressed by the ROW id', async () => {
    const fetchMock = stub(makeKTRosterOperative({ position: 2 }))
    await moveRosterOperative('ktr-1', 'ktro-3', 2)
    const call = callOf(fetchMock)
    // The row's own id, not the operative's: two rows can hold the same datacard.
    expect(call.url).toBe('/api/v1/me/kill-team/rosters/ktr-1/operatives/ktro-3')
    expect(call.method).toBe('PATCH')
    // Absolute, never a delta (#53).
    expect(call.body).toEqual({ position: 2 })
  })

  it('removeRosterOperative DELETEs the row', async () => {
    const fetchMock = stub()
    await removeRosterOperative('ktr-1', 'ktro-2')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/rosters/ktr-1/operatives/ktro-2')
    expect(call.method).toBe('DELETE')
  })

  it('parses a roster detail through its generated schema', async () => {
    // Proves the fixture and the generated schema agree; a drifted fixture would
    // throw ResponseShapeError here rather than in a view test.
    stub(makeKTRoster())
    const roster = await getRoster('ktr-1')
    expect(roster.kill_team_name).toBe('Raveners')
    // The defining property of a roster row: two rows, same datacard (#50).
    const ids = roster.operatives.map((row) => row.operative.id)
    expect(ids).toEqual(['kto1', 'kto2', 'kto2'])
    expect(new Set(roster.operatives.map((row) => row.id)).size).toBe(3)
    // And the reference pool arrives with it (#52), so a screen needs no catalog read.
    expect(roster.universal_ploys).toHaveLength(1)
    expect(roster.equipment).toHaveLength(1)
  })

  it('surfaces the name conflict as the backend worded it', async () => {
    // #64: unique per OWNER, 409 naming `name`. The message carries no id, so
    // `messageForError` prefers it over the generic "That already exists." — which is
    // why no copy is written for this case on the client.
    stub(
      { detail: "a roster called 'My Raveners' already exists", code: 'CONFLICT', field: 'name' },
      { status: 409 },
    )
    await expect(createRoster({ kill_team_id: 'kt1', name: 'My Raveners' })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      field: 'name',
      message: "a roster called 'My Raveners' already exists",
    })
  })

  it('surfaces the delete refusal, which counts the games', async () => {
    // #60: a roster a game was played from cannot be deleted. Also id-free, so also
    // shown verbatim.
    stub(
      {
        detail: "roster 'My Raveners' is played by 1 game and cannot be deleted",
        code: 'CONFLICT',
      },
      { status: 409 },
    )
    await expect(deleteRoster('ktr-1')).rejects.toMatchObject({
      status: 409,
      message: "roster 'My Raveners' is played by 1 game and cannot be deleted",
    })
  })
})

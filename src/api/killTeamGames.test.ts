import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  activateGameOperative,
  addGameEquipment,
  addGameOperative,
  advanceGame,
  createGame,
  deleteGame,
  getGame,
  listGames,
  removeGameEquipment,
  revealGameEquipment,
  transformGameOperative,
  undoGame,
  updateGame,
  updateGameOperative,
  useGamePloy,
} from './killTeamGames'
import type { KTGame_ListRead } from './types'
import {
  jsonResponse,
  makeKTGame,
  makeKTGameEquipment,
  makeKTGameOperative,
  page,
} from '../test/fixtures'

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

describe('kill team game resource: the reads', () => {
  it('listGames GETs the caller\'s games', async () => {
    const fetchMock = stub(page<KTGame_ListRead>([]))
    await listGames()
    expect(callOf(fetchMock).url).toBe('/api/v1/me/kill-team/games')
  })

  it('getGame GETs one game by id', async () => {
    const fetchMock = stub(makeKTGame())
    await getGame('ktg-1')
    expect(callOf(fetchMock).url).toBe('/api/v1/me/kill-team/games/ktg-1')
  })

  it('getGame parses the whole snapshot, so a missing nested shape fails here', async () => {
    stub(makeKTGame())
    const game = await getGame('ktg-1')
    // The snapshot is the point of this read (#22, #24): a response that dropped the
    // datacards would still be a valid `KTGame_Read` to a loose parser.
    expect(game.operatives[0].weapons.length).toBeGreaterThan(0)
    expect(game.rules.length).toBeGreaterThan(0)
    expect(game.ploys.length).toBeGreaterThan(0)
  })
})

describe('kill team game resource: the writes', () => {
  it('createGame POSTs the roster and the opponent name', async () => {
    const fetchMock = stub(makeKTGame())
    await createGame({ roster_id: 'ktr-1', opponent_name: 'Kesh' })
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games')
    expect(call.method).toBe('POST')
    expect(call.body).toEqual({ roster_id: 'ktr-1', opponent_name: 'Kesh' })
  })

  it('deleteGame DELETEs and returns nothing', async () => {
    const fetchMock = stub()
    await expect(deleteGame('ktg-1')).resolves.toBeUndefined()
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1')
    expect(call.method).toBe('DELETE')
  })

  it('advanceGame POSTs with no body at all', async () => {
    const fetchMock = stub(makeKTGame())
    await advanceGame('ktg-1')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/advance')
    expect(call.method).toBe('POST')
    // The turning point is NOT a field a caller sets: the server decides whether this
    // is the next phase, the next turning point or the end of the game.
    expect(call.body).toBeUndefined()
  })

  it('undoGame POSTs to undo', async () => {
    const fetchMock = stub(makeKTGame())
    await undoGame('ktg-1')
    expect(callOf(fetchMock).url).toBe('/api/v1/me/kill-team/games/ktg-1/undo')
    expect(callOf(fetchMock).method).toBe('POST')
  })

  it('useGamePloy sends only the name — never the cost', async () => {
    const fetchMock = stub(makeKTGame())
    await useGamePloy('ktg-1', 'Sudden Surge')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/ploys')
    // The CP cost comes from the game's own snapshot, so a client cannot get it wrong
    // and cannot forget it. A body carrying `cp_cost` would mean it could.
    expect(call.body).toEqual({ name: 'Sudden Surge' })
  })

  it('addGameOperative POSTs the datacard and where it came from', async () => {
    const fetchMock = stub(makeKTGameOperative())
    await addGameOperative('ktg-1', 'kto9', 'rule')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/operatives')
    expect(call.body).toEqual({ operative_id: 'kto9', source: 'rule' })
  })

  it('activateGameOperative POSTs to its own path with no body', async () => {
    const fetchMock = stub(makeKTGameOperative())
    await activateGameOperative('ktg-1', 'ktgo-1')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/operatives/ktgo-1/activate')
    expect(call.method).toBe('POST')
    // `activated_in_turning_point` is set by the SERVER from the game's own turning
    // point (#61), so it is not a value a caller supplies — which is exactly why this
    // is a path of its own rather than a field on the PATCH (#63).
    expect(call.body).toBeUndefined()
  })

  it('transformGameOperative addresses the ROW and names the card it becomes', async () => {
    const fetchMock = stub(makeKTGameOperative())
    await transformGameOperative('ktg-1', 'ktgo-2', 'kto7')
    const call = callOf(fetchMock)
    // The row's own id, not the operative's: the row keeps its id while its catalog
    // pointer moves (#19), and two rows can hold the same datacard (#50).
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/operatives/ktgo-2/transform')
    expect(call.body).toEqual({ becomes_operative_id: 'kto7' })
  })

  it('addGameEquipment POSTs the piece, and nothing about the allowance', async () => {
    const fetchMock = stub(makeKTGameEquipment())
    await addGameEquipment('ktg-1', 'kte9')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/equipment')
    expect(call.body).toEqual({ equipment_id: 'kte9' })
  })

  it('revealGameEquipment PATCHes with no body, because it is an operation', async () => {
    const fetchMock = stub(makeKTGameEquipment({ revealed: true }))
    await revealGameEquipment('ktg-1', 'ktge-1')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/equipment/ktge-1')
    expect(call.method).toBe('PATCH')
    // The backend declares no request body for this path. A PATCH that sent
    // `{ revealed: true }` would be rejected: `WriteSchema` forbids unknown keys.
    expect(call.body).toBeUndefined()
  })

  it('removeGameEquipment DELETEs the row', async () => {
    const fetchMock = stub()
    await removeGameEquipment('ktg-1', 'ktge-1')
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/equipment/ktge-1')
    expect(call.method).toBe('DELETE')
  })
})

describe('kill team game resource: where `version` travels', () => {
  // KILLTEAM.md #79 moves `version` to an `If-Match` header on all twelve nested
  // writes. These tests pin where it lives TODAY, so that migration has to change
  // them deliberately rather than passing unchanged against a dropped header.

  it('updateGame puts the version in the BODY when given one', async () => {
    const fetchMock = stub(makeKTGame())
    await updateGame('ktg-1', { command_points: 3 }, 7)
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1')
    expect(call.method).toBe('PATCH')
    expect(call.body).toEqual({ command_points: 3, version: 7 })
  })

  it('updateGame OMITS the version when not given one, rather than sending null', async () => {
    const fetchMock = stub(makeKTGame())
    await updateGame('ktg-1', { command_points: 3 })
    // A blind write, which the backend accepts. `version: null` would also be
    // accepted and would read as "I checked and there is no version", which is a
    // different claim from "I did not check".
    expect(callOf(fetchMock).body).toEqual({ command_points: 3 })
  })

  it('updateGameOperative puts the version in the body, beside absolute values', async () => {
    const fetchMock = stub(makeKTGameOperative())
    await updateGameOperative('ktg-1', 'ktgo-1', { current_wounds: 7 }, 7)
    const call = callOf(fetchMock)
    expect(call.url).toBe('/api/v1/me/kill-team/games/ktg-1/operatives/ktgo-1')
    // `current_wounds: 7`, never `-2` (#7). The absolute value is what makes a
    // duplicate delivery of this request harmless; `version` is what handles a
    // SECOND writer, and the two are different problems.
    expect(call.body).toEqual({ current_wounds: 7, version: 7 })
  })

  it('no write sends an If-Match header, because the backend declares none', async () => {
    const fetchMock = stub(makeKTGame())
    await updateGame('ktg-1', { command_points: 3 }, 7)
    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>
    // Undeclared parameters are IGNORED rather than rejected (backend
    // `docs/api/conventions.md`), so an `If-Match` sent today would be dropped in
    // silence and the write would apply blind — a guard that reads as wired up and
    // protects nothing. This fails the day someone adds the header early.
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('if-match')
  })
})

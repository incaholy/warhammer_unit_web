import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listArmies,
  getArmy,
  createArmy,
  updateArmy,
  deleteArmy,
  addUnit,
  setAmount,
  removeUnit,
  shortfall,
  validate,
} from './armies'

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

describe('armies resource', () => {
  it('listArmies GETs /me/armies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await listArmies()
    expect(fetchMock.mock.calls[0][0]).toBe('/me/armies')
  })

  it('getArmy GETs /me/armies/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'a1' }))
    vi.stubGlobal('fetch', fetchMock)
    await getArmy('a1')
    expect(fetchMock.mock.calls[0][0]).toBe('/me/armies/a1')
  })

  it('createArmy POSTs JSON to /me/armies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'a1', name: 'Vigil' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await createArmy({ name: 'Vigil', faction_id: 'f1' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ name: 'Vigil', faction_id: 'f1' })
  })

  it('updateArmy PATCHes /me/armies/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'a1' }))
    vi.stubGlobal('fetch', fetchMock)

    await updateArmy('a1', { name: 'Renamed' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies/a1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ name: 'Renamed' })
  })

  it('deleteArmy DELETEs /me/armies/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await deleteArmy('a1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies/a1')
    expect(init.method).toBe('DELETE')
  })

  it('addUnit POSTs to /me/armies/{id}/units', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unit: { id: 'u1' }, amount: 2 }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await addUnit('a1', { unit_id: 'u1', amount: 2 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies/a1/units')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ unit_id: 'u1', amount: 2 })
  })

  it('setAmount PATCHes /me/armies/{id}/units/{unit_id} with { amount }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unit: { id: 'u1' }, amount: 5 }))
    vi.stubGlobal('fetch', fetchMock)

    await setAmount('a1', 'u1', 5)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies/a1/units/u1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ amount: 5 })
  })

  it('removeUnit DELETEs /me/armies/{id}/units/{unit_id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await removeUnit('a1', 'u1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/armies/a1/units/u1')
    expect(init.method).toBe('DELETE')
  })

  it('shortfall GETs /me/armies/{id}/shortfall', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await shortfall('a1')
    expect(fetchMock.mock.calls[0][0]).toBe('/me/armies/a1/shortfall')
  })

  it('validate GETs /me/armies/{id}/validate', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, points_total: 0, points_limit: null, issues: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await validate('a1')
    expect(fetchMock.mock.calls[0][0]).toBe('/me/armies/a1/validate')
  })
})

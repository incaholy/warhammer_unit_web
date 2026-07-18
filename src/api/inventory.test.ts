import { describe, it, expect, vi, afterEach } from 'vitest'
import { listInventory, addUnit, setAmount, removeUnit } from './inventory'

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

describe('inventory resource', () => {
  it('listInventory GETs /me/inventory', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await listInventory()
    expect(fetchMock.mock.calls[0][0]).toBe('/me/inventory')
  })

  it('addUnit POSTs to /me/inventory', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ unit: { id: 'u1' }, amount: 1 }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await addUnit({ unit_id: 'u1' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/inventory')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ unit_id: 'u1' })
  })

  it('setAmount PATCHes /me/inventory/{unit_id} with { amount }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ unit: { id: 'u1' }, amount: 3 }))
    vi.stubGlobal('fetch', fetchMock)

    await setAmount('u1', 3)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/inventory/u1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ amount: 3 })
  })

  it('removeUnit DELETEs /me/inventory/{unit_id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await removeUnit('u1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me/inventory/u1')
    expect(init.method).toBe('DELETE')
  })
})

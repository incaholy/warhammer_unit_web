import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  apiGet,
  apiPost,
  apiPostForm,
  apiDelete,
  apiGetWithHeaders,
  tokenStore,
  onUnauthorized,
} from './client'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('api client', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches a Bearer token when one is stored', async () => {
    tokenStore.set('tok123')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await apiGet('/me')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer tok123')
  })

  it('omits Authorization when no token is stored', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await apiGet('/units')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBeUndefined()
  })

  it('sends a JSON body with the JSON content-type on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/me/armies', { name: 'The Hollow Vigil' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ name: 'The Hollow Vigil' }))
  })

  it('form-encodes the login body (OAuth2 password form)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'a', token_type: 'bearer' }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPostForm('/auth/login', { username: 'me@dominion.imp', password: 'pw' })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(init.body).toContain('username=me%40dominion.imp')
    expect(init.body).toContain('password=pw')
  })

  it('resolves to undefined for a 204 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiDelete('/me/inventory/unit-1')).resolves.toBeUndefined()
  })

  it('throws an ApiError carrying status, detail message, and field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'email already taken', field: 'email' }, { status: 409 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiPost('/auth/register', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'email already taken',
      field: 'email',
    })
  })

  it('clears the token and notifies listeners on 401', async () => {
    tokenStore.set('stale')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: 'unauthorized' }, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    const listener = vi.fn()
    const off = onUnauthorized(listener)

    await expect(apiGet('/me')).rejects.toBeInstanceOf(ApiError)

    expect(tokenStore.get()).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
    off()
  })

  it('exposes response headers (X-Total-Count) via apiGetWithHeaders', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([], {
        headers: { 'Content-Type': 'application/json', 'X-Total-Count': '137' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { data, headers } = await apiGetWithHeaders('/units')

    expect(data).toEqual([])
    expect(headers.get('X-Total-Count')).toBe('137')
  })
})

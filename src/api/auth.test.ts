import { describe, it, expect, vi, afterEach } from 'vitest'
import { register, login, getMe } from './auth'

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

describe('auth resource', () => {
  it('register POSTs JSON to /auth/register', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'u1', username: 'me', email: 'me@x.io' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const user = await register({ username: 'me', email: 'me@x.io', password: 'pw' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/auth/register')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ username: 'me', email: 'me@x.io', password: 'pw' })
    expect(user.id).toBe('u1')
  })

  it('login form-encodes the identifier as the username field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ access_token: 'tok', token_type: 'bearer' }))
    vi.stubGlobal('fetch', fetchMock)

    const token = await login('me@x.io', 'secret')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/auth/login')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(init.body).toContain('username=me%40x.io')
    expect(init.body).toContain('password=secret')
    expect(token.access_token).toBe('tok')
  })

  it('getMe GETs /me', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'u1', username: 'me', email: 'me@x.io' }))
    vi.stubGlobal('fetch', fetchMock)

    await getMe()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/me')
    expect(init.method ?? 'GET').toBe('GET')
  })
})

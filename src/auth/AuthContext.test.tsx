import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { tokenStore } from '../api/client'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** Route the fetch mock by request path so login (form) → token, /me → user. */
function routedFetch() {
  return vi.fn((url: string) => {
    if (url === '/auth/login') {
      return Promise.resolve(jsonResponse({ access_token: 'tok123', token_type: 'bearer' }))
    }
    if (url === '/me') {
      return Promise.resolve(jsonResponse({ id: 'u1', username: 'kesh', email: 'kesh@x.io' }))
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`))
  })
}

/** Test harness exposing the auth context to the DOM + imperative handles. */
let handle: ReturnType<typeof useAuth>
function Probe() {
  handle = useAuth()
  return (
    <div>
      <span data-testid="user">{handle.user?.email ?? 'none'}</span>
      <span data-testid="loading">{String(handle.isLoading)}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('login stores the token and sets the user', async () => {
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await act(async () => {
      await handle.login('kesh@x.io', 'secret')
    })

    expect(tokenStore.get()).toBe('tok123')
    expect(screen.getByTestId('user')).toHaveTextContent('kesh@x.io')
  })

  it('logout clears the token and the user', async () => {
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    await act(async () => {
      await handle.login('kesh@x.io', 'secret')
    })
    expect(tokenStore.get()).toBe('tok123')

    act(() => {
      handle.logout()
    })

    expect(tokenStore.get()).toBeNull()
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('hydrates the user from /me when a token is already stored', async () => {
    tokenStore.set('tok123')
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('kesh@x.io'))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})

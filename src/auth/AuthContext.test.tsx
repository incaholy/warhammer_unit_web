import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
  return vi.fn((rawUrl: string) => {
    const url = rawUrl.replace(/^\/api\/v1/, '')
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
  // eslint-disable-next-line react-hooks/globals -- test harness capturing the hook value
  handle = useAuth()
  return (
    <div>
      <span data-testid="user">{handle.user?.email ?? 'none'}</span>
      <span data-testid="loading">{String(handle.isLoading)}</span>
    </div>
  )
}

/** Mirrors main.tsx: the session layer lives inside the query client's provider. */
let queryClient: QueryClient
function renderProvider() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
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

  it('logout clears cached server data so it cannot leak to the next user', async () => {
    // Regression for ROADMAP F1: the cache used to outlive the session, and
    // TanStack Query serves it on mount, so the next user saw the previous
    // user's data on first paint.
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    await act(async () => {
      await handle.login('kesh@x.io', 'secret')
    })

    queryClient.setQueryData(['armies'], { items: [{ id: 'a1', name: 'USER A ARMY' }] })
    expect(queryClient.getQueryData(['armies'])).toBeDefined()

    act(() => {
      handle.logout()
    })

    expect(queryClient.getQueryData(['armies'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('login clears data cached by a previous session', async () => {
    // The other half of ROADMAP F1: a session can end involuntarily (the client
    // clears the token on a 401 without touching the cache), so a second user
    // signing in on the same page load would otherwise inherit the first's data.
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    queryClient.setQueryData(['armies'], { items: [{ id: 'a1', name: 'USER A ARMY' }] })

    await act(async () => {
      await handle.login('kesh@x.io', 'secret')
    })

    expect(queryClient.getQueryData(['armies'])).toBeUndefined()
  })

  it('hydrates the user from /me when a token is already stored', async () => {
    tokenStore.set('tok123')
    vi.stubGlobal('fetch', routedFetch())
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('kesh@x.io'))
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})

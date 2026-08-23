import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { tokenStore } from './api/client'
import App from './App'
import { jsonResponse, makeUser, page } from './test/fixtures'

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}


describe('App routing', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects an unauthenticated visit to the login screen', async () => {
    renderAt('/')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('renders the login screen at /login', async () => {
    renderAt('/login')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('shows route-derived breadcrumbs on an authenticated page', async () => {
    tokenStore.set('tok')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.endsWith('/me'))
          return jsonResponse(makeUser({ id: 'u1', username: 'cmdr', email: 'c@dominion.imp' }))
        return jsonResponse(page([])) // inventory / factions etc.
      }),
    )

    renderAt('/inventory')

    const nav = await screen.findByLabelText('Breadcrumb')
    expect(within(nav).getByText('Collection')).toBeInTheDocument()
    expect(within(nav).getByText('Inventory')).toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { tokenStore } from './api/client'
import App from './App'
import { jsonResponse, makeArmy, makeFacets, makeUser, page } from './test/fixtures'

/** Writes the current location into the DOM, so a test can assert where a redirect
 *  actually landed. Needed for the query string, which survives the redirect but
 *  never reaches a request — the catalog's search box holds it in local state. */
function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{`${pathname}${search}`}</output>
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Signed in, with every request answered generically. Returns the fetch mock so a
 *  test can assert which URLs the landed view asked for — which is how the redirect
 *  tests below prove a route parameter survived the move. */
function signedIn() {
  tokenStore.set('tok')
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.endsWith('/me')) return jsonResponse(makeUser({ id: 'u1', username: 'cmdr' }))
    if (u.includes('/units/facets')) return jsonResponse(makeFacets())
    if (/\/me\/armies\/[^/]+$/.test(u)) return jsonResponse(makeArmy({ id: 'a1' }))
    return jsonResponse(page([])) // inventory / factions / units etc.
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
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

  it('offers both sections at the root, and only one of them is a destination', async () => {
    signedIn()

    renderAt('/')

    // Awaited on the heading, and the links are read WITHIN the view: the Header
    // also has an "Army List" link, so an unscoped query would pass while the lazy
    // chooser was still loading.
    await screen.findByRole('heading', { name: 'Two games, one shelf' })
    const chooser = within(screen.getByRole('main'))

    // `/` is a chooser, not either section's index (KILLTEAM.md #11), so neither
    // game is the app's implicit default.
    expect(chooser.getByRole('link', { name: /Army List/ })).toHaveAttribute('href', '/army-list')
    // Kill Team is shown so the shape of the app is honest about what is coming,
    // but it is not a link until KF2 — a live one would bounce off the catch-all.
    expect(chooser.queryByRole('link', { name: /Kill Team/ })).not.toBeInTheDocument()
    expect(chooser.getByText('Not here yet')).toBeInTheDocument()
    // A chooser is not inside a section, so it carries no breadcrumbs.
    expect(screen.queryByLabelText('Breadcrumb')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('shows section-rooted breadcrumbs on an authenticated page', async () => {
    signedIn()

    renderAt('/army-list/inventory')

    const nav = await screen.findByLabelText('Breadcrumb')
    // Rooted at the section, not at `/`: the first crumb names where you are.
    expect(within(nav).getByText('Army List')).toBeInTheDocument()
    expect(within(nav).getByText('Inventory')).toBeInTheDocument()
  })

  describe('pre-section paths keep resolving', () => {
    // These five paths were live and bookmarkable before the sections existed. A
    // redirect that quietly dropped a route parameter would send someone who
    // bookmarked one army to the index instead, which is the failure these guard.

    it.each([
      ['/inventory', '/me/inventory'],
      ['/catalog', '/units'],
    ])('%s lands in the section and loads its view', async (from, expectedRequest) => {
      const fetchMock = signedIn()

      renderAt(from)

      await screen.findByLabelText('Breadcrumb')
      const asked = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(asked.some((u) => u.includes(expectedRequest))).toBe(true)
    })

    it('/armies/:id keeps the army id across the redirect', async () => {
      const fetchMock = signedIn()

      renderAt('/armies/a1')

      await screen.findByLabelText('Breadcrumb')
      const asked = fetchMock.mock.calls.map((c) => String(c[0]))
      // The id is the whole point: `/api/v1/me/armies/a1`, not the armies index.
      expect(asked.some((u) => u.endsWith('/api/v1/me/armies/a1'))).toBe(true)
    })

    it('/armies/:id/catalog keeps the id and lands on the add-units view', async () => {
      const fetchMock = signedIn()

      renderAt('/armies/a1/catalog')

      const nav = await screen.findByLabelText('Breadcrumb')
      expect(within(nav).getByText('Add Units')).toBeInTheDocument()
      // The "Army" crumb points back into the section, carrying the id.
      expect(within(nav).getByRole('link', { name: 'Army' })).toHaveAttribute(
        'href',
        '/army-list/armies/a1',
      )
      expect(fetchMock.mock.calls.length).toBeGreaterThan(0)
    })

    it('/units/:id keeps the unit id across the redirect', async () => {
      const fetchMock = signedIn()

      renderAt('/units/u-int')

      await screen.findByLabelText('Breadcrumb')
      const asked = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(asked.some((u) => u.endsWith('/api/v1/units/u-int'))).toBe(true)
    })

    it('carries the query string across', async () => {
      signedIn()

      renderAt('/catalog?q=intercessor')

      await screen.findByLabelText('Breadcrumb')
      // Asserted on the location rather than on a request: the redirect's job is to
      // preserve the URL, and whether the catalog reads `q` from it is its own
      // concern. Dropping the search here would silently lose a shared link's filter.
      expect(screen.getByTestId('location')).toHaveTextContent('/army-list/catalog?q=intercessor')
    })

    it('rewrites the path and nothing else', async () => {
      signedIn()

      renderAt('/armies/a1/catalog')

      await screen.findByLabelText('Breadcrumb')
      expect(screen.getByTestId('location')).toHaveTextContent('/army-list/armies/a1/catalog')
    })
  })
})

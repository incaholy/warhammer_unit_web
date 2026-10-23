import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { tokenStore } from './api/client'
import App from './App'
import {
  jsonResponse,
  makeArmy,
  makeFacets,
  makeKillTeam,
  makeKillTeamDetail,
  makeKTFaction,
  makeUniversal,
  makeUser,
  page,
} from './test/fixtures'

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

  it('answers an unknown URL instead of silently going home (F13 tier 3)', async () => {
    signedIn()
    renderAt('/kill-team/catalog')

    // This was `<Navigate to="/" replace />`, so a mistyped, stale or
    // shared-but-deleted link became the home page with nothing to say it had not
    // worked. Found by walking the product and assuming this path existed; the Kill
    // Team catalog is at `/kill-team`.
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not find the page')

    // AND it is still a heading. `role="alert"` sat on the `h1` itself, and an explicit
    // role REPLACES the implicit one -- so every not-found screen announced itself and
    // then had no `h1` in the accessibility tree and no document outline. The role
    // belongs on the region, which can carry it without costing the heading.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Could not find the page' }),
    ).toBeInTheDocument()

    // And it offers the section the path was in, not the top of the app. Addressed by
    // the arrow, because the app header carries a "Kill Team" nav link too.
    expect(screen.getByRole('link', { name: '← Kill Team' })).toHaveAttribute('href', '/kill-team')
  })

  it('keeps the legacy redirects as redirects', async () => {
    // The pre-section paths really did move, so those stay a redirect: the player
    // should land where they meant rather than be told they are lost.
    signedIn()
    renderAt('/inventory')
    expect(await screen.findByText('/army-list/inventory')).toBeInTheDocument()
  })

  it('redirects an unauthenticated visit to the login screen', async () => {
    renderAt('/')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('renders the login screen at /login', async () => {
    renderAt('/login')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('offers both sections at the root', async () => {
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
    expect(chooser.getByRole('link', { name: /Kill Team/ })).toHaveAttribute('href', '/kill-team')
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

describe('App routing: the two branches', () => {
  // The largest gap either audit found: every Kill Team view test renders the
  // component in a bare MemoryRouter, bypassing `App`. So the two claims the route
  // tree exists to make were verified nowhere, and wrapping the public branch back
  // inside `RequireAuth` left the whole suite green.

  /** Signed OUT, with the catalog's public reads answered. */
  function visitor() {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/me')) return jsonResponse({ detail: 'nope', code: 'UNAUTHORIZED' }, { status: 401 })
      if (u.includes('/kill-team/factions')) {
        return jsonResponse(page([makeKTFaction({ id: 'ktf1', name: 'Tyranids' })]))
      }
      if (/\/kill-team\/teams\/[^/]+$/.test(u)) return jsonResponse(makeKillTeamDetail())
      if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
      if (u.includes('/kill-team/teams')) {
        return jsonResponse(page([makeKillTeam({ id: 'kt1', name: 'Raveners' })]))
      }
      return jsonResponse(page([]))
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('lets a signed-out visitor browse the catalog', async () => {
    // KF2's central claim: the catalog's reads need no token, so a shared team link
    // works without an account.
    visitor()

    renderAt('/kill-team')

    expect(await screen.findByRole('heading', { name: 'Kill teams', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/kill-team')
  })

  it('lets a signed-out visitor open a team page', async () => {
    visitor()

    renderAt('/kill-team/teams/kt1')

    expect(await screen.findByRole('heading', { name: 'Raveners', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/kill-team/teams/kt1')
  })

  it('offers a visitor a way in, where a signed-in user gets a way out', async () => {
    visitor()

    renderAt('/kill-team')

    await screen.findByRole('heading', { name: 'Kill teams', level: 1 })
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Log Out' })).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor from the ROSTERS to the login screen', async () => {
    // KF3's counterpart claim: a roster is user-owned, so it sits inside the guard.
    visitor()

    renderAt('/kill-team/rosters')

    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your rosters' })).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor from a roster page to the login screen', async () => {
    visitor()

    renderAt('/kill-team/rosters/ktr-1')

    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('shows the Kill Team section crumbs', async () => {
    // `crumbsForPath`'s whole `kill-team` branch was at 0% coverage.
    visitor()

    renderAt('/kill-team/teams/kt1')

    const nav = await screen.findByLabelText('Breadcrumb')
    expect(within(nav).getAllByText(/Kill Team/).length).toBeGreaterThan(0)
    expect(within(nav).getByRole('link', { name: 'Kill Team' })).toHaveAttribute(
      'href',
      '/kill-team',
    )
  })

  it('sends a signed-out visitor from the BATTLES to the login screen', async () => {
    // KF4's counterpart claim: a game is user-owned like a roster, so it is inside
    // the guard and not beside the public catalog.
    visitor()

    renderAt('/kill-team/games')

    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your battles' })).not.toBeInTheDocument()
  })

  it('renders the battles for a signed-in player, with its own crumbs', async () => {
    signedIn()

    renderAt('/kill-team/games')

    expect(await screen.findByRole('heading', { name: 'Your battles', level: 1 })).toBeInTheDocument()
    const nav = screen.getByLabelText('Breadcrumb')
    // `crumbsForPath` is hand-written per section, so a new branch that was never
    // added renders only the Kill Team home crumb -- silently, with no error.
    expect(within(nav).getByText('Battles')).toBeInTheDocument()
  })

  it('sends a signed-out visitor from a BATTLE page to the login screen', async () => {
    visitor()

    renderAt('/kill-team/games/ktg-1')

    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('shows the Battle crumb trail, with Battles linked back', async () => {
    signedIn()

    renderAt('/kill-team/games/ktg-1')

    const nav = await screen.findByLabelText('Breadcrumb')
    // Three levels, and the middle one has to be a LINK: the detail branch of
    // `crumbsForPath` is separate from the list branch, so a slice that added the
    // route and forgot the `rest.length > 1` case renders "Battles" unlinked.
    expect(within(nav).getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'href',
      '/kill-team/games',
    )
    expect(within(nav).getByText('Battle')).toBeInTheDocument()
  })

  it('offers Battles in the Kill Team page nav', async () => {
    signedIn()

    renderAt('/kill-team/games')

    await screen.findByRole('heading', { name: 'Your battles', level: 1 })
    expect(screen.getByRole('link', { name: 'Battles' })).toHaveAttribute(
      'href',
      '/kill-team/games',
    )
  })
})

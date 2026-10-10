/* The app route table (SPEC.md → "Routing & views"). Public /login; every other
 * route sits behind RequireAuth inside a Header + Breadcrumbs shell. This is the
 * central glue that mounts the independently-built views.
 *
 * Two sections, per KILLTEAM.md decision #11: the 40k builder under /army-list and
 * Kill Team under /kill-team. Neither section's routes or views leak into the other.
 * `/` is a chooser rather than either section's index, so neither is the implicit
 * default. The pre-section paths (/, /inventory, /catalog, /armies/..., /units/...)
 * were live and bookmarkable, so each one still resolves — see LegacySectionRedirect. */

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Header, Breadcrumbs, type Crumb } from './ui'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'

// Route-level code splitting: each view ships in its own chunk, so the login
// screen doesn't pull in the whole app. (Named-export views need the .then map.)
const AuthView = lazy(() => import('./views/AuthView').then((m) => ({ default: m.AuthView })))
const SectionView = lazy(() => import('./views/SectionView'))
const CollectionView = lazy(() => import('./views/CollectionView'))
const KillTeamCatalogView = lazy(() => import('./views/KillTeamCatalogView'))
const KillTeamView = lazy(() => import('./views/KillTeamView'))
const KillTeamRostersView = lazy(() => import('./views/KillTeamRostersView'))
const KillTeamRosterView = lazy(() => import('./views/KillTeamRosterView'))
const CatalogView = lazy(() => import('./views/CatalogView'))
const InventoryView = lazy(() => import('./views/InventoryView').then((m) => ({ default: m.InventoryView })))
const ArmyView = lazy(() => import('./views/ArmyView'))
const UnitView = lazy(() => import('./views/UnitView'))

/** Quiet fallback while a lazy view chunk loads. */
function ViewFallback() {
  return <div style={{ minHeight: '40vh' }} aria-hidden="true" />
}

/** Sends a pre-section URL to its new home under /army-list, keeping the rest of
 * the path and the query string.
 *
 * Built from the CURRENT pathname rather than a per-route `<Navigate to>` string,
 * which is what makes it parameter-safe: `/armies/abc123` carries its id across
 * without anyone reassembling it, and a route added under a redirected prefix is
 * covered without a second entry. A static `to` would have silently dropped the id
 * and landed the visitor on the index instead — the failure a bookmark redirect
 * exists to prevent. */
function LegacySectionRedirect() {
  const { pathname, search } = useLocation()
  return <Navigate to={`/army-list${pathname}${search}`} replace />
}

/** Route-structural breadcrumbs. Entity-name crumbs (army/unit names) are a later
 * refinement — they'd need the view's loaded data.
 *
 * Rooted at the SECTION, not at `/`: `/` is a chooser and carries no crumbs, so the
 * first crumb a visitor sees names the section they are inside. */
function crumbsForPath(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return []

  if (parts[0] === 'kill-team') {
    const home: Crumb = { label: 'Kill Team', to: '/kill-team' }
    const rest = parts.slice(1)
    if (rest.length === 0) return []
    if (rest[0] === 'teams') return [home, { label: 'Kill Team' }]
    if (rest[0] === 'rosters') {
      return rest.length > 1
        ? [home, { label: 'Rosters', to: '/kill-team/rosters' }, { label: 'Roster' }]
        : [home, { label: 'Rosters' }]
    }
    return [home]
  }

  if (parts[0] === 'army-list') {
    const home: Crumb = { label: 'Army List', to: '/army-list' }
    const rest = parts.slice(1)
    if (rest.length === 0) return []
    if (rest[0] === 'inventory') return [home, { label: 'Inventory' }]
    if (rest[0] === 'catalog') return [home, { label: 'Catalog' }]
    if (rest[0] === 'units') return [home, { label: 'Datasheet' }]
    if (rest[0] === 'armies') {
      if (rest[2] === 'catalog') {
        return [home, { label: 'Army', to: `/army-list/armies/${rest[1]}` }, { label: 'Add Units' }]
      }
      return [home, { label: 'Army' }]
    }
    return [home]
  }

  return []
}

/** Authenticated shell: sticky Header + breadcrumbs + the matched route's view. */
/** Header + breadcrumbs + the matched route's view.
 *
 * Used by BOTH route branches. The Kill Team catalog is public (every read under
 * `/api/v1/kill-team` needs no token), so this shell renders with no user at all —
 * which is why it tells the Header whether there is one rather than assuming. */
function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const crumbs = crumbsForPath(pathname)
  return (
    <>
      <Header
        pathname={pathname}
        signedIn={Boolean(user)}
        onLogout={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      />
      {crumbs.length > 0 && (
        <div style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: '22px 48px 0' }}>
          <Breadcrumbs items={crumbs} />
        </div>
      )}
      <Suspense fallback={<ViewFallback />}>
        <Outlet />
      </Suspense>
    </>
  )
}

/** Catalog opened from an army — passes the army target so "+ Add" adds to it. */
function ArmyCatalog() {
  const { armyId } = useParams()
  return <CatalogView target={{ kind: 'army', armyId: armyId! }} />
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <Suspense fallback={<ViewFallback />}>
            <AuthView />
          </Suspense>
        }
      />

      {/* Public, inside the same shell. The Kill Team CATALOG is reference data and
        * every one of its reads is open (KILLTEAM.md #21, #49), so a visitor can
        * follow a shared team link without an account. Only the catalog: a roster
        * or a game is user-owned and arrives behind the guard in KF3/KF4. */}
      <Route element={<AppLayout />}>
        <Route path="/kill-team" element={<KillTeamCatalogView />} />
        <Route path="/kill-team/teams/:killTeamId" element={<KillTeamView />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<SectionView />} />

        {/* The 40k section. */}
        <Route path="/army-list" element={<CollectionView />} />
        <Route path="/army-list/inventory" element={<InventoryView />} />
        <Route path="/army-list/catalog" element={<CatalogView />} />
        <Route path="/army-list/armies/:armyId" element={<ArmyView />} />
        <Route path="/army-list/armies/:armyId/catalog" element={<ArmyCatalog />} />
        <Route path="/army-list/units/:unitId" element={<UnitView />} />

        {/* Kill Team's user-owned half. The catalog above is public; a roster is
          * not, so these are inside the guard. */}
        <Route path="/kill-team/rosters" element={<KillTeamRostersView />} />
        <Route path="/kill-team/rosters/:rosterId" element={<KillTeamRosterView />} />

        {/* Pre-section paths, kept so existing bookmarks resolve. The splats cover
         * the nested army and unit routes without repeating their parameters. */}
        <Route path="/inventory" element={<LegacySectionRedirect />} />
        <Route path="/catalog" element={<LegacySectionRedirect />} />
        <Route path="/armies/*" element={<LegacySectionRedirect />} />
        <Route path="/units/*" element={<LegacySectionRedirect />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

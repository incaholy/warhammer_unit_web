/* The app route table (SPEC.md → "Routing & views"). Public /login; every other
 * route sits behind RequireAuth inside a Header + Breadcrumbs shell. This is the
 * central glue that mounts the independently-built views. */

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Header, Breadcrumbs, type Crumb } from './ui'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'

// Route-level code splitting: each view ships in its own chunk, so the login
// screen doesn't pull in the whole app. (Named-export views need the .then map.)
const AuthView = lazy(() => import('./views/AuthView').then((m) => ({ default: m.AuthView })))
const CollectionView = lazy(() => import('./views/CollectionView'))
const CatalogView = lazy(() => import('./views/CatalogView'))
const InventoryView = lazy(() => import('./views/InventoryView').then((m) => ({ default: m.InventoryView })))
const ArmyView = lazy(() => import('./views/ArmyView'))
const UnitView = lazy(() => import('./views/UnitView'))

/** Quiet fallback while a lazy view chunk loads. */
function ViewFallback() {
  return <div style={{ minHeight: '40vh' }} aria-hidden="true" />
}

/** Route-structural breadcrumbs. Entity-name crumbs (army/unit names) are a later
 * refinement — they'd need the view's loaded data. */
function crumbsForPath(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  const home: Crumb = { label: 'Collection', to: '/' }
  if (parts.length === 0) return []
  if (parts[0] === 'inventory') return [home, { label: 'Inventory' }]
  if (parts[0] === 'catalog') return [home, { label: 'Catalog' }]
  if (parts[0] === 'units') return [home, { label: 'Datasheet' }]
  if (parts[0] === 'armies') {
    if (parts[2] === 'catalog') {
      return [home, { label: 'Army', to: `/armies/${parts[1]}` }, { label: 'Add Units' }]
    }
    return [home, { label: 'Army' }]
  }
  return [home]
}

/** Authenticated shell: sticky Header + breadcrumbs + the matched route's view. */
function AppLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const crumbs = crumbsForPath(useLocation().pathname)
  return (
    <>
      <Header
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

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<CollectionView />} />
        <Route path="/inventory" element={<InventoryView />} />
        <Route path="/catalog" element={<CatalogView />} />
        <Route path="/armies/:armyId" element={<ArmyView />} />
        <Route path="/armies/:armyId/catalog" element={<ArmyCatalog />} />
        <Route path="/units/:unitId" element={<UnitView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/* The app route table (SPEC.md → "Routing & views"). Public /login; every other
 * route sits behind RequireAuth inside a Header shell. This is the central glue
 * that mounts the independently-built views. */

import { Routes, Route, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom'
import { Header } from './ui'
import { useAuth } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { AuthView } from './views/AuthView'
import CollectionView from './views/CollectionView'
import CatalogView from './views/CatalogView'
import { InventoryView } from './views/InventoryView'
import ArmyView from './views/ArmyView'
import UnitView from './views/UnitView'

/** Authenticated shell: sticky Header + the matched route's view. */
function AppLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <>
      <Header
        onLogout={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      />
      <Outlet />
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
      <Route path="/login" element={<AuthView />} />

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

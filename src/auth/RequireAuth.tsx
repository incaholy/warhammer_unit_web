/* Route guard: gate every non-auth route behind a hydrated session.
 * See SPEC.md → "Guarding". */

import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export interface RequireAuthProps {
  /** Rendered when authenticated. Falls back to a nested `<Outlet/>` if omitted. */
  children?: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, isLoading } = useAuth()

  // Don't decide until the initial /me hydration settles, or we'd flash /login
  // for an already-signed-in user on a hard refresh.
  if (isLoading) return null

  if (!user) return <Navigate to="/login" replace />

  return <>{children ?? <Outlet />}</>
}

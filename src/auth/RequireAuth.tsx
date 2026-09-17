/* Route guard: gate every non-auth route behind a hydrated session.
 * See SPEC.md → "Guarding". */

import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export interface RequireAuthProps {
  /** Rendered when authenticated. Falls back to a nested `<Outlet/>` if omitted. */
  children?: ReactNode
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  // Don't decide until the initial /me hydration settles, or we'd flash /login
  // for an already-signed-in user on a hard refresh.
  if (isLoading) return null

  // Carry the attempted URL so signing in returns the user there instead of the
  // home view (ROADMAP F6). It travels in router *state*, not a query parameter:
  // state is set by this code and never appears in a link someone can craft, which
  // removes most of the open-redirect surface. AuthView still validates it.
  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <>{children ?? <Outlet />}</>
}

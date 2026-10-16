/* The session layer: token in localStorage + the current user, exposed as a
 * React context. See SPEC.md → "Auth & session". Views never read the token or
 * call the auth resource directly — they go through `useAuth()`. */

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tokenStore, onUnauthorized } from '../api/client'
import { register as apiRegister, login as apiLogin, getMe } from '../api/auth'
import type { User_Read } from '../api/types'

export interface AuthContextValue {
  /** The current user, or `null` when signed out / not yet hydrated. */
  user: User_Read | null
  /** True while the initial `getMe()` hydration is in flight. */
  isLoading: boolean
  /** Log in with a username *or* email identifier (sent as the OAuth2 `username`). */
  login: (identifier: string, password: string) => Promise<void>
  /** Register (Name → `username`) then log in with the same credentials. */
  register: (name: string, email: string, password: string) => Promise<void>
  /** End the session: drop the token, the current user, and all cached server data. */
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // The provider is mounted inside <QueryClientProvider> (main.tsx), so the
  // session layer can end the session completely — see `logout` below.
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User_Read | null>(null)
  // Loading only when we actually hold a token to hydrate — otherwise there's
  // nothing to wait for (avoids a setState directly inside the effect).
  const [isLoading, setIsLoading] = useState<boolean>(() => tokenStore.get() != null)

  // On mount: if we hold a token, hydrate the user from /me. A stale token
  // (getMe rejects, e.g. 401) is cleared so the app falls back to /login.
  useEffect(() => {
    let active = true
    const token = tokenStore.get()
    if (!token) return
    getMe()
      .then((me) => {
        if (active) setUser(me)
      })
      .catch(() => {
        if (!active) return
        tokenStore.clear()
        setUser(null)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  // When the HTTP client sees a 401 it already clears the token; mirror that in
  // the session by dropping the user so guards bounce to /login.
  useEffect(() => {
    const off = onUnauthorized(() => setUser(null))
    return off
  }, [])

  async function login(identifier: string, password: string): Promise<void> {
    const token = await apiLogin(identifier, password)
    tokenStore.set(token.access_token)
    // Starting a session drops whatever the previous one cached. `logout()` below
    // covers the deliberate exit, but a session can also end involuntarily: the
    // client clears the token on a 401 (client.ts) without touching the cache,
    // because clearing from that listener would make mounted queries refetch,
    // 401, and re-enter it. Clearing here closes that path instead — the new
    // token is already stored, so any refetch this triggers is the new user's.
    queryClient.clear()
    const me = await getMe()
    setUser(me)
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    await apiRegister({ username: name, email, password })
    await login(email, password)
  }

  function logout(): void {
    tokenStore.clear()
    setUser(null)
    // Cached server state outlives the token unless it is dropped explicitly, and
    // TanStack Query serves the cache on mount before any refetch resolves — so a
    // second user on a shared browser would see the first user's data on FIRST
    // PAINT, not in a narrow race. `clear()` (not `resetQueries()`) because the
    // user is leaving: reset would immediately refetch every active query, and
    // those requests now carry no token.
    //
    // Deliberately not wired into the `onUnauthorized` listener below: clearing
    // there removes queries that still have mounted observers, which refetch,
    // 401 again, and re-enter this path.
    queryClient.clear()
  }

  const value: AuthContextValue = { user, isLoading, login, register, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Access the session. Throws if used outside an `<AuthProvider>`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

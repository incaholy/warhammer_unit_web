import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './AuthContext'
import { RequireAuth } from './RequireAuth'
import { tokenStore } from '../api/client'

/** Renders whatever the guard put in router state, so a test can assert on it. */
function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: unknown } | null)?.from
  return <span data-testid="from">{typeof from === 'string' ? from : 'none'}</span>
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginProbe />} />
            <Route
              path="/armies/:armyId"
              element={
                <RequireAuth>
                  <span>protected</span>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequireAuth', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  it('bounces a signed-out user to /login', async () => {
    renderAt('/armies/a1')
    await waitFor(() => expect(screen.getByTestId('from')).toBeInTheDocument())
    expect(screen.queryByText('protected')).not.toBeInTheDocument()
  })

  it('carries the attempted URL so sign-in can return there (F6)', async () => {
    renderAt('/armies/a1?tab=roster#top')
    await waitFor(() =>
      expect(screen.getByTestId('from')).toHaveTextContent('/armies/a1?tab=roster#top'),
    )
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import App from './App'

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

  it('redirects an unauthenticated visit to the login screen', async () => {
    renderAt('/')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('renders the login screen at /login', async () => {
    renderAt('/login')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })
})

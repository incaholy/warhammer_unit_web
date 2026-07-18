import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthView } from './AuthView'
import { AuthProvider } from '../auth/AuthContext'
import { tokenStore } from '../api/client'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AuthView />
      </AuthProvider>
    </MemoryRouter>,
  )
}

/** The Log In / Sign Up mode toggle (scoped so its labels don't collide with
 *  the submit button, which shares the mode's text). */
function toggle() {
  return within(screen.getByRole('group', { name: 'Log In or Sign Up' }))
}

describe('AuthView', () => {
  beforeEach(() => {
    tokenStore.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders Log In mode by default (email + password, no name field)', () => {
    renderView()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Confirm Password')).not.toBeInTheDocument()
    expect(toggle().getByRole('button', { name: 'Log In' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches to Sign Up via the toggle, revealing name + confirm fields', () => {
    renderView()
    fireEvent.click(toggle().getByRole('button', { name: 'Sign Up' }))

    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument()
    expect(toggle().getByRole('button', { name: 'Sign Up' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('shows an inline error message when login fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ detail: 'Invalid credentials' }, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    renderView()

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'kesh@x.io' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' },
    })
    const submit = screen
      .getAllByRole('button', { name: 'Log In' })
      .find((b) => b.getAttribute('type') === 'submit')!
    fireEvent.click(submit)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'),
    )
  })
})

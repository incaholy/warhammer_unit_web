import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

describe('Header', () => {
  it('renders the wordmark and nav links', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByText('Muster')).toBeInTheDocument()
    expect(screen.getByText('Collection Index')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Armies' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument()
  })

  it('fires onLogout when Log Out is clicked', () => {
    const onLogout = vi.fn()
    render(
      <MemoryRouter>
        <Header onLogout={onLogout} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

describe('Header', () => {
  it('renders the wordmark and the section nav', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByText('Muster')).toBeInTheDocument()
    expect(screen.getByText('Collection Index')).toBeInTheDocument()
    // Top row: the sections. Kill Team is present but not a link until KF2.
    expect(screen.getByRole('link', { name: 'Army List' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Kill Team' })).not.toBeInTheDocument()
    expect(screen.getByText('Kill Team')).toHaveAttribute('aria-disabled', 'true')
  })

  it('shows a section\'s own pages only while inside that section', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Header pathname="/" />
      </MemoryRouter>,
    )
    // The chooser is not inside a section, so there is no second row.
    expect(screen.queryByRole('link', { name: 'Armies' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Army List pages' })).not.toBeInTheDocument()
    unmount()

    render(
      <MemoryRouter>
        <Header pathname="/army-list/inventory" />
      </MemoryRouter>,
    )
    const pages = screen.getByRole('navigation', { name: 'Army List pages' })
    expect(pages).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Armies' })).toHaveAttribute('href', '/army-list')
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute(
      'href',
      '/army-list/inventory',
    )
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

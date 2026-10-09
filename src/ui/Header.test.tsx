import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

describe('Header', () => {
  it('renders the wordmark and a link per section', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByText('Muster')).toBeInTheDocument()
    expect(screen.getByText('Collection Index')).toBeInTheDocument()
    const sections = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(sections.getByRole('link', { name: 'Army List' })).toHaveAttribute('href', '/army-list')
    expect(sections.getByRole('link', { name: 'Kill Team' })).toHaveAttribute('href', '/kill-team')
  })

  it('offers a way in when nobody is signed in, and out when someone is', () => {
    // `signedIn` defaults to false, which is the safe default now that the Kill Team
    // catalog renders for visitors: a default of true would offer "Log Out" to
    // someone who never logged in.
    const { unmount } = render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'Log Out' })).not.toBeInTheDocument()
    unmount()

    render(
      <MemoryRouter>
        <Header signedIn />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Log Out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
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

    const second = render(
      <MemoryRouter>
        <Header pathname="/army-list/inventory" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation', { name: 'Army List pages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Armies' })).toHaveAttribute('href', '/army-list')
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute(
      'href',
      '/army-list/inventory',
    )
    second.unmount()

    // The second row is named for the section you are IN. It was hardcoded to
    // "Army List pages", which was wrong the moment a second section existed.
    render(
      <MemoryRouter>
        <Header pathname="/kill-team/teams/kt1" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation', { name: 'Kill Team pages' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Catalog' })).toHaveAttribute('href', '/kill-team')
    expect(screen.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument()
  })

  it('fires onLogout when Log Out is clicked', () => {
    const onLogout = vi.fn()
    render(
      <MemoryRouter>
        <Header signedIn onLogout={onLogout} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Log Out' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { CollectionView } from './CollectionView'
import type { Army_Read, Faction_Read, Unit_Read } from '../api/types'
import { listArmies } from '../api/armies'

// The read hooks call the api module directly; mock it so we can drive a pending
// query (a promise that never settles) for the skeleton-state test. Existing
// tests seed data via setQueryData and never hit this mock.
vi.mock('../api/armies', () => ({
  listArmies: vi.fn(() => new Promise<never>(() => {})),
}))

const unit = (id: string) => ({ id }) as unknown as Unit_Read

const factions: Faction_Read[] = [
  { id: 'f-dominion', name: 'The Dominion', subfactions: [] },
  { id: 'f-hollow', name: 'Hollow Vigil', subfactions: [] },
]

const armies: Army_Read[] = [
  {
    id: 'a1',
    created_at: '2026-01-01T00:00:00Z',
    name: 'The Hollow Vigil',
    faction_id: 'f-hollow',
    subfaction_id: null,
    description: 'A grim watch upon the walls.',
    points_limit: 2000,
    points_total: 1980,
    units: [
      { unit: unit('u1'), amount: 3 },
      { unit: unit('u2'), amount: 1 },
    ],
  },
  {
    id: 'a2',
    created_at: '2026-01-01T00:00:00Z',
    name: 'Dawnbreak Column',
    faction_id: 'f-dominion',
    subfaction_id: null,
    description: null,
    points_limit: null,
    points_total: 1000,
    units: [{ unit: unit('u3'), amount: 2 }],
  },
]

function renderView(seedArmies: Army_Read[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(['armies'], seedArmies)
  client.setQueryData(['factions'], factions)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CollectionView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CollectionView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('lists the seeded armies with faction, points, and unit count', () => {
    renderView(armies)

    expect(screen.getByRole('heading', { name: 'Collection' })).toBeInTheDocument()
    expect(screen.getByText('The Hollow Vigil')).toBeInTheDocument()
    expect(screen.getByText('Dawnbreak Column')).toBeInTheDocument()
    expect(screen.getByText('Hollow Vigil')).toBeInTheDocument()

    // Aggregated meta: 2 armies · 6 units · 2980 pts
    expect(screen.getByText('2 armies · 6 units · 2980 pts')).toBeInTheDocument()
    expect(screen.getByText('1980 pts')).toBeInTheDocument()
  })

  it('shows skeleton rows while the armies query is pending', () => {
    vi.mocked(listArmies).mockImplementation(() => new Promise<never>(() => {}))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // Seed factions only; leave ['armies'] unseeded so its query stays pending.
    client.setQueryData(['factions'], factions)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CollectionView />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getAllByTestId('army-skeleton').length).toBeGreaterThan(0)
    // No real army rows or empty state while loading.
    expect(screen.queryByText('No armies mustered yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no armies', () => {
    renderView([])
    expect(screen.getByText('No armies mustered yet.')).toBeInTheDocument()
    expect(screen.queryByText('The Hollow Vigil')).not.toBeInTheDocument()
  })

  it('toggles between List and Grid and persists the choice', () => {
    renderView(armies)

    const listBtn = screen.getByRole('button', { name: 'List' })
    const gridBtn = screen.getByRole('button', { name: 'Grid' })
    expect(listBtn).toHaveAttribute('aria-pressed', 'true')
    expect(gridBtn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(gridBtn)

    expect(gridBtn).toHaveAttribute('aria-pressed', 'true')
    expect(listBtn).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('muster:collection-layout')).toBe('grid')

    // Armies still render in grid layout.
    expect(screen.getByText('Dawnbreak Column')).toBeInTheDocument()
  })

  it('opens the New Army modal from the header button', () => {
    renderView(armies)
    fireEvent.click(screen.getByRole('button', { name: '+ New Army' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('New Army')).toBeInTheDocument()
  })
})

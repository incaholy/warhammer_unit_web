import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { InventoryView } from './InventoryView'
import { queryKeys } from '../api/queries'
import { jsonResponse, makeUnit, makeUserUnit, page } from '../test/fixtures'
import type { Unit_Read, UserUnit_Read } from '../api/types'

// --- fetch stub (mutations go through the real HTTP client) ---

// A minimal Unit_Read with the given name + keywords (the only fields this view reads).
/** Shorthand over the shared builder, so the fixture table below stays readable. */
function unitRow(id: string, unit_name: string, keywords: string[]): Unit_Read {
  return makeUnit({ id, unit_name, keywords })
}

function makeEntry(unit: Unit_Read, amount: number): UserUnit_Read {
  return { unit, amount }
}

/** Wrap rows in the pagination envelope the inventory list hook now exposes. */

// Owned units spanning three derived roles (Characters, Battleline, Vehicles).
const OWNED: UserUnit_Read[] = [
  makeEntry(unitRow('u-captain', 'Blade Captain', ['Character', 'Infantry']), 1),
  makeEntry(unitRow('u-troops', 'Battle Sisters', ['Battleline', 'Infantry']), 3),
  makeEntry(unitRow('u-tank', 'Siege Tank', ['Vehicle']), 2),
]

function renderView(owned: UserUnit_Read[] | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  if (owned !== null) client.setQueryData(queryKeys.inventory, page(owned))
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <InventoryView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

describe('InventoryView', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }))
      if (init?.method === 'PATCH') return Promise.resolve(jsonResponse(makeUserUnit({ unit: makeUnit(), amount: 1 })))
      // any GET (e.g. an invalidation-triggered refetch)
      return Promise.resolve(jsonResponse(page(OWNED)))
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows skeleton placeholders while the inventory query is pending', () => {
    // Keep the inventory fetch pending so the query never leaves isLoading.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    renderView(null)

    const skeleton = screen.getByTestId('inventory-skeleton')
    expect(skeleton).toBeInTheDocument()
    // The pending region is announced to assistive tech…
    expect(skeleton).toHaveAttribute('role', 'status')
    expect(skeleton).toHaveAccessibleName('Loading inventory')
    // …and no real rows / error / empty copy render yet.
    expect(screen.queryByText('Couldn’t load your inventory.')).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing in your collection yet')).not.toBeInTheDocument()
  })

  it('renders the header meta from owned datasheets and total models', () => {
    renderView(OWNED)
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
    // 3 datasheets · 6 total models (1 + 3 + 2)
    expect(screen.getByText('3 owned datasheets · 6 models')).toBeInTheDocument()
  })

  it('groups owned units into role sections', () => {
    renderView(OWNED)
    expect(screen.getByRole('button', { name: /Characters/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Battleline/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vehicles/ })).toBeInTheDocument()
    expect(screen.getByText('Blade Captain')).toBeInTheDocument()
    expect(screen.getByText('Siege Tank')).toBeInTheDocument()
  })

  it('collapses a role section when its header is clicked', () => {
    renderView(OWNED)
    expect(screen.getByText('Blade Captain')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Characters/ }))
    expect(screen.queryByText('Blade Captain')).not.toBeInTheDocument()
  })

  it('persists a changed quantity via the set-amount mutation (debounced)', async () => {
    renderView(OWNED)
    const input = screen.getByLabelText('Owned quantity of Battle Sisters')
    fireEvent.change(input, { target: { value: '5' } })

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(patch![0]).toContain('/me/inventory/u-troops')
      expect(patch![1].body).toBe(JSON.stringify({ amount: 5 }))
    })
  })

  it('removes a unit via the remove mutation', async () => {
    renderView(OWNED)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Siege Tank' }))

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
      expect(del).toBeTruthy()
      expect(del![0]).toContain('/me/inventory/u-tank')
    })
  })

  it('shows the empty state when nothing is owned', () => {
    renderView([])
    expect(screen.getByText('Nothing in your collection yet')).toBeInTheDocument()
    // The empty state offers an add action.
    const empty = screen.getByText('Nothing in your collection yet').closest('div')!
    expect(within(empty).getByRole('button', { name: /Add to Inventory/ })).toBeInTheDocument()
  })

  it('filters the list by the search query', () => {
    renderView(OWNED)
    fireEvent.change(screen.getByLabelText('Search inventory'), {
      target: { value: 'tank' },
    })
    expect(screen.getByText('Siege Tank')).toBeInTheDocument()
    expect(screen.queryByText('Blade Captain')).not.toBeInTheDocument()
  })
})

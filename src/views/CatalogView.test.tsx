import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CatalogView, { type CatalogTarget } from './CatalogView'
import type { Faction_Read, Unit_Read } from '../api/types'

// ---- Mock data ----------------------------------------------------------------

const factions: Faction_Read[] = [
  { id: 'f1', name: 'Imperium', subfactions: [] },
  { id: 'f2', name: 'Xenos', subfactions: [] },
]

function makeUnit(id: string, name: string, factionId: string, keywords: string[]): Unit_Read {
  return {
    id,
    unit_name: name,
    faction_id: factionId,
    subfaction_id: null,
    movement: 6,
    toughness: 4,
    armor_save: 3,
    wounds: 2,
    invulnerable_save: null,
    leadership: 6,
    objective_control: 1,
    points: 100,
    keywords,
    weapons: [],
    abilities: [],
  }
}

const units: Unit_Read[] = [
  makeUnit('u1', 'Sword Captain', 'f1', ['Character']),
  makeUnit('u2', 'Line Trooper', 'f1', ['Battleline']),
  makeUnit('u3', 'Hive Warrior', 'f2', ['Battleline']),
]

// The user owns u1 → an "Owned" tag should render for it.
const inventory = [{ unit: units[0], amount: 2 }]

const army = {
  id: 'army-1',
  name: 'The Hollow Vigil',
  faction_id: 'f1',
  subfaction_id: null,
  description: null,
  points_limit: null,
  points_total: 0,
  units: [],
}

// ---- Fetch stub ---------------------------------------------------------------

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** Route by method + path, filtering /units by `faction_id` and `q`. */
function makeFetchMock() {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const url = new URL(input, 'http://localhost')
    const path = url.pathname

    if (method === 'GET' && path === '/factions') return jsonResponse(factions)
    if (method === 'GET' && path === '/me/inventory') return jsonResponse(inventory)
    if (method === 'GET' && path === '/me/armies/army-1') return jsonResponse(army)

    if (method === 'GET' && path === '/units') {
      const factionId = url.searchParams.get('faction_id')
      const q = url.searchParams.get('q')?.toLowerCase()
      let matched = units
      if (factionId) matched = matched.filter((u) => u.faction_id === factionId)
      if (q) matched = matched.filter((u) => u.unit_name.toLowerCase().includes(q))
      return jsonResponse(matched, {
        headers: { 'Content-Type': 'application/json', 'X-Total-Count': String(matched.length) },
      })
    }

    if (method === 'POST' && (path === '/me/inventory' || path === '/me/armies/army-1/units')) {
      return jsonResponse({ unit: units[0], amount: 1 }, { status: 201 })
    }

    throw new Error(`Unhandled request: ${method} ${path}`)
  })
}

function renderView(target?: CatalogTarget) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CatalogView target={target} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ---- Tests --------------------------------------------------------------------

describe('CatalogView', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>

  beforeEach(() => {
    fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading skeletons while the units query is pending', async () => {
    renderView()

    // On the first render the units query is still pending → the skeleton
    // placeholder (an accessible loading status) is shown before rows arrive.
    const status = screen.getByRole('status', { name: /loading units/i })
    expect(status).toBeInTheDocument()

    // The skeleton must give way to real rows once the query resolves.
    expect(await screen.findByText('Sword Captain')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /loading units/i })).not.toBeInTheDocument()
  })

  it('renders unit rows with faction · role and an owned tag', async () => {
    renderView()

    expect(await screen.findByText('Sword Captain')).toBeInTheDocument()
    expect(screen.getByText('Line Trooper')).toBeInTheDocument()
    expect(screen.getByText('Hive Warrior')).toBeInTheDocument()

    // Derived role + faction name on the owned unit's row.
    expect(screen.getByText('Imperium · Characters')).toBeInTheDocument()
    // u1 is in the inventory → owned tag present.
    expect(screen.getByText('Owned')).toBeInTheDocument()
  })

  it('shows the "N of M" count backed by X-Total-Count', async () => {
    renderView()
    // 3 units total, all on the first page.
    expect(await screen.findByText('3 of 3')).toBeInTheDocument()
  })

  it('filters units when a faction is selected', async () => {
    renderView()
    await screen.findByText('Hive Warrior')

    fireEvent.click(screen.getByRole('button', { name: /Xenos/i }))

    // After the faction-filtered refetch resolves, only the Xenos unit remains.
    expect(await screen.findByText('Hive Warrior')).toBeInTheDocument()
    expect(screen.queryByText('Sword Captain')).not.toBeInTheDocument()

    // The units request carried the faction_id filter.
    const filtered = fetchMock.mock.calls.some(([input, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = new URL(input as string, 'http://localhost')
      return method === 'GET' && url.pathname === '/units' && url.searchParams.get('faction_id') === 'f2'
    })
    expect(filtered).toBe(true)
  })

  it('wires the search input to the q filter', async () => {
    renderView()
    await screen.findByText('Sword Captain')

    fireEvent.change(screen.getByLabelText('Search units'), { target: { value: 'hive' } })

    // Only the matching unit remains once the q-filtered refetch resolves.
    expect(await screen.findByText('Hive Warrior')).toBeInTheDocument()
    expect(screen.queryByText('Sword Captain')).not.toBeInTheDocument()

    const searched = fetchMock.mock.calls.some(([input, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = new URL(input as string, 'http://localhost')
      return method === 'GET' && url.pathname === '/units' && url.searchParams.get('q') === 'hive'
    })
    expect(searched).toBe(true)
  })

  it('adds to the INVENTORY when target is the inventory (default)', async () => {
    renderView({ kind: 'inventory' })
    await screen.findByText('Sword Captain')

    const rows = screen.getAllByRole('listitem')
    fireEvent.click(within(rows[0]).getByRole('button', { name: /\+ add/i }))

    await waitFor(() => {
      const posted = fetchMock.mock.calls.some(([input, init]) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        const url = new URL(input as string, 'http://localhost')
        return method === 'POST' && url.pathname === '/me/inventory'
      })
      expect(posted).toBe(true)
    })

    // It must NOT have posted to an army endpoint.
    const armyPost = fetchMock.mock.calls.some(([input, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = new URL(input as string, 'http://localhost')
      return method === 'POST' && url.pathname.endsWith('/units')
    })
    expect(armyPost).toBe(false)
  })

  it('adds to the ARMY when target is an army', async () => {
    renderView({ kind: 'army', armyId: 'army-1' })
    await screen.findByText('Sword Captain')

    // Header reflects the army name.
    expect(screen.getByText('Adding to The Hollow Vigil')).toBeInTheDocument()

    const rows = screen.getAllByRole('listitem')
    fireEvent.click(within(rows[0]).getByRole('button', { name: /\+ add/i }))

    await waitFor(() => {
      const posted = fetchMock.mock.calls.some(([input, init]) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        const url = new URL(input as string, 'http://localhost')
        return method === 'POST' && url.pathname === '/me/armies/army-1/units'
      })
      expect(posted).toBe(true)
    })
  })
})

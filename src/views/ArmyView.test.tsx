import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'

import ArmyView from './ArmyView'
import type { Army_Read, Unit_Read } from '../api/types'

// ---- Fixtures ----

function unit(over: Partial<Unit_Read> & { id: string; unit_name: string }): Unit_Read {
  return {
    faction_id: 'f1',
    subfaction_id: null,
    movement: 6,
    toughness: 4,
    armor_save: 3,
    wounds: 2,
    invulnerable_save: null,
    leadership: 6,
    objective_control: 1,
    points: 100,
    keywords: [],
    weapons: [],
    abilities: [],
    ...over,
  }
}

const captain = unit({ id: 'u-cap', unit_name: 'Captain', points: 80, keywords: ['Character'] })
const intercessors = unit({
  id: 'u-int',
  unit_name: 'Intercessors',
  points: 100,
  keywords: ['Battleline', 'Infantry'],
})
const tank = unit({ id: 'u-tank', unit_name: 'Repulsor', points: 180, keywords: ['Vehicle'] })

const ARMY: Army_Read & { created_at: string } = {
  id: 'a1',
  name: 'Vigil Host',
  faction_id: 'f1',
  subfaction_id: null,
  description: null,
  points_limit: 2000,
  points_total: 1080,
  created_at: '2026-07-01T00:00:00Z',
  units: [
    { unit: intercessors, amount: 3 },
    { unit: captain, amount: 1 },
    { unit: tank, amount: 1 },
  ],
}

const EMPTY_ARMY: Army_Read = { ...ARMY, units: [], points_total: 0 }

const FACTIONS = [{ id: 'f1', name: 'Space Marines', subfactions: [] }]

// ---- Harness ----

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** Route fetch by path: single army, factions, and a DELETE for remove-unit. */
function stubFetch(army: Army_Read, onDelete?: (url: string) => void) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (init?.method === 'DELETE') {
      onDelete?.(url)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url.includes('/factions')) return Promise.resolve(jsonResponse(FACTIONS))
    if (url.includes('/me/armies/')) return Promise.resolve(jsonResponse(army))
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView(armyId = 'a1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = (ui: ReactNode) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/armies/${armyId}`]}>
        <Routes>
          <Route path="/armies/:armyId" element={ui} />
          <Route path="/units/:unitId" element={<div>unit page</div>} />
          <Route path="/armies/:armyId/catalog" element={<div>catalog page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(wrapper(<ArmyView />))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('ArmyView', () => {
  it('renders the army header with faction, name, and points/units meta', async () => {
    stubFetch(ARMY)
    renderView()

    expect(await screen.findByRole('heading', { name: 'Vigil Host' })).toBeInTheDocument()
    expect(screen.getByText('Space Marines')).toBeInTheDocument()

    // points_total, total fielded models (3 + 1 + 1 = 5), and the created label.
    const meta = screen.getByText(/1080 pts/)
    expect(meta).toHaveTextContent('1080 pts')
    expect(meta).toHaveTextContent('5 units')
    expect(meta).toHaveTextContent(/Created/)
  })

  it('groups units by derived role in priority order', async () => {
    stubFetch(ARMY)
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    // Role group labels present and ordered Characters → Battleline → Vehicles.
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('Battleline')).toBeInTheDocument()
    expect(screen.getByText('Vehicles')).toBeInTheDocument()

    const labels = screen
      .getAllByText(/Characters|Battleline|Vehicles/)
      .map((el) => el.textContent)
    expect(labels).toEqual(['Characters', 'Battleline', 'Vehicles'])

    // Each unit row links to its datasheet and shows quantity when > 1.
    const link = screen.getByRole('link', { name: 'Intercessors' })
    expect(link).toHaveAttribute('href', '/units/u-int')
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('calls the remove-unit mutation (DELETE) when Remove is clicked', async () => {
    const onDelete = vi.fn()
    stubFetch(ARMY, onDelete)
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    // The Captain row's Remove button.
    const captainRow = screen.getByRole('link', { name: 'Captain' }).closest('div')!
      .parentElement!
    const removeBtn = within(captainRow).getByRole('button', { name: 'Remove' })
    fireEvent.click(removeBtn)

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith(expect.stringContaining('/me/armies/a1/units/u-cap')),
    )
  })

  it('shows the empty state for an army with no units', async () => {
    stubFetch(EMPTY_ARMY)
    renderView()

    expect(await screen.findByText('No units mustered yet')).toBeInTheDocument()
    expect(screen.queryByText('Characters')).not.toBeInTheDocument()
  })
})

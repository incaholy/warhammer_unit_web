import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'

import ArmyView from './ArmyView'
import type {
  Army_Read,
  Shortfall_Read,
  Unit_Read,
  Validation_Read,
} from '../api/types'

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

// A legal, no-shortfall army over the wire — the default so the base-view tests
// exercise the clean state.
const LEGAL: Validation_Read = { ok: true, points_total: 1080, points_limit: 2000, issues: [] }
const NO_SHORTFALL: Shortfall_Read[] = []

// ---- Harness ----

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

interface StubOptions {
  onDelete?: (url: string) => void
  validation?: Validation_Read
  shortfall?: Shortfall_Read[]
}

/** Route fetch by path: single army, factions, validate, shortfall, and a DELETE
 * for remove-unit. `/validate` and `/shortfall` are matched before the generic
 * army route (all three share the `/me/armies/{id}` prefix). */
function stubFetch(army: Army_Read, options: StubOptions = {}) {
  const { onDelete, validation = LEGAL, shortfall = NO_SHORTFALL } = options
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (init?.method === 'DELETE') {
      onDelete?.(url)
      return Promise.resolve(new Response(null, { status: 204 }))
    }
    if (url.includes('/factions')) return Promise.resolve(jsonResponse(FACTIONS))
    if (url.includes('/validate')) return Promise.resolve(jsonResponse(validation))
    if (url.includes('/shortfall')) return Promise.resolve(jsonResponse(shortfall))
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
    stubFetch(ARMY, { onDelete })
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    // The Captain row's Remove button.
    const captainRow = screen.getByRole('link', { name: 'Captain' }).closest('div')!
      .parentElement!
    const removeBtn = within(captainRow).getByRole('button', { name: 'Remove Captain' })
    fireEvent.click(removeBtn)

    await waitFor(() =>
      expect(onDelete).toHaveBeenCalledWith(expect.stringContaining('/me/armies/a1/units/u-cap')),
    )
  })

  it('shows a loading skeleton while the army query is pending', async () => {
    stubFetch(ARMY)
    renderView()

    // The query starts pending, so the very first render is the skeleton — a
    // polite status region flagged aria-busy, with no real heading yet.
    const skeleton = screen.getByRole('status', { name: 'Loading army' })
    expect(skeleton).toBeInTheDocument()
    expect(skeleton).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('heading', { name: 'Vigil Host' })).not.toBeInTheDocument()

    // Once data resolves the skeleton is replaced by the real header.
    expect(await screen.findByRole('heading', { name: 'Vigil Host' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading army' })).not.toBeInTheDocument()
  })

  it('exposes an accessible progressbar and named remove buttons', async () => {
    stubFetch(ARMY)
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    // Points-limit bar is a labelled progressbar reporting now/max.
    const bar = screen.getByRole('progressbar', { name: 'Points used against limit' })
    expect(bar).toHaveAttribute('aria-valuenow', '1080')
    expect(bar).toHaveAttribute('aria-valuemax', '2000')

    // Each remove button names the unit it removes.
    expect(screen.getByRole('button', { name: 'Remove Captain' })).toBeInTheDocument()

    // The panels are named regions.
    expect(screen.getByRole('region', { name: 'Legality' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'What to Buy' })).toBeInTheDocument()
  })

  it('shows the empty state for an army with no units', async () => {
    stubFetch(EMPTY_ARMY)
    renderView()

    expect(await screen.findByText('No units mustered yet')).toBeInTheDocument()
    expect(screen.queryByText('Characters')).not.toBeInTheDocument()
  })

  it('flags an over-limit army and lists the over-points issue', async () => {
    const validation: Validation_Read = {
      ok: false,
      points_total: 1080,
      points_limit: 1000,
      issues: [
        {
          kind: 'over_points',
          detail: 'List is 80 points over the 1000 limit.',
          unit: null,
        },
      ],
    }
    stubFetch({ ...ARMY, points_limit: 1000 }, { validation })
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    // Header progress is flagged over the limit.
    expect(await screen.findByText('Over Limit')).toBeInTheDocument()
    expect(screen.getByText('1080 / 1000 pts')).toBeInTheDocument()

    // The legality panel surfaces the over-points issue (kind label + detail).
    expect(screen.getByText('Over Points')).toBeInTheDocument()
    expect(screen.getByText(/80 points over the 1000 limit/)).toBeInTheDocument()
  })

  it('renders a wrong-faction issue with its offending unit', async () => {
    const orks = unit({ id: 'u-ork', unit_name: 'Ork Boyz', faction_id: 'f9' })
    const validation: Validation_Read = {
      ok: false,
      points_total: 1080,
      points_limit: 2000,
      issues: [
        {
          kind: 'wrong_faction',
          detail: 'Ork Boyz is not a Space Marines unit.',
          unit: orks,
        },
      ],
    }
    stubFetch(ARMY, { validation })
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    expect(await screen.findByText('Wrong Faction')).toBeInTheDocument()
    // The offending unit name and detail both render in the issue row.
    expect(screen.getByText('Ork Boyz')).toBeInTheDocument()
    expect(screen.getByText(/not a Space Marines unit/)).toBeInTheDocument()
  })

  it('lists the units to buy in the shortfall panel', async () => {
    const shortfall: Shortfall_Read[] = [
      { unit: tank, in_list: 1, owned: 0, need: 1 },
      // Fully owned — must be filtered out of the "to buy" list.
      { unit: intercessors, in_list: 3, owned: 3, need: 0 },
    ]
    stubFetch(ARMY, { shortfall })
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    const panel = (await screen.findByRole('heading', { name: 'What to Buy' })).closest(
      'section',
    )!
    // The needed unit (Repulsor also appears in Order of Battle, so scope to the panel).
    expect(within(panel).getByText('Repulsor')).toBeInTheDocument()
    expect(within(panel).getByText('+1 to buy')).toBeInTheDocument()
    // The covered unit adds no buy row.
    expect(within(panel).queryByText('Intercessors')).not.toBeInTheDocument()
  })

  it('shows the clean legal + no-shortfall state for a valid army', async () => {
    stubFetch(ARMY) // defaults: legal validation, empty shortfall
    renderView()

    await screen.findByRole('heading', { name: 'Vigil Host' })

    expect(await screen.findByText('Legal — no issues found')).toBeInTheDocument()
    expect(screen.getByText(/Nothing needed/)).toBeInTheDocument()
    // No over-limit flag for an in-budget list.
    expect(screen.queryByText('Over Limit')).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'

import ArmyView from './ArmyView'
import type {
  Army_Read,
  Shortfall_Read,
  Validation_Read,
} from '../api/types'
import { jsonResponse, makeArmyUnit, makeFaction, makeUnit, page } from '../test/fixtures'

// ---- Fixtures ----


const captain = makeUnit({ id: 'u-cap', unit_name: 'Captain', points: 80, keywords: ['Character'] })
const intercessors = makeUnit({
  id: 'u-int',
  unit_name: 'Intercessors',
  points: 100,
  keywords: ['Battleline', 'Infantry'],
})
const tank = makeUnit({ id: 'u-tank', unit_name: 'Repulsor', points: 180, keywords: ['Vehicle'] })

const ARMY: Army_Read = {
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

const FACTIONS = [makeFaction({ id: 'f1', name: 'Space Marines' })]

// A legal, no-shortfall army over the wire — the default so the base-view tests
// exercise the clean state.
const LEGAL: Validation_Read = { ok: true, points_total: 1080, points_limit: 2000, issues: [] }
const NO_SHORTFALL: Shortfall_Read[] = []

// ---- Harness ----


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
    if (init?.method === 'PATCH') {
      // Rename patches the army; a unit quantity patches .../units/{id}.
      const body = JSON.parse(String(init.body ?? '{}'))
      return Promise.resolve(
        jsonResponse(
          url.includes('/units/')
            ? makeArmyUnit({ unit: intercessors, amount: body.amount ?? 1 })
            : { ...army, ...body },
        ),
      )
    }
    if (url.includes('/factions'))
      return Promise.resolve(
        jsonResponse(page(FACTIONS)),
      )
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
  // Restore here, not at the end of the test that installs them: a test failing
  // before its own cleanup would otherwise leave fake timers on and every later
  // test would hang on a real `waitFor`.
  vi.useRealTimers()
})

describe('ArmyView', () => {
  it('renames the army in place', async () => {
    const fetchMock = stubFetch(ARMY)
    renderView()
    await screen.findByRole('heading', { name: 'Vigil Host' })

    fireEvent.click(screen.getByRole('button', { name: /Rename Vigil Host/i }))
    const field = screen.getByLabelText('Army name')
    expect(field).toHaveFocus() // moved by an effect, not `autoFocus`

    fireEvent.change(field, { target: { value: 'Hollow Vigil' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const patched = fetchMock.mock.calls.some(
        ([, init]) =>
          init?.method === 'PATCH' && JSON.parse(String(init.body)).name === 'Hollow Vigil',
      )
      expect(patched).toBe(true)
    })
  })

  it('does not send a rename that changed nothing', async () => {
    const fetchMock = stubFetch(ARMY)
    renderView()
    await screen.findByRole('heading', { name: 'Vigil Host' })

    fireEvent.click(screen.getByRole('button', { name: /Rename Vigil Host/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
  })

  it('cancels a rename on Escape', async () => {
    stubFetch(ARMY)
    renderView()
    await screen.findByRole('heading', { name: 'Vigil Host' })

    fireEvent.click(screen.getByRole('button', { name: /Rename Vigil Host/i }))
    fireEvent.change(screen.getByLabelText('Army name'), { target: { value: 'Discarded' } })
    fireEvent.keyDown(screen.getByLabelText('Army name'), { key: 'Escape' })

    expect(screen.getByRole('heading', { name: 'Vigil Host' })).toBeInTheDocument()
  })

  it('deletes the army behind a confirmation, then leaves the page', async () => {
    const deleted: string[] = []
    stubFetch(ARMY, { onDelete: (url) => deleted.push(url) })
    renderView()
    await screen.findByRole('heading', { name: 'Vigil Host' })

    // Destructive, so it asks first rather than acting on the click.
    fireEvent.click(screen.getByRole('button', { name: 'Delete Army' }))
    expect(screen.getByRole('dialog', { name: /Delete this army/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleted.some((u) => u.endsWith('/me/armies/a1'))).toBe(true))
  })

  it('keeps the army when the confirmation is dismissed', async () => {
    const deleted: string[] = []
    stubFetch(ARMY, { onDelete: (url) => deleted.push(url) })
    renderView()
    await screen.findByRole('heading', { name: 'Vigil Host' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Army' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleted).toHaveLength(0)
  })

  it('changes a unit quantity, debounced', async () => {
    const fetchMock = stubFetch(ARMY)
    renderView()
    // Let the initial load settle on real timers -- `findBy*` polls, so installing
    // fake timers first would hang it.
    await screen.findByLabelText('Quantity of Intercessors')
    vi.useFakeTimers()

    const field = screen.getByLabelText('Quantity of Intercessors')
    fireEvent.change(field, { target: { value: '5' } })

    // Nothing yet — a request per keystroke is what the debounce avoids.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    const patched = fetchMock.mock.calls.some(
      ([url, init]) =>
        init?.method === 'PATCH' &&
        String(url).includes('/units/') &&
        JSON.parse(String(init.body)).amount === 5,
    )
    expect(patched).toBe(true)
  })

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
    // The quantity is an editable field now, not a "×3" label.
    expect(screen.getByLabelText('Quantity of Intercessors')).toHaveValue(3)
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
    const orks = makeUnit({ id: 'u-ork', unit_name: 'Ork Boyz', faction_id: 'f9' })
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

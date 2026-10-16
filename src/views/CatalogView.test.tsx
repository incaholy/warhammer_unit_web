import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import CatalogView, { type CatalogTarget } from './CatalogView'
import type { Faction_Read, Unit_Read } from '../api/types'
import {
  jsonResponse,
  makeArmy,
  makeUnit,
  makeUserUnit,
  page,
} from '../test/fixtures'

// ---- Mock data ----------------------------------------------------------------

const factions: Faction_Read[] = [
  { id: 'f1', name: 'Imperium', subfactions: [] },
  { id: 'f2', name: 'Xenos', subfactions: [] },
]

/** Local shorthand over the shared builder, so the table of units below stays readable. */
function unitRow(id: string, name: string, factionId: string, keywords: string[]): Unit_Read {
  return makeUnit({ id, unit_name: name, faction_id: factionId, keywords })
}

const units: Unit_Read[] = [
  unitRow('u1', 'Sword Captain', 'f1', ['Character']),
  unitRow('u2', 'Line Trooper', 'f1', ['Battleline']),
  unitRow('u3', 'Hive Warrior', 'f2', ['Battleline']),
]

// The user owns u1 → an "Owned" tag should render for it.
// Deliberately larger than one page (the backend caps a request at 200), with the
// entry that matters LAST. A client that reads only the first page answers "do I
// own this?" against a window and renders an owned unit as un-owned.
const inventoryFiller = Array.from({ length: 250 }, (_, i) =>
  makeUserUnit({ unit: makeUnit({ id: `filler-${i}` }) }),
)
const inventory = [...inventoryFiller, makeUserUnit({ unit: units[0], amount: 2 })]
const ownedIds = new Set(inventory.map((entry) => entry.unit.id))
const isOwned = (u: Unit_Read) => ownedIds.has(u.id)

const army = makeArmy({ id: 'army-1' })

// ---- Fetch stub ---------------------------------------------------------------

/** Route by method + path, filtering /units by `faction_id` and `q`. */
function makeFetchMock() {
  return vi.fn(async (input: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    const url = new URL(input, 'http://localhost')
    const path = url.pathname.replace(/^\/api\/v1/, '')

    if (method === 'GET' && path === '/factions') return jsonResponse(page(factions))
    if (method === 'GET' && path === '/me/inventory') {
      // Paginates like the real endpoint, so a client that takes only the first
      // page is visibly wrong rather than accidentally right.
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      return jsonResponse(
        page(inventory.slice(offset, offset + limit), { total: inventory.length, limit, offset }),
      )
    }
    if (method === 'GET' && path === '/me/armies/army-1') return jsonResponse(army)

    // Per-faction rail counts — grouped over the same `q` the request carries
    // (no faction filter: the rail shows every faction's count at once).
    if (method === 'GET' && path === '/units/facets') {
      const q = url.searchParams.get('q')?.toLowerCase()
      let matched = units
      if (q) matched = matched.filter((u) => u.unit_name.toLowerCase().includes(q))
      if (url.searchParams.get('owned') === 'true') matched = matched.filter(isOwned)
      const by_faction: Record<string, number> = {}
      for (const u of matched) by_faction[u.faction_id] = (by_faction[u.faction_id] ?? 0) + 1
      return jsonResponse({ total: matched.length, by_faction })
    }

    if (method === 'GET' && path === '/units') {
      const factionId = url.searchParams.get('faction_id')
      const q = url.searchParams.get('q')?.toLowerCase()
      let matched = units
      if (factionId) matched = matched.filter((u) => u.faction_id === factionId)
      if (q) matched = matched.filter((u) => u.unit_name.toLowerCase().includes(q))
      // The server owns this filter now (backend `owned=true`), so the fake server
      // has to apply it too -- otherwise the test proves nothing about the toggle.
      if (url.searchParams.get('owned') === 'true') matched = matched.filter(isOwned)
      return jsonResponse(page(matched))
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

  it('shows the "N of M" count backed by the body total', async () => {
    renderView()
    // 3 units total, all on the first page.
    expect(await screen.findByText('3 of 3')).toBeInTheDocument()
  })

  it('asks the server for owned-only units instead of filtering the page (F10)', async () => {
    renderView()
    await screen.findByText('Sword Captain')

    fireEvent.click(screen.getByRole('button', { name: /Owned only/i }))

    // Only the owned unit remains...
    expect(await screen.findByText('Sword Captain')).toBeInTheDocument()
    expect(screen.queryByText('Line Trooper')).not.toBeInTheDocument()

    // ...and it remains because the REQUEST carried the filter. Filtering the
    // page in the browser would hide owned units sitting on other pages and make
    // the count compare a filtered page against an unfiltered total.
    const asked = fetchMock.mock.calls.some(([input, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = new URL(input as string, 'http://localhost')
      return (
        method === 'GET' &&
        url.pathname.replace(/^\/api\/v1/, '') === '/units' &&
        url.searchParams.get('owned') === 'true'
      )
    })
    expect(asked).toBe(true)
  })

  it('counts the filtered set, not the whole catalog', async () => {
    renderView()
    expect(await screen.findByText('3 of 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Owned only/i }))

    // 1 of 1, not "1 of 3" -- the total now counts the same filtered set.
    expect(await screen.findByText('1 of 1')).toBeInTheDocument()
  })

  it('sends owned to the facets aggregate so the rail agrees with the list', async () => {
    renderView()
    await screen.findByText('Sword Captain')

    fireEvent.click(screen.getByRole('button', { name: /Owned only/i }))

    await waitFor(() => {
      const asked = fetchMock.mock.calls.some(([input]) => {
        const url = new URL(input as string, 'http://localhost')
        return (
          url.pathname.replace(/^\/api\/v1/, '') === '/units/facets' &&
          url.searchParams.get('owned') === 'true'
        )
      })
      expect(asked).toBe(true)
    })
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
      const path = url.pathname.replace(/^\/api\/v1/, '')
      return method === 'GET' && path === '/units' && url.searchParams.get('faction_id') === 'f2'
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
      const path = url.pathname.replace(/^\/api\/v1/, '')
      return method === 'GET' && path === '/units' && url.searchParams.get('q') === 'hive'
    })
    expect(searched).toBe(true)
  })

  it('adds to the INVENTORY when target is the inventory (default)', async () => {
    renderView({ kind: 'inventory' })
    await screen.findByText('Sword Captain')

    const rows = screen.getAllByRole('listitem')
    // rows[0] (u1) is already owned → its button is a disabled "Added"; add a
    // not-yet-owned unit instead. (Re-adding an owned unit would 409 now — R12.)
    fireEvent.click(within(rows[1]).getByRole('button', { name: /\+ add/i }))

    await waitFor(() => {
      const posted = fetchMock.mock.calls.some(([input, init]) => {
        const method = (init?.method ?? 'GET').toUpperCase()
        const url = new URL(input as string, 'http://localhost')
        const path = url.pathname.replace(/^\/api\/v1/, '')
        return method === 'POST' && path === '/me/inventory'
      })
      expect(posted).toBe(true)
    })

    // It must NOT have posted to an army endpoint.
    const armyPost = fetchMock.mock.calls.some(([input, init]) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      const url = new URL(input as string, 'http://localhost')
      const path = url.pathname.replace(/^\/api\/v1/, '')
      return method === 'POST' && path.endsWith('/units')
    })
    expect(armyPost).toBe(false)
  })

  it('shows a disabled "Added" for a unit already in the target (no re-add — R12)', async () => {
    renderView({ kind: 'inventory' })
    await screen.findByText('Sword Captain')

    // u1 is in the inventory, so its add control is a disabled "Added": re-adding
    // would 409 now that POST is create-only.
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByRole('button', { name: /added/i })).toBeDisabled()
    expect(within(rows[0]).queryByRole('button', { name: /\+ add/i })).toBeNull()
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
        const path = url.pathname.replace(/^\/api\/v1/, '')
        return method === 'POST' && path === '/me/armies/army-1/units'
      })
      expect(posted).toBe(true)
    })
  })
})

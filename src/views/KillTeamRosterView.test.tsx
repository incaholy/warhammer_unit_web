import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamRosterView from './KillTeamRosterView'
import {
  jsonResponse,
  makeKTOperative,
  makeKTRoster,
  makeKTRosterOperative,
  page,
} from '../test/fixtures'
import type { KTOperative_ListRead, KTRoster_Read } from '../api/types'

const POOL = [
  makeKTOperative({ id: 'kto1', name: 'Ravener Prime', position: 0 }),
  makeKTOperative({ id: 'kto2', name: 'Hormagaunt', position: 1 }),
  makeKTOperative({ id: 'kto9', name: 'Mutoid Vermin', availability: 'in_battle', position: 2 }),
]

function stubFetch(roster: KTRoster_Read = makeKTRoster(), pool = POOL) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    if (method === 'DELETE') return new Response(null, { status: 204 })
    if (u.includes('/operatives/')) return jsonResponse(makeKTRosterOperative())
    if (u.includes('/me/kill-team/rosters/') && u.endsWith('/operatives')) {
      return jsonResponse(makeKTRosterOperative({ id: 'ktro-new' }))
    }
    if (/\/me\/kill-team\/rosters\/[^/]+$/.test(u)) return jsonResponse(roster)
    if (u.includes('/kill-team/operatives')) {
      return jsonResponse(page<KTOperative_ListRead>(pool, { total: pool.length }))
    }
    throw new Error(`unexpected request: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView(id = 'ktr-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/kill-team/rosters/${id}`]}>
        <Routes>
          <Route path="/kill-team/rosters/:rosterId" element={<KillTeamRosterView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KillTeamRosterView', () => {
  it('names the roster, its team and its faction', async () => {
    stubFetch()
    renderView()
    expect(await screen.findByRole('heading', { name: 'My Raveners', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Raveners · Tyranids')).toBeInTheDocument()
  })

  it('reads the roster once, and the Reference tab adds nothing', async () => {
    // `KTRoster_Read` carries the rows, the team's reference AND both universal
    // lists (#52), so the Reference tab must not fetch. The picker IS a second read
    // — the pool to add from is the catalog's, not the roster's — so the assertion
    // is on the roster read specifically rather than on a total call count.
    const fetchMock = stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    const rosterReads = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => /\/me\/kill-team\/rosters\/[^/]+$/.test(u))
    expect(rosterReads).toHaveLength(1)
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/kill-team/universal'))).toBe(
      false,
    )
  })

  it('lists two rows holding the same datacard as two rows', async () => {
    // The roster's defining property (#50): a row is one operative, add appends, and
    // each row is addressed by its own id. The fixture has two Hormagaunts.
    stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    // Scoped to the list: the picker below contributes an <h2> of its own.
    const list = screen.getByRole('list', { name: '' }) ?? screen.getAllByRole('list')[0]
    const names = within(list)
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(names).toEqual(['Ravener Prime', 'Hormagaunt', 'Hormagaunt'])
  })

  it('numbers the rows by their place in the list, not by raw position', async () => {
    // `position` is a sort hint, neither contiguous nor distinct (#53). After a move
    // it can read 0, 2, 2 — printing it raw would number the list "1, 3, 3".
    stubFetch(
      makeKTRoster({
        operatives: [
          makeKTRosterOperative({
            id: 'a',
            position: 0,
            operative: makeKTOperative({ id: 'k1', name: 'First' }),
          }),
          makeKTRosterOperative({
            id: 'b',
            position: 7,
            operative: makeKTOperative({ id: 'k2', name: 'Second' }),
          }),
          makeKTRosterOperative({
            id: 'c',
            position: 7,
            operative: makeKTOperative({ id: 'k3', name: 'Third' }),
          }),
        ],
      }),
    )
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    // Queried by test id, not by a digit pattern: the stat line also renders bare
    // numbers (APL 2, Wounds 12), so `/^\d+$/` matched three things per row.
    const ordinals = screen.getAllByTestId('row-ordinal').map((n) => n.textContent?.trim())
    expect(ordinals).toEqual(['1', '2', '3'])
  })

  it('counts the operatives and links to the kill team', async () => {
    stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    expect(screen.getByText(/3 operatives/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View the kill team' })).toHaveAttribute(
      'href',
      '/kill-team/teams/kt1',
    )
  })

  it('keeps each datacard collapsed until asked for', async () => {
    // A roster of ten with every weapon table open is unreadable, and a player
    // building one is comparing names and stat lines. `<details>` works without JS.
    stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    const first = screen.getAllByRole('listitem')[0]
    // The stat line is always visible.
    expect(within(first).getByText('APL')).toBeInTheDocument()

    // Asserted on the element's `open` state rather than on the table's absence:
    // jsdom does not hide a closed `<details>`'s children from queries the way a
    // browser does, so `queryByRole('table')` finds it either way and would pass
    // whether or not the card was collapsed.
    const details = within(first).getByText('Datacard').closest('details')
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute('open')
    // The weapon table is inside it, so opening reveals the real content.
    expect(details && within(details).getByRole('table')).toBeTruthy()
  })

  it('shows the reference from the roster read, universal lists separated', async () => {
    stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    expect(screen.getByText('Tunnel')).toBeInTheDocument()
    expect(screen.getByText('Predatory Instincts')).toBeInTheDocument()
    expect(screen.getByText('Universal — every team may use these')).toBeInTheDocument()
    expect(screen.getByText('Command Re-roll')).toBeInTheDocument()
  })

  it('says a roster that is not yours does not exist', async () => {
    // 404 rather than 403, so an id reveals nothing — the same answer a bad id gets.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'not found', code: 'NOT_FOUND' }, { status: 404 })),
    )
    renderView('someone-elses')

    expect(await screen.findByRole('alert')).toHaveTextContent('That roster does not exist.')
    expect(screen.getByRole('link', { name: /Your rosters/ })).toHaveAttribute(
      'href',
      '/kill-team/rosters',
    )
  })

  it('distinguishes a server failure from a missing roster', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 })),
    )
    renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this roster.")
  })

  it('shows an empty roster as empty rather than broken', async () => {
    stubFetch(makeKTRoster({ operatives: [] }))
    renderView()
    expect(await screen.findByText('No operatives yet. Add one below.')).toBeInTheDocument()
  })

  it('announces that it is loading', async () => {
    stubFetch()
    renderView()
    expect(screen.getByRole('status', { name: 'Loading roster' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })
  })
})

describe('KillTeamRosterView: the writes', () => {
  function calls(fetchMock: ReturnType<typeof stubFetch>) {
    return fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }))
  }

  describe('reordering', () => {
    it('swaps with the neighbour above, in two absolute PATCHes', async () => {
      // `PATCH position` sets the value and shifts nothing (#53), so a swap is the
      // only move that leaves no tie for `id` to break.
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Move Hormagaunt at position 2 up' }))

      await waitFor(() => {
        const patches = calls(fetchMock).filter((c) => c.method === 'PATCH')
        expect(patches).toHaveLength(2)
        // Row 2 (position 1) takes row 1's position, and row 1 takes row 2's.
        expect(patches[0]).toMatchObject({ body: { position: 0 } })
        expect(patches[1]).toMatchObject({ body: { position: 1 } })
        expect(patches[0].url).toContain('/operatives/ktro-2')
        expect(patches[1].url).toContain('/operatives/ktro-1')
      })
    })

    it('cannot move the first row up or the last row down', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      expect(
        screen.getByRole('button', { name: 'Move Ravener Prime at position 1 up' }),
      ).toBeDisabled()
      const downs = screen.getAllByRole('button', { name: /Move .* down/ })
      expect(downs[downs.length - 1]).toBeDisabled()
    })

    it('names the move buttons per row, so two identical datacards are distinguishable', async () => {
      // Two rows hold a Hormagaunt (#50). Their row ids differ, and the accessible
      // names have to let a keyboard user tell which one they are moving.
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      expect(screen.getByRole('button', { name: 'Remove Hormagaunt at position 2' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Remove Hormagaunt at position 3' })).toBeInTheDocument()
    })
  })

  describe('removing', () => {
    it('DELETEs the row by its own id, not the datacard\'s', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Remove Hormagaunt at position 3' }))

      await waitFor(() => {
        const del = calls(fetchMock).find((c) => c.method === 'DELETE')
        // `ktro-3` is the third ROW; its datacard id is `kto2`, shared with row two.
        expect(del?.url).toContain('/operatives/ktro-3')
        expect(del?.url).not.toContain('kto2')
      })
    })
  })

  describe('adding', () => {
    it('lists the team\'s datacards and POSTs the one chosen', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      const add = await screen.findByRole('button', { name: 'Add Mutoid Vermin' })
      fireEvent.click(add)

      await waitFor(() => {
        const post = calls(fetchMock).find((c) => c.method === 'POST')
        expect(post?.url).toMatch(/\/me\/kill-team\/rosters\/ktr-1\/operatives$/)
        expect(post?.body).toEqual({ operative_id: 'kto9' })
      })
    })

    it('offers an in-battle datacard rather than refusing it, with the marker shown', async () => {
      // Verified against the backend: `add_operative` refuses a cross-team card and
      // a withdrawn one, and nothing else. So `availability` only informs (#51) —
      // refusing it here would be the app holding a rule of the game (#1).
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      const button = await screen.findByRole('button', { name: 'Add Mutoid Vermin' })
      expect(button).toBeEnabled()
      expect(screen.getAllByText('In battle only').length).toBeGreaterThan(0)
    })

    it('keeps a datacard addable after it has been added', async () => {
      // The opposite of the 40k catalog, which disables an added unit because its
      // POST is create-only. Here a second add APPENDS a second row (#50), so there
      // is no "Added" state and nothing to disable.
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      // The roster already holds Hormagaunt twice; the picker still offers it.
      expect(await screen.findByRole('button', { name: 'Add Hormagaunt' })).toBeEnabled()
    })
  })

  describe('renaming', () => {
    it('PATCHes the trimmed name', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Rename My Raveners' }))
      fireEvent.change(screen.getByLabelText('Roster name'), { target: { value: '  Renamed  ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        const patch = calls(fetchMock).find(
          (c) => c.method === 'PATCH' && !c.url.includes('/operatives/'),
        )
        expect(patch?.body).toEqual({ name: 'Renamed' })
      })
    })

    it('sends nothing for an unchanged or empty name', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Rename My Raveners' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(calls(fetchMock).some((c) => c.method === 'PATCH')).toBe(false)

      fireEvent.click(screen.getByRole('button', { name: 'Rename My Raveners' }))
      fireEvent.change(screen.getByLabelText('Roster name'), { target: { value: '   ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(calls(fetchMock).some((c) => c.method === 'PATCH')).toBe(false)
    })

    it('abandons the edit on Escape', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Rename My Raveners' }))
      fireEvent.change(screen.getByLabelText('Roster name'), { target: { value: 'Discarded' } })
      fireEvent.keyDown(screen.getByLabelText('Roster name'), { key: 'Escape' })

      expect(screen.getByRole('heading', { name: 'My Raveners', level: 1 })).toBeInTheDocument()
      expect(calls(fetchMock).some((c) => c.method === 'PATCH')).toBe(false)
    })
  })

  describe('deleting', () => {
    it('states the consequence as the dialog\'s description', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Roster' }))

      // Passed as `description` so `aria-describedby` reaches it and it is read with
      // the title, rather than being body copy a screen-reader user must hunt for.
      expect(
        screen.getByRole('dialog', { name: /Delete this roster/i }),
      ).toHaveAccessibleDescription(
        /My Raveners and its 3 operatives will be removed\. A roster a game was played from cannot be deleted\./,
      )
    })

    it('DELETEs on confirm and leaves for the list', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Roster' }))
      const dialog = screen.getByRole('dialog', { name: /Delete this roster/i })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        const del = calls(fetchMock).find(
          (c) => c.method === 'DELETE' && !c.url.includes('/operatives/'),
        )
        expect(del?.url).toMatch(/\/me\/kill-team\/rosters\/ktr-1$/)
      })
    })

    it('closes the dialog when the delete is refused, so the reason is readable', async () => {
      // #60: a roster a game was played from cannot be deleted, 409 with a message
      // that counts the games. Leaving the modal open would sit it over the toast
      // explaining why nothing happened.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL, init?: RequestInit) => {
          const u = String(url)
          if ((init?.method ?? 'GET') === 'DELETE') {
            return jsonResponse(
              {
                detail: "roster 'My Raveners' is played by 1 game and cannot be deleted",
                code: 'CONFLICT',
              },
              { status: 409 },
            )
          }
          if (/\/me\/kill-team\/rosters\/[^/]+$/.test(u)) return jsonResponse(makeKTRoster())
          return jsonResponse(page<KTOperative_ListRead>([], { total: 0 }))
        }),
      )
      renderView()
      await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

      fireEvent.click(screen.getByRole('button', { name: 'Delete Roster' }))
      const dialog = screen.getByRole('dialog', { name: /Delete this roster/i })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /Delete this roster/i })).not.toBeInTheDocument(),
      )
    })
  })
})

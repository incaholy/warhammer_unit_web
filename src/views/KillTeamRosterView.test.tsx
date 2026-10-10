import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamRosterView from './KillTeamRosterView'
import {
  jsonResponse,
  makeKTOperative,
  makeKTRoster,
  makeKTRosterOperative,
} from '../test/fixtures'
import type { KTRoster_Read } from '../api/types'

function stubFetch(roster: KTRoster_Read = makeKTRoster()) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (/\/me\/kill-team\/rosters\/[^/]+$/.test(u)) return jsonResponse(roster)
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

  it('reads the whole screen in one request', async () => {
    // `KTRoster_Read` carries the rows, the team's reference AND both universal
    // lists (#52), so the Reference tab must not fetch anything.
    const fetchMock = stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })

    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    expect(fetchMock.mock.calls).toHaveLength(1)
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

    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
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
    expect(await screen.findByText('No operatives yet.')).toBeInTheDocument()
  })

  it('announces that it is loading', async () => {
    stubFetch()
    renderView()
    expect(screen.getByRole('status', { name: 'Loading roster' })).toBeInTheDocument()
    await screen.findByRole('heading', { name: 'My Raveners', level: 1 })
  })
})

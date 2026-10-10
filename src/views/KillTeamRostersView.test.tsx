import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamRostersView from './KillTeamRostersView'
import {
  jsonResponse,
  makeKillTeam,
  makeKTFaction,
  makeKTRoster,
  makeKTRosterListRow,
  page,
} from '../test/fixtures'
import type { KillTeam_Read, KTFaction_Read, KTRoster_ListRead } from '../api/types'

const MINE = makeKTRosterListRow({
  id: 'ktr-1',
  name: 'My Raveners',
  kill_team_name: 'Raveners',
  faction_name: 'Tyranids',
  created_at: '2026-03-04T00:00:00Z',
})
const SECOND = makeKTRosterListRow({
  id: 'ktr-2',
  name: 'Tuesday list',
  kill_team_name: 'Gellerpox',
  faction_name: 'Chaos',
  description: 'Shorter game',
})

function stubFetch(rosters: KTRoster_ListRead[] = [MINE, SECOND]) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    // A create answers `KTRoster_Read`, not a page. Returning the list shape here
    // would fail the generated schema and leave the success path untested while the
    // body assertion still passed.
    if (method === 'POST' && u.includes('/me/kill-team/rosters')) {
      return jsonResponse(makeKTRoster({ id: 'ktr-new', name: 'My list' }))
    }
    if (u.includes('/me/kill-team/rosters')) {
      return jsonResponse(page<KTRoster_ListRead>(rosters, { total: rosters.length }))
    }
    if (u.includes('/kill-team/factions')) {
      return jsonResponse(page<KTFaction_Read>([makeKTFaction({ id: 'ktf1', name: 'Tyranids' })]))
    }
    if (u.includes('/kill-team/teams')) {
      return jsonResponse(page<KillTeam_Read>([makeKillTeam({ id: 'kt1', name: 'Raveners' })]))
    }
    throw new Error(`unexpected request: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KillTeamRostersView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KillTeamRostersView', () => {
  it('lists the rosters, each linking to its own page', async () => {
    stubFetch()
    renderView()

    const first = await screen.findByRole('link', { name: /My Raveners/ })
    expect(first).toHaveAttribute('href', '/kill-team/rosters/ktr-1')
    expect(screen.getByRole('link', { name: /Tuesday list/ })).toHaveAttribute(
      'href',
      '/kill-team/rosters/ktr-2',
    )
  })

  it('names the team and faction from the row itself, with no second request', async () => {
    // The roster LIST row carries `kill_team_name` and `faction_name` outright —
    // unlike the catalog's team row, which carries only `faction_id`. So this view
    // must not fetch the factions to label itself.
    const fetchMock = stubFetch()
    renderView()

    const row = await screen.findByRole('link', { name: /My Raveners/ })
    expect(within(row).getByText(/Raveners · Tyranids/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/kill-team/factions'))).toBe(
      false,
    )
  })

  it('shows a description when the roster has one, and nothing when it does not', async () => {
    stubFetch()
    renderView()

    await screen.findByRole('link', { name: /Tuesday list/ })
    expect(screen.getByText('Shorter game')).toBeInTheDocument()
    const mine = screen.getByRole('link', { name: /My Raveners/ })
    expect(within(mine).queryByText('Shorter game')).not.toBeInTheDocument()
  })

  it('counts every roster, not the rows on a page', async () => {
    stubFetch()
    renderView()
    await screen.findByRole('link', { name: /My Raveners/ })
    expect(screen.getByText('2 rosters')).toBeInTheDocument()
  })

  it('offers a way to start one from the empty state as well as the header', async () => {
    stubFetch([])
    renderView()

    expect(await screen.findByText('No rosters yet.')).toBeInTheDocument()
    // Two entry points, because an empty list is exactly when the header button is
    // easiest to miss.
    expect(screen.getAllByRole('button', { name: '+ New Roster' })).toHaveLength(2)
  })

  it('reports a failed read without claiming you have no rosters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 })),
    )
    renderView()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your rosters.")
    expect(screen.queryByText('No rosters yet.')).not.toBeInTheDocument()
  })

  it('announces that it is loading', async () => {
    stubFetch()
    renderView()
    expect(screen.getByRole('status', { name: 'Loading rosters' })).toBeInTheDocument()
    await screen.findByRole('link', { name: /My Raveners/ })
  })

  describe('creating one', () => {
    it('opens the modal and offers every kill team, labelled by faction', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('link', { name: /My Raveners/ })

      fireEvent.click(screen.getByRole('button', { name: '+ New Roster' }))

      const dialog = await screen.findByRole('dialog', { name: 'New Roster' })
      const select = within(dialog).getByLabelText('Kill Team')
      // A team row names its faction by id (#46), so the label is assembled here —
      // and a 48-option dropdown is much easier to read when each says whose it is.
      await waitFor(() =>
        expect(within(select).getByRole('option', { name: 'Raveners — Tyranids' })).toBeInTheDocument(),
      )
    })

    it('refuses to submit without a name or a team, before any request', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('link', { name: /My Raveners/ })
      fireEvent.click(screen.getByRole('button', { name: '+ New Roster' }))
      const dialog = await screen.findByRole('dialog', { name: 'New Roster' })
      const before = fetchMock.mock.calls.length

      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Roster' }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Give your roster a name.')

      fireEvent.change(within(dialog).getByLabelText('Roster Name'), {
        target: { value: 'My list' },
      })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Roster' }))
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose a kill team.')

      // Neither attempt reached the network.
      expect(fetchMock.mock.calls.length).toBe(before)
    })

    it('sends the name and team, omitting an empty description', async () => {
      const fetchMock = stubFetch()
      renderView()
      await screen.findByRole('link', { name: /My Raveners/ })
      fireEvent.click(screen.getByRole('button', { name: '+ New Roster' }))
      const dialog = await screen.findByRole('dialog', { name: 'New Roster' })
      await waitFor(() =>
        expect(within(dialog).getByRole('option', { name: /Raveners/ })).toBeInTheDocument(),
      )

      fireEvent.change(within(dialog).getByLabelText('Roster Name'), { target: { value: 'My list' } })
      fireEvent.change(within(dialog).getByLabelText('Kill Team'), { target: { value: 'kt1' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Roster' }))

      await waitFor(() => {
        const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
        expect(post).toBeDefined()
        // `description` absent rather than '': an untouched field must not store a
        // blank where the column means "none".
        expect(JSON.parse(String(post?.[1]?.body))).toEqual({
          name: 'My list',
          kill_team_id: 'kt1',
        })
      })
    })

    it('shows the duplicate-name conflict in the form, as the backend worded it', async () => {
      // #64: unique per owner. The backend's message names the roster and carries no
      // id, so `messageForError` prefers it over the generic "That already exists."
      // Shown in the form rather than only toasted, because the player is looking at
      // the field that caused it.
      const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url)
        if ((init?.method ?? 'GET') === 'POST') {
          return jsonResponse(
            { detail: "a roster called 'My list' already exists", code: 'CONFLICT', field: 'name' },
            { status: 409 },
          )
        }
        if (u.includes('/me/kill-team/rosters')) {
          return jsonResponse(page<KTRoster_ListRead>([MINE], { total: 1 }))
        }
        if (u.includes('/kill-team/factions')) return jsonResponse(page<KTFaction_Read>([]))
        return jsonResponse(page<KillTeam_Read>([makeKillTeam({ id: 'kt1' })]))
      })
      vi.stubGlobal('fetch', fetchMock)
      renderView()
      await screen.findByRole('link', { name: /My Raveners/ })
      fireEvent.click(screen.getByRole('button', { name: '+ New Roster' }))
      const dialog = await screen.findByRole('dialog', { name: 'New Roster' })
      await waitFor(() =>
        expect(within(dialog).getByRole('option', { name: 'Raveners' })).toBeInTheDocument(),
      )

      fireEvent.change(within(dialog).getByLabelText('Roster Name'), { target: { value: 'My list' } })
      fireEvent.change(within(dialog).getByLabelText('Kill Team'), { target: { value: 'kt1' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Roster' }))

      await waitFor(() =>
        expect(within(dialog).getByRole('alert')).toHaveTextContent(
          "a roster called 'My list' already exists",
        ),
      )
      // The modal stays open on a conflict, so the name can be changed in place.
      expect(screen.getByRole('dialog', { name: 'New Roster' })).toBeInTheDocument()
    })

    it('says the kill team cannot be changed later, while it is still a choice', async () => {
      // The team is fixed at creation: every operative is held to it by a composite
      // foreign key, so switching would mean emptying the roster.
      stubFetch()
      renderView()
      await screen.findByRole('link', { name: /My Raveners/ })
      fireEvent.click(screen.getByRole('button', { name: '+ New Roster' }))

      const dialog = await screen.findByRole('dialog', { name: 'New Roster' })
      expect(
        within(dialog).getByText('The kill team is fixed once the roster is created.'),
      ).toBeInTheDocument()
    })
  })
})

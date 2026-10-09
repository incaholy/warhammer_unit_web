import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamCatalogView from './KillTeamCatalogView'
import { jsonResponse, makeKillTeam, makeKTFaction, page } from '../test/fixtures'
import type { KillTeam_Read, KTFaction_Read } from '../api/types'

const TYRANIDS = makeKTFaction({ id: 'ktf1', name: 'Tyranids' })
const AELDARI = makeKTFaction({ id: 'ktf2', name: 'Aeldari' })

const RAVENERS = makeKillTeam({ id: 'kt1', name: 'Raveners', faction_id: 'ktf1' })
const BLADES = makeKillTeam({ id: 'kt2', name: 'Blades of Khaine', faction_id: 'ktf2' })

/** Routes by path, and records every URL asked for so a test can assert the filter
 *  reached the query string rather than only the rendered list. */
function stubFetch(teams: KillTeam_Read[] = [RAVENERS, BLADES], total = teams.length) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('/kill-team/factions')) {
      return jsonResponse(page<KTFaction_Read>([TYRANIDS, AELDARI]))
    }
    if (u.includes('/kill-team/teams')) {
      return jsonResponse(page<KillTeam_Read>(teams, { total }))
    }
    throw new Error(`unexpected request: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KillTeamCatalogView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KillTeamCatalogView', () => {
  it('lists the teams, each linking to its own page', async () => {
    stubFetch()
    renderView()

    const raveners = await screen.findByRole('link', { name: /Raveners/ })
    expect(raveners).toHaveAttribute('href', '/kill-team/teams/kt1')
    expect(screen.getByRole('link', { name: /Blades of Khaine/ })).toHaveAttribute(
      'href',
      '/kill-team/teams/kt2',
    )
  })

  it('resolves each team\'s faction name from the factions list', async () => {
    // A team row carries `faction_id` and never a copy of the name (#46), so the
    // name has to come from the separate factions read. Asserted per row, because a
    // lookup that returned the first faction for everything would still render
    // *something* next to each team.
    stubFetch()
    renderView()

    const raveners = await screen.findByRole('link', { name: /Raveners/ })
    expect(within(raveners).getByText('Tyranids')).toBeInTheDocument()
    const blades = screen.getByRole('link', { name: /Blades of Khaine/ })
    expect(within(blades).getByText('Aeldari')).toBeInTheDocument()
  })

  it('says Unknown rather than blank when a faction is missing from the list', async () => {
    stubFetch([makeKillTeam({ id: 'kt9', name: 'Orphan', faction_id: 'ktf-missing' })])
    renderView()

    const row = await screen.findByRole('link', { name: /Orphan/ })
    expect(within(row).getByText('Unknown')).toBeInTheDocument()
  })

  it('narrows to one faction, and sends the filter to the server', async () => {
    const fetchMock = stubFetch()
    renderView()
    await screen.findByRole('link', { name: /Raveners/ })

    fireEvent.change(screen.getByLabelText('Faction'), { target: { value: 'ktf2' } })

    // Server-side, not a client-side filter over the page in hand: the list is paged,
    // so filtering locally would only ever narrow the current 25 rows.
    await waitFor(() => {
      const asked = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(asked.some((u) => u.includes('faction_id=ktf2'))).toBe(true)
    })
  })

  it('returns to the first page when the faction changes', async () => {
    // 60 teams, so the pager is live and Next can move the offset.
    const fetchMock = stubFetch([RAVENERS, BLADES], 60)
    renderView()
    await screen.findByRole('link', { name: /Raveners/ })

    fireEvent.click(screen.getByRole('button', { name: 'Next →' }))
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('offset=25'))).toBe(true)
    })

    fireEvent.change(screen.getByLabelText('Faction'), { target: { value: 'ktf2' } })

    // The new filter must be requested at offset 0. Holding offset=25 across a
    // filter change lands on an empty page of a smaller result set, which shows as
    // "no teams" for a faction that has some.
    await waitFor(() => {
      const withFaction = fetchMock.mock.calls
        .map((c) => String(c[0]))
        .filter((u) => u.includes('faction_id=ktf2'))
      expect(withFaction.length).toBeGreaterThan(0)
      expect(withFaction.every((u) => !u.includes('offset=25'))).toBe(true)
    })
  })

  it('hides the pager when everything fits on one page', async () => {
    stubFetch([RAVENERS, BLADES], 2)
    renderView()
    await screen.findByRole('link', { name: /Raveners/ })

    expect(screen.queryByRole('button', { name: 'Next →' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '← Prev' })).not.toBeInTheDocument()
  })

  it('counts the whole result set, not the rows in hand', async () => {
    stubFetch([RAVENERS, BLADES], 48)
    renderView()
    await screen.findByRole('link', { name: /Raveners/ })

    // "2 of 48 teams" — the total states a fact about the catalog, so it comes from
    // the server's count rather than from however many rows this page holds.
    expect(screen.getByRole('status')).toHaveTextContent('2 of 48 teams')
  })

  it('shows an empty state rather than a bare list when a faction has no teams', async () => {
    stubFetch([], 0)
    renderView()

    expect(await screen.findByText('No kill teams here.')).toBeInTheDocument()
  })

  it('reports a failed team read without claiming the catalog is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/kill-team/factions')) {
          return jsonResponse(page<KTFaction_Read>([TYRANIDS]))
        }
        return jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 })
      }),
    )
    renderView()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load the kill teams.")
    expect(screen.queryByText('No kill teams here.')).not.toBeInTheDocument()
  })

  it('still lists the teams when only the faction names fail', async () => {
    // The two reads are independent. Losing the names should cost the labels, not
    // the list — a visitor can still reach a team page.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/kill-team/factions')) {
          return jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 })
        }
        return jsonResponse(page<KillTeam_Read>([RAVENERS]))
      }),
    )
    renderView()

    const row = await screen.findByRole('link', { name: /Raveners/ })
    expect(row).toHaveAttribute('href', '/kill-team/teams/kt1')
    expect(within(row).getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('Faction names are unavailable.')).toBeInTheDocument()
  })

  it('announces that it is loading', async () => {
    stubFetch()
    renderView()
    expect(screen.getByRole('status', { name: 'Loading kill teams' })).toBeInTheDocument()
    await screen.findByRole('link', { name: /Raveners/ })
  })
})

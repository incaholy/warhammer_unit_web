import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamGamesView from './KillTeamGamesView'
import {
  jsonResponse,
  makeKTGame,
  makeKTGameListRow,
  makeKTRosterListRow,
  page,
} from '../test/fixtures'
import type { KTGame_ListRead, KTRoster_ListRead } from '../api/types'

const IN_PROGRESS = makeKTGameListRow({
  id: 'ktg-1',
  kill_team_name: 'Raveners',
  faction_name: 'Tyranids',
  opponent_name: 'Kesh',
  // The token the backend actually stores (`ck_kt_game_status`), not 'in progress'.
  status: 'in_progress',
  turning_point: 2,
  phase: 'firefight',
  // Three sources, so a row that read one field instead of summing shows 3 not 6.
  victory_points: { 'Crit op: Hold': 3, 'Tunnel network': 2, Kills: 1 },
  opponent_victory_points: 4,
  created_at: '2026-03-04T00:00:00Z',
})
const UNNAMED_OPPONENT = makeKTGameListRow({
  id: 'ktg-2',
  kill_team_name: 'Gellerpox',
  faction_name: 'Chaos',
  opponent_name: null,
  status: 'setup',
  turning_point: 1,
  phase: 'strategy',
  victory_points: {},
  opponent_victory_points: 0,
})

const ROSTER = makeKTRosterListRow({
  id: 'ktr-1',
  name: 'My Raveners',
  kill_team_name: 'Raveners',
})

function stubFetch(
  games: KTGame_ListRead[] = [IN_PROGRESS, UNNAMED_OPPONENT],
  rosters: KTRoster_ListRead[] = [ROSTER],
) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const method = init?.method ?? 'GET'
    // A create answers the whole `KTGame_Read` snapshot, not a list row. Returning the
    // row shape here would fail the generated schema and leave the success path
    // untested while the body assertion still passed.
    if (method === 'POST' && u.includes('/me/kill-team/games')) {
      return jsonResponse(makeKTGame({ id: 'ktg-new' }))
    }
    if (u.includes('/me/kill-team/games')) {
      return jsonResponse(page<KTGame_ListRead>(games, { total: games.length }))
    }
    if (u.includes('/me/kill-team/rosters')) {
      return jsonResponse(page<KTRoster_ListRead>(rosters, { total: rosters.length }))
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
        <KillTeamGamesView />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function calls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }))
}

describe('KillTeamGamesView', () => {
  it('lists each battle with its team and its opponent', async () => {
    stubFetch()
    renderView()
    expect(await screen.findByText('Raveners vs Kesh')).toBeInTheDocument()
    expect(screen.getByText('Gellerpox')).toBeInTheDocument()
  })

  it('names no opponent rather than an empty one, when the game has none', async () => {
    stubFetch()
    renderView()
    await screen.findByText('Raveners vs Kesh')
    // `opponent_name` is nullable because the common case is an opponent with no
    // account. "Gellerpox vs " is what a template with no guard produces.
    expect(screen.queryByText(/Gellerpox vs/)).not.toBeInTheDocument()
  })

  it('SUMS the victory points across their sources', async () => {
    stubFetch()
    renderView()
    // 3 + 2 + 1 against the opponent's hand-entered 4. A row that read one source,
    // or took the first value, shows 3 — which is why the fixture has three.
    const score = await screen.findByLabelText('Victory points, you 6, opponent 4')
    expect(score).toBeInTheDocument()
  })

  it('scores a battle that has scored nothing as 0, not blank', async () => {
    stubFetch()
    renderView()
    expect(await screen.findByLabelText('Victory points, you 0, opponent 0')).toBeInTheDocument()
  })

  it('shows the turning point and phase only for a battle in progress', async () => {
    stubFetch()
    renderView()
    const inProgress = (await screen.findByText('Raveners vs Kesh')).closest('a')
    expect(within(inProgress as HTMLElement).getByText(/TP 2 · firefight/)).toBeInTheDocument()
    // Never the raw token. This is what the list rendered before the fix, because the
    // comparison and the fixture agreed on a spelling the backend cannot store.
    expect(within(inProgress as HTMLElement).queryByText(/in_progress/)).not.toBeInTheDocument()

    // A game in setup is at turning point 1 having played none of it, so "TP 1 ·
    // strategy" would read as a battle already under way. And the row shows the
    // player's word for it, not the server's token.
    const setup = screen.getByText('Gellerpox').closest('a')
    expect(within(setup as HTMLElement).getByText(/Not started/)).toBeInTheDocument()
    expect(within(setup as HTMLElement).queryByText(/TP 1/)).not.toBeInTheDocument()
  })

  it('links each row to its own battle', async () => {
    stubFetch()
    renderView()
    await screen.findByText('Raveners vs Kesh')
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/kill-team/games/ktg-1',
      '/kill-team/games/ktg-2',
    ])
  })

  it('counts the battles, and says so only when there are some', async () => {
    stubFetch()
    renderView()
    expect(await screen.findByText('2 battles')).toBeInTheDocument()
  })

  it('says how many of the total are shown once a page is short', async () => {
    // `total` counts across the whole collection and this screen renders one page,
    // so the two disagree as soon as a player has more than fifty battles. With no
    // pager yet, saying both is what keeps the gap visible instead of silent.
    const fetchMock = vi.fn(async () =>
      jsonResponse(page<KTGame_ListRead>([IN_PROGRESS], { total: 57 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderView()
    expect(await screen.findByText('1 of 57 battles')).toBeInTheDocument()
  })

  it('shows a loading status, then the rows', async () => {
    stubFetch()
    renderView()
    expect(screen.getByRole('status', { name: 'Loading battles' })).toBeInTheDocument()
    await screen.findByText('Raveners vs Kesh')
    expect(screen.queryByRole('status', { name: 'Loading battles' })).not.toBeInTheDocument()
  })

  it('shows an alert when the list cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ detail: 'nope', code: 'INTERNAL', request_id: 'rq-9' }, { status: 500 }),
      ),
    )
    renderView()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your battles.")
    // A 500 is not actionable, so the reference the player can quote is appended.
    expect(alert).toHaveTextContent('rq-9')
  })

  it('offers an empty state with no count beside it', async () => {
    stubFetch([])
    renderView()
    expect(await screen.findByText('No battles yet.')).toBeInTheDocument()
    expect(screen.queryByText(/battle$/)).not.toBeInTheDocument()
  })
})

describe('KillTeamGamesView: starting a battle', () => {
  it('POSTs the chosen roster, and omits an unnamed opponent', async () => {
    const fetchMock = stubFetch()
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ New Battle' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Roster'), {
      target: { value: 'ktr-1' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Battle' }))

    await waitFor(() => {
      const post = calls(fetchMock).find((c) => c.method === 'POST')
      // `opponent_name` is nullable with a minimum length of 1, so '' is a 422 while
      // an absent key means "no opponent named". Asserting the WHOLE body is what
      // catches an empty string being sent.
      expect(post?.body).toEqual({ roster_id: 'ktr-1' })
    })
  })

  it('sends the opponent name when one is given', async () => {
    const fetchMock = stubFetch()
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ New Battle' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Roster'), {
      target: { value: 'ktr-1' },
    })
    fireEvent.change(within(dialog).getByLabelText('Opponent'), { target: { value: '  Kesh  ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Battle' }))

    await waitFor(() => {
      const post = calls(fetchMock).find((c) => c.method === 'POST')
      expect(post?.body).toEqual({ roster_id: 'ktr-1', opponent_name: 'Kesh' })
    })
  })

  it('refuses to submit without a roster, and sends nothing', async () => {
    const fetchMock = stubFetch()
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ New Battle' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Battle' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Choose a roster.')
    await waitFor(() => {
      expect(calls(fetchMock).some((c) => c.method === 'POST')).toBe(false)
    })
  })

  it('explains itself instead of showing a form when the player has no rosters', async () => {
    // A battle is started FROM a roster, so this is not an edge case to disable a
    // button for: an empty picker says nothing about what to do next.
    stubFetch([], [])
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ New Battle' }))

    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(/you need one first/i),
    ).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Roster')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: 'Go to rosters' })).toHaveAttribute(
      'href',
      '/kill-team/rosters',
    )
  })

  it('does not navigate away, because the battle screen is KF4c', async () => {
    const fetchMock = stubFetch()
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: '+ New Battle' }))

    const dialog = await screen.findByRole('dialog')
    fireEvent.change(await within(dialog).findByLabelText('Roster'), {
      target: { value: 'ktr-1' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Battle' }))

    // The list is still here and the dialog has closed. Navigating to
    // `/kill-team/games/:id` would match no route and bounce the player to `/`, so
    // this pins the departure from `NewRosterModal` rather than leaving it to a
    // comment that a later slice could quietly contradict.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Your battles' })).toBeInTheDocument()
    await waitFor(() => {
      // And the list was re-read, so the new battle is the top row.
      const gets = calls(fetchMock).filter(
        (c) => c.method === 'GET' && c.url.includes('/me/kill-team/games'),
      )
      expect(gets.length).toBeGreaterThan(1)
    })
  })
})

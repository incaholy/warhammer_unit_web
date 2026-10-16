import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamGameView from './KillTeamGameView'
import {
  jsonResponse,
  makeKTGame,
  makeKTGameOperative,
  makeKTGamePloy,
} from '../test/fixtures'
import type { KTGame_Read } from '../api/types'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A fresh `Response` per call: one instance cannot have its body read twice. */
function stub(game: KTGame_Read) {
  const seen: { url: string; method: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    seen.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    return jsonResponse(game)
  })
  vi.stubGlobal('fetch', fetchMock)
  return seen
}

function renderView(gameId = 'ktg-1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/kill-team/games/${gameId}`]}>
        <Routes>
          <Route path="/kill-team/games/:gameId" element={<KillTeamGameView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('KillTeamGameView: the scoreboard', () => {
  it('names the battle and its state', async () => {
    stub(makeKTGame())
    renderView()
    expect(await screen.findByRole('heading', { name: 'Raveners vs Kesh', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('TP 2 · firefight')).toBeInTheDocument()
  })

  it('reads the whole battle in ONE request, and never the catalog', async () => {
    const seen = stub(makeKTGame())
    renderView()
    await screen.findByRole('heading', { level: 1 })
    // #22 and #24: the datacards, rules and ploys travel with the game. Asserting the
    // whole list of urls is what makes that falsifiable.
    expect(seen.map((c) => c.url)).toEqual(['/api/v1/me/kill-team/games/ktg-1'])
  })

  it('shows CP, and both scores with the player\'s VP summed', async () => {
    stub(makeKTGame({ command_points: 2, victory_points: { a: 3, b: 2, c: 1 }, opponent_victory_points: 4 }))
    renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('CP')).toBeInTheDocument()
    expect(screen.getByLabelText('Victory points, you 6, opponent 4')).toBeInTheDocument()
  })

  it('says initiative is not rolled rather than naming the opponent', async () => {
    // #62: `advance` resets initiative to null every turning point for the roll-off,
    // so null is the COMMON state and must not read as the opponent holding it.
    stub(makeKTGame({ initiative: null, opponent_name: 'Kesh' }))
    renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('Not rolled')).toBeInTheDocument()
  })

  it('names the player as You, and the opponent by their name', async () => {
    stub(makeKTGame({ initiative: 'player', opponent_name: 'Kesh' }))
    const { unmount } = renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByText('You')).toBeInTheDocument()
    unmount()

    stub(makeKTGame({ initiative: 'opponent', opponent_name: 'Kesh' }))
    renderView()
    await screen.findByRole('heading', { level: 1 })
    // "Kesh" twice -- the title and the initiative line -- so scope to the term.
    expect(screen.getAllByText('Kesh').length).toBeGreaterThan(0)
  })
})

describe('KillTeamGameView: advance and undo', () => {
  it('names the phase it will advance to', async () => {
    stub(makeKTGame({ turning_point: 2, phase: 'strategy' }))
    renderView()
    expect(await screen.findByRole('button', { name: 'Advance to firefight' })).toBeInTheDocument()
  })

  it('names the next turning point when the firefight phase is over', async () => {
    stub(makeKTGame({ turning_point: 2, phase: 'firefight' }))
    renderView()
    expect(
      await screen.findByRole('button', { name: 'Advance to next turning point' }),
    ).toBeInTheDocument()
  })

  it('offers to FINISH out of the last turning point, which is what advance does', async () => {
    // The branch that makes the label worth predicting: turning point 4's firefight
    // phase ends the battle rather than rolling over. A label that always said "next
    // turning point" would be wrong here and nowhere else.
    stub(makeKTGame({ turning_point: 4, phase: 'firefight' }))
    renderView()
    expect(await screen.findByRole('button', { name: 'Finish battle' })).toBeInTheDocument()
  })

  it('POSTs to advance', async () => {
    const seen = stub(makeKTGame({ phase: 'strategy' }))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Advance to firefight' }))
    await waitFor(() => {
      const post = seen.find((c) => c.url.endsWith('/advance'))
      expect(post?.method).toBe('POST')
      expect(post?.body).toBeUndefined()
    })
  })

  it('stops offering to advance a finished battle', async () => {
    // `advance` refuses a finished game with its own 400, so the control says so
    // instead of inviting it.
    stub(makeKTGame({ status: 'finished' }))
    renderView()
    expect(await screen.findByRole('button', { name: 'Battle finished' })).toBeDisabled()
  })

  it('keeps UNDO available on a finished battle, so an accident is recoverable', async () => {
    // #58: finishing is an ordinary event, so undo reopens a game ended by mistake --
    // which is the single thing a player most needs from this control. Disabling undo
    // alongside advance is the easy mistake and would make the finish irreversible.
    stub(makeKTGame({ status: 'finished' }))
    renderView()
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeEnabled()
  })

  it('POSTs to undo', async () => {
    const seen = stub(makeKTGame())
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => {
      expect(seen.find((c) => c.url.endsWith('/undo'))?.method).toBe('POST')
    })
  })
})

describe('KillTeamGameView: the ploys spent this turning point', () => {
  const game = makeKTGame({
    turning_point: 2,
    ploys: [
      makeKTGamePloy({ name: 'Sudden Surge', kind: 'strategy', cp_cost: 1 }),
      makeKTGamePloy({ name: 'Quick Reflexes', kind: 'firefight', cp_cost: 1 }),
    ],
    ploys_used: [
      { name: 'Sudden Surge', turning_point: 1 },
      { name: 'Quick Reflexes', turning_point: 2 },
    ],
  })

  it('lists only the ones spent in the turning point being played', async () => {
    stub(game)
    renderView()
    const section = (await screen.findByText('This turning point')).closest('section')
    expect(within(section as HTMLElement).getByText('Quick Reflexes')).toBeInTheDocument()
    // Spent in turning point 1, so it is in the log but not standing now.
    expect(within(section as HTMLElement).queryByText('Sudden Surge')).not.toBeInTheDocument()
  })

  it('shows each one\'s KIND, so a player reads the duration off the data', async () => {
    // #1: the app records that a ploy was spent and when. How long a strategy ploy
    // lasts is a rule the players apply, so the screen states the kind rather than
    // claiming "active for the rest of the turning point".
    stub(game)
    renderView()
    const section = (await screen.findByText('This turning point')).closest('section')
    expect(within(section as HTMLElement).getByText('firefight')).toBeInTheDocument()
  })

  it('says so plainly when none have been spent', async () => {
    stub(makeKTGame({ turning_point: 2, ploys_used: [] }))
    renderView()
    expect(await screen.findByText('No ploys spent this turning point.')).toBeInTheDocument()
  })

  it('offers every ploy in the snapshot, with its cost', async () => {
    stub(game)
    renderView()
    const select = await screen.findByLabelText('Ploy')
    expect(
      within(select).getByRole('option', { name: 'Sudden Surge — 1 CP (strategy)' }),
    ).toBeInTheDocument()
  })

  it('POSTs the name only, because the cost comes from the snapshot', async () => {
    const seen = stub(game)
    renderView()
    fireEvent.change(await screen.findByLabelText('Ploy'), { target: { value: 'Sudden Surge' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spend' }))
    await waitFor(() => {
      const post = seen.find((c) => c.url.endsWith('/ploys'))
      // A body carrying `cp_cost` would mean a client could get it wrong, or forget.
      expect(post?.body).toEqual({ name: 'Sudden Surge' })
    })
  })

  it('cannot spend nothing', async () => {
    const seen = stub(game)
    renderView()
    await screen.findByLabelText('Ploy')
    expect(screen.getByRole('button', { name: 'Spend' })).toBeDisabled()
    expect(seen.some((c) => c.url.endsWith('/ploys'))).toBe(false)
  })
})

describe('KillTeamGameView: the operative list', () => {
  const game = makeKTGame({
    turning_point: 2,
    operatives: [
      makeKTGameOperative({ id: 'a', name: 'Ravener Prime', current_wounds: 8, wounds: 12, order: 'engage', activated_in_turning_point: 2 }),
      makeKTGameOperative({ id: 'b', name: 'Hormagaunt', current_wounds: 12, wounds: 12, activated_in_turning_point: 1 }),
      makeKTGameOperative({ id: 'c', name: 'Hormagaunt', current_wounds: 0, wounds: 12, status: 'incapacitated', activated_in_turning_point: null }),
    ],
  })

  it('shows wounds left against the wounds it started with', async () => {
    stub(game)
    renderView()
    expect(await screen.findByText('8/12')).toBeInTheDocument()
  })

  it('derives "activated" by COMPARING turning points, not by a non-null check', async () => {
    // #61: `advance` clears nothing, so the operative stamped with turning point 1 is
    // not activated in turning point 2. A non-null check marks it activated for the
    // rest of the battle, which is the whole defect this guards.
    stub(game)
    renderView()
    await screen.findByText('8/12')
    expect(screen.getAllByText('Activated')).toHaveLength(1)
    expect(screen.getAllByText('Not activated')).toHaveLength(2)
  })

  it('names each row by its position, because two rows can hold the same datacard', async () => {
    // #50 carries into the game: a row is one operative and is addressed by its own
    // id. Two "Hormagaunt" rows are indistinguishable by name alone.
    stub(game)
    renderView()
    await screen.findByText('8/12')
    expect(screen.getByLabelText('Hormagaunt at position 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Hormagaunt at position 3')).toBeInTheDocument()
  })

  it('renders the order it was SENT, not re-sorted', async () => {
    stub(
      makeKTGame({
        operatives: [
          makeKTGameOperative({ id: 'z', name: 'Last Sent', position: 9 }),
          makeKTGameOperative({ id: 'a', name: 'First Sent', position: 1 }),
        ],
      }),
    )
    renderView()
    await screen.findByText('First Sent')
    // #25: the server sends `position` order with the primary key as a tie-break, and
    // a client that re-sorted would break a tie it cannot see. Positions 9 and 1
    // disagree with array order, so sorting by position fails only this test.
    const ordinals = screen.getAllByTestId('row-ordinal').map((n) => n.textContent)
    expect(ordinals).toEqual(['1', '2'])
    const names = screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))
    expect(names).toEqual(['Last Sent at position 1', 'First Sent at position 2'])
  })

  it('says so when a battle has no operatives', async () => {
    stub(makeKTGame({ operatives: [] }))
    renderView()
    expect(await screen.findByText('No operatives in this battle.')).toBeInTheDocument()
  })
})

describe('KillTeamGameView: loading and failure', () => {
  it('shows a loading status, then the battle', async () => {
    stub(makeKTGame())
    renderView()
    expect(screen.getByRole('status', { name: 'Loading battle' })).toBeInTheDocument()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('status', { name: 'Loading battle' })).not.toBeInTheDocument()
  })

  it('says a battle does not exist rather than blaming the network', async () => {
    // Another player's game is a 404, not a 403, so an id reveals nothing -- and the
    // copy has to read as "no such battle", not as a failure the player can retry.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ detail: 'not found', code: 'NOT_FOUND', request_id: 'rq-1' }, { status: 404 }),
      ),
    )
    renderView()
    expect(await screen.findByRole('alert')).toHaveTextContent('That battle does not exist.')
    expect(screen.getByRole('link', { name: '← Battles' })).toHaveAttribute(
      'href',
      '/kill-team/games',
    )
  })

  it('appends the quotable reference on a server fault', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ detail: 'boom', code: 'INTERNAL', request_id: 'rq-9' }, { status: 500 }),
      ),
    )
    renderView()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load this battle.")
    expect(alert).toHaveTextContent('rq-9')
  })
})

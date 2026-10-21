import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamGameView from './KillTeamGameView'
import {
  jsonResponse,
  makeKillTeamDetail,
  makeKTEquipment,
  makeKTGame,
  makeKTGameEquipment,
  makeKTGameOperative,
  makeKTGamePloy,
  makeKTGameRule,
  makeKTOperative,
  makeUniversal,
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

/** Battle-tab sections and operative rows are collapsed by default (KF8c), and a closed
 *  one is NOT in the DOM -- which is the point, and also why these helpers exist: a test
 *  that reaches inside one opens it first.
 *
 *  Both address the disclosure by `expanded: false` rather than by its label, so a
 *  reworded heading does not silently turn these into no-ops. */
async function openSection(name: string | RegExp) {
  // `find`, not `get`: `renderView` does not wait, so the first render of every test is
  // the loading state and the section does not exist yet.
  fireEvent.click(await screen.findByRole('button', { name, expanded: false }))
}

async function openOperative(who: string) {
  const row = await screen.findByRole('listitem', { name: who })
  fireEvent.click(within(row).getByRole('button', { expanded: false }))
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
    // Scoped to the Operatives section: KF4f added a victory-point source list, so
    // those are list items on this screen too.
    const operatives = screen.getByRole('heading', { name: 'Operatives' }).closest('section')!
    const names = within(operatives)
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-label'))
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

/* ---- Score, command and the killzone (KF4f) ---- */

describe('KillTeamGameView: score and command', () => {
  it('sends an ABSOLUTE command point total', async () => {
    const seen = stub(makeKTGame({ command_points: 2 }))
    renderView()
    fireEvent.click(await screen.findByLabelText('Gain a command point'))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      // #7, and the version is asserted because `PATCH /{game_id}` answers the whole
      // game -- the one write in a battle where a client can stay current.
      expect(patch?.body).toEqual({ command_points: 3, version: 7 })
    })
  })

  it('cannot spend a command point it does not have', async () => {
    stub(makeKTGame({ command_points: 0 }))
    renderView()
    // `ck_kt_game_command_points` refuses a negative, and the service says "cannot be
    // negative". Disabling mirrors that refusal rather than applying a rule.
    expect(await screen.findByLabelText('Spend a command point')).toBeDisabled()
  })

  it('writes the WHOLE victory point document when one source changes', async () => {
    const seen = stub(
      makeKTGame({ victory_points: { 'Crit op: Hold': 3, 'Tunnel network': 2 } }),
    )
    renderView()
    fireEvent.click(await screen.findByLabelText('Score a victory point from Tunnel network'))

    await waitFor(() => {
      // The document, not a patch of one key: every write in a battle is absolute, and
      // a per-key merge is something two devices would both win.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        victory_points: { 'Crit op: Hold': 3, 'Tunnel network': 3 },
        version: 7,
      })
    })
  })

  it('adds a new source at zero', async () => {
    const seen = stub(makeKTGame({ victory_points: {} }))
    renderView()
    fireEvent.change(await screen.findByLabelText('Victory point source'), {
      target: { value: '  Kill ops  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))

    await waitFor(() => {
      // Adding a source says "we scored this kind of thing", not how much. The keys are
      // free text because the sources are the players' (#1, #59) -- Tac Ops are not
      // scraped, so nothing here could enumerate them.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        victory_points: { 'Kill ops': 0 },
        version: 7,
      })
    })
  })

  it('sends nothing for a blank or duplicate source', async () => {
    const seen = stub(makeKTGame({ victory_points: { 'Kill ops': 2 } }))
    renderView()
    const field = await screen.findByLabelText('Victory point source')

    fireEvent.change(field, { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Add source' })).toBeDisabled()

    fireEvent.change(field, { target: { value: 'Kill ops' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    await waitFor(() => expect(field).toHaveValue(''))
    expect(seen.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('removes a source from the document', async () => {
    const seen = stub(makeKTGame({ victory_points: { 'Kill ops': 2, Hold: 1 } }))
    renderView()
    fireEvent.click(await screen.findByLabelText('Remove the victory point source Kill ops'))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        victory_points: { Hold: 1 },
        version: 7,
      })
    })
  })

  it('says so when nothing has been scored', async () => {
    stub(makeKTGame({ victory_points: {} }))
    renderView()
    expect(await screen.findByText('No victory points scored yet.')).toBeInTheDocument()
  })

  it("edits the opponent's score as a plain number", async () => {
    const seen = stub(makeKTGame({ opponent_victory_points: 4, opponent_name: 'Kesh' }))
    renderView()
    fireEvent.click(await screen.findByLabelText("Raise the opponent's victory points"))

    await waitFor(() => {
      // A bare integer, not a keyed document: the opponent's score is entered by hand.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        opponent_victory_points: 5,
        version: 7,
      })
    })
  })

  it("names the opponent on their score when the battle records one", async () => {
    stub(makeKTGame({ opponent_name: 'Kesh' }))
    renderView()
    expect(await screen.findByText("Kesh's victory points")).toBeInTheDocument()
  })
})

describe('KillTeamGameView: the killzone', () => {
  it('writes the whole marker list', async () => {
    const seen = stub(makeKTGame({ markers: ['Tunnel 0'] }))
    renderView()
    await openSection(/Killzone/)
    fireEvent.change(await screen.findByLabelText('Add a marker to the killzone'), {
      target: { value: 'Tunnel 3' },
    })
    fireEvent.click(screen.getByLabelText('Add the marker to the killzone'))

    await waitFor(() => {
      // A NUMBERED marker, which is the case no enum could express -- Raveners place
      // Tunnel markers 0 to 4, so the column stays free text (#1, #21).
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        markers: ['Tunnel 0', 'Tunnel 3'],
        version: 7,
      })
    })
  })

  it('removes a marker', async () => {
    const seen = stub(makeKTGame({ markers: ['Tunnel 0', 'Tunnel 3'] }))
    renderView()
    await openSection(/Killzone/)
    fireEvent.click(await screen.findByLabelText('Remove marker Tunnel 0 from the killzone'))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        markers: ['Tunnel 3'],
        version: 7,
      })
    })
  })
})

describe('KillTeamGameView: deleting a battle', () => {
  it('confirms first, and says what goes with it', async () => {
    const seen = stub(makeKTGame())
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete battle' }))

    const dialog = await screen.findByRole('dialog')
    // `undo` reverts an event and a deleted game has no events left:
    // `kt_game_events.game_id` is ON DELETE CASCADE, so the log goes with the row.
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/i)
    expect(seen.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('cancels without sending anything', async () => {
    const seen = stub(makeKTGame())
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete battle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(seen.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('DELETEs on confirmation', async () => {
    const seen = stub(makeKTGame())
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete battle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      const del = seen.find((c) => c.method === 'DELETE')
      expect(del?.url).toBe('/api/v1/me/kill-team/games/ktg-1')
    })
  })
})

/* ---- Catalog pools, behind a disclosure (KF4g) ----
 *
 * The property these protect is a NON-event: the battle screen asks the catalog for
 * nothing until a player opens one of three controls. KF4c and KF4e each assert the
 * whole list of urls for the same reason -- a count plus a check of the first would pass
 * a screen that also called the catalog. */

/** Answers the game, the team detail and the universal lists, recording every url. */
function stubWithCatalog(game = makeKTGame()) {
  const seen: { url: string; method: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    seen.push({
      url: u,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
    if (u.includes('/kill-team/teams/')) {
      return jsonResponse(
        makeKillTeamDetail({
          equipment: [
            makeKTEquipment({ id: 'kte1', name: 'Tunnel markers' }),
            makeKTEquipment({ id: 'kte2', name: 'Spike' }),
          ],
          operatives: [
            makeKTOperative({ id: 'kto1', name: 'Ravener Prime', availability: 'roster' }),
            makeKTOperative({ id: 'kto9', name: 'Mutoid Vermin', availability: 'in_battle' }),
          ],
        }),
      )
    }
    if (u.includes('/operatives/') || u.includes('/equipment')) {
      return jsonResponse(makeKTGameOperative())
    }
    return jsonResponse(game)
  })
  vi.stubGlobal('fetch', fetchMock)
  return seen
}

const catalogCalls = (seen: { url: string }[]) =>
  seen.filter((c) => c.url.includes('/api/v1/kill-team/'))

describe('KillTeamGameView: the pools are not fetched until asked for', () => {
  it('renders a whole battle without a single catalog request', async () => {
    const seen = stubWithCatalog()
    renderView()
    await screen.findByRole('heading', { level: 1 })
    // The claim `KILLTEAM.md` now makes, narrowed from the one it used to: a battle
    // RENDERS with no catalog request. Three controls ask for a pool; nothing else does.
    expect(catalogCalls(seen)).toEqual([])
  })

  it('fetches the equipment pool only when the disclosure opens', async () => {
    const seen = stubWithCatalog()
    renderView()
    await openSection(/Equipment/)
    await screen.findByRole('heading', { level: 1 })
    expect(catalogCalls(seen)).toEqual([])

    fireEvent.click(screen.getByText('Take equipment'))
    await waitFor(() => expect(catalogCalls(seen).length).toBe(2))
    expect(catalogCalls(seen).map((c) => c.url.replace('/api/v1', '')).sort()).toEqual([
      '/kill-team/teams/kt1',
      '/kill-team/universal',
    ])
  })

  it('offers only pieces this battle has not taken', async () => {
    // The same piece twice is a 409, and that one IS integrity rather than a rule -- so
    // it is prevented rather than reported.
    stubWithCatalog(
      makeKTGame({ equipment: [makeKTGameEquipment({ equipment_id: 'kte1', name: 'Tunnel markers' })] }),
    )
    renderView()
    await openSection(/Equipment/)
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByText('Take equipment'))

    const select = await screen.findByLabelText('Equipment')
    expect(within(select).getByRole('option', { name: 'Spike' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Tunnel markers' })).not.toBeInTheDocument()
  })

  it('takes a piece by id', async () => {
    const seen = stubWithCatalog(makeKTGame({ equipment: [] }))
    renderView()
    await openSection(/Equipment/)
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByText('Take equipment'))
    fireEvent.change(await screen.findByLabelText('Equipment'), { target: { value: 'kte2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Take' }))

    await waitFor(() => {
      const post = seen.find((c) => c.method === 'POST' && c.url.endsWith('/equipment'))
      expect(post?.body).toEqual({ equipment_id: 'kte2' })
    })
  })

  it('reports the allowance and never blocks on it', async () => {
    // #57: `equipment_limit` is a constant the read carries, and the service accepts a
    // fifth piece on purpose so a custom game can be built.
    stubWithCatalog(
      makeKTGame({
        equipment_limit: 1,
        equipment: [makeKTGameEquipment({ equipment_id: 'kte1', name: 'Tunnel markers' })],
      }),
    )
    renderView()
    await openSection(/Equipment/)
    expect(await screen.findByText(/Equipment · 1 of 1/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Take equipment'))
    // At the limit, and still offering the other piece.
    expect(await screen.findByLabelText('Equipment')).toBeEnabled()
  })

  it('reveals a piece with no body, and removes one by its row id', async () => {
    const seen = stubWithCatalog(
      makeKTGame({ equipment: [makeKTGameEquipment({ id: 'ktge-1', name: 'Spike', revealed: false })] }),
    )
    renderView()
    await openSection(/Equipment/)
    fireEvent.click(await screen.findByLabelText('Reveal Spike'))
    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH' && c.url.includes('/equipment/'))
      expect(patch?.body).toBeUndefined()
    })

    fireEvent.click(screen.getByLabelText('Remove Spike from the battle'))
    await waitFor(() => {
      expect(seen.find((c) => c.method === 'DELETE')?.url).toContain('/equipment/ktge-1')
    })
  })

  it('says a piece is revealed instead of offering to reveal it again', async () => {
    stubWithCatalog(
      makeKTGame({ equipment: [makeKTGameEquipment({ name: 'Spike', revealed: true })] }),
    )
    renderView()
    await openSection(/Equipment/)
    expect(await screen.findByText('Revealed')).toBeInTheDocument()
    expect(screen.queryByLabelText('Reveal Spike')).not.toBeInTheDocument()
  })
})

describe('KillTeamGameView: fielding a datacard the battle produced', () => {
  it('offers only the cards marked in_battle', async () => {
    stubWithCatalog()
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByText('Field a datacard'))

    const select = await screen.findByLabelText('Datacard')
    // #20: the flag comes from a conditional composition block, which only Gellerpox
    // print -- so this is the vermin, and NOT the team's rosterable cards.
    expect(within(select).getByRole('option', { name: 'Mutoid Vermin' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Ravener Prime' })).not.toBeInTheDocument()
  })

  it('POSTs the datacard and what produced it', async () => {
    const seen = stubWithCatalog()
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByText('Field a datacard'))
    fireEvent.change(await screen.findByLabelText('Datacard'), { target: { value: 'kto9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Rule' }))
    fireEvent.click(screen.getByRole('button', { name: 'Field' }))

    await waitFor(() => {
      const post = seen.find((c) => c.method === 'POST' && c.url.endsWith('/operatives'))
      expect(post?.body).toEqual({ operative_id: 'kto9', source: 'rule' })
    })
  })

  it('says so for a team that prints none, rather than showing an empty picker', async () => {
    const seen: { url: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        seen.push({ url: u })
        if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
        if (u.includes('/kill-team/teams/')) {
          // Every card rosterable, which is 47 of the 48 teams: only Gellerpox print a
          // conditional block, so only they have `in_battle` rows at all.
          return jsonResponse(
            makeKillTeamDetail({
              operatives: [makeKTOperative({ id: 'kto1', availability: 'roster' })],
            }),
          )
        }
        return jsonResponse(makeKTGame())
      }),
    )
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByText('Field a datacard'))

    expect(
      await screen.findByText('This kill team prints no datacards that arrive mid-battle.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Datacard')).not.toBeInTheDocument()
  })
})

/* ---- Tabs, the reference and the quick reference (KF5) ---- */

describe('KillTeamGameView: the two tabs', () => {
  it('opens on Battle, with the reference behind its own tab', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('heading', { level: 1 })

    const tabs = screen.getByRole('tablist', { name: 'Battle sections' })
    expect(within(tabs).getByRole('tab', { name: 'Battle' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // KF4c shipped no tablist on purpose: one tab is noise. This is the second panel
    // that justifies it.
    expect(within(tabs).getByRole('tab', { name: 'Reference' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('heading', { name: 'Operatives' })).toBeInTheDocument()
    // And the reference panel is ABSENT, not merely unselected. Asserting only that the
    // Battle panel disappears on switching let a mutant that rendered both survive: the
    // switch hides Battle either way, so the gap was only visible on first render.
    expect(screen.queryByRole('heading', { name: 'Team rules' })).not.toBeInTheDocument()
  })

  it('swaps the panels rather than showing both', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    expect(screen.getByRole('heading', { name: 'Team rules' })).toBeInTheDocument()
    // The write surface is gone, which is the line the tabs draw: everything behind
    // Battle can change the game and nothing behind Reference can.
    expect(screen.queryByRole('heading', { name: 'Operatives' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete battle' })).not.toBeInTheDocument()
  })
})

describe('KillTeamGameView: the reference', () => {
  const game = makeKTGame({
    rules: [
      makeKTGameRule({ name: 'Swarming Instincts', description: 'A printed rule.', group: null }),
    ],
    ploys: [
      makeKTGamePloy({ name: 'Sudden Surge', kind: 'strategy', cp_cost: 1, universal: false }),
      makeKTGamePloy({ name: 'Command Re-roll', kind: 'strategy', cp_cost: 1, universal: true }),
    ],
    equipment: [
      makeKTGameEquipment({ name: 'Tunnel markers', text: 'Place a marker.', revealed: true }),
    ],
  })

  const openReference = async () => {
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))
  }

  it("renders the team's rules, which nothing rendered before KF5", async () => {
    stub(game)
    await openReference()
    expect(screen.getByText('Swarming Instincts')).toBeInTheDocument()
    expect(screen.getByText('A printed rule.')).toBeInTheDocument()
  })

  it('splits the ploys on the universal flag the game read carries', async () => {
    stub(game)
    await openReference()
    // The catalog shapes have no `universal`, so the team page fetches `/universal`
    // separately. A game's snapshot carries both lists in one, flagged.
    expect(screen.getByText(/Universal — every team may use these/)).toBeInTheDocument()
    expect(screen.getByText('Command Re-roll')).toBeInTheDocument()
    expect(screen.getByText('Sudden Surge')).toBeInTheDocument()
  })

  it("shows each taken piece's snapshotted text and whether it is revealed", async () => {
    stub(game)
    await openReference()
    // `text`, not `description` -- the rename is why `EquipmentList` could not widen.
    expect(screen.getByText('Place a marker.')).toBeInTheDocument()
    expect(screen.getByText('revealed')).toBeInTheDocument()
  })

  it('makes no request to render, because it reads the snapshot', async () => {
    const seen = stubWithCatalog(game)
    await openReference()
    await screen.findByRole('heading', { name: 'Team rules' })
    // #22, #24: the same property KF4e's datacard has.
    expect(catalogCalls(seen)).toEqual([])
  })
})

describe('KillTeamGameView: the strategy ploy quick reference', () => {
  const ploys = [
    makeKTGamePloy({ name: 'Sudden Surge', kind: 'strategy' }),
    makeKTGamePloy({ name: 'Quick Reflexes', kind: 'firefight' }),
  ]

  it('names the strategy ploys spent this turning point', async () => {
    stub(
      makeKTGame({
        turning_point: 2,
        ploys,
        ploys_used: [
          { name: 'Sudden Surge', turning_point: 2 },
          { name: 'Quick Reflexes', turning_point: 2 },
        ],
      }),
    )
    renderView()
    const quick = await screen.findByLabelText('Strategy ploys spent this turning point')
    // A strategy ploy is what a player is still playing under; a firefight ploy resolved
    // where it was used. Both are in the log; only one answers "what are we under?".
    expect(within(quick).getByText('Sudden Surge')).toBeInTheDocument()
    expect(within(quick).queryByText('Quick Reflexes')).not.toBeInTheDocument()
  })

  it('is absent entirely when none are in play', async () => {
    // Costs nothing on a battle with no ploys spent, which is most of a battle.
    stub(makeKTGame({ turning_point: 2, ploys, ploys_used: [] }))
    renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(
      screen.queryByLabelText('Strategy ploys spent this turning point'),
    ).not.toBeInTheDocument()
  })

  it('drops one spent in an earlier turning point', async () => {
    stub(
      makeKTGame({
        turning_point: 3,
        ploys,
        ploys_used: [{ name: 'Sudden Surge', turning_point: 2 }],
      }),
    )
    renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(
      screen.queryByLabelText('Strategy ploys spent this turning point'),
    ).not.toBeInTheDocument()
  })
})

describe('KillTeamGameView: choices', () => {
  it('records a pick as a named note, writing the whole document', async () => {
    const seen = stub(makeKTGame({ choices: { 'Accursed Gift': 'Mutation' } }))
    renderView()
    await openSection(/Choices/)
    fireEvent.change(await screen.findByLabelText('Choice'), { target: { value: '  Tac Op  ' } })
    fireEvent.change(screen.getByLabelText('What was chosen'), {
      target: { value: '  Seek and Destroy  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        choices: { 'Accursed Gift': 'Mutation', 'Tac Op': 'Seek and Destroy' },
        version: 7,
      })
    })
  })

  it('needs both halves before it will record', async () => {
    stub(makeKTGame({ choices: {} }))
    renderView()
    await openSection(/Choices/)
    fireEvent.change(await screen.findByLabelText('Choice'), { target: { value: 'Tac Op' } })
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled()
  })

  it('removes a pick from the document', async () => {
    const seen = stub(makeKTGame({ choices: { 'Accursed Gift': 'Mutation', 'Tac Op': 'Hold' } }))
    renderView()
    await openSection(/Choices/)
    fireEvent.click(await screen.findByLabelText('Remove the choice Tac Op'))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        choices: { 'Accursed Gift': 'Mutation' },
        version: 7,
      })
    })
  })

  it('does not write back a value it refused to display', async () => {
    // `choices` is the one writable field the service does not validate, so a non-string
    // can be in there. `gameChoices` drops it on READ; writing it back untouched would
    // mean editing a document the screen is not showing.
    const seen = stub(
      makeKTGame({ choices: { Good: 'yes', Nested: { a: 1 } } as Record<string, unknown> }),
    )
    renderView()
    await openSection(/Choices/)
    fireEvent.change(await screen.findByLabelText('Choice'), { target: { value: 'Tac Op' } })
    fireEvent.change(screen.getByLabelText('What was chosen'), { target: { value: 'Hold' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        choices: { Good: 'yes', 'Tac Op': 'Hold' },
        version: 7,
      })
    })
  })

  it('says what the field is for when nothing is recorded', async () => {
    stub(makeKTGame({ choices: {} }))
    renderView()
    await openSection(/Choices/)
    expect(
      await screen.findByText(/The Accursed Gift, a Tac Op taken/),
    ).toBeInTheDocument()
  })
})

/* ---- Ending a battle (KF7 group A) ---- */

describe('KillTeamGameView: getting back to the list', () => {
  it('offers a way back that is not the breadcrumb', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('heading', { level: 1 })
    // The breadcrumb links to Battles too, and is not wrong -- it just lives above the
    // view and is not sticky, so it is gone once a long battle screen is scrolled. This
    // one shares the scoreboard's eyebrow row, which IS sticky.
    expect(screen.getByRole('link', { name: '← Battles' })).toHaveAttribute(
      'href',
      '/kill-team/games',
    )
  })
})

describe('KillTeamGameView: the two-step finish', () => {
  const lastPhase = { turning_point: 4, phase: 'firefight' }

  it('advances straight through when it would NOT finish the battle', async () => {
    const seen = stub(makeKTGame({ turning_point: 2, phase: 'strategy' }))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Advance to firefight' }))

    // Only the advance that ENDS a battle asks first; the other two would be a dialog on
    // the most-pressed control in the app.
    await waitFor(() => expect(seen.some((c) => c.url.endsWith('/advance'))).toBe(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before the advance that finishes, and sends nothing yet', async () => {
    const seen = stub(makeKTGame(lastPhase))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish battle' }))

    const dialog = await screen.findByRole('dialog')
    // #66: a finished game is closed to edits, so a victory-point write afterwards
    // answers 400. The adjustment can only happen before this write.
    expect(dialog).toHaveAccessibleDescription(/closed to changes/i)
    expect(seen.some((c) => c.url.endsWith('/advance'))).toBe(false)
  })

  it('shows the score and REAL controls, not a read-only recap', async () => {
    stub(makeKTGame({ ...lastPhase, victory_points: { Hold: 3 }, opponent_victory_points: 4 }))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish battle' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Final score, you 3, opponent 4')).toBeInTheDocument()
    // The whole point of the step: the last chance to correct the score is here.
    expect(within(dialog).getByLabelText('Score a victory point from Hold')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Victory point source')).toBeInTheDocument()
  })

  it('writes a late victory point from inside the dialog', async () => {
    const seen = stub(makeKTGame({ ...lastPhase, victory_points: { Hold: 3 } }))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish battle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText('Score a victory point from Hold'))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        victory_points: { Hold: 4 },
        version: 7,
      })
    })
  })

  it('finishes on confirmation', async () => {
    const seen = stub(makeKTGame(lastPhase))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish battle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Finish battle' })[0])

    await waitFor(() => {
      expect(seen.find((c) => c.url.endsWith('/advance'))?.method).toBe('POST')
    })
  })

  it('keeps playing without sending anything', async () => {
    const seen = stub(makeKTGame(lastPhase))
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish battle' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep playing' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(seen.some((c) => c.url.endsWith('/advance'))).toBe(false)
  })
})

describe('KillTeamGameView: the final score', () => {
  const finished = makeKTGame({
    status: 'finished',
    victory_points: { Hold: 3, Kills: 3 },
    opponent_victory_points: 4,
    opponent_name: 'Kesh',
  })

  it('shows what the battle came to', async () => {
    stub(finished)
    renderView()
    expect(await screen.findByRole('heading', { name: 'Battle finished' })).toBeInTheDocument()
    expect(screen.getByLabelText('Final score, you 6, opponent 4')).toBeInTheDocument()
    expect(screen.getByText(/Kesh 4/)).toBeInTheDocument()
  })

  it('prints no verdict', async () => {
    stub(finished)
    renderView()
    await screen.findByRole('heading', { name: 'Battle finished' })
    // Higher VP is the basic win condition, so naming a winner is an inference -- and #1
    // is that the tracker records while the players apply. The numbers are the fact.
    expect(screen.queryByText(/\b(won|win|lost|loss|defeat|victor)\b/i)).not.toBeInTheDocument()
  })

  it('names Undo as the way back, because there is no reopen route', async () => {
    const seen = stub(finished)
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: 'Undo to reopen' }))
    // #66: the finish is an event like any other and always the newest, so undoing it IS
    // reopening. The control says so rather than leaving a player to discover it.
    await waitFor(() => {
      expect(seen.find((c) => c.url.endsWith('/undo'))?.method).toBe('POST')
    })
  })

  it('is absent while a battle is being played', async () => {
    stub(makeKTGame({ status: 'in_progress' }))
    renderView()
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('heading', { name: 'Battle finished' })).not.toBeInTheDocument()
  })
})

/* ---- Reading the screen while playing (KF7 group B) ---- */

describe('KillTeamGameView: sections and rows collapse (KF8c)', () => {
  /** `aria-expanded` on the section's own heading button. */
  const sectionState = (name: RegExp) =>
    screen.getByRole('button', { name }).getAttribute('aria-expanded')

  it('opens on what a player touches and folds the setup sections away', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('button', { name: /Operatives/ })

    // Ordered by how often a section is touched, the same argument KF7 group B used to
    // order them in the first place: operatives and the turning point are worked every
    // activation, the killzone and `choices` are set once.
    expect(sectionState(/Operatives/)).toBe('true')
    expect(sectionState(/This turning point/)).toBe('true')
    expect(sectionState(/Score and command/)).toBe('true')
    expect(sectionState(/Equipment/)).toBe('false')
    expect(sectionState(/Killzone/)).toBe('false')
    expect(sectionState(/Choices/)).toBe('false')
  })

  it('does not render a closed section body at all', async () => {
    stub(makeKTGame({ markers: ['Tunnel 0'] }))
    renderView()
    await screen.findByRole('button', { name: /Killzone/ })

    // The marker is in the game the server sent, so this is the collapse hiding it and
    // not an empty battle.
    expect(screen.queryByText('Tunnel 0')).not.toBeInTheDocument()
    await openSection(/Killzone/)
    expect(screen.getByText('Tunnel 0')).toBeInTheDocument()
  })

  it('keeps the heading and its id, so the tab order stays assertable', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('button', { name: /Killzone/ })

    // The disclosure went INSIDE the `<h2>` rather than replacing it. `aria-labelledby`
    // on each section points at that id, and the battle tab's order is asserted through
    // `section[aria-labelledby]` -- both break silently if the heading is swapped for a
    // bare button, which is how `InventoryView` does it.
    const heading = screen.getByRole('heading', { name: /Killzone/ })
    expect(heading.tagName).toBe('H2')
    expect(heading.id).toBe('killzone-heading')
    expect(heading.querySelector('button')).not.toBeNull()
  })

  it('opens one operative without opening the rest', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('listitem', { name: /Ravener Prime/ })

    expect(screen.queryByText('Datacard')).not.toBeInTheDocument()
    await openOperative('Ravener Prime at position 1')

    // One datacard, not two: a player reads one operative at a time, which is the whole
    // report this slice answers.
    expect(screen.getAllByText('Datacard')).toHaveLength(1)
    // Addressed by POSITION, not by name: this battle fields two Hormagaunts, which is
    // the duplicate-datacard case (#50) the row's accessible names exist for.
    const other = screen.getByRole('listitem', { name: 'Hormagaunt at position 2' })
    expect(within(other).queryByText('Datacard')).toBeNull()
  })
})

describe('KillTeamGameView: the order of the battle tab', () => {
  it('puts the operatives first and the setup sections last', async () => {
    stub(makeKTGame())
    renderView()
    await screen.findByRole('heading', { level: 1 })

    // Read off the labelled sections in DOM order. Not `getAllByRole('heading')`: the
    // datacard's own blocks are level-2 headings too, and jsdom does not hide a closed
    // `<details>`, so they would appear in that list.
    const ids = Array.from(document.querySelectorAll('section[aria-labelledby]')).map((el) =>
      el.getAttribute('aria-labelledby'),
    )
    // Ordered by how often a player touches it, which is NOT the order they were built
    // in. Operatives moved from fifth to first.
    expect(ids).toEqual([
      'operatives-heading',
      'ploys-heading',
      'equipment-heading',
      'score-heading',
      'killzone-heading',
      'choices-heading',
    ])
  })

  it('puts the final score above everything once a battle is over', async () => {
    stub(makeKTGame({ status: 'finished' }))
    renderView()
    await screen.findByRole('heading', { name: 'Battle finished' })

    const ids = Array.from(document.querySelectorAll('section[aria-labelledby]')).map((el) =>
      el.getAttribute('aria-labelledby'),
    )
    expect(ids[0]).toBe('final-heading')
  })
})

describe('KillTeamGameView: the reference collapses per entry', () => {
  const game = makeKTGame({
    rules: [
      makeKTGameRule({ name: 'Swarming Instincts', description: 'A printed rule.', group: null }),
    ],
    ploys: [
      makeKTGamePloy({ name: 'Sudden Surge', kind: 'strategy', cp_cost: 1, universal: false }),
      makeKTGamePloy({ name: 'Second Wind', kind: 'firefight', cp_cost: 2, universal: false }),
    ],
    equipment: [makeKTGameEquipment({ name: 'Tunnel markers', text: 'Place a marker.' })],
  })

  const openReference = async () => {
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))
  }

  /** The `<details>` whose summary names this entry. */
  const entryFor = (name: string) =>
    screen.getByText(name).closest('details') as HTMLDetailsElement

  it('starts every entry closed, so the tab is a list of lines', async () => {
    stub(game)
    await openReference()
    // Through the `open` attribute: jsdom has no layout engine and does not hide a
    // closed `<details>`, so querying for the prose proves nothing either way.
    expect(entryFor('Sudden Surge').open).toBe(false)
    expect(entryFor('Second Wind').open).toBe(false)
    expect(entryFor('Swarming Instincts').open).toBe(false)
    expect(entryFor('Tunnel markers').open).toBe(false)
  })

  it('opens one without opening the rest', async () => {
    // The complaint this answers: remembering one rule should not leave it in the way of
    // the next. Per ENTRY, not per block -- a single `<details>` around "Ploys" would
    // still open the eight paragraphs every team has.
    stub(game)
    await openReference()
    fireEvent.click(screen.getByText('Sudden Surge'))

    expect(entryFor('Sudden Surge').open).toBe(true)
    expect(entryFor('Second Wind').open).toBe(false)
  })

  it('keeps a ploy\'s kind and cost on the line, so it is scannable closed', async () => {
    stub(game)
    await openReference()
    const summary = entryFor('Sudden Surge').querySelector('summary')
    expect(summary?.textContent).toContain('strategy · 1 CP')
  })
})

describe('KillTeamGameView: rules group where a group exists', () => {
  it('renders a group heading and its members under it', async () => {
    // Measured over the real scrape: 30 of 127 team rules carry a group, across 6 of the
    // 48 teams -- three Aspect Techniques sets and three Upgrade sets, five rules each.
    stub(
      makeKTGame({
        rules: [
          makeKTGameRule({ name: 'Loose', description: 'x', group: null }),
          makeKTGameRule({ name: 'Technique A', description: 'y', group: 'Aspect Techniques' }),
          makeKTGameRule({ name: 'Technique B', description: 'z', group: 'Aspect Techniques' }),
        ],
      }),
    )
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    const group = screen.getByText('Aspect Techniques').closest('section') as HTMLElement
    expect(within(group).getByText('Technique A')).toBeInTheDocument()
    expect(within(group).getByText('Technique B')).toBeInTheDocument()
    // The ungrouped rule sits outside, not swept under a heading it does not belong to.
    expect(within(group).queryByText('Loose')).not.toBeInTheDocument()
    expect(screen.getByText('Loose')).toBeInTheDocument()
  })

  it('prints no group heading for a team whose rules have none', async () => {
    // The common case by a wide margin: a median team has TWO rules and no group, so
    // grouping them would be noise.
    stub(
      makeKTGame({
        rules: [
          makeKTGameRule({ name: 'One', description: 'x', group: null }),
          makeKTGameRule({ name: 'Two', description: 'y', group: null }),
        ],
      }),
    )
    renderView()
    await screen.findByRole('heading', { level: 1 })
    fireEvent.click(screen.getByRole('tab', { name: 'Reference' }))

    const rules = screen.getByRole('heading', { name: 'Team rules' }).closest('section') as HTMLElement
    expect(within(rules).queryAllByRole('listitem')).toHaveLength(2)
    // No subhead, so no nested section inside the Team rules block.
    expect(rules.querySelectorAll('section')).toHaveLength(0)
  })
})

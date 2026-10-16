/* Row tests. Real timers rather than fake ones: the wounds commit is debounced at
 * 400ms and `waitFor` allows 1000ms, so the debounce elapses naturally — and fake
 * timers plus react-query's own scheduling is a deadlock this suite has no reason to
 * take on. */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OperativeRow } from './killTeamGameRow'
import {
  jsonResponse,
  makeKTGame,
  makeKTGameAbility,
  makeKTGameOperative,
  makeKTGameWeapon,
} from '../test/fixtures'
import type { KTGame_Read, KTGameOperative_Read } from '../api/types'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stub() {
  const seen: { url: string; method: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    seen.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    })
    const u = String(url)
    if (u.includes('/operatives/')) return jsonResponse(makeKTGameOperative())
    return jsonResponse(makeKTGame())
  })
  vi.stubGlobal('fetch', fetchMock)
  return seen
}

/** Rejects every write, so the reset-on-rejection path can be exercised. */
function stubRefusing() {
  const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return jsonResponse(makeKTGame())
    return jsonResponse(
      { detail: 'must be between 0 and 12, this card\'s maximum', code: 'VALIDATION', field: 'current_wounds' },
      { status: 400 },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderRow(
  operative: Partial<KTGameOperative_Read> = {},
  game: Partial<KTGame_Read> = {},
  suggestions: string[] = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const row = makeKTGameOperative({ id: 'ktgo-1', name: 'Ravener Prime', ...operative })
  return render(
    <QueryClientProvider client={queryClient}>
      <ul>
        <OperativeRow
          game={makeKTGame({ turning_point: 2, ...game })}
          operative={row}
          index={0}
          tokenSuggestions={suggestions}
        />
      </ul>
    </QueryClientProvider>,
  )
}

const WHO = 'Ravener Prime at position 1'

describe('OperativeRow: wounds', () => {
  it('sends the ABSOLUTE value, never a delta', async () => {
    const seen = stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Take a wound from ${WHO}`))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      // #7: `current_wounds: 7`, not `-1`. The absolute value is what makes a
      // duplicate delivery of this request harmless.
      expect(patch?.body).toEqual({ current_wounds: 7 })
    })
  })

  it('moves the number on the tap, before any round-trip', () => {
    stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Take a wound from ${WHO}`))
    // Local draft. A control that waited for the server would feel broken at a table.
    expect(screen.getByLabelText(`Wounds for ${WHO}`)).toHaveTextContent('7/12')
  })

  it('coalesces rapid taps into ONE request carrying the final value', async () => {
    const seen = stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    const take = screen.getByLabelText(`Take a wound from ${WHO}`)
    fireEvent.click(take)
    fireEvent.click(take)
    fireEvent.click(take)

    await waitFor(() => {
      const patches = seen.filter((c) => c.method === 'PATCH')
      expect(patches).toHaveLength(1)
      expect(patches[0].body).toEqual({ current_wounds: 5 })
    })
  })

  it('never sends `status` beside the wounds', async () => {
    const seen = stub()
    renderRow({ current_wounds: 1, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Take a wound from ${WHO}`))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      // The service couples zero wounds to `incapacitated` in BOTH directions, and its
      // own comment says a caller that had to remember would eventually not. Sending
      // `status` here would be the asymmetric automation it warns about.
      expect(patch?.body).toEqual({ current_wounds: 0 })
      expect(patch?.body).not.toHaveProperty('status')
    })
  })

  it('cannot go below zero or above the card\'s maximum', () => {
    stub()
    const { unmount } = renderRow({ current_wounds: 0, wounds: 12 })
    expect(screen.getByLabelText(`Take a wound from ${WHO}`)).toBeDisabled()
    expect(screen.getByLabelText(`Heal a wound on ${WHO}`)).toBeEnabled()
    unmount()

    renderRow({ current_wounds: 12, wounds: 12 })
    // The bound is the row's OWN snapshot, so this is bookkeeping rather than a rule:
    // `_validate_operative_fields` refuses anything outside `0..row.wounds` anyway.
    expect(screen.getByLabelText(`Heal a wound on ${WHO}`)).toBeDisabled()
  })

  it('puts the number back when the write is refused', async () => {
    stubRefusing()
    renderRow({ current_wounds: 8, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Take a wound from ${WHO}`))
    expect(screen.getByLabelText(`Wounds for ${WHO}`)).toHaveTextContent('7/12')

    // A refused edit must not sit on screen looking saved -- the reason
    // `QuantityInput` exists, applied to a control that is not it.
    await waitFor(() =>
      expect(screen.getByLabelText(`Wounds for ${WHO}`)).toHaveTextContent('8/12'),
    )
  })
})

describe('OperativeRow: order', () => {
  it('sets the order absolutely', async () => {
    const seen = stub()
    renderRow({ order: 'conceal' })
    fireEvent.click(screen.getByRole('button', { name: 'Engage' }))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ order: 'engage' })
    })
  })

  it('shows which order is set', () => {
    stub()
    renderRow({ order: 'engage' })
    expect(screen.getByRole('group', { name: `Order for ${WHO}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Engage' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('OperativeRow: activate', () => {
  it('POSTs to its own path with no body', async () => {
    const seen = stub()
    renderRow({ activated_in_turning_point: null })
    fireEvent.click(screen.getByLabelText(`Activate ${WHO}`))

    await waitFor(() => {
      const post = seen.find((c) => c.url.endsWith('/activate'))
      // #61/#63: the server reads the turning point off the game, so there is nothing
      // for a caller to send and this cannot be a field on the PATCH.
      expect(post?.method).toBe('POST')
      expect(post?.body).toBeUndefined()
    })
  })

  it('is spent once this operative has activated in THIS turning point', () => {
    stub()
    renderRow({ activated_in_turning_point: 2 }, { turning_point: 2 })
    expect(screen.getByLabelText(`Activate ${WHO}`)).toBeDisabled()
  })

  it('is available again in the next turning point, with the stamp still on the row', () => {
    // #61: `advance` clears nothing. The stamp from turning point 1 stays, and a
    // non-null check would leave this operative unable to act for the rest of the game.
    stub()
    renderRow({ activated_in_turning_point: 1 }, { turning_point: 2 })
    expect(screen.getByLabelText(`Activate ${WHO}`)).toBeEnabled()
  })

  it('refuses an incapacitated operative, which the service refuses too', () => {
    stub()
    renderRow({ status: 'incapacitated', current_wounds: 0 })
    expect(screen.getByLabelText(`Activate ${WHO}`)).toBeDisabled()
  })

  it('still offers to activate one in RESERVE, because that is a rule', () => {
    // The service is deliberate about this: it refuses `incapacitated` and NOT
    // `reserve`, because whether an operative can arrive and act in one turning point
    // is a rule the players apply (#1). Disabling it here would enforce one.
    stub()
    renderRow({ status: 'reserve' })
    expect(screen.getByLabelText(`Activate ${WHO}`)).toBeEnabled()
  })
})

describe('OperativeRow: tokens', () => {
  it('writes the WHOLE array when one is added', async () => {
    const seen = stub()
    renderRow({ tokens: ['Poison'] })
    fireEvent.change(screen.getByLabelText(`Add a token to ${WHO}`), {
      target: { value: 'Heightened Senses' },
    })
    fireEvent.click(screen.getByLabelText(`Add the token to ${WHO}`))

    await waitFor(() => {
      // Absolute, like every write here (#7). An "add this one" body would need the
      // server to merge, and two devices merging would both win.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        tokens: ['Poison', 'Heightened Senses'],
      })
    })
  })

  it('accepts Enter as well as the button', async () => {
    const seen = stub()
    renderRow({ tokens: [] })
    const field = screen.getByLabelText(`Add a token to ${WHO}`)
    fireEvent.change(field, { target: { value: 'Tunnel 3' } })
    fireEvent.keyDown(field, { key: 'Enter' })

    await waitFor(() => {
      // A numbered token, which is the case no enum could express: Raveners place
      // Tunnel markers 0-4, so the vocabulary has to be free text.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ tokens: ['Tunnel 3'] })
    })
  })

  it('writes the array minus one when a token is removed', async () => {
    const seen = stub()
    renderRow({ tokens: ['Poison', 'Tunnel 3'] })
    fireEvent.click(screen.getByLabelText(`Remove token Poison from ${WHO}`))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ tokens: ['Tunnel 3'] })
    })
  })

  it('sends nothing for a blank or duplicate token', async () => {
    const seen = stub()
    renderRow({ tokens: ['Poison'] })
    const field = screen.getByLabelText(`Add a token to ${WHO}`)

    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.click(screen.getByLabelText(`Add the token to ${WHO}`))
    fireEvent.change(field, { target: { value: 'Poison' } })
    fireEvent.click(screen.getByLabelText(`Add the token to ${WHO}`))

    // The backend validates `tokens` not at all, so two identical chips would both
    // exist and neither could be told from the other. Refused locally.
    await waitFor(() => expect(field).toHaveValue(''))
    expect(seen.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('suggests the tokens this battle has already used', () => {
    stub()
    renderRow({ tokens: [] }, {}, ['Poison', 'Tunnel 3'])
    const options = Array.from(document.querySelectorAll('datalist option')).map((o) =>
      o.getAttribute('value'),
    )
    expect(options).toEqual(['Poison', 'Tunnel 3'])
  })
})

describe('OperativeRow: where `version` is not sent', () => {
  it('omits the version from every write on a row', async () => {
    const seen = stub()
    renderRow({ current_wounds: 8, wounds: 12, order: 'conceal', tokens: [] })

    fireEvent.click(screen.getByLabelText(`Take a wound from ${WHO}`))
    fireEvent.click(screen.getByRole('button', { name: 'Engage' }))
    fireEvent.click(screen.getByLabelText(`Activate ${WHO}`))

    await waitFor(() => {
      expect(seen.filter((c) => c.method !== 'GET').length).toBeGreaterThanOrEqual(3)
    })
    // The documented departure. `PATCH …/operatives/{row_id}` answers
    // `KTGameOperative_Read`, which carries no version and no response header, so a
    // client cannot learn the new version from its own write -- and since #9 moves the
    // version on EVERY write, sending the last-rendered one makes a second tap conflict
    // with the player's own first tap. The `version_id_col` still refuses a genuine
    // concurrent write at flush. This fails the day someone adds it back without
    // solving the response side.
    for (const call of seen.filter((c) => c.method !== 'GET')) {
      expect(call.body ?? {}).not.toHaveProperty('version')
    }
  })
})

/* ---- The datacard (KF4e) ----
 *
 * One caveat these tests are written around: **jsdom does not hide the contents of a
 * closed `<details>`**. It has no layout engine, so everything inside is queryable
 * whether the card is open or shut -- a defect KF3 already hit. So "collapsed" is
 * asserted through the `open` attribute, never by querying for absent content, and the
 * content assertions open the card first so they describe what a player sees. */

describe('OperativeRow: the datacard', () => {
  const card = () => screen.getByLabelText(`Datacard for ${WHO}`).closest('details')!

  it('is collapsed until it is opened', () => {
    stub()
    renderRow()
    // Through the attribute, because jsdom renders closed content anyway.
    expect(card().open).toBe(false)
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    expect(card().open).toBe(true)
  })

  it('reads the printed stats from the game\'s own snapshot', () => {
    stub()
    renderRow({ apl: 2, move: 6, save: 4, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))

    // #22, #24: these were copied when the battle started. The row above shows the
    // LIVE wounds; this shows the wounds the card was printed with -- a reference
    // sheet and a status sheet at once.
    const body = card()
    expect(within(body).getByText('APL')).toBeInTheDocument()
    expect(within(body).getByText('6"')).toBeInTheDocument()
    expect(within(body).getByText('4+')).toBeInTheDocument()
  })

  it('renders a melee weapon as melee, not as a 0" range', () => {
    stub()
    renderRow({
      weapons: [makeKTGameWeapon({ name: 'Ravening claws', category: 'melee', range: 0 })],
    })
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))

    const body = card()
    expect(within(body).getByText('Ravening claws')).toBeInTheDocument()
    // The defect this pins: a fixture that said `category: 'M'` -- a value
    // `ck_kt_weapon_category` forbids -- made this profile print `0"`.
    expect(within(body).getByText('melee')).toBeInTheDocument()
    expect(within(body).queryByText('0"')).not.toBeInTheDocument()
  })

  it('prints a weapon profile\'s numbers and its rules verbatim', () => {
    stub()
    renderRow({
      weapons: [
        makeKTGameWeapon({
          name: 'Spike rifle',
          category: 'range',
          range: 8,
          attacks: 4,
          hit: 3,
          normal_damage: 3,
          crit_damage: 4,
          // #56: footnote markers are kept, so `Torrent 0"*` is its own string.
          weapon_rules: ['Lethal 5+', 'Torrent 0"*'],
        }),
      ],
    })
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))

    const body = card()
    expect(within(body).getByText('8"')).toBeInTheDocument()
    expect(within(body).getByText('3/4')).toBeInTheDocument()
    expect(within(body).getByText('Lethal 5+, Torrent 0"*')).toBeInTheDocument()
  })

  it('renders a weapon with no rules as a dash', () => {
    // An EMPTY list, which is reachable: plenty of profiles print no rules. `undefined`
    // is not -- a defaulted response field is always sent, and both generated types
    // require it -- which is why `WeaponProfile` requires it rather than guarding for a
    // value that cannot arrive.
    stub()
    renderRow({ weapons: [makeKTGameWeapon({ name: 'Bare', weapon_rules: [] })] })
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    expect(within(card()).getByText('—')).toBeInTheDocument()
  })

  it('renders the abilities and the keywords it was snapshotted with', () => {
    stub()
    renderRow({
      abilities: [makeKTGameAbility({ name: 'Burrow', description: 'Goes under.' })],
      keywords: ['RAVENER', 'TYRANID'],
    })
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))

    // Scoped to the Abilities block: the same name also appears as an option in the
    // action picker below, which is correct and made a document-wide query ambiguous.
    const abilities = screen.getByRole('heading', { name: 'Abilities' }).closest('section')!
    expect(within(abilities).getByText('Burrow')).toBeInTheDocument()
    expect(within(abilities).getByText('Goes under.')).toBeInTheDocument()
    expect(within(card()).getByText('RAVENER · TYRANID')).toBeInTheDocument()
  })

  it('makes NO request to render, because it reads the snapshot', async () => {
    const seen = stub()
    renderRow()
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    // The whole point of #22 and #24: a battle needs no catalog request once it has
    // started, so opening a card at a table cannot be waiting on anything.
    await waitFor(() => expect(card().open).toBe(true))
    expect(seen).toEqual([])
  })
})

describe('OperativeRow: actions used', () => {
  const openCard = () => fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))

  it('says none used when none have been', () => {
    stub()
    renderRow({ actions_used: [] })
    openCard()
    expect(screen.getByText('None used.')).toBeInTheDocument()
  })

  it('appends the action with the turning point the server would stamp', async () => {
    const seen = stub()
    renderRow(
      { actions_used: [], abilities: [makeKTGameAbility({ name: 'Burrow' })] },
      { turning_point: 3 },
    )
    openCard()
    fireEvent.change(screen.getByLabelText(`Action for ${WHO}`), { target: { value: 'Burrow' } })
    fireEvent.click(screen.getByLabelText(`Mark the action used for ${WHO}`))

    await waitFor(() => {
      // The turning point comes from the GAME, the way an activation is stamped (#61).
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        actions_used: [{ name: 'Burrow', turning_point: 3 }],
      })
    })
  })

  it('offers only the abilities on THIS card', () => {
    // `_validate_actions` refuses a name that is not on the operative's own snapshot,
    // which is the difference between a tracker and a notepad. Building the picker
    // from `abilities` means a refusable name cannot be chosen.
    stub()
    renderRow({
      abilities: [makeKTGameAbility({ name: 'Burrow' }), makeKTGameAbility({ name: 'Scuttle' })],
    })
    openCard()
    const select = screen.getByLabelText(`Action for ${WHO}`)
    expect(within(select).getByRole('option', { name: 'Burrow' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Scuttle' })).toBeInTheDocument()
    expect(within(select).queryByRole('option', { name: 'Sudden Surge' })).not.toBeInTheDocument()
  })

  it('shows every turning point an action was used in, not just this one', () => {
    // The opposite of the ploys beside the scoreboard, and deliberately: #23 says
    // limits differ -- once per battle, once per turning point -- so the screen shows
    // what was used AND WHEN and lets the players apply either rule.
    stub()
    renderRow(
      {
        actions_used: [
          { name: 'Burrow', turning_point: 1 },
          { name: 'Burrow', turning_point: 3 },
        ],
        abilities: [makeKTGameAbility({ name: 'Burrow' })],
      },
      { turning_point: 3 },
    )
    openCard()
    expect(screen.getByText('TP 1')).toBeInTheDocument()
    expect(screen.getByText('TP 3')).toBeInTheDocument()
  })

  it('removes the right entry when two share a name', async () => {
    const seen = stub()
    renderRow(
      {
        actions_used: [
          { name: 'Burrow', turning_point: 1 },
          { name: 'Burrow', turning_point: 3 },
        ],
        abilities: [makeKTGameAbility({ name: 'Burrow' })],
      },
      { turning_point: 3 },
    )
    openCard()
    fireEvent.click(
      screen.getByLabelText(`Remove Burrow used in turning point 1 from ${WHO}`),
    )

    await waitFor(() => {
      // By INDEX, never by name. A filter on the name would delete both, which is the
      // whole reason `UsageEntry` carries the raw position.
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({
        actions_used: [{ name: 'Burrow', turning_point: 3 }],
      })
    })
  })

  it('says so when a card prints no abilities, and offers no picker', () => {
    stub()
    renderRow({ abilities: [], actions_used: [] })
    openCard()
    expect(screen.getByText('This card prints no abilities.')).toBeInTheDocument()
    expect(screen.queryByLabelText(`Action for ${WHO}`)).not.toBeInTheDocument()
  })

  it('drops an entry whose shape is wrong rather than rendering undefined', () => {
    stub()
    renderRow({
      actions_used: [{ name: 'Good', turning_point: 1 }, { turning_point: 2 }, { name: 'No TP' }],
      abilities: [makeKTGameAbility({ name: 'Good' })],
    })
    openCard()
    // Scoped to the used-actions block for the same reason: 'Good' is also an ability
    // on the card and an option in the picker.
    // Through the list ITEMS: 'Good' is also an option in the picker, which lives in
    // this same section, so even a scoped text query is ambiguous.
    const section = screen.getByRole('heading', { name: 'Actions used' }).closest('section')!
    const items = within(section).getAllByRole('listitem')
    // One entry survived, so the two malformed ones were dropped rather than rendered.
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Good')
    expect(within(section).queryByText('No TP')).not.toBeInTheDocument()
  })
})

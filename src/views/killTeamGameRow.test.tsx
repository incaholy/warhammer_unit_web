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
  makeKillTeamDetail,
  makeKTGame,
  makeKTGameAbility,
  makeKTGameOperative,
  makeKTGameWeapon,
  makeKTOperative,
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

/** A row is collapsed by default (KF8c), and a closed one does not render its tokens or
 *  its datacard at all -- so a test that addresses either opens the row first.
 *
 *  Addressed by `expanded: false` rather than by the name it shows. The disclosure is the
 *  only control in a closed row carrying `aria-expanded`, and the datacard's own
 *  `<summary>` does not, so this stays unambiguous without depending on the ordinal or
 *  the operative's name. */
function expandRow(who = WHO) {
  const row = screen.getByRole('listitem', { name: who })
  fireEvent.click(within(row).getByRole('button', { expanded: false }))
}

describe('OperativeRow: wounds (KF10)', () => {
  /** Opens the wounds dialog and fills it in. */
  async function applyWounds(mode: 'Damage' | 'Heal', amount: string) {
    fireEvent.click(screen.getByLabelText(`Wounds for ${WHO}`))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: mode }))
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: amount } })
    return dialog
  }

  it('sends the ABSOLUTE value, never a delta', async () => {
    const seen = stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    const dialog = await applyWounds('Damage', '5')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      // #7: `current_wounds: 3`, not `-5`. The absolute value is what makes a duplicate
      // delivery of this request harmless, and KF10 changed the INPUT from a tap to a
      // typed amount without changing that.
      expect(patch?.body).toEqual({ current_wounds: 3 })
    })
  })

  it('asks for damage and shows the result before committing', async () => {
    stub()
    renderRow({ current_wounds: 12, wounds: 12 })
    const dialog = await applyWounds('Damage', '7')

    // The number a player has is the DAMAGE. Doing "12 - 7" in the head at a table is
    // where a wrong value comes from, so the dialog does the arithmetic and shows it.
    expect(within(dialog).getByText('12 → 5')).toBeInTheDocument()
  })

  it('heals in the other direction, from the same amount', async () => {
    const seen = stub()
    renderRow({ current_wounds: 4, wounds: 12 })
    const dialog = await applyWounds('Heal', '3')
    expect(within(dialog).getByText('4 → 7')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ current_wounds: 7 })
    })
  })

  it('clamps to what the column allows rather than letting it 400', async () => {
    const seen = stub()
    renderRow({ current_wounds: 5, wounds: 12 })
    // `ck_kt_game_operative_current_wounds` is `>= 0 AND <= wounds`. Nine damage to an
    // operative on five is zero, not an error toast in the middle of a turn.
    const dialog = await applyWounds('Damage', '9')
    expect(within(dialog).getByText('5 → 0')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ current_wounds: 0 })
    })
  })

  it('clamps a heal at the datacard maximum', async () => {
    stub()
    renderRow({ current_wounds: 10, wounds: 12 })
    const dialog = await applyWounds('Heal', '99')
    expect(within(dialog).getByText('10 → 12')).toBeInTheDocument()
  })

  it('never sends `status` beside the wounds', async () => {
    const seen = stub()
    renderRow({ current_wounds: 1, wounds: 12 })
    const dialog = await applyWounds('Damage', '1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      // The service couples zero wounds to `incapacitated` in BOTH directions, and a
      // caller that had to remember would eventually not.
      expect(patch?.body).not.toHaveProperty('status')
      expect(patch?.body).toEqual({ current_wounds: 0 })
    })
  })

  it('refuses to confirm nothing', async () => {
    stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    fireEvent.click(screen.getByLabelText(`Wounds for ${WHO}`))
    const dialog = await screen.findByRole('dialog')

    // Nothing typed yet, so there is no write to make.
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '0' } })
    expect(within(dialog).getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('takes digits only', async () => {
    stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    const dialog = await applyWounds('Damage', '3')
    const field = within(dialog).getByLabelText('Amount') as HTMLInputElement

    // `inputMode="numeric"` asks for a numeric keypad; it does not STOP anything, and a
    // desktop keyboard or a paste can still deliver letters. The filter is this
    // component's job, which is why `type="number"` was not the answer.
    fireEvent.change(field, { target: { value: '3e-4abc' } })
    expect(field.value).toBe('34')
  })

  it('cancels without writing anything', async () => {
    const seen = stub()
    renderRow({ current_wounds: 8, wounds: 12 })
    const dialog = await applyWounds('Damage', '5')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(seen.filter((c) => c.method === 'PATCH')).toHaveLength(0)
  })

  it('opens empty, so the last operative\'s amount cannot land on this one', async () => {
    stub()
    renderRow({ current_wounds: 12, wounds: 12 })
    const dialog = await applyWounds('Damage', '7')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByLabelText(`Wounds for ${WHO}`))
    const reopened = await screen.findByRole('dialog')
    expect((within(reopened).getByLabelText('Amount') as HTMLInputElement).value).toBe('')
    expect(within(reopened).getByRole('button', { name: 'Damage' })).toHaveAttribute(
      'aria-pressed',
      'true',
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

describe('OperativeRow: board status (KF7 D)', () => {
  const control = () => screen.getByRole('group', { name: `Board status for ${WHO}` })

  it('lives in the folded half, not the always-visible strip', () => {
    stub()
    renderRow({ status: 'on_board' })

    // Not one of the four `KILLTEAM.md` asks to see at a glance, and that strip already
    // wraps to two lines at 390px (KF8c) -- so it folds away with the tokens.
    expect(screen.queryByRole('group', { name: `Board status for ${WHO}` })).not.toBeInTheDocument()
    expandRow()
    expect(control()).toBeInTheDocument()
  })

  it('writes the literal the CHECK constraint allows, underscore and all', async () => {
    const seen = stub()
    renderRow({ status: 'on_board' })
    expandRow()
    fireEvent.click(within(control()).getByRole('button', { name: 'In reserve' }))

    await waitFor(() => {
      const patch = seen.find((c) => c.method === 'PATCH')
      expect(patch?.body).toEqual({ status: 'reserve' })
    })
  })

  it('writes `on_board` with its underscore, which nothing else can check', async () => {
    const seen = stub()
    renderRow({ status: 'reserve' })
    expandRow()
    expect(within(control()).getByRole('button', { name: 'In reserve', pressed: true })).toBeInTheDocument()
    fireEvent.click(within(control()).getByRole('button', { name: 'On the board' }))

    // The published schema types this a bare `string`, so neither tsc nor zod would
    // reject `'on board'`. This assertion is the only thing that does.
    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'on_board' })
    })
  })

  it('never offers `incapacitated`, because the service derives it', () => {
    stub()
    renderRow({ status: 'on_board' })
    expandRow()
    const labels = within(control())
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(labels).toEqual(['In reserve', 'On the board'])
  })

  it('shows an incapacitated model as derived copy, with no control at all', () => {
    stub()
    renderRow({ status: 'incapacitated', current_wounds: 0 })
    expandRow()

    // Not a disabled toggle: there is nothing to disable, because wounds are what move
    // this state in both directions. Offering a control the server would overrule is
    // the asymmetric automation the service's own comment warns against.
    expect(screen.queryByRole('group', { name: `Board status for ${WHO}` })).not.toBeInTheDocument()
    expect(screen.getByText(/incapacitated/i)).toBeInTheDocument()
  })
})

describe('OperativeRow: collapsing (KF8c)', () => {
  it('still shows name, wounds, order and activated while collapsed', () => {
    stub()
    renderRow({ current_wounds: 8, wounds: 12 })

    // `KILLTEAM.md` asks the list to stay "compact enough to see the whole team at a
    // glance -- name, wounds, order, activated". None of those four is text on this
    // screen: wounds and order ARE their controls, so a collapsed row cannot hide them
    // without breaking the requirement collapsing was meant to serve.
    expect(screen.getByText('Ravener Prime')).toBeInTheDocument()
    expect(screen.getByLabelText(`Wounds for ${WHO}`)).toBeInTheDocument()
    expect(screen.getByLabelText(`Order for ${WHO}`)).toBeInTheDocument()
    expect(screen.getByText('Not activated')).toBeInTheDocument()
    expect(screen.getByLabelText(`Activate ${WHO}`)).toBeInTheDocument()
  })

  it('leaves the tokens and the datacard out of the DOM until it is opened', () => {
    stub()
    renderRow()

    // Absent, not hidden. That is what makes the height saving real -- and it is the
    // only form the suite can see, because jsdom lays nothing out and keeps a closed
    // `<details>`'s children queryable.
    expect(screen.queryByText('Datacard')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(`Add a token to ${WHO}`)).not.toBeInTheDocument()

    expandRow()

    expect(screen.getByText('Datacard')).toBeInTheDocument()
    expect(screen.getByLabelText(`Add a token to ${WHO}`)).toBeInTheDocument()
  })

  it('announces its own state, and names what it controls', () => {
    stub()
    renderRow()
    const row = screen.getByRole('listitem', { name: WHO })
    const toggle = within(row).getByRole('button', { expanded: false })

    // `aria-controls` has to point at an element that exists once open, or the
    // announcement is a promise to a screen reader that the DOM does not keep.
    const controls = toggle.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    expect(document.getElementById(controls!)).toBeNull()

    expandRow()

    expect(within(row).getByRole('button', { expanded: true })).toBe(toggle)
    expect(document.getElementById(controls!)).not.toBeNull()
  })
})

describe('OperativeRow: tokens', () => {
  it('writes the WHOLE array when one is added', async () => {
    const seen = stub()
    renderRow({ tokens: ['Poison'] })
    expandRow()
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
    expandRow()
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
    expandRow()
    fireEvent.click(screen.getByLabelText(`Remove token Poison from ${WHO}`))

    await waitFor(() => {
      expect(seen.find((c) => c.method === 'PATCH')?.body).toEqual({ tokens: ['Tunnel 3'] })
    })
  })

  it('sends nothing for a blank or duplicate token', async () => {
    const seen = stub()
    renderRow({ tokens: ['Poison'] })
    expandRow()
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
    expandRow()
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

    // Three different writes on one row, so the claim is about the row and not about
    // one control. Wounds goes through KF10's dialog now.
    fireEvent.click(screen.getByLabelText(`Wounds for ${WHO}`))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Amount'), { target: { value: '1' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
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
    expandRow()
    // Through the attribute, because jsdom renders closed content anyway.
    expect(card().open).toBe(false)
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    expect(card().open).toBe(true)
  })

  it('reads the printed stats from the game\'s own snapshot', () => {
    stub()
    renderRow({ apl: 2, move: 6, save: 4, wounds: 12 })
    expandRow()
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
    expandRow()
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
    expandRow()
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
    expandRow()
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    expect(within(card()).getByText('—')).toBeInTheDocument()
  })

  it('renders the abilities and the keywords it was snapshotted with', () => {
    stub()
    renderRow({
      abilities: [makeKTGameAbility({ name: 'Burrow', description: 'Goes under.' })],
      keywords: ['RAVENER', 'TYRANID'],
    })
    expandRow()
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
    expandRow()
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
    expandRow()
    openCard()
    expect(screen.getByText('None used.')).toBeInTheDocument()
  })

  it('appends the action with the turning point the server would stamp', async () => {
    const seen = stub()
    renderRow(
      { actions_used: [], abilities: [makeKTGameAbility({ name: 'Burrow' })] },
      { turning_point: 3 },
    )
    expandRow()
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
    expandRow()
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
    expandRow()
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
    expandRow()
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
    expandRow()
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
    expandRow()
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

/* ---- Transform (KF4g) ---- */

describe('OperativeRow: transform', () => {
  /** Answers the team detail too, and records every url. */
  function stubWithTeam() {
    const seen: { url: string; method: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      seen.push({
        url: u,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      if (u.includes('/kill-team/teams/')) {
        return jsonResponse(
          makeKillTeamDetail({
            operatives: [
              // The card this row already holds, plus two it could become. All three
              // `roster`, which is the point: Chaos Cult's Mutant and Torment are NOT
              // flagged `in_battle` (#20), so filtering on that would offer nothing.
              makeKTOperative({ id: 'kto1', name: 'Devotee', availability: 'roster' }),
              makeKTOperative({ id: 'kto2', name: 'Mutant', availability: 'roster' }),
              makeKTOperative({ id: 'kto3', name: 'Torment', availability: 'roster' }),
            ],
          }),
        )
      }
      if (u.includes('/operatives/')) return jsonResponse(makeKTGameOperative())
      return jsonResponse(makeKTGame())
    })
    vi.stubGlobal('fetch', fetchMock)
    return seen
  }

  const catalog = (seen: { url: string }[]) =>
    seen.filter((c) => c.url.includes('/api/v1/kill-team/'))

  it('fetches nothing until its own disclosure opens', async () => {
    const seen = stubWithTeam()
    renderRow({ operative_id: 'kto1' })
    expandRow()
    // Opening the DATACARD must not fetch the team: a player reading a weapon rule is
    // the common case, and transforming is one team's rule.
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    expect(catalog(seen)).toEqual([])

    fireEvent.click(screen.getByLabelText(`Transform ${WHO}`))
    await waitFor(() => expect(catalog(seen).length).toBe(1))
    expect(catalog(seen)[0].url).toContain('/kill-team/teams/kt1')
  })

  it('offers every card the team prints, not only the in_battle ones', async () => {
    stubWithTeam()
    renderRow({ operative_id: 'kto1' })
    expandRow()
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    fireEvent.click(screen.getByLabelText(`Transform ${WHO}`))

    const select = await screen.findByLabelText(`Becomes, for ${WHO}`)
    expect(within(select).getByRole('option', { name: 'Mutant' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Torment' })).toBeInTheDocument()
  })

  it('does not offer the card this row already holds', async () => {
    stubWithTeam()
    renderRow({ operative_id: 'kto1' })
    expandRow()
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    fireEvent.click(screen.getByLabelText(`Transform ${WHO}`))

    const select = await screen.findByLabelText(`Becomes, for ${WHO}`)
    expect(within(select).queryByRole('option', { name: 'Devotee' })).not.toBeInTheDocument()
  })

  it('POSTs the card it becomes, addressed by the ROW', async () => {
    const seen = stubWithTeam()
    renderRow({ id: 'ktgo-7', operative_id: 'kto1' })
    expandRow()
    fireEvent.click(screen.getByLabelText(`Datacard for ${WHO}`))
    fireEvent.click(screen.getByLabelText(`Transform ${WHO}`))
    fireEvent.change(await screen.findByLabelText(`Becomes, for ${WHO}`), {
      target: { value: 'kto2' },
    })
    fireEvent.click(screen.getByLabelText(`Transform ${WHO} into the chosen datacard`))

    await waitFor(() => {
      const post = seen.find((c) => c.url.endsWith('/transform'))
      // #19: the row keeps its id while its catalog pointer moves, so the operation is
      // addressed by the row and names only what it becomes.
      expect(post?.url).toContain('/operatives/ktgo-7/transform')
      expect(post?.body).toEqual({ becomes_operative_id: 'kto2' })
    })
  })
})

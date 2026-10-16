/* Row tests. Real timers rather than fake ones: the wounds commit is debounced at
 * 400ms and `waitFor` allows 1000ms, so the debounce elapses naturally — and fake
 * timers plus react-query's own scheduling is a deadlock this suite has no reason to
 * take on. */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { OperativeRow } from './killTeamGameRow'
import { jsonResponse, makeKTGame, makeKTGameOperative } from '../test/fixtures'
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

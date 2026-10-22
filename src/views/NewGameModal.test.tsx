/* The start-a-battle overlay. These tests cover ONE behaviour: a battle cannot be
 * started from a roster with nobody in it (ROADMAP F13 tier 3).
 *
 * That check is a deliberate exception to the house style. This app informs and never
 * refuses -- #1, #51 and #57 all say availability is reported and not enforced -- so a
 * block needs its own justification: a roster with no operatives produces a battle with
 * nothing to track, and the modal promises "the roster is copied into the battle". */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { NewGameModal } from './NewGameModal'
import { jsonResponse, makeKTGame, makeKTRoster, makeKTRosterListRow, page } from '../test/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

const EMPTY = makeKTRoster({ id: 'ktr-empty', name: 'Fresh Roster', operatives: [] })
const FULL = makeKTRoster({ id: 'ktr-1', name: 'My Raveners' })

/** Lists both rosters; returns whichever detail is asked for. */
function stub() {
  const seen: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(String(url), 'http://localhost').pathname
      seen.push(`${init?.method ?? 'GET'} ${path}`)
      if (path.endsWith('/rosters')) {
        return jsonResponse(
          page([
            makeKTRosterListRow({ id: FULL.id, name: FULL.name }),
            makeKTRosterListRow({ id: EMPTY.id, name: EMPTY.name }),
          ]),
        )
      }
      if (path.endsWith(`/rosters/${EMPTY.id}`)) return jsonResponse(EMPTY)
      if (path.endsWith(`/rosters/${FULL.id}`)) return jsonResponse(FULL)
      return jsonResponse(makeKTGame())
    }),
  )
  return seen
}

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NewGameModal open onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const start = () => screen.getByRole('button', { name: /start battle/i })

describe('NewGameModal: a battle needs somebody to fight it', () => {
  it('refuses a roster with no operatives, and says whose it is', async () => {
    stub()
    renderModal()
    await screen.findByRole('option', { name: /Fresh Roster/ })

    fireEvent.change(screen.getByLabelText('Roster'), { target: { value: EMPTY.id } })

    // `find`, not `get`: the button is disabled immediately by the in-flight check, so
    // asserting on `disabled` first would pass before the answer had arrived and prove
    // nothing about the empty case.
    const alert = await screen.findByRole('alert')
    // Names the roster rather than saying "this roster": the picker holds several and
    // the player may have chosen the wrong one.
    expect(alert).toHaveTextContent(/Fresh Roster has no operatives/i)
    expect(start()).toBeDisabled()
  })

  it('allows a roster that has operatives', async () => {
    stub()
    renderModal()
    await screen.findByRole('option', { name: /My Raveners/ })

    fireEvent.change(screen.getByLabelText('Roster'), { target: { value: FULL.id } })

    await waitFor(() => expect(start()).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('asks for the roster only once one is chosen', async () => {
    const seen = stub()
    renderModal()
    await screen.findByRole('option', { name: /Fresh Roster/ })

    // The list read carries no operative count, so this costs a second request -- which
    // is why it is deferred until a choice exists rather than fetched for every roster.
    expect(seen.some((c) => c.includes(`/rosters/${EMPTY.id}`))).toBe(false)

    fireEvent.change(screen.getByLabelText('Roster'), { target: { value: EMPTY.id } })
    await waitFor(() => expect(seen.some((c) => c.includes(`/rosters/${EMPTY.id}`))).toBe(true))
  })

  it('does not start a battle while the check is still in flight', async () => {
    stub()
    renderModal()
    await screen.findByRole('option', { name: /Fresh Roster/ })

    fireEvent.change(screen.getByLabelText('Roster'), { target: { value: EMPTY.id } })
    // Disabled immediately, before the detail lands: the alternative is a button that
    // is briefly pressable and then refuses.
    expect(start()).toBeDisabled()
  })
})

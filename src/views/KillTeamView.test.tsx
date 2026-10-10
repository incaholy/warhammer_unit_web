import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import KillTeamView from './KillTeamView'
import {
  jsonResponse,
  makeKillTeamDetail,
  makeKTAbility,
  makeKillTeamRule,
  makeKTFaction,
  makeKTOperative,
  makeKTSelectionRule,
  makeKTWeapon,
  makeUniversal,
  page,
} from '../test/fixtures'
import type { KillTeam_Detail, KTFaction_Read } from '../api/types'

function stubFetch(team: KillTeam_Detail = makeKillTeamDetail()) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.includes('/kill-team/factions')) {
      return jsonResponse(page<KTFaction_Read>([makeKTFaction({ id: 'ktf1', name: 'Tyranids' })]))
    }
    if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
    if (u.includes('/kill-team/teams/')) return jsonResponse(team)
    throw new Error(`unexpected request: ${u}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderView(id = 'kt1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/kill-team/teams/${id}`]}>
        <Routes>
          <Route path="/kill-team/teams/:killTeamId" element={<KillTeamView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KillTeamView', () => {
  it('names the team and its faction', async () => {
    stubFetch()
    renderView()
    expect(await screen.findByRole('heading', { name: 'Raveners', level: 1 })).toBeInTheDocument()
    // The detail names its faction by id only (#46), so this proves the lookup.
    expect(screen.getByText('Tyranids')).toBeInTheDocument()
  })

  it('reads the whole team in one request', async () => {
    const fetchMock = stubFetch()
    renderView()
    await screen.findByRole('heading', { name: 'Raveners', level: 1 })

    // `KillTeam_Detail` nests the datacards, rules, ploys, equipment AND the
    // composition (#47), so the tabs must not each fetch something.
    const teamReads = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => /\/kill-team\/teams\/[^/]+$/.test(u))
    expect(teamReads).toHaveLength(1)
    // And nothing hits the separate composition endpoint.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/composition'))).toBe(false)
  })

  describe('datacards', () => {
    it('shows the stat line and the weapon profiles', async () => {
      stubFetch(
        makeKillTeamDetail({
          operatives: [
            makeKTOperative({
              id: 'kto1',
              name: 'Ravener Warrior',
              apl: 2,
              move: 6,
              save: 4,
              wounds: 12,
              weapons: [
                makeKTWeapon({
                  id: 'w1',
                  name: 'Scything talons',
                  category: 'melee',
                  attacks: 5,
                  hit: 3,
                  normal_damage: 4,
                  crit_damage: 5,
                  weapon_rules: ['Lethal 5+'],
                }),
              ],
              abilities: [makeKTAbility({ id: 'a1', name: 'Burrow', description: 'It burrows.' })],
            }),
          ],
        }),
      )
      renderView()

      const card = await screen.findByRole('heading', { name: 'Ravener Warrior', level: 2 })
      expect(card).toBeInTheDocument()
      const row = screen.getByRole('row', { name: /Scything talons/ })
      expect(within(row).getByText('5')).toBeInTheDocument() // attacks
      expect(within(row).getByText('3+')).toBeInTheDocument() // hit
      expect(within(row).getByText('4/5')).toBeInTheDocument() // normal/crit damage
      expect(within(row).getByText('Lethal 5+')).toBeInTheDocument()
      expect(screen.getByText('It burrows.')).toBeInTheDocument()
    })

    it('keeps the printed order rather than sorting by name', async () => {
      // #25: the page prints the leader first in 46 of 48 teams. The fixture is
      // named so printed order and alphabetical order disagree, which is what makes
      // this falsifiable.
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
      expect(names).toEqual(['Ravener Prime', 'Hormagaunt'])
      expect(names).not.toEqual([...names].sort())
    })

    it('marks an in-battle datacard rather than hiding it', async () => {
      // `in_battle` means granted during a game, not rostered (#20). It informs; it
      // never refuses (#51), so the card is present and labelled.
      stubFetch(
        makeKillTeamDetail({
          operatives: [
            makeKTOperative({ id: 'kto1', name: 'Vermin', availability: 'in_battle', position: 0 }),
          ],
        }),
      )
      renderView()

      expect(await screen.findByRole('heading', { name: 'Vermin', level: 2 })).toBeInTheDocument()
      expect(screen.getByText('In battle only')).toBeInTheDocument()
    })

    it('shows a melee weapon as melee and a ranged one by its range', async () => {
      stubFetch(
        makeKillTeamDetail({
          operatives: [
            makeKTOperative({
              id: 'kto1',
              name: 'Warrior',
              position: 0,
              weapons: [
                makeKTWeapon({ id: 'w1', name: 'Devourer', category: 'range', range: 8, position: 0 }),
                makeKTWeapon({ id: 'w2', name: 'Talons', category: 'melee', range: 0, position: 1 }),
              ],
            }),
          ],
        }),
      )
      renderView()

      await screen.findByRole('heading', { name: 'Warrior', level: 2 })
      expect(within(screen.getByRole('row', { name: /Devourer/ })).getByText('8"')).toBeInTheDocument()
      expect(within(screen.getByRole('row', { name: /Talons/ })).getByText('melee')).toBeInTheDocument()
    })
  })

  describe('composition', () => {
    it('renders each row in printed order, indented by depth', async () => {
      stubFetch(
        makeKillTeamDetail({
          selection_rules: [
            makeKTSelectionRule({ id: 's1', position: 0, depth: 0, kind: 'heading', text: 'Select' }),
            makeKTSelectionRule({ id: 's2', position: 1, depth: 1, kind: 'line', text: 'One LEADER' }),
            makeKTSelectionRule({ id: 's3', position: 2, depth: 2, kind: 'line', text: 'Then five' }),
          ],
        }),
      )
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Composition' }))

      const rows = screen.getAllByRole('listitem')
      expect(rows.map((r) => r.textContent)).toEqual(['Select', 'One LEADER', 'Then five'])
      // `depth` is the only thing that restores the printed shape (#45). Without the
      // indent the three lines read as one flat list and the section is lost.
      expect(rows[0]).toHaveStyle({ paddingLeft: '0px' })
      expect(rows[1]).toHaveStyle({ paddingLeft: '22px' })
      expect(rows[2]).toHaveStyle({ paddingLeft: '44px' })
    })

    it('renders a note as its own row', async () => {
      // A footnote's body is a `kind = 'note'` row rather than text appended to the
      // bullet above it (#30), so it must not be folded into the previous line.
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Composition' }))

      const rows = screen.getAllByRole('listitem')
      expect(rows.map((r) => r.textContent)).toEqual(['Select', 'One LEADER', 'A footnote.'])
    })

    it('derives nothing — no counts, no budget', async () => {
      // Composition is DESCRIPTION (#28, #44). The app shows the printed words and
      // never a derived "0 of 6 selected", which would be the tracker applying a rule.
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Composition' }))

      expect(screen.queryByText(/\bof 6\b/)).not.toBeInTheDocument()
      expect(screen.queryByText(/selected/i)).not.toBeInTheDocument()
    })
  })

  describe('rules and ploys', () => {
    it('shows each ploy with its kind and CP cost, in printed order', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Rules & Ploys' }))

      // Strategy before Firefight, because that is the printed order (#25) — not
      // because the view groups by kind. Scoped per ploy: the universal ploy is also
      // a 1 CP strategy ploy, so an unscoped match finds two and proves neither.
      const own = screen.getByText('Predatory Instincts').closest('div')
      expect(own).not.toBeNull()
      expect(within(own as HTMLElement).getByText(/strategy · 1 CP/)).toBeInTheDocument()

      const firefight = screen.getByText('Lurking Horror').closest('div')
      expect(within(firefight as HTMLElement).getByText(/firefight · 1 CP/)).toBeInTheDocument()

      // Printed order, not grouped by kind: strategy sits before firefight because
      // that is the order the page prints, and the view does not reorder.
      const ployNames = screen
        .getAllByRole('definition')
        .map((d) => d.previousElementSibling?.textContent ?? '')
      expect(ployNames.join(' ')).toMatch(/Predatory Instincts.*Lurking Horror/s)
    })

    it('shows the universal ploys separately from the team\'s own', async () => {
      // One row per team, plus the rows no team owns (#48) — "its own, plus these".
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Rules & Ploys' }))

      expect(screen.getByText('Universal — every team may use these')).toBeInTheDocument()
      expect(screen.getByText('Command Re-roll')).toBeInTheDocument()
      expect(screen.getByText('Frag Grenade')).toBeInTheDocument()
    })

    it('shows a rule\'s group when it has one', async () => {
      stubFetch(
        makeKillTeamDetail({
          rules: [makeKillTeamRule({ id: 'r1', name: 'Hive Sense', group: 'Hive Mind' })],
        }),
      )
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Rules & Ploys' }))

      expect(screen.getByText('Hive Mind')).toBeInTheDocument()
    })
  })

  describe('tabs', () => {
    it('associates each panel with its tab', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      // Real tab semantics rather than a toggle group: a screen reader announces the
      // selected tab and reaches the panel it controls.
      const tabs = screen.getAllByRole('tab')
      expect(tabs.map((t) => t.textContent)).toEqual(['Datacards', 'Composition', 'Rules & Ploys'])
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true')

      // Asserted as a RELATIONSHIP rather than against literal ids: `Tabs` prefixes
      // them so two tabbed screens on one page cannot collide, and a test pinned to
      // the unprefixed string would break on that without anything being wrong.
      const panel = screen.getByRole('tabpanel')
      expect(tabs[0]).toHaveAttribute('aria-controls', panel.id)
      expect(panel).toHaveAttribute('aria-labelledby', tabs[0].id)
    })

    it('shows one panel at a time', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
      fireEvent.click(screen.getByRole('tab', { name: 'Composition' }))
      expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
      expect(screen.getByRole('tab', { name: 'Composition' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
  })

  describe('failures', () => {
    it('says a withdrawn or unknown team is not in the catalog', async () => {
      // A withdrawn row reads as missing (#55), the same 404 a bad id gets — and the
      // catalog deliberately does not say which.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL) => {
          const u = String(url)
          if (u.includes('/kill-team/factions')) return jsonResponse(page<KTFaction_Read>([]))
          if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
          return jsonResponse({ detail: 'not found', code: 'NOT_FOUND' }, { status: 404 })
        }),
      )
      renderView('gone')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'That kill team is not in the catalog.',
      )
      expect(screen.getByRole('link', { name: /All kill teams/ })).toHaveAttribute(
        'href',
        '/kill-team',
      )
    })

    it('distinguishes a server failure from a missing team', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL) => {
          const u = String(url)
          if (u.includes('/kill-team/factions')) return jsonResponse(page<KTFaction_Read>([]))
          if (u.includes('/kill-team/universal')) return jsonResponse(makeUniversal())
          return jsonResponse({ detail: 'boom', code: 'INTERNAL' }, { status: 500 })
        }),
      )
      renderView()

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this kill team.")
    })

    it('announces that it is loading', async () => {
      stubFetch()
      renderView()
      expect(screen.getByRole('status', { name: 'Loading kill team' })).toBeInTheDocument()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })
    })
  })
})

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

      // The stat line, asserted as label→value pairs. It was rendered and asserted
      // nowhere: deleting `<StatLine>` outright left all seventeen tests green.
      const stats = screen
        .getAllByRole('term')
        .filter((t) => ['APL', 'Move', 'Save', 'Wounds'].includes(t.textContent ?? ''))
        .map((t) => [t.textContent, t.nextElementSibling?.textContent])
      expect(stats).toEqual([
        ['APL', '2'],
        ['Move', '6"'],
        ['Save', '4+'],
        ['Wounds', '12'],
      ])

      // Cells read BY COLUMN, not by text. `getByText('5')` ignored position, so
      // swapping the attacks and hit cells so `3+` rendered under "A" passed.
      const row = screen.getByRole('row', { name: /Scything talons/ })
      const cells = within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent)
      expect(cells).toEqual(['5', '3+', '4/5', 'Lethal 5+'])
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

    it('renders the order it was SENT, not the order `position` implies', async () => {
      // The one test that can tell "does not re-sort" from "sorts by position". Every
      // shared fixture has array order equal to `position` order, so every other
      // ordering assertion passes under both behaviours. Here they disagree.
      //
      // Array order is what must win: the server sends rows in `position` order and
      // the client renders what it was sent (#25). A client that sorted would be
      // deciding an order the catalog already decided, and would also break the
      // `(position, id)` tie-break the server applies and the client cannot see.
      stubFetch(
        makeKillTeamDetail({
          operatives: [
            makeKTOperative({ id: 'kto-a', name: 'Sent first', position: 9 }),
            makeKTOperative({ id: 'kto-b', name: 'Sent second', position: 1 }),
          ],
        }),
      )
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      const names = screen
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent)
        .filter((n) => n?.startsWith('Sent'))
      expect(names).toEqual(['Sent first', 'Sent second'])
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

    it('does NOT mark a rosterable datacard', async () => {
      // The other half of #20/#51, and the half that was missing: nothing asserted
      // the tag's ABSENCE, so making it unconditional left all seventeen tests
      // green. A marker that appears on everything marks nothing.
      stubFetch(
        makeKillTeamDetail({
          operatives: [
            makeKTOperative({ id: 'kto1', name: 'Warrior', availability: 'roster', position: 0 }),
          ],
        }),
      )
      renderView()

      await screen.findByRole('heading', { name: 'Warrior', level: 2 })
      expect(screen.queryByText('In battle only')).not.toBeInTheDocument()
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

      // Asserted over what is RENDERED, not against two guessed strings. The previous
      // version banned `/\bof 6\b/` and `/selected/i`; no "6" existed in the fixture
      // and "chosen" is not "selected", so adding `0 of 3 chosen` above the list
      // passed. The composition panel may contain the printed rows and nothing else.
      const panel = screen.getByRole('tabpanel')
      const rows = within(panel).getAllByRole('listitem')
      expect(rows.map((r) => r.textContent)).toEqual(['Select', 'One LEADER', 'A footnote.'])
      // Every text node in the panel belongs to one of those rows: no derived line,
      // no count, no budget, whatever words it might use (#28, #44).
      expect(panel.textContent).toBe(rows.map((r) => r.textContent).join(''))
    })
  })

  describe('rules and ploys', () => {
    it('shows each ploy with its kind and CP cost, in printed order', async () => {
      stubFetch()
      renderView()
      await screen.findByRole('heading', { name: 'Raveners', level: 1 })

      fireEvent.click(screen.getByRole('tab', { name: 'Rules & Ploys' }))

      // Scoped to the Ploys block and asserted ABSOLUTELY, in order. The previous
      // version matched a substring across the whole reference panel, which could not
      // tell printed order from group-by-kind order — and the fixture could not
      // either, until it started printing the firefight ploy first.
      const ploys = screen.getByRole('heading', { name: 'Ploys', level: 2 }).parentElement
      expect(ploys).not.toBeNull()
      // Read off each entry's SUMMARY, not a `<dt>`: KF7 group B made every reference
      // entry collapsible, so the list is `<li><details><summary>` now. The intent is
      // unchanged -- printed order, with the name and its aside together.
      const names = within(ploys as HTMLElement)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('summary')?.textContent ?? '')

      // GROUPED by kind since KF11, strategy first, which is the order a turning point
      // runs in. This assertion previously locked in PRINTED order (#25) specifically so
      // that "a view grouping by kind would put the strategy ploy first and fail here" --
      // the fixture prints firefight first for that reason. The guard did its job: this
      // change could not happen quietly, and the decision is recorded in KF11.
      expect(names[0]).toContain('Predatory Instincts')
      expect(names[1]).toContain('Lurking Horror')

      // The kind has left the LINE, because a heading above the group already says it.
      // The cost stays, since that is what differs between rows.
      expect(names[0]).toContain('1 CP')
      expect(names[0]).not.toContain('strategy ·')
      expect(names[1]).toContain('2 CP')

      // The headings are what carries the kind now.
      expect(within(ploys as HTMLElement).getByText('Strategy ploys')).toBeInTheDocument()
      expect(within(ploys as HTMLElement).getByText('Firefight ploys')).toBeInTheDocument()
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

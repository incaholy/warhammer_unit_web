/* An axe-core sweep over every route, and over the states a route alone cannot reach.
 *
 * Why a browser and not jsdom: almost every rule worth running needs a layout engine or
 * a computed style. Colour contrast needs rendered pixels; "is this control focusable"
 * needs a focus model; "does this landmark contain that heading" needs the real
 * accessibility tree, which jsdom does not build. The jsdom suite asserts the names and
 * roles it knows to look for -- `getByRole`, `getByLabelText` -- and that is a different
 * question from "what does the tree actually contain".
 *
 * Why it is not enough on its own: axe finds roughly the machine-checkable half. It
 * cannot see that focus never returns from a dialog, that a value silently reverted, or
 * that an `aria-label` is present but WRONG. Those are read out of the code, and the
 * findings live in ROADMAP A1.
 *
 * Populated, not empty. `seed.ts` answers every non-battle collection with an empty page
 * on purpose -- a layout assertion wants the empty state -- but an empty table has no
 * header cells and an empty list has no repeated controls, so an accessibility sweep over
 * it passes by having nothing to judge. This file seeds real rows for every route.
 *
 * Dialogs get their own tests. A route visit scans the first render only, and a dialog is
 * where focus, labelling and modality actually go wrong. */

import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

import {
  makeArmy,
  makeArmyUnit,
  makeFacets,
  makeFaction,
  makeKillTeam,
  makeKillTeamDetail,
  makeKTFaction,
  makeKTGameListRow,
  makeKTOperative,
  makeKTRoster,
  makeKTRosterListRow,
  makeUniversal,
  makeUnit,
  makeUser,
  makeUserUnit,
  makeValidation,
  page,
} from '../src/test/fixtures'
import { seededGame } from './seed'

/** WCAG 2.1 A and AA. The level this project is auditing against; it is the level most
 *  procurement and most legislation names, and the one with an agreed meaning. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const GAME = seededGame()

/** Every route populated, so a sweep judges real rows rather than empty states. */
async function seedAll(testPage: Page) {
  await testPage.addInitScript(() => {
    window.localStorage.setItem('muster.token', 'a11y-suite-token')
  })

  const units = [
    makeUnit({ id: 'u1', unit_name: 'Intercessor', points: 100, keywords: ['Infantry'] }),
    makeUnit({ id: 'u2', unit_name: 'Terminator', points: 185, keywords: ['Infantry'] }),
  ]

  await testPage.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '')
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/me') return json(makeUser())

    // --- Army List ---
    if (path === '/me/armies') return json(page([makeArmy({ points_total: 285 })]))
    if (path === '/me/armies/a1')
      return json(
        makeArmy({
          points_total: 285,
          points_limit: 2000,
          units: [makeArmyUnit({ unit: units[0], amount: 2 }), makeArmyUnit({ unit: units[1] })],
        }),
      )
    if (path === '/me/armies/a1/validate') return json(makeValidation({ points_total: 285 }))
    if (path === '/me/armies/a1/shortfall') return json([])
    if (path === '/me/inventory') return json(page([makeUserUnit({ unit: units[0], amount: 3 })]))
    if (path === '/units/facets') return json(makeFacets({ total: 2, by_faction: { f1: 2 } }))
    if (path === '/units/u1') return json(units[0])
    if (path === '/units') return json(page(units))
    if (path === '/factions') return json(page([makeFaction({ name: 'Imperium' })]))

    // --- Kill Team ---
    if (path === '/kill-team/factions') return json(page([makeKTFaction()]))
    if (path === '/kill-team/teams/kt1') return json(makeKillTeamDetail())
    if (path === '/kill-team/teams') return json(page([makeKillTeam()]))
    if (path === '/kill-team/universal') return json(makeUniversal())
    if (path === '/kill-team/operatives')
      return json(page([makeKTOperative({ id: 'kto1', name: 'Ravener Prime' })]))
    if (path === '/me/kill-team/rosters/ktr-1') return json(makeKTRoster())
    if (path === '/me/kill-team/rosters') return json(page([makeKTRosterListRow()]))
    if (path === `/me/kill-team/games/${GAME.id}`) return json(GAME)
    if (path === '/me/kill-team/games') return json(page([makeKTGameListRow()]))

    // A route left unstubbed renders its skeleton forever, and a skeleton has nothing to
    // judge -- the same trap `seed.ts` names.
    return json({ items: [], total: 0, limit: 50, offset: 0 })
  })
}

/** Rendered, not merely loaded. `networkidle` resolves before React has painted.
 *
 *  Waits for the LOADING regions specifically, not for every `role="status"`: this app
 *  uses that role for two different things -- a skeleton, which is transient, and a live
 *  result count like the catalog's "Showing 12 of 141", which is permanent and SHOULD be
 *  in the DOM before its text changes. Waiting for zero status regions therefore never
 *  settles on half the routes. The skeletons are the ones named "Loading ...". */
async function settled(testPage: Page) {
  await testPage.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15_000 })
  await expect(testPage.locator('[role="status"][aria-label^="Loading"]')).toHaveCount(0, {
    timeout: 15_000,
  })
}

/** Rules this app does not pass yet, listed so they are VISIBLE and can only shrink.
 *
 * A RATCHET, the same device KF9 used for tap targets: a rule named here is allowed to
 * fail, every rule not named here fails the build, and fixing one means deleting its line
 * -- which fails this file until the name goes, so the list cannot silently regrow. Each
 * entry carries its cause and the group that closes it, because an allowlist without a
 * reason becomes permanent.
 *
 * An empty list is the goal and is the point at which this becomes a plain assertion. */
const KNOWN: Record<string, string> = {
  // `--faint` (2.70) and `--fainter` (1.99) against `--paper`. ONE cause for every
  // screen: every failure axe reports has the identical ratio. Closed by group A, which
  // re-spaces the four text weights so all of them clear 4.5:1.
  'color-contrast': 'ROADMAP A1 group A — the text tokens fail AA',

  // `aria-label` REPLACES content, so a label that omits the value hides it. Six sites,
  // one judgement -- the same defect already fixed on the wounds trigger. Closed by
  // group B.
  'label-content-name-mismatch': 'ROADMAP A1 group B — a name that hides its own content',
}

/** Runs axe and renders each violation as something a person can act on. */
async function scan(testPage: Page, context?: string) {
  const results = await new AxeBuilder({ page: testPage }).withTags(TAGS).analyze()

  // A rule in KNOWN that has stopped failing EVERYWHERE is reported by the dedicated
  // test at the bottom of this file rather than here, because one screen passing does
  // not mean the rule is fixed.
  const unexpected = results.violations.filter((v) => !(v.id in KNOWN))

  const readable = unexpected.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 4).map((n) => ({
      target: n.target.join(' '),
      failure: (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 220),
    })),
    totalNodes: v.nodes.length,
  }))
  expect(readable, `axe violations${context ? ` (${context})` : ''}`).toEqual([])
  return results.violations.map((v) => v.id)
}

const ROUTES: [name: string, path: string][] = [
  ['section chooser', '/'],
  ['login', '/login'],
  ['collection', '/army-list'],
  ['inventory', '/army-list/inventory'],
  ['catalog', '/army-list/catalog'],
  ['army', '/army-list/armies/a1'],
  ['army catalog', '/army-list/armies/a1/catalog'],
  ['unit datasheet', '/army-list/units/u1'],
  ['kill team catalog', '/kill-team'],
  ['kill team', '/kill-team/teams/kt1'],
  ['rosters', '/kill-team/rosters'],
  ['roster', '/kill-team/rosters/ktr-1'],
  ['battles', '/kill-team/games'],
  ['battle', `/kill-team/games/${GAME.id}`],
  ['not found', '/kill-team/nope'],
]

test.describe('axe: every route', () => {
  for (const [name, path] of ROUTES) {
    test(name, async ({ page: testPage }) => {
      await seedAll(testPage)
      await testPage.goto(path)
      await settled(testPage)
      await scan(testPage, path)
    })
  }
})

test.describe('axe: states a route visit cannot reach', () => {
  test('the new-army dialog', async ({ page: testPage }) => {
    await seedAll(testPage)
    await testPage.goto('/army-list')
    await settled(testPage)
    await testPage.getByRole('button', { name: /new army/i }).click()
    await testPage.getByRole('dialog').waitFor()
    await scan(testPage, 'new-army dialog open')
  })

  test('the wounds dialog on a battle row', async ({ page: testPage }) => {
    await seedAll(testPage)
    await testPage.goto(`/kill-team/games/${GAME.id}`)
    await settled(testPage)
    await testPage.getByLabel(/^Wounds for /).first().click()
    await testPage.getByRole('dialog').waitFor()
    await scan(testPage, 'wounds dialog open')
  })

  test('an operative row expanded', async ({ page: testPage }) => {
    await seedAll(testPage)
    await testPage.goto(`/kill-team/games/${GAME.id}`)
    await settled(testPage)
    // Rows open collapsed since KF8c, so the tokens and the datacard are not in the tree
    // until one is expanded -- which is most of the row's markup.
    await testPage.getByRole('button', { expanded: false }).first().click()
    await scan(testPage, 'operative row expanded')
  })

  test('the battle Reference tab', async ({ page: testPage }) => {
    await seedAll(testPage)
    await testPage.goto(`/kill-team/games/${GAME.id}`)
    await settled(testPage)
    await testPage.getByRole('tab', { name: /reference/i }).click()
    await scan(testPage, 'Reference tab')
  })
})

test.describe('axe: the ratchet itself', () => {
  test('every allowed rule is still failing somewhere', async ({ page: testPage }) => {
    // The half of a ratchet that makes it one. Without this, fixing `color-contrast`
    // leaves its line in `KNOWN` forever and the next regression is allowed through on a
    // licence nobody remembers granting.
    //
    // Two screens, not all nineteen: the battle screen is the densest in the app and the
    // catalog carries the other half of the markup. A rule that fails nowhere on either
    // is fixed enough to come off the list.
    await seedAll(testPage)
    const seen = new Set<string>()
    for (const path of [`/kill-team/games/${GAME.id}`, '/army-list/catalog']) {
      await testPage.goto(path)
      await settled(testPage)
      for (const id of await scan(testPage, path)) seen.add(id)
    }
    const fixed = Object.keys(KNOWN).filter((id) => !seen.has(id))
    expect(fixed, 'these rules now pass -- delete their lines from KNOWN').toEqual([])
  })
})

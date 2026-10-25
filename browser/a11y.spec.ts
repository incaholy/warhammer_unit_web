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
  // `color-contrast` was here. Closed by group A: `--faint` (2.70) and `--fainter` (1.99)
  // were the whole of it, and re-spacing the four text weights cleared all 19 screens at
  // once. `src/styles/contrast.test.ts` now holds the palette in the suite CI runs.

  // `aria-label` REPLACES content, so a label that omits the value hides it. Six sites,
  // one judgement -- the same defect already fixed on the wounds trigger. Closed by
  // group B.
  'label-content-name-mismatch': 'ROADMAP A1 group B — a name that hides its own content',
}

/** The app bar, left out of the SWEEP and asserted directly instead.
 *
 * `Header.module.css:6` sets `backdrop-filter: blur(8px)` over a translucent ground, and
 * axe cannot compute contrast beneath a backdrop filter -- it samples, and a blur averages
 * the active pill's ink into its paper text, which it then reports as 3.02 against a pill
 * whose COMPUTED colours are `rgb(21,20,15)` on `rgb(250,250,248)`: 17.64:1, fully opaque,
 * no animation. Verified by reading the computed style off the element and by walking
 * every ancestor for an alpha or an animation; there is none.
 *
 * The coverage this gives up is taken back by a test below that does the arithmetic from
 * computed styles, where a blur cannot interfere.
 *
 * It was `'header'` and that was a DEFECT, found by an independent review. A tag selector
 * matches all 14 `<header>` elements in `src/`, 13 of them view page headings -- so every
 * route was being scanned with its own header, its `h1` and its controls removed, and
 * reporting green on markup nobody had judged. An attribute is used because the
 * CSS-module class is content-hashed and cannot be a selector. The test immediately
 * below is the floor that would have caught it. */
const APP_BAR = '[data-app-bar]'

/** The exclusion never removes more than one element. Checked on EVERY route.
 *
 * `.exclude()` silently drops whatever it matches, so a selector that is too broad makes
 * the sweep pass by judging less -- the exact defect this replaced, where `'header'`
 * matched all 14 in `src/`. At most one is the invariant that holds everywhere: `/login`
 * renders no app bar at all, and several routes render no header of their own.
 *
 * This alone cannot tell "the app bar" from "every header", because on a one-header route
 * both are 1. The test below does that, on a route that has two. */
async function assertExclusionIsNarrow(testPage: Page) {
  const excluded = await testPage.evaluate((sel) => document.querySelectorAll(sel).length, APP_BAR)
  expect(excluded, `${APP_BAR} must never match more than the app bar`).toBeLessThanOrEqual(1)
}

/** Runs axe and renders each violation as something a person can act on. */
async function scan(testPage: Page, context?: string) {
  const results = await new AxeBuilder({ page: testPage })
    .withTags(TAGS)
    .exclude(APP_BAR)
    .analyze()

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

/** Scans the DIALOG, not the page dimmed behind it.
 *
 * The overlay is `rgba(20,20,15,0.42)` (`Modal.module.css:4`), so axe blends every control
 * behind it through that dim and reports the result as a contrast failure -- a wounds
 * trigger at 1.58 that reads 4.62 when no dialog is open. The elements are deliberately
 * obscured, and the real defect is that they are not `inert`: A1 group C adds that, and
 * once it does they leave the accessibility tree and this narrowing becomes unnecessary.
 * Until then, scanning the whole page would judge a backdrop as if it were content. */
async function scanDialog(testPage: Page, context: string) {
  const results = await new AxeBuilder({ page: testPage })
    .withTags(TAGS)
    .include('[role="dialog"]')
    .analyze()
  const unexpected = results.violations.filter((v) => !(v.id in KNOWN))
  expect(
    unexpected.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })),
    `axe violations (${context})`,
  ).toEqual([])
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
      await assertExclusionIsNarrow(testPage)
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
    await scanDialog(testPage, 'new-army dialog open')
  })

  test('the wounds dialog on a battle row', async ({ page: testPage }) => {
    await seedAll(testPage)
    await testPage.goto(`/kill-team/games/${GAME.id}`)
    await settled(testPage)
    await testPage.getByLabel(/^Wounds for /).first().click()
    await testPage.getByRole('dialog').waitFor()
    await scanDialog(testPage, 'wounds dialog open')
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

test.describe('the axe exclusion is the app bar, not every header', () => {
  test('a route with two headers still excludes exactly one', async ({ page: testPage }) => {
    // The DISCRIMINATING case, and the one that would have caught the defect. On a route
    // rendering only the app bar, "excludes the app bar" and "excludes every header" are
    // indistinguishable -- both match 1. `/army-list` renders `CollectionView`'s own
    // header as well, so the two answers differ there: 1 is correct, 2 is the bug.
    await seedAll(testPage)
    await testPage.goto('/army-list')
    await settled(testPage)

    const counts = await testPage.evaluate((sel) => ({
      excluded: document.querySelectorAll(sel).length,
      headers: document.querySelectorAll('header').length,
    }), APP_BAR)

    expect(counts.headers, 'this route must render a second header for the test to mean anything')
      .toBeGreaterThanOrEqual(2)
    expect(counts.excluded, `${APP_BAR} must match the app bar alone`).toBe(1)
  })
})

test.describe('contrast the sweep cannot judge', () => {
  test('the active nav pill is opaque ink on paper, under its own blur', async ({
    page: testPage,
  }) => {
    // The coverage `APP_BAR` gives up, taken back by a method a backdrop filter cannot
    // confuse: read the COMPUTED colours and do the WCAG arithmetic here. If the pill ever
    // becomes translucent, or its ink/paper pairing is changed, this fails -- which is the
    // claim the exclusion rests on.
    await seedAll(testPage)
    await testPage.goto('/kill-team')
    await settled(testPage)

    const measured = await testPage.evaluate(() => {
      const el = document.querySelector('[class*="navActive"]') as HTMLElement | null
      if (!el) return null
      const rgb = (v: string) => (v.match(/\d+/g) ?? []).slice(0, 3).map(Number)
      const lum = (c: number[]) => {
        const f = (x: number) =>
          x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
      }
      const cs = getComputedStyle(el)
      const [a, b] = [lum(rgb(cs.color)), lum(rgb(cs.backgroundColor))]
      let node: HTMLElement | null = el
      let translucent = false
      while (node && node !== document.documentElement) {
        if (Number(getComputedStyle(node).opacity) < 1) translucent = true
        node = node.parentElement
      }
      return {
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        alpha: cs.backgroundColor.startsWith('rgba'),
        translucent,
      }
    })

    expect(measured, 'expected an active nav pill to measure').not.toBeNull()
    expect(measured!.alpha, 'the pill background is opaque').toBe(false)
    expect(measured!.translucent, 'no ancestor reduces opacity').toBe(false)
    expect(Number(measured!.ratio.toFixed(2))).toBeGreaterThanOrEqual(4.5)
  })
})

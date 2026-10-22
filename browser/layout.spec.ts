/* The layout claims jsdom cannot hold (ROADMAP KF9).
 *
 * The discipline that keeps this file small: EVERY assertion here names a requirement
 * from `KILLTEAM.md` or the roadmap. If it cannot, it belongs in the jsdom suite or
 * nowhere. Every browser suite starts as "just a few layout checks"; that rule is the
 * only thing stopping this one becoming a slow second suite re-testing behaviour the
 * 619 jsdom tests already cover better.
 *
 * It measures boxes. It never asserts on copy, never signs in, and takes no screenshots —
 * appearance stays a human's job, and visual regression is a different, far larger
 * commitment. */

import { test, expect, type Page } from '@playwright/test'
import { seed, GAME_ID } from './seed'

const BATTLE = `/kill-team/games/${GAME_ID}`

interface Box {
  label: string
  top: number
  bottom: number
  height: number
}

/** Every element the browser is actually PINNING, with its rect.
 *
 *  Discovered from computed styles rather than from a list of known selectors, so a new
 *  sticky region added later is covered the day it appears — which is the failure this
 *  assertion exists for. KF8a found three overlapping regions that had each been added
 *  by a different slice, none of which thought it was adding a fourth. */
async function pinnedBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const out: { label: string; top: number; bottom: number; height: number }[] = []
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const pos = getComputedStyle(el).position
      if (pos !== 'sticky' && pos !== 'fixed') continue
      const r = el.getBoundingClientRect()
      if (r.height === 0 || r.width === 0) continue
      const cls = (el.className || '').toString().split(/\s+/)[0] || el.tagName.toLowerCase()
      out.push({ label: `${el.tagName.toLowerCase()}.${cls}`, top: r.top, bottom: r.bottom, height: r.height })
    }
    return out
  })
}

async function openBattle(page: Page) {
  await seed(page)
  await page.goto(BATTLE)
  // Wait for real content, not for a timeout: the loading state has no sticky regions,
  // so asserting against it would pass by measuring nothing.
  await page.getByRole('heading', { level: 1 }).waitFor()
  // The section heading, which is unique -- an operative's own name matches its wounds,
  // order and Activate controls too, since every control in a row is named after it.
  //
  // ATTACHED, not visible. A chrome pinned wrongly COVERS this button, so waiting for
  // visibility makes a layout defect report itself as a timeout on an unrelated element
  // rather than as the overlap it is. Verified by reintroducing KF8a's `top: 0`.
  await page.getByRole('button', { name: /^Operatives$/ }).waitFor({ state: 'attached' })
}

/** Scrolls far enough that sticky regions are actually pinning, then lets it settle. */
async function scrollDown(page: Page, y = 700) {
  await page.evaluate((to) => window.scrollTo(0, to), y)
  await page.waitForFunction((to) => Math.abs(window.scrollY - to) < 2, y)
  await page.waitForTimeout(150)
}

test.describe('the battle screen, after scrolling', () => {
  test('no two pinned regions overlap', async ({ page }) => {
    // KF8a: four sticky elements were each pinned at `top: 0`, and `position: sticky`
    // does not stack -- so three of them claimed the same strip and `z-index` decided
    // which was visible. Advance, Undo and the tablist were entirely occluded for three
    // slices before a phone preview found it. Nothing in 619 jsdom tests can see this.
    await openBattle(page)
    await scrollDown(page)

    const boxes = await pinnedBoxes(page)
    expect(boxes.length, 'expected the app header and the battle chrome to be pinning').toBeGreaterThanOrEqual(2)

    const overlaps: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlap > 1) overlaps.push(`${a.label} and ${b.label} overlap by ${Math.round(overlap)}px`)
      }
    }
    expect(overlaps).toEqual([])
  })

  test('the pinned chrome stays within its budget of the viewport', async ({ page }) => {
    // "Phone-first, for use at the table" (KILLTEAM.md) as a number. A RATCHET set at
    // what was measured, not at an aspiration: a gate that fails the day it lands
    // teaches people to skip it. Tighten this when the chrome gets smaller; it should
    // never be loosened without a note saying why.
    await openBattle(page)
    await scrollDown(page)

    const boxes = await pinnedBoxes(page)
    const viewport = page.viewportSize()!.height
    const chromeBottom = Math.max(...boxes.map((b) => b.bottom))
    const share = chromeBottom / viewport

    // 481px of 664px on first measurement. The viewport is 664 and NOT the 844 of the
    // device: Safari's own chrome takes the rest, and every phone number recorded before
    // this file existed was against the device height. So the chrome is 72% of what a
    // player can actually see, leaving 183px -- barely one collapsed operative row.
    // KF8d should cut this sharply; tighten the ratchet when it does.
    expect(
      share,
      `pinned chrome reaches ${Math.round(chromeBottom)}px of ${viewport}px (${Math.round(share * 100)}%)`,
    ).toBeLessThanOrEqual(0.73)
  })
})

test.describe('touch targets', () => {
  test('every visible button is at least 44px tall', async ({ page }) => {
    // Apple's minimum, and the reason the context sets `hasTouch`: KF8b scoped the rule
    // to `@media (pointer: coarse)`, so without touch emulation this would measure the
    // desktop rendering and pass or fail for the wrong reason.
    await openBattle(page)

    const short = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('button'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.height > 0 && r.height < 44)
        // Identified by the CSS-module class rather than by the label, so eight
        // operative rows collapse to one entry instead of eight that change with the
        // fixture.
        .map(({ el }) => (el.className || '').toString().split(/\s+/)[0].replace(/_[a-z0-9]{5}_\d+/g, ''))
        .filter((c, i, all) => all.indexOf(c) === i)
        .sort(),
    )

    // A RATCHET, not a pass. These two bypass the `Button` primitive, which is why
    // KF8b's static test cannot see them -- it checks the five primitives' stylesheets,
    // and a bespoke button in a view is invisible to it. Listed so they are visible and
    // can only shrink: fixing one fails this until the name is removed, and a NEW short
    // button fails it immediately. See ROADMAP KF9.
    expect(short).toEqual(['_name', '_removeSource'])
  })
})

test.describe('no horizontal scroll', () => {
  for (const route of ['/', '/army-list', '/kill-team', BATTLE]) {
    test(`on ${route}`, async ({ page }) => {
      // From KF8's checklist, promoted to a gate. A phone that scrolls sideways is the
      // most obvious possible layout break and the suite could not see it until now.
      await seed(page)
      await page.goto(route)
      await page.waitForLoadState('networkidle')

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `${route} scrolls sideways by ${scrollWidth - clientWidth}px`).toBeLessThanOrEqual(clientWidth)
    })
  }
})

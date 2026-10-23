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

/** Scrolls, then waits for the page to stop moving AND for the chrome to stop animating.
 *
 *  Two tolerances, both learned the hard way. The page often cannot reach the exact
 *  target -- asking for 700 landed on 698, because tucking the chrome changes the
 *  document height and therefore the maximum scroll -- so the position is allowed a few
 *  pixels. And KF8d gives the chrome a 200ms transition, so a measurement taken too soon
 *  catches it mid-flight: this waits until the scoreboard's own top is the same across
 *  two reads a frame apart, which is the only honest definition of settled. */
async function scrollDown(page: Page, y = 700) {
  await page.evaluate((to) => window.scrollTo(0, to), y)
  await page.waitForFunction((to) => Math.abs(window.scrollY - to) <= 3, y)
  // Past the handler's own frame AND the 200ms transition. Without this the stability
  // check below resolves instantly on a position that has not started moving yet: the
  // scroll decision is itself made in a `requestAnimationFrame`, so "unchanged across two
  // frames" is true of the OLD value before the new one is ever applied.
  await page.waitForTimeout(350)
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const board = document.querySelector('[class*="chrome"] header')
        if (!board) return resolve(true)
        const first = board.getBoundingClientRect().top
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(board.getBoundingClientRect().top === first)),
        )
      }),
    undefined,
    { polling: 'raf' },
  )
}

/** A viewport-relative box, read the same way `pinnedBoxes` reads them.
 *
 *  NOT Playwright's `boundingBox()`, which answers in a different coordinate space and
 *  made this file disagree with itself about where the scoreboard was. */
async function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom }
  }, selector)
}

test.describe('the battle screen, after scrolling', () => {
  test('no two pinned regions overlap', async ({ page }) => {
    // KF8a: four sticky elements were each pinned at `top: 0`, and `position: sticky`
    // does not stack -- so three of them claimed the same strip and `z-index` decided
    // which was visible. Advance, Undo and the tablist were entirely occluded for three
    // slices before a phone preview found it. Nothing in 619 jsdom tests can see this.
    await openBattle(page)
    // Down, then back up. Since KF8d the scoreboard deliberately slides behind the app
    // header on the way DOWN, so measuring there would report the intended design as a
    // defect. The claim this assertion carries is the one KF8a was about: when every
    // pinned region is meant to be on screen, none of them occludes another.
    await scrollDown(page, 700)
    await scrollDown(page, 600)

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

    // 481px of 664px when this was written, now 452px -- 68%. The viewport is 664 and
    // NOT the 844 of the device: Safari's own chrome takes the rest, and every phone
    // number recorded before this file existed was against the device height.
    //
    // The 29px came from removing `.chrome`'s own `border-bottom`, which duplicated the
    // tablist's underline 28px lower; with the border gone the tablist's bottom margin
    // collapses out of the pinned region instead of padding it. Tightened to match --
    // this ratchet only ever goes down.
    expect(
      share,
      `pinned chrome reaches ${Math.round(chromeBottom)}px of ${viewport}px (${Math.round(share * 100)}%)`,
    ).toBeLessThanOrEqual(0.69)
  })
})

test.describe('the scoreboard gets out of the way', () => {
  test('hides on the way down and comes back on the way up', async ({ page }) => {
    // KF8d. This replaces `KILLTEAM.md`'s "always visible", and it is the assertion that
    // slice exists for: a hidden tab runs no rendering lifecycle, so scroll events and
    // `requestAnimationFrame` never fire there and nothing but a real browser can see it.
    await openBattle(page)

    // The scoreboard is the `<header>` inside the battle chrome; the app header is the
    // document's own.
    const SCOREBOARD = '[class*="chrome"] header'
    const appBottom = (await boxOf(page, 'header'))!.bottom

    expect((await boxOf(page, SCOREBOARD))!.bottom, 'the scoreboard starts on screen').toBeGreaterThan(
      appBottom,
    )

    await scrollDown(page, 700)
    expect(
      (await boxOf(page, SCOREBOARD))!.bottom,
      'after scrolling down the scoreboard should be behind the app header',
    ).toBeLessThanOrEqual(appBottom + 1)

    // Up by more than the noise floor. No threshold on the way back: scrolling up and
    // seeing nothing happen is the failure this direction exists to avoid.
    await scrollDown(page, 600)
    expect(
      (await boxOf(page, SCOREBOARD))!.bottom,
      'scrolling up should bring it straight back',
    ).toBeGreaterThan(appBottom)
  })

  test('reclaims the chrome budget it was built to reclaim', async ({ page }) => {
    // The number KF8d was justified by: 481px of 664 before it existed.
    await openBattle(page)
    await scrollDown(page, 700)

    const boxes = await pinnedBoxes(page)
    const viewport = page.viewportSize()!.height
    const chromeBottom = Math.max(...boxes.map((b) => b.bottom))
    const share = chromeBottom / viewport
    expect(
      share,
      `pinned chrome reaches ${Math.round(chromeBottom)}px of ${viewport}px (${Math.round(share * 100)}%) while scrolling down`,
    ).toBeLessThanOrEqual(0.52)
  })
})

test.describe('pinned regions are not see-through', () => {
  test('every pinned region either is opaque or blurs what is behind it', async ({ page }) => {
    // The defect: `.chrome` declared `background: var(--bg)`, and `--bg` is not a token
    // here. An unresolvable `var()` is invalid at computed-value time, so the property
    // fell back to `transparent` and the page scrolled visibly through the pinned
    // chrome. A static test now catches the TOKEN (`src/styles/tokens.test.ts`); this
    // catches the CONSEQUENCE, which is the part only a browser computes.
    //
    // The rule is not "must be opaque". The app header is deliberately
    // `rgba(250, 250, 248, 0.88)` with `backdrop-filter: blur(8px)` -- translucent, but
    // not see-through, because the blur is what keeps the text underneath from reading
    // as part of it. Either treatment passes; nothing at all does not.
    await openBattle(page)
    await scrollDown(page)

    const pinned = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('*'))
        .filter((el) => ['sticky', 'fixed'].includes(getComputedStyle(el).position))
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.height > 0 && r.width > 0
        })
        .map((el) => {
          const cs = getComputedStyle(el)
          const alpha = Number((cs.backgroundColor.match(/[\d.]+\)$/) ?? ['1)'])[0].slice(0, -1))
          const opaque = !cs.backgroundColor.startsWith('rgba') || alpha === 1
          const blurs = cs.backdropFilter !== 'none' && cs.backdropFilter !== ''
          const painted = cs.backgroundImage !== 'none'
          const cls = (el.className || '').toString().split(/\s+/)[0] || el.tagName.toLowerCase()
          return {
            what: `${el.tagName.toLowerCase()}.${cls}`,
            treated: opaque || blurs || painted,
            how: `${cs.backgroundColor}, backdrop-filter: ${cs.backdropFilter || 'none'}`,
          }
        }),
    )

    // The FLOOR first. `expect([]).toEqual([])` passes when the filter found nothing to
    // judge -- if `.chrome` stopped being sticky, or the battle failed to render at all,
    // the assertion below would go quiet instead of failing. The sibling test above
    // guards itself the same way, and so do the two static sweeps in `src/styles`.
    expect(
      pinned.length,
      'expected the app header and the battle chrome to be pinning',
    ).toBeGreaterThanOrEqual(2)

    expect(pinned.filter((p) => !p.treated).map((p) => `${p.what} has ${p.how}`)).toEqual([])
  })
})

test.describe('touch targets', () => {
  test('every visible button is at least 44px tall', async ({ page }) => {
    // Apple's minimum, and the reason the context sets `hasTouch`: KF8b scoped the rule
    // to `@media (pointer: coarse)`, so without touch emulation this would measure the
    // desktop rendering and pass or fail for the wrong reason.
    await openBattle(page)

    const { measured, short } = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll<HTMLElement>('button'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.height > 0)
      return {
        measured: boxes.length,
        short: boxes
          .filter(({ r }) => r.height < 44)
          // Identified by the CSS-module class rather than by the label, so eight
          // operative rows collapse to one entry instead of eight that change with the
          // fixture.
          .map(({ el }) =>
            (el.className || '').toString().split(/\s+/)[0].replace(/_[a-z0-9]{5}_\d+/g, ''),
          )
          .filter((c, i, all) => all.indexOf(c) === i)
          .sort(),
      }
    })

    // The FLOOR, and this one has a live failure mode rather than a theoretical one.
    // `openBattle` waits for the Advance button `{ state: 'attached' }` on purpose,
    // because "a chrome pinned wrongly COVERS this button" -- so in exactly the layout
    // break this file exists to catch, every button could measure zero height and the
    // ratchet below would pass by measuring nothing. Eight operative rows carry a
    // disclosure, a wounds trigger and an Activate each.
    expect(measured, 'expected the battle screen to render its buttons').toBeGreaterThanOrEqual(10)

    // A RATCHET, not a pass. It is currently EMPTY: the two bespoke buttons that used to
    // be listed here -- which bypass the `Button` primitive, and so are invisible to
    // KF8b's static stylesheet test -- were both fixed in F13 tier 3. Any name appearing
    // here is a regression, and a new short button fails this immediately.
    expect(short).toEqual([])
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

/* Every text colour meets WCAG 2.1 AA against both backgrounds (ROADMAP A1 group A).
 *
 * Static, and deliberately so. `browser/a11y.spec.ts` catches a contrast failure where it
 * is RENDERED, which is the only place a real one can be judged -- but it needs a browser,
 * it is not in CI, and it reports the symptom one element at a time. This file reads the
 * token block off disk and judges the palette itself, in milliseconds, in the suite CI
 * actually runs. The two are not redundant: this one cannot see a view that puts
 * `--faint` on an unexpected background, and that one cannot run on every commit.
 *
 * The arithmetic is WCAG 2.1's, hand-written for the reason `cssModules.test.ts` gives
 * about hand-rolling its directory walk: one guard is a poor reason to grow the
 * dependency list, and the relative-luminance formula is eight lines that have not changed
 * since 2008. */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// A cwd-relative path, matching `tokens.test.ts` next door. `import.meta.url` is not a
// file URL once vitest has transformed the module, so `fileURLToPath` throws on it.
const THEME = readFileSync('src/styles/theme.css', 'utf8')

/** The `:root` custom properties, as declared.
 *
 *  Comments are stripped first, the way `tokens.test.ts` does: the block above these
 *  tokens quotes the OLD hex values in prose, and a parser that read those would assert
 *  against the very numbers this change replaced. */
function tokens(): Record<string, string> {
  const css = THEME.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: Record<string, string> = {}
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    found[name] = value.toLowerCase()
  }
  return found
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.1 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Every token used as `color:` on a paper or panel ground.
 *
 *  `--ink-hover` and `--danger-hover` are omitted: both are button FILLS, so the text on
 *  them is `--paper`, and that pairing is asserted below as its own case. */
const TEXT_TOKENS = ['ink', 'muted', 'faint', 'fainter', 'danger'] as const

const BACKGROUNDS = ['paper', 'panel'] as const

describe('contrast: the text palette meets WCAG 2.1 AA', () => {
  const t = tokens()

  it('reads the token block it is judging', () => {
    // A floor, for the reason ROADMAP F14 gives: a regex that matched nothing would make
    // every assertion below pass by iterating an empty list.
    expect(Object.keys(t).length).toBeGreaterThanOrEqual(11)
    for (const name of [...TEXT_TOKENS, ...BACKGROUNDS]) {
      expect(t[name], `--${name} is declared in theme.css`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  for (const name of TEXT_TOKENS) {
    for (const ground of BACKGROUNDS) {
      it(`--${name} on --${ground} reaches 4.5:1`, () => {
        const ratio = contrastRatio(t[name], t[ground])
        expect(
          Number(ratio.toFixed(2)),
          `--${name} (${t[name]}) on --${ground} (${t[ground]}) is ${ratio.toFixed(2)}:1, ` +
            `and AA asks 4.5:1 of body text. See ROADMAP A1 group A.`,
        ).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps `--paper` readable on the two button fills', () => {
    // The inverted case: a primary button is `--ink` filled with `--paper` text, and a
    // destructive one is `--danger`. Both hover states have to hold too, because a hover
    // that drops below AA is a control the user cannot read while using it.
    for (const fill of ['ink', 'ink-hover', 'danger', 'danger-hover']) {
      const ratio = contrastRatio(t['paper'], t[fill])
      expect(
        Number(ratio.toFixed(2)),
        `--paper on --${fill} (${t[fill]}) is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the grey weights distinct enough to be a hierarchy', () => {
    // The reason four weights were re-spaced rather than collapsed to two: passing AA by
    // moving every grey to nearly the same value would satisfy the assertions above and
    // destroy what the tokens are FOR. Each step is at least 1.2x the next one's ratio.
    const ladder = ['ink', 'muted', 'faint', 'fainter'].map((n) => ({
      name: n,
      ratio: contrastRatio(t[n], t['paper']),
    }))
    for (let i = 1; i < ladder.length; i += 1) {
      const factor = ladder[i - 1].ratio / ladder[i].ratio
      expect(
        Number(factor.toFixed(2)),
        `--${ladder[i - 1].name} is only ${factor.toFixed(2)}x --${ladder[i].name}; ` +
          `the weights have collapsed into each other`,
      ).toBeGreaterThanOrEqual(1.2)
    }
  })

  it('records that the BORDER tokens do not meet 1.4.11, deliberately', () => {
    // Not a pass disguised as one. `--rule` borders inputs and tags, and WCAG 1.4.11 asks
    // 3:1 of a boundary that identifies a control; it is 1.62. Reaching 3:1 needs about
    // #939188, a visibly heavier line on every input in the app -- a different criterion
    // and a larger visual change than the text ladder, so A1 records it rather than
    // fixing it. This asserts the CURRENT value, so the day someone changes it the
    // decision is revisited on purpose instead of by accident.
    expect(Number(contrastRatio(t['rule'], t['paper']).toFixed(2))).toBeCloseTo(1.62, 2)
    expect(Number(contrastRatio(t['rule-light'], t['paper']).toFixed(2))).toBeCloseTo(1.24, 2)
  })
})

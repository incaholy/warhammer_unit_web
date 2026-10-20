/* Three platform rules that are NUMBERS, so they belong in a test rather than a style
 * guide (KF8b).
 *
 * Each was unmet when this was written, and one had already drifted: every 40k view pairs
 * its shimmer with a `prefers-reduced-motion` escape, and eight stylesheets did not —
 * including `ui/Modal` and `ui/Toast`, which predate all the Kill Team work. So the
 * convention was never universal, and a convention nothing enforces is the thing
 * `cssModules.test.ts` already exists to catch one level down.
 *
 * None of this is reachable from a rendering test. jsdom implements the DOM and parses
 * CSS but lays nothing out: an element declared `position: sticky; top: 0; height: 120px`
 * reports those values back and a bounding rect of `0x0`. So rendered heights, overlap
 * and media queries are all invisible to the suite — which is why these three are
 * asserted as declarations in the stylesheets instead.
 *
 * What the rules are FOR, since none is obvious from the number alone:
 *
 *   - **16px on a touch control.** iOS Safari auto-zooms the page when a control under
 *     16px takes focus, leaving the player scrolled somewhere they did not ask to be.
 *     This app puts fields across the battle screen — a token field on every operative,
 *     the marker field, the victory-point source, both `choices` fields, every picker —
 *     so at a table it fires constantly.
 *   - **44px targets**, Apple's minimum. Measured in a browser beforehand: 9 of 34
 *     controls on the catalog were under it, the smallest 24px.
 *   - **A reduced-motion escape**, for anyone who asked not to be moved.
 *
 * Scoped to `pointer: coarse` rather than to a width, which is the part worth keeping:
 * the problem is a TOUCH behaviour, not a narrow one. A width breakpoint would miss a
 * tablet in landscape and would change a desktop design that has no such problem. */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Walked with `node:fs` rather than a glob library, for the reason
 *  `cssModules.test.ts` gives: this repo's dependency list is deliberately tiny. */
function stylesheets(): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.module.css')) found.push(path)
    }
  }
  walk('src')
  return found
}

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** The body of every `@media (pointer: coarse)` block in a stylesheet. */
function coarseBlocks(css: string): string {
  const out: string[] = []
  const re = /@media[^{]*pointer:\s*coarse[^{]*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    // Walk braces from the block's opening, so nested rules come with it.
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    out.push(css.slice(start, i - 1))
  }
  return out.join('\n')
}

/** Every control a finger lands on. Named explicitly rather than discovered: these are
 *  the primitives, and a view that needs the rule should use one of them rather than
 *  rolling its own. A new primitive added here is a deliberate decision.
 *
 *  The first three were chosen by reasoning about which primitives existed, and that was
 *  wrong: measuring the battle screen in a browser found 23 controls still under 44px
 *  with the rules applied, and `Tabs` (37px) and `SegmentedToggle` (31px, twelve
 *  instances) were among them. The remaining 23rd group is `Header`'s nav links, which
 *  are NOT listed here on purpose — see KF8b in ROADMAP.md. */
const TOUCH_CONTROLS = [
  { file: 'src/ui/Input.module.css', why: 'every text field in the app' },
  { file: 'src/ui/Select.module.css', why: 'every picker, including the battle screen\'s' },
  { file: 'src/ui/Button.module.css', why: 'every button, including the stepper +/-' },
  { file: 'src/ui/Tabs.module.css', why: "the battle screen's Battle/Reference switch" },
  { file: 'src/ui/SegmentedToggle.module.css', why: 'Conceal/Engage, one per operative' },
]

describe('platform rules: touch', () => {
  it.each(TOUCH_CONTROLS)('$file declares a coarse-pointer block ($why)', ({ file }) => {
    const block = coarseBlocks(stripComments(read(file)))
    expect(block.length, `${file} has no @media (pointer: coarse) rule`).toBeGreaterThan(0)
  })

  it('no touch control sets a font smaller than 16px', () => {
    // Only the TEXT-ENTRY controls carry this: a `Button`'s label is mono uppercase by
    // design and 16px there would not be the same control. Focus is what triggers the
    // zoom, and a button does not take text.
    const offenders: string[] = []
    for (const file of ['src/ui/Input.module.css', 'src/ui/Select.module.css']) {
      const block = coarseBlocks(stripComments(read(file)))
      const sizes = Array.from(block.matchAll(/font-size:\s*(\d+)px/g), (m) => Number(m[1]))
      if (sizes.length === 0) offenders.push(`${file}: coarse block sets no font-size`)
      for (const s of sizes) if (s < 16) offenders.push(`${file}: ${s}px under a coarse pointer`)
    }
    expect(offenders, 'iOS Safari auto-zooms a focused control under 16px').toEqual([])
  })

  it('every touch control reserves at least a 44px target', () => {
    const offenders: string[] = []
    for (const { file } of TOUCH_CONTROLS) {
      const block = coarseBlocks(stripComments(read(file)))
      const heights = Array.from(block.matchAll(/min-height:\s*(\d+)px/g), (m) => Number(m[1]))
      if (heights.length === 0) offenders.push(`${file}: coarse block sets no min-height`)
      for (const h of heights) if (h < 44) offenders.push(`${file}: ${h}px target`)
    }
    expect(offenders, "Apple's minimum target is 44px").toEqual([])
  })
})

describe('platform rules: motion', () => {
  it('every stylesheet that animates offers a way out of it', () => {
    // The rule that had already drifted. Stated over the whole tree rather than per
    // folder, because the two that surprised me were `ui/Modal` and `ui/Toast` — not the
    // newest code, but the oldest.
    const offenders = stylesheets()
      .filter((p) => {
        const css = stripComments(read(p))
        return /animation:\s*[^;]*\b\w/.test(css) && !css.includes('prefers-reduced-motion')
      })
      .map((p) => `${p}: animates with no prefers-reduced-motion escape`)
    expect(offenders).toEqual([])
  })

  it('finds the stylesheets it is checking, so it cannot pass by matching nothing', () => {
    // The guard `cssModules.test.ts` carries on itself: a walk that silently stopped
    // finding files would make every assertion above vacuously true.
    const all = stylesheets()
    expect(all.length).toBeGreaterThan(20)
    expect(all.filter((p) => read(p).includes('animation:')).length).toBeGreaterThan(5)
  })
})

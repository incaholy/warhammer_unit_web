/* One destructive treatment across every screen that has one (F12).
 *
 * Three screens had three treatments before this, because each chose locally: `ArmyView`
 * used `ghost`, which is `color: var(--muted)` and nothing else -- the least visible
 * control on a page that renders "+ ADD FROM CATALOG" twice, once as a solid black bar.
 * `KillTeamRosterView` used a filled `danger`. `KillTeamGameView` used `secondary` plus a
 * local class that re-coloured it.
 *
 * That local class is why this is a test rather than a note. `Button` appends `className`
 * last, so a view can override any variant, and `KillTeamGameView`'s confirm button
 * carried the class with NO variant -- so it rendered as `primary` (an ink fill) with only
 * `color` overridden, putting red text on a black background. Nothing flagged it: it
 * type-checked, it rendered, and it was wrong only to the eye.
 *
 * Static rather than rendered, because the claim is about which variant each CALL SITE
 * passes. A rendering test would have to find the right button on each of three screens
 * and assert a class name, which is the same assertion with more ways to go stale. */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/** Every screen that deletes something it owns. Listed explicitly: a new one is a
 *  deliberate addition here, not something a glob should quietly absorb. */
const SCREENS = [
  { view: 'src/views/ArmyView.tsx', css: 'src/views/ArmyView.module.css', what: 'an army' },
  { view: 'src/views/KillTeamRosterView.tsx', css: 'src/views/KillTeamRosterView.module.css', what: 'a roster' },
  { view: 'src/views/KillTeamGameView.tsx', css: 'src/views/KillTeamGameView.module.css', what: 'a battle' },
]

const read = (p: string) => readFileSync(p, 'utf8')
const count = (s: string, needle: string) => s.split(needle).length - 1

describe('destructive actions use one treatment', () => {
  it.each(SCREENS)('$view opens the dialog with a bordered trigger ($what)', ({ view }) => {
    const src = read(view)
    expect(count(src, 'variant="dangerOutline"'), `${view}: expected exactly one delete trigger`).toBe(1)
  })

  it.each(SCREENS)('$view confirms with the filled variant ($what)', ({ view }) => {
    const src = read(view)
    expect(count(src, 'variant="danger"'), `${view}: expected a filled confirm button`).toBeGreaterThanOrEqual(1)
  })

  it('no class handed to a Button re-colours it', () => {
    // The bug above, stated as a rule -- and scoped to BUTTONS, which is the whole
    // subtlety. `ArmyView` legitimately gives `.overTag` and `.issueKind` red text and a
    // red border, because those are `<Tag>` badges where red IS the meaning. A first
    // version of this test flagged both. The invariant is not "nothing is red", it is
    // "a Button's colour comes from its variant".
    const offenders: string[] = []
    for (const { view, css } of SCREENS) {
      const src = read(view)
      const sheet = read(css).replace(/\/\*[\s\S]*?\*\//g, '')

      // Walk each <Button ...> opening tag brace-aware: an attribute like
      // `onClick={() => f()}` contains a '>', so stopping at the first one is wrong.
      for (let i = src.indexOf('<Button'); i !== -1; i = src.indexOf('<Button', i + 1)) {
        let depth = 0
        let end = i
        for (let j = i; j < src.length; j++) {
          const c = src[j]
          if (c === '{') depth++
          else if (c === '}') depth--
          else if (c === '>' && depth === 0) { end = j; break }
        }
        const tag = src.slice(i, end)
        for (const m of tag.matchAll(/className=\{(?:`[^`]*`|)?styles\.(\w+)/g)) {
          const name = m[1]
          const rule = sheet.match(new RegExp('\\.' + name + '\\s*\\{([^}]*)\\}'))
          if (rule && /(^|[^-])color:|border-color:|background:/.test(rule[1]))
            offenders.push(`${view}: <Button className={styles.${name}}> re-colours it; use a variant`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

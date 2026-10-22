/* Every `var(--token)` resolves to something (ROADMAP F13).
 *
 * The defect this exists for: `KillTeamGameView.module.css` declared
 * `background: var(--bg)` and `--bg` is not a token in this project -- the palette is
 * `--paper`, `--panel`, `--ink`. An unresolvable `var()` makes the whole declaration
 * invalid AT COMPUTED-VALUE TIME, so the property silently falls back to its initial
 * value. For `background-color` that is `transparent`, so the battle screen's pinned
 * chrome had no background at all and the page scrolled visibly through it, from the
 * slice that introduced it until somebody looked at it.
 *
 * Nothing could catch it. It is valid CSS, so the build is happy; `cssModules.test.ts`
 * checks that a referenced CLASS is defined, which is the same shape of bug one level
 * over and does not reach this one; and jsdom computes `var(--bg)` to an empty string
 * rather than to a colour, so even a rendering test sees nothing.
 *
 * Walked with `node:fs` for the reason `cssModules.test.ts` gives: this repo's
 * dependency list is deliberately tiny, and a guard is a poor reason to grow it. */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Custom properties set from JavaScript rather than declared in a stylesheet.
 *
 *  Both are MEASURED heights that CSS cannot know, so they are published at runtime with
 *  `style.setProperty`. Listed explicitly: a new one is a deliberate decision, and the
 *  test below checks each is really published somewhere, so a typo on the JS side is
 *  caught too rather than being waved through by this allowance. */
const PUBLISHED_AT_RUNTIME = ['--app-header-h', '--kt-scoreboard-h']

function stylesheets(dir = 'src'): string[] {
  const found: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.css')) found.push(path)
    }
  }
  walk(dir)
  return found
}

const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Every custom property DECLARED anywhere in the stylesheets. */
function declaredTokens(files: string[]): Set<string> {
  const out = new Set<string>()
  for (const f of files) {
    for (const m of stripComments(read(f)).matchAll(/(--[a-z0-9-]+)\s*:/g)) out.add(m[1])
  }
  return out
}

/** Every custom property READ, with the files that read it. */
function usedTokens(files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const f of files) {
    for (const m of stripComments(read(f)).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), f])
    }
  }
  return out
}

describe('design tokens', () => {
  const files = stylesheets()

  it('finds the stylesheets, so it cannot pass by matching nothing', () => {
    // The guard `cssModules.test.ts` carries on itself. A walk that stopped finding
    // files would make every assertion below vacuously true.
    expect(files.length).toBeGreaterThan(20)
    expect(declaredTokens(files).size).toBeGreaterThan(10)
  })

  it('every var() resolves to a declared token', () => {
    const declared = declaredTokens(files)
    const offenders: string[] = []
    for (const [token, where] of usedTokens(files)) {
      if (declared.has(token) || PUBLISHED_AT_RUNTIME.includes(token)) continue
      offenders.push(`${token} is read in ${where.join(', ')} and declared nowhere`)
    }
    expect(offenders).toEqual([])
  })

  it('every token said to be published at runtime really is', () => {
    // Otherwise the allowance above becomes a place to hide a typo: a name listed here
    // and set nowhere reads as deliberate and behaves exactly like `--bg` did.
    const tsx: string[] = []
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) tsx.push(path)
      }
    }
    walk('src')
    const all = tsx.map(read).join('\n')
    const missing = PUBLISHED_AT_RUNTIME.filter((t) => !all.includes(`'${t}'`) && !all.includes(`"${t}"`))
    expect(missing).toEqual([])
  })
})

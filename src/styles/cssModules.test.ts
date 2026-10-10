/* Every CSS-Module class a component references must exist in the stylesheet it
 * imports.
 *
 * This exists because of a defect no other gate could see. KF3 extracted the shared
 * datacard pieces into `killTeamCards.module.css` and moved `.card`, `.cardHead` and
 * `.cardName` with them, but left `KillTeamView.tsx` referencing them through its OWN
 * `styles` alias. Every datacard on the team page rendered with no border, no padding,
 * no flex head and no serif name — and:
 *
 *   - `tsc` accepted it, because Vite types `*.module.css` as
 *     `{ readonly [key: string]: string }`, so every key is `string`;
 *   - CSS Modules emit no warning for a key that resolves to `undefined`;
 *   - React silently omits a `className={undefined}`;
 *   - no test asserted a class name, and none should have to — asserting classes in a
 *     view test couples it to styling.
 *
 * So the check is static and global rather than per-view: find each
 * `import x from './Thing.module.css'`, collect every `x.member` the file uses, and
 * require the stylesheet to define it. One test covers every component, including ones
 * written later. */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Class names a stylesheet defines. Permissive on purpose: it takes every `.name`
 *  token in a selector position, so a class used only in `.a .b` or `.a.b` still
 *  counts as defined. The goal is to catch an absent class, not to police selectors. */
function definedClasses(cssPath: string): Set<string> {
  const css = readFileSync(cssPath, 'utf8')
  // Strip comments first, so a class named only inside one does not count.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return new Set(Array.from(withoutComments.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g), (m) => m[1]))
}

interface Reference {
  file: string
  alias: string
  member: string
  css: string
}

function references(): Reference[] {
  // Walked with `node:fs` rather than a glob library: this repo's dependency list is
  // deliberately tiny, and a test guard is a poor reason to grow it.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path)
    }
  }
  walk('src')
  const found: Reference[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const imports = Array.from(
      source.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.module\.css)['"]/g),
    )
    for (const [, alias, spec] of imports) {
      const css = resolve(dirname(file), spec)
      for (const [, member] of source.matchAll(new RegExp(`\\b${alias}\\.(\\w+)`, 'g'))) {
        found.push({ file, alias, member, css })
      }
    }
  }
  return found
}

describe('CSS module references', () => {
  const refs = references()

  it('finds the stylesheet imports it is meant to check', () => {
    // A guard on the guard: if the import regex ever stops matching, every assertion
    // below would pass over an empty list and this file would silently check nothing.
    expect(refs.length).toBeGreaterThan(100)
    expect(new Set(refs.map((r) => r.css)).size).toBeGreaterThan(10)
  })

  it('resolves every referenced class to a definition', () => {
    const cache = new Map<string, Set<string>>()
    const missing = refs.filter(({ member, css }) => {
      if (!cache.has(css)) cache.set(css, definedClasses(css))
      return !cache.get(css)!.has(member)
    })

    expect(
      missing.map((m) => `${m.file}: ${m.alias}.${m.member} is not in ${m.css.split('/').pop()}`),
    ).toEqual([])
  })
})

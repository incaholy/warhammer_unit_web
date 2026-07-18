/* Small presentation helpers — points, pluralized counts, and date labels. Pure
 * string formatting, no React. See SPEC.md → project structure (`lib/format.ts`). */

/** Format a points value, e.g. `120` → `"120 pts"`. */
export function formatPoints(points: number): string {
  return `${points} pts`
}

/** Pluralize a count with its noun, e.g. `(1, "army")` → `"1 army"`,
 * `(3, "army", "armies")` → `"3 armies"`. When no explicit plural is given,
 * appends "s". */
export function pluralize(count: number, singular: string, plural?: string): string {
  const noun = count === 1 ? singular : (plural ?? `${singular}s`)
  return `${count} ${noun}`
}

/** A meta line like `"2 armies · 14 units · 1980 pts"` from the aggregate counts.
 * Filters out any empty segments. */
export function formatArmiesMeta(armyCount: number, unitCount: number, points: number): string {
  return [
    pluralize(armyCount, 'army', 'armies'),
    pluralize(unitCount, 'unit'),
    formatPoints(points),
  ].join(' · ')
}

/** A human "created" label from an ISO date/timestamp, e.g. `"Created Jul 17, 2026"`.
 * Returns an empty string for an unparseable input. */
export function formatCreatedLabel(iso: string | number | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const label = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
  return `Created ${label}`
}

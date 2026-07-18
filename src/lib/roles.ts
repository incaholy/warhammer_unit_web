/* Derive a display "role" from a unit's keywords, and group units by it.
 *
 * The backend `Unit` has no role field — only `keywords: string[]` — but the
 * design groups the "Order of Battle" and inventory by role. We reconstruct a role
 * from keywords using an ordered priority list (first match wins). See SPEC.md →
 * "Design ↔ backend reconciliation" → "Deriving 'role'". */

import type { Unit_Read } from '../api/types'

export const OTHER_ROLE = 'Other Units'

/** Ordered priority list: the first keyword found (case-insensitively) decides the
 * role. Earlier entries win over later ones. */
const ROLE_PRIORITY: ReadonlyArray<{ keyword: string; role: string }> = [
  { keyword: 'Epic Hero', role: 'Characters' },
  { keyword: 'Character', role: 'Characters' },
  { keyword: 'Battleline', role: 'Battleline' },
  { keyword: 'Vehicle', role: 'Vehicles' },
  { keyword: 'Walker', role: 'Vehicles' },
  { keyword: 'Monster', role: 'Monsters' },
  { keyword: 'Mounted', role: 'Mounted' },
  { keyword: 'Beast', role: 'Beast' },
  { keyword: 'Swarm', role: 'Swarm' },
]

/** Map a unit's keywords to a single display role, using the priority list above;
 * falls back to "Other Units" when nothing matches. */
export function deriveRole(keywords: string[]): string {
  const haystack = keywords.map((k) => k.toLowerCase())
  for (const { keyword, role } of ROLE_PRIORITY) {
    if (haystack.includes(keyword.toLowerCase())) return role
  }
  return OTHER_ROLE
}

export interface RoleGroup<T> {
  role: string
  units: T[]
}

/** Group units by their derived role, preserving both the priority ordering of
 * roles and the input order of units within each role. Accepts either bare
 * `Unit_Read`s or entries (`{ unit }`), so it works for the catalog, inventory,
 * and an army's order of battle alike. */
export function groupByRole<T extends Unit_Read | { unit: Unit_Read }>(
  items: T[],
): RoleGroup<T>[] {
  // Canonical role order: the priority list's roles, then the fallback last.
  const roleOrder: string[] = []
  for (const { role } of ROLE_PRIORITY) {
    if (!roleOrder.includes(role)) roleOrder.push(role)
  }
  roleOrder.push(OTHER_ROLE)

  const buckets = new Map<string, T[]>()
  for (const item of items) {
    // Narrow the entry-vs-bare-unit union (generic `T` blocks direct narrowing).
    const asUnion = item as Unit_Read | { unit: Unit_Read }
    const unit = 'unit' in asUnion ? asUnion.unit : asUnion
    const role = deriveRole(unit.keywords)
    const bucket = buckets.get(role)
    if (bucket) bucket.push(item)
    else buckets.set(role, [item])
  }

  return roleOrder
    .filter((role) => buckets.has(role))
    .map((role) => ({ role, units: buckets.get(role)! }))
}

/* Fetching a complete collection across the pagination envelope.
 *
 * Every list endpoint paginates (backend ROADMAP R4), which is right for the
 * shared catalog: it is large, growing, and nobody needs all of it at once. It is
 * the wrong shape for the two collections that are scoped to one user.
 *
 * `InventoryView` searches, groups by role, and sums model counts over the whole
 * inventory; `CollectionView` totals armies, units and points over the whole
 * collection; and `CatalogView` answers "do I own this?" against the whole
 * inventory. Handing those a page makes every one of those aggregates
 * page-scoped -- the same defect as the truncated list, but silent, because a sum
 * over 50 of 137 rows still looks like a number.
 *
 * So user-scoped collections are fetched completely and the catalog stays paged.
 * The cost is bounded by the caller's own data, and `total` tells us exactly how
 * many requests that is rather than guessing.
 */

import type { Page } from './types'

/** Paging params every list endpoint accepts. */
export interface PageParams {
  limit?: number
  offset?: number
}

/** `?limit=&offset=` for a list request, empty when neither is set. */
export function toQueryString(params: PageParams): string {
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set('limit', String(params.limit))
  if (params.offset !== undefined) search.set('offset', String(params.offset))
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

/** The backend's per-request cap (`MAX_LIMIT` in app/api/pagination.py). */
const MAX_PAGE = 200

/** A guard against an unbounded loop if `total` and `items` ever disagree. At
 *  MAX_PAGE this is 20,000 rows -- far past any personal collection, and small
 *  enough that a runaway stops rather than hanging the tab. */
const MAX_REQUESTS = 100

/** Every page of a collection, concatenated, in one `Page` with the true total. */
export async function fetchAllPages<T>(
  fetchPage: (params: { limit: number; offset: number }) => Promise<Page<T>>,
): Promise<Page<T>> {
  const first = await fetchPage({ limit: MAX_PAGE, offset: 0 })
  const items = [...first.items]

  for (let request = 1; items.length < first.total && request < MAX_REQUESTS; request++) {
    const next = await fetchPage({ limit: MAX_PAGE, offset: items.length })
    if (next.items.length === 0) break // defensive: a shrinking collection mid-walk
    items.push(...next.items)
  }

  return { items, total: first.total, limit: items.length, offset: 0 }
}

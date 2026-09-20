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
import { PAGE_LIMIT_MAX } from './schemas.gen'

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

/** A guard against an unbounded loop if `total` and `items` ever disagree. At
 *  `PAGE_LIMIT_MAX` this is 20,000 rows -- far past any personal collection, and
 *  small enough that a runaway stops rather than hanging the tab. */
const MAX_REQUESTS = 100

/** The walk stopped at its request ceiling with rows still outstanding.
 *
 * Thrown rather than returned, because the alternative is what this module exists
 * to prevent: handing a view 20,000 of 25,000 rows alongside the true `total`, so
 * every aggregate over them is wrong and nothing says so. Three orders of
 * magnitude past any real collection, so in practice this means the contract broke
 * (a `total` that does not shrink, a page that repeats) -- and then failing is
 * right. Views already render a thrown query error; none of them render a
 * quietly-short list. */
export class IncompleteCollectionError extends Error {
  readonly total: number
  readonly fetched: number

  constructor(total: number, fetched: number) {
    super(`Stopped after ${MAX_REQUESTS} requests with ${fetched} of ${total} rows`)
    this.name = 'IncompleteCollectionError'
    this.total = total
    this.fetched = fetched
  }
}

/** Every page of a collection, concatenated, in one `Page` with the true total. */
export async function fetchAllPages<T>(
  fetchPage: (params: { limit: number; offset: number }) => Promise<Page<T>>,
): Promise<Page<T>> {
  const first = await fetchPage({ limit: PAGE_LIMIT_MAX, offset: 0 })
  const items = [...first.items]
  let exhausted = false

  for (let request = 1; items.length < first.total && request < MAX_REQUESTS; request++) {
    const next = await fetchPage({ limit: PAGE_LIMIT_MAX, offset: items.length })
    if (next.items.length === 0) {
      // A row was deleted mid-walk, so `first.total` is already stale. What we hold
      // IS the collection now, and reporting the count we actually have beats
      // reporting a total nothing adds up to.
      exhausted = true
      break
    }
    items.push(...next.items)
  }

  if (!exhausted && items.length < first.total) throw new IncompleteCollectionError(first.total, items.length)

  return { items, total: exhausted ? items.length : first.total, limit: items.length, offset: 0 }
}

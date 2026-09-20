import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages, IncompleteCollectionError, toQueryString } from './paging'
import { PAGE_LIMIT_MAX } from './schemas.gen'
import { makeUserUnit, makeUnit, page } from '../test/fixtures'
import type { Page, UserUnit_Read } from './types'

/** A fake endpoint holding `size` rows, serving them `limit` at a time. */
function endpoint(size: number) {
  const all = Array.from({ length: size }, (_, i) =>
    makeUserUnit({ unit: makeUnit({ id: `u${i}` }) }),
  )
  const fetchPage = vi.fn(
    async ({ limit, offset }: { limit: number; offset: number }): Promise<Page<UserUnit_Read>> =>
      page(all.slice(offset, offset + limit), { total: all.length, limit, offset }),
  )
  return { fetchPage, all }
}

describe('fetchAllPages', () => {
  it('returns everything when it fits in one request', async () => {
    const { fetchPage } = endpoint(12)
    const result = await fetchAllPages(fetchPage)
    expect(result.items).toHaveLength(12)
    expect(result.total).toBe(12)
    expect(fetchPage).toHaveBeenCalledOnce()
  })

  it('walks every page when the collection is larger than one request', async () => {
    // The reported bug: 137 rows behind a server default of 50 meant the client
    // held 50 and reported "50" as the collection size.
    const { fetchPage } = endpoint(437)
    const result = await fetchAllPages(fetchPage)

    expect(result.items).toHaveLength(437)
    expect(result.total).toBe(437)
    expect(fetchPage).toHaveBeenCalledTimes(3) // 200 + 200 + 37
    expect(new Set(result.items.map((e) => e.unit.id)).size).toBe(437) // no repeats
  })

  it('stops instead of looping when a page comes back empty, and reports what it holds', async () => {
    // Defensive: a collection shrinking mid-walk would otherwise never reach
    // `total` and spin to the request cap. Two calls, not one -- the first is the
    // initial fetch, the second is the iteration that sees empty and breaks. The
    // `total` returned is what we actually have: the server's 999 is already stale,
    // and a count nothing adds up to is the defect this module exists to prevent.
    const fetchPage = vi.fn(async () => page<UserUnit_Read>([], { total: 999 }))
    const result = await fetchAllPages(fetchPage)
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('throws rather than returning a short collection with the full total', async () => {
    // The request ceiling used to return quietly: 20,000 rows of a claimed 25,000,
    // and every aggregate over them silently wrong -- the same "count disagrees with
    // rows in hand" shape as the original bug, three orders of magnitude out.
    const { fetchPage } = endpoint(PAGE_LIMIT_MAX * 100 + 1)

    await expect(fetchAllPages(fetchPage)).rejects.toBeInstanceOf(IncompleteCollectionError)
    await expect(fetchAllPages(fetchPage)).rejects.toMatchObject({
      total: PAGE_LIMIT_MAX * 100 + 1,
      fetched: PAGE_LIMIT_MAX * 100,
    })
  })

  it('requests the cap published by the API, not a hand-copied number', async () => {
    // PAGE_LIMIT_MAX is generated from openapi.json (the `limit` parameter's
    // maximum), so a backend cap change reaches this without anyone editing it.
    const { fetchPage } = endpoint(5)
    await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledWith({ limit: PAGE_LIMIT_MAX, offset: 0 })
    expect(PAGE_LIMIT_MAX).toBe(200)
  })
})

describe('toQueryString', () => {
  it('is empty when nothing is set', () => {
    expect(toQueryString({})).toBe('')
  })

  it('carries limit and offset', () => {
    expect(toQueryString({ limit: 200, offset: 400 })).toBe('?limit=200&offset=400')
  })
})

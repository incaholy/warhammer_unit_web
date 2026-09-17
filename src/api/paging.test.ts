import { describe, it, expect, vi } from 'vitest'
import { fetchAllPages, toQueryString } from './paging'
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

  it('stops instead of looping when a page comes back empty', async () => {
    // Defensive: a collection shrinking mid-walk would otherwise never reach
    // `total` and spin to the request cap. Two calls, not one -- the first is the
    // initial fetch, the second is the iteration that sees empty and breaks.
    const fetchPage = vi.fn(async () => page<UserUnit_Read>([], { total: 999 }))
    const result = await fetchAllPages(fetchPage)
    expect(result.items).toHaveLength(0)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('requests the backend cap, not the server default', async () => {
    const { fetchPage } = endpoint(5)
    await fetchAllPages(fetchPage)
    expect(fetchPage).toHaveBeenCalledWith({ limit: 200, offset: 0 })
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

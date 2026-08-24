import { describe, it, expect, vi, afterEach } from 'vitest'
import { listUnits } from './units'
import { ResponseShapeError } from './parse'
import { jsonResponse, makeUnit, page } from '../test/fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A body the API could never send, past the typed-fixture helper on purpose. */
function badResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('success-path validation (F11)', () => {
  it('accepts a response that matches the generated schema', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(page([makeUnit()]))))
    const result = await listUnits()
    expect(result.items).toHaveLength(1)
  })

  it('rejects a response missing a required field, instead of rendering it', async () => {
    // The old `as T` assertion accepted this silently and the app rendered a unit
    // with `undefined` stats -- plausible-looking garbage, which is the failure
    // ARCHITECTURE §2.2 exists to prevent.
    const incomplete: Record<string, unknown> = { ...makeUnit() }
    delete incomplete.objective_control
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(badResponse({ items: [incomplete], total: 1, limit: 50, offset: 0 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listUnits()).rejects.toBeInstanceOf(ResponseShapeError)
  })

  it('names the offending field, so a contract break is diagnosable', async () => {
    const incomplete: Record<string, unknown> = { ...makeUnit() }
    delete incomplete.points
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(badResponse({ items: [incomplete], total: 1, limit: 50, offset: 0 })),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(listUnits()).rejects.toMatchObject({
      issues: expect.arrayContaining([expect.stringContaining('items.0.points')]),
    })
  })

  it('ignores a field the backend ADDS, so additive changes never break a client', async () => {
    const extended = { ...makeUnit(), a_new_backend_field: 'whatever' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(badResponse({ items: [extended], total: 1, limit: 50, offset: 0 })),
    )

    const result = await listUnits()
    expect(result.items[0].unit_name).toBe('Intercessor')
  })
})

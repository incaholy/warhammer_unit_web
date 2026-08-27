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

import { addUnit } from './inventory'
import { ApiError } from './client'
import { messageForError, messageWithReference } from '../lib/errors'
import { CODE_MESSAGES } from '../lib/errors'

describe('an error the client can actually produce reaches the user as copy', () => {
  it('never shows a backend detail that embeds an id', async () => {
    // Reachability, not just behaviour: the previous test for this branch built
    // `new ApiError(403, '', 'FORBIDDEN')` by hand -- a state the client cannot
    // produce, since ApiError.message is never empty. This drives the real 409
    // body through the real client and asserts what a user would read.
    const body = {
      detail:
        "unit 3f2a1b8c-5d4e-4f6a-9b7c-1e2d3f4a5b6c is already in " +
        "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d's inventory",
      code: 'CONFLICT',
      errors: [{ code: 'CONFLICT', field: null, detail: 'duplicate' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    const err = await addUnit({ unit_id: 'u1' }).catch((e) => e)
    expect(messageForError(err)).toBe(CODE_MESSAGES.CONFLICT)
    expect(messageForError(err)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})

describe('request id reaches the user (R7 last mile)', () => {
  it('carries request_id from the error body onto ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: 'internal server error', code: 'INTERNAL', request_id: 'req-abc123' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const err = await addUnit({ unit_id: 'u1' }).catch((e) => e)
    expect(err.requestId).toBe('req-abc123')
  })

  it('prefers the header, which survives a body that never arrived', async () => {
    // A proxy error page or a truncated stream has no parseable body -- exactly
    // when a user most needs something to quote.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html', 'X-Request-ID': 'req-from-header' },
        }),
      ),
    )
    const err = await addUnit({ unit_id: 'u1' }).catch((e) => e)
    expect(err.requestId).toBe('req-from-header')
  })

  it('appends the reference on a server fault, and not on a client error', async () => {
    const serverFault = new ApiError(500, 'internal server error', 'INTERNAL', undefined, undefined, 'req-xyz')
    expect(messageWithReference(serverFault)).toContain('(ref: req-xyz)')

    // A 409 is actionable by the user; an opaque id would just be noise.
    const conflict = new ApiError(409, "username 'kesh' is already taken", 'CONFLICT', undefined, undefined, 'req-xyz')
    expect(messageWithReference(conflict)).toBe("username 'kesh' is already taken")
  })
})

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

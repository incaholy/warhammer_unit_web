/* The dev proxy and the client have to agree on the API prefix, and nothing
 * connects them: `vite.config.ts` is never imported by application code, and
 * `API_PREFIX` lives only inside `client.ts`. Editing the proxy pattern alone
 * leaves every other test green and breaks the dev server on the next page load.
 *
 * That is ROADMAP F4's cheap half, and the reason ARCHITECTURE §2.5 was Partial:
 * "it fails loudly the moment you load the page" is fast feedback, not
 * enforcement. This test is the thing that actually runs.
 *
 * It asserts an agreement between two files rather than the behaviour of one, so
 * it deliberately reads the real config and the real outgoing URL instead of
 * restating either as a literal. */

import { describe, it, expect, vi, afterEach } from 'vitest'
import viteConfig from '../../vite.config'
import { apiGet } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The proxy patterns the dev server forwards to the backend. */
function proxyPatterns(): string[] {
  const proxy = (viteConfig as { server?: { proxy?: Record<string, unknown> } }).server?.proxy
  return Object.keys(proxy ?? {})
}

/** The path the client actually requests, captured from a stubbed fetch. */
async function outgoingUrl(path: string): Promise<string> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  await apiGet(path)
  return fetchMock.mock.calls[0][0] as string
}

describe('dev proxy and client agree on the API prefix', () => {
  it('forwards at least one pattern', () => {
    expect(proxyPatterns().length).toBeGreaterThan(0)
  })

  it('every resource request starts with a forwarded pattern', async () => {
    const patterns = proxyPatterns()
    for (const path of ['/units', '/me/armies', '/factions/taxonomy']) {
      const url = await outgoingUrl(path)
      expect(
        patterns.some((pattern) => url.startsWith(pattern)),
        `${url} is not forwarded by any of ${JSON.stringify(patterns)}`,
      ).toBe(true)
    }
  })
})

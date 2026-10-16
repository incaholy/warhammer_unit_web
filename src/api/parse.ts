/* Validating what crossed the network, rather than asserting it.
 *
 * ARCHITECTURE §2.2: `res.json()` returns `any`, so `as SomeType` is a claim to
 * the compiler that nothing ever checks — and no compiler flag catches it,
 * `strict` included. The error path has been parsed with zod since the branch
 * landed; this is the success path, which was still asserting (ROADMAP F11).
 *
 * The schemas are GENERATED from the backend's openapi.json (schemas.gen.ts), not
 * hand-written, so there is still one source of truth. Hand-writing a second copy
 * is what makes validation start rejecting data the API legitimately sent.
 */

import type { ZodType } from 'zod'

/** A response that did not match the contract.
 *
 * Deliberately thrown rather than logged-and-passed-through. If the body is not
 * what the schema describes, the app cannot trust it, and rendering it anyway is
 * exactly the "plausible-looking garbage" §2.2 exists to prevent — every view
 * already handles a thrown error, and none of them handle a half-shaped object.
 */
export class ResponseShapeError extends Error {
  readonly path: string
  readonly issues: string[]

  constructor(path: string, issues: string[]) {
    super(`Unexpected response shape from ${path}`)
    this.name = 'ResponseShapeError'
    this.path = path
    this.issues = issues
  }
}

/** Parse a response body against its generated schema.
 *
 * Objects are non-strict (zod's default), so a field the backend ADDS is ignored
 * rather than fatal — additive changes must never break a deployed client. What
 * fails is a missing required field or a wrong type, which is a real contract
 * break the client cannot render correctly anyway.
 */
export function parsed<T>(schema: ZodType<T>, data: unknown, path: string): T {
  const result = schema.safeParse(data)
  if (result.success) return result.data

  const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
  // Logged as well as thrown: the thrown message stays generic for the user, and
  // this is what a developer needs to see which field disagreed.
  console.error(`[api] ${path} did not match its schema:`, issues)
  throw new ResponseShapeError(path, issues)
}

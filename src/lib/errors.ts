/* Turning a thrown error into a user-facing message, in one place. Every view was
 * repeating `err instanceof ApiError ? err.message : 'generic'`; this centralizes
 * it and adds a clean per-code fallback. See SPEC.md → "Error handling". */

import { ApiError, type ErrorCode } from '../api/client'

/** Clean, user-facing fallback message per backend error code — used when the
 * backend's own `detail` isn't suitable to display (absent, or embeds an id).
 * A `Record` so adding a new `ErrorCode` fails typecheck until it has a message. */
export const CODE_MESSAGES: Record<ErrorCode, string> = {
  NOT_FOUND: 'Not found.',
  CONFLICT: 'That already exists.',
  VALIDATION: 'Please check your input.',
  REQUEST_VALIDATION: 'Please check your input.',
  UNAUTHORIZED: 'Please sign in again.',
  FORBIDDEN: 'You do not have permission to do that.',
  INTERNAL: 'Something went wrong. Please try again.',
}

const GENERIC = 'Something went wrong. Please try again.'

/** Any string containing one is describing a row, not talking to a person. */
const EMBEDS_AN_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** A user-facing message for any thrown value.
 *
 * Prefers the backend's `detail`, which is often the best copy available
 * ("username 'kesh' is already taken", "amount: must be >= 1"), and falls back to
 * this module's per-code message when the detail is not fit to show a person.
 *
 * "Not fit" means it embeds an id. The same `code` produces both kinds — CONFLICT
 * is "username 'kesh' is already taken" from registration and
 * "unit {uuid} is already in {uuid}'s inventory" from the inventory — so no
 * per-code rule can separate them, but the id itself is exact to detect. No copy
 * written for a person contains a UUID.
 *
 * This is what the module always claimed to do; until now the first branch was
 * `err.message || …`, and `ApiError.message` is never empty (it starts as the
 * status text and is only ever overwritten by `detail`), so the code map was
 * unreachable and users saw the raw string. Non-`ApiError` values get `fallback`,
 * never a raw internal message, so a caller can supply context. */
export function messageForError(err: unknown, fallback: string = GENERIC): string {
  if (!(err instanceof ApiError)) return fallback
  if (err.message && !EMBEDS_AN_ID.test(err.message)) return err.message
  return err.code ? CODE_MESSAGES[err.code] : fallback
}

/** Map of backend field name → message, from an error's `errors[]` array — so a
 * form can show all its bad fields at once (ROADMAP R9/C). Empty for non-`ApiError`
 * values or errors without field info. First message per field wins. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.errors) return {}
  const map: Record<string, string> = {}
  for (const e of err.errors) {
    if (e.field && !(e.field in map)) map[e.field] = e.detail
  }
  return map
}

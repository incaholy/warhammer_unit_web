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

/** A user-facing message for any thrown value. Prefers the backend's specific
 * `detail` (a clean string since R2), then a per-code message, then `fallback`
 * (default generic). Non-`ApiError` values get `fallback` — never a raw internal
 * message — so a caller can supply context (e.g. "Could not create the army."). */
export function messageForError(err: unknown, fallback: string = GENERIC): string {
  if (err instanceof ApiError) {
    return err.message || (err.code ? CODE_MESSAGES[err.code] : fallback)
  }
  return fallback
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

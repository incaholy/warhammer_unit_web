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
 * `detail` (a clean string since R2), then a per-code fallback, then a generic.
 * Non-`ApiError` values get the generic message — never a raw internal message. */
export function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message || (err.code ? CODE_MESSAGES[err.code] : GENERIC)
  }
  return GENERIC
}

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

/** The one CONFLICT that is not a duplicate: a Kill Team game written from stale state.
 *
 * `CODE_MESSAGES.CONFLICT` is "That already exists.", which is right for the two
 * conflicts it was written for and nonsense for this one. The backend's own contract
 * names the discriminator (`docs/api/conventions.md`): CONFLICT is three situations,
 * and **`field: "version"` is what separates the stale write from the duplicates.**
 *
 * Worded here rather than taken from the backend because the two paths that produce it
 * disagree, and the one a careful client reaches is the worse of them:
 *
 *   - The service's `expected_version` check — reached only when a client SENDS a
 *     version — answers `game {uuid} has moved on (version 7, not 5)`. That embeds an
 *     id, so `messageForError` refuses it and the user gets "That already exists."
 *   - The `StaleDataError` handler, reached when a client sends none, answers prose
 *     with no id, which is shown verbatim: "…read it again and retry".
 *
 * So doing the careful thing produced the worse message. And the better of the two
 * says **retry**, which KILLTEAM.md #78 forbids: a 409 means re-read and re-DECIDE,
 * because the write that lost is exactly the overwrite the guard exists to stop.
 * Re-sending it is the bug. One string for both paths, in the design's own words.
 *
 * `meta.errorMessage` could not do this job: it overrides a mutation's EVERY error,
 * and a game write fails with 400 VALIDATION far more often than with a 409. */
const STALE_VERSION = 'Someone changed this game since you loaded it. Reload and choose again.'

/** A write that lost a race, as opposed to a duplicate. See `STALE_VERSION`. */
export function isStaleVersion(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'CONFLICT' && err.field === 'version'
}

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
  if (isStaleVersion(err)) return STALE_VERSION
  if (err.message && !EMBEDS_AN_ID.test(err.message)) return err.message
  return err.code ? CODE_MESSAGES[err.code] : fallback
}

/** Append the quotable reference to copy the CALLER owns.
 *
 * For the read paths, where the view's own wording ("Couldn’t load your
 * inventory.") is better copy than the backend’s `detail` for a 500 ("internal
 * server error"), but the reference is just as necessary. Reads are queries, so
 * they never reach the mutation cache that appends it for writes -- which left the
 * id populated on every error and surfaced on none of the GETs.
 *
 * Only for server faults (5xx): a 404 or a 409 is the user’s to act on, and an
 * opaque id on "Army not found" is noise. Returns the message unchanged when there
 * is nothing to add, so callers can wrap unconditionally. */
export function withReference(message: string, err: unknown): string {
  if (!(err instanceof ApiError) || err.status < 500 || !err.requestId) return message
  return `${message} (ref: ${err.requestId})`
}

/** A reference a user can quote, for failures they would need to report.
 *
 * Only for server faults (5xx). A 409 or a 422 is something the user can act on
 * themselves, and appending an opaque id to "That already exists." is noise. A
 * 500 is not actionable, so the useful thing to hand them is the one string that
 * finds the log line and the Sentry event (backend ROADMAP R7).
 *
 * Returns the message unchanged when there is nothing to add. */
export function messageWithReference(err: unknown, fallback: string = GENERIC): string {
  return withReference(messageForError(err, fallback), err)
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

/** The toast copy for a failed mutation, honouring a per-mutation override.
 *
 * `meta.errorMessage` OVERRIDES rather than falls back, and the distinction matters:
 * `messageForError`'s `fallback` argument is only reached for a non-`ApiError` or one
 * with no `code`, so it cannot help an error that HAS a code. The case this exists
 * for is a backend message that is good copy but embeds an id — which
 * `messageForError` correctly refuses to show, leaving the code's generic string
 * where the mutation knows something better. Opted into per mutation, so every other
 * error keeps the generic path.
 *
 * Lives here rather than inline in `main.tsx` so it can be tested: `main.tsx` is
 * excluded from coverage because it renders the app. */
export function mutationErrorMessage(err: unknown, meta?: Record<string, unknown>): string {
  const override = meta?.errorMessage
  if (typeof override === 'string') return withReference(override, err)
  return messageWithReference(err)
}

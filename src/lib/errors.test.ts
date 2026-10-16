import { describe, it, expect } from 'vitest'

import { ApiError } from '../api/client'
import { CODE_MESSAGES, fieldErrors, isStaleVersion, messageForError, messageWithReference, mutationErrorMessage, withReference } from './errors'

describe('messageForError', () => {
  it('prefers the ApiError message (the backend detail)', () => {
    const err = new ApiError(409, 'email already taken', 'CONFLICT', 'email')
    expect(messageForError(err)).toBe('email already taken')
  })

  it('falls back to the per-code message when the detail embeds an id', () => {
    // The backend's real 409 from `POST /me/inventory` on a repeat add. Shown
    // verbatim it is two raw UUIDs and a possessive apostrophe on a user id.
    const err = new ApiError(
      409,
      "unit 3f2a1b8c-5d4e-4f6a-9b7c-1e2d3f4a5b6c is already in " +
        "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d's inventory",
      'CONFLICT',
    )
    expect(messageForError(err)).toBe(CODE_MESSAGES.CONFLICT)
  })

  it('keeps a detail that reads as copy, for the same code', () => {
    // Registration produces CONFLICT too, with a message worth showing. No
    // per-code rule could separate these two; the id is what distinguishes them.
    const err = new ApiError(409, "username 'kesh' is already taken", 'CONFLICT', 'username')
    expect(messageForError(err)).toBe("username 'kesh' is already taken")
  })

  it('returns a generic message for non-ApiError values (no internal leak)', () => {
    expect(messageForError(new Error('boom'))).toBe('Something went wrong. Please try again.')
    expect(messageForError('nope')).toBe('Something went wrong. Please try again.')
  })

  it('uses the provided fallback for non-ApiError values', () => {
    expect(messageForError(new Error('boom'), 'Could not save.')).toBe('Could not save.')
  })
})

describe('fieldErrors', () => {
  it('maps backend field -> message from the errors[] array', () => {
    const err = new ApiError(422, 'value is not a valid email address', 'REQUEST_VALIDATION', 'email', [
      { code: 'REQUEST_VALIDATION', field: 'email', detail: 'value is not a valid email address' },
      { code: 'REQUEST_VALIDATION', field: 'password', detail: 'string too short' },
    ])
    expect(fieldErrors(err)).toEqual({
      email: 'value is not a valid email address',
      password: 'string too short',
    })
  })

  it('ignores non-field (null) entries and is empty for non-ApiError values', () => {
    const err = new ApiError(500, 'internal', 'INTERNAL', undefined, [
      { code: 'INTERNAL', field: null, detail: 'internal' },
    ])
    expect(fieldErrors(err)).toEqual({})
    expect(fieldErrors(new Error('boom'))).toEqual({})
  })
})

describe('withReference', () => {
  it('appends the reference to the caller\'s own copy on a server fault', () => {
    // The read paths keep their wording -- "internal server error" is worse copy
    // than "Couldn\u2019t load your inventory." -- and still hand over the id.
    const fault = new ApiError(500, 'internal server error', 'INTERNAL', undefined, undefined, 'req-abc123')
    expect(withReference('Couldn\u2019t load your inventory.', fault)).toBe(
      'Couldn\u2019t load your inventory. (ref: req-abc123)',
    )
  })

  it('adds nothing to a 404, which the user can act on', () => {
    const missing = new ApiError(404, 'army not found', 'NOT_FOUND', undefined, undefined, 'req-abc123')
    expect(withReference('Army not found', missing)).toBe('Army not found')
  })

  it('adds nothing when there is no id, or the value is not an ApiError', () => {
    const noId = new ApiError(503, 'unavailable', 'INTERNAL')
    expect(withReference('Army not found', noId)).toBe('Army not found')
    expect(withReference('Something went wrong', new Error('boom'))).toBe('Something went wrong')
    expect(withReference('Something went wrong', null)).toBe('Something went wrong')
  })
})

describe('mutationErrorMessage', () => {
  it('prefers a mutation\'s own copy over the code\'s generic string', () => {
    // The case it exists for: the backend's message is good copy but embeds an id, so
    // `messageForError` refuses it and falls back to "Not found." — which says
    // nothing about a datacard the player can see on screen.
    const err = new ApiError(
      404,
      'operative 3f2c1a7e-0000-4000-8000-000000000000 is no longer in the catalog',
      'NOT_FOUND',
    )
    expect(messageForError(err)).toBe('Not found.')
    expect(mutationErrorMessage(err, { errorMessage: 'That datacard is gone. Reload.' })).toBe(
      'That datacard is gone. Reload.',
    )
  })

  it('leaves every other mutation on the generic path', () => {
    const err = new ApiError(409, "a roster called 'Mine' already exists", 'CONFLICT')
    // No override, so the backend's id-free prose still wins — which is the behaviour
    // the roster conflicts rely on.
    expect(mutationErrorMessage(err, { successMessage: 'Saved' })).toBe(
      "a roster called 'Mine' already exists",
    )
    expect(mutationErrorMessage(err, undefined)).toBe("a roster called 'Mine' already exists")
  })

  it('ignores a non-string override, falling back to the normal path', () => {
    const err = new ApiError(500, 'boom', 'INTERNAL')
    // Asserted against the normal path's own result rather than a literal, because
    // the point is that a bad override changes nothing — not what the normal path
    // happens to return. (Here it returns the backend's `detail`, since 'boom'
    // carries no id.)
    expect(mutationErrorMessage(err, { errorMessage: 42 })).toBe(messageWithReference(err))
  })
})

describe('the stale-version 409 (ROADMAP KF4, KILLTEAM.md #78)', () => {
  // The three CONFLICTs the backend's contract names, told apart by `field` alone.
  const stale = (detail: string) => new ApiError(409, detail, 'CONFLICT', 'version')

  it('is recognised by `field`, not by the code or the status', () => {
    expect(isStaleVersion(stale('anything'))).toBe(true)
    expect(isStaleVersion(new ApiError(409, 'x', 'CONFLICT', 'equipment_id'))).toBe(false)
    expect(isStaleVersion(new ApiError(409, 'x', 'CONFLICT'))).toBe(false)
    expect(isStaleVersion(new ApiError(400, 'x', 'VALIDATION', 'version'))).toBe(false)
    expect(isStaleVersion(new Error('version'))).toBe(false)
  })

  it('words the service path, whose real detail embeds the game id', () => {
    // `service_killteam_game.py`: "game {uuid} has moved on (version 7, not 5)".
    // Reached ONLY when a client sends a version -- so before this, doing the
    // careful thing got "That already exists." and sending nothing got good prose.
    const err = stale('game 3f2a1b8c-5d4e-4f6a-9b7c-1e2d3f4a5b6c has moved on (version 7, not 5)')
    expect(messageForError(err)).not.toBe(CODE_MESSAGES.CONFLICT)
    expect(messageForError(err)).toMatch(/reload/i)
  })

  it('OVERRIDES the handler path, whose own prose says "retry"', () => {
    // `app/main.py`: "this game has moved on since it was read -- read it again and
    // retry". No id, so `messageForError` would show it verbatim -- and #78 is that
    // a 409 means re-read and re-DECIDE. The write that lost is exactly the
    // overwrite the guard exists to stop, so re-sending it is the bug.
    const err = stale('this game has moved on since it was read \u2014 read it again and retry')
    expect(messageForError(err)).not.toMatch(/retry/i)
  })

  it('gives both paths the SAME copy, since the player cannot tell them apart', () => {
    const fromService = stale('game 3f2a1b8c-5d4e-4f6a-9b7c-1e2d3f4a5b6c has moved on (version 7, not 5)')
    const fromHandler = stale('this game has moved on since it was read')
    expect(messageForError(fromService)).toBe(messageForError(fromHandler))
  })

  it('carries no reference id, because a 409 is the player\'s to act on', () => {
    const err = new ApiError(409, 'moved on', 'CONFLICT', 'version', undefined, 'rq-1')
    expect(messageWithReference(err)).not.toMatch(/ref:/)
  })

  it('leaves the duplicate conflicts alone', () => {
    // The regression this guards: a rule keyed on the CODE would have reworded
    // registration's "username 'kesh' is already taken" into reload advice.
    const dup = new ApiError(409, "username 'kesh' is already taken", 'CONFLICT', 'username')
    expect(messageForError(dup)).toBe("username 'kesh' is already taken")
  })
})

import { describe, it, expect } from 'vitest'

import { ApiError } from '../api/client'
import { CODE_MESSAGES, fieldErrors, messageForError } from './errors'

describe('messageForError', () => {
  it('prefers the ApiError message (the backend detail)', () => {
    const err = new ApiError(409, 'email already taken', 'CONFLICT', 'email')
    expect(messageForError(err)).toBe('email already taken')
  })

  it('falls back to the per-code message when there is no detail', () => {
    const err = new ApiError(403, '', 'FORBIDDEN')
    expect(messageForError(err)).toBe(CODE_MESSAGES.FORBIDDEN)
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

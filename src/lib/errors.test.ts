import { describe, it, expect } from 'vitest'

import { ApiError } from '../api/client'
import { CODE_MESSAGES, messageForError } from './errors'

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
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'

describe('Field', () => {
  it('labels its input', () => {
    render(<Field label="Email" />)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('has no error description when there is no error', () => {
    render(<Field label="Email" />)
    const input = screen.getByLabelText('Email')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).not.toHaveAttribute('aria-describedby')
  })

  it('ties the error text to the input, so it is read on focus and not only once', () => {
    // role="alert" announces an error when it appears. aria-describedby is what
    // makes it part of the field: a screen-reader user tabbing back hears the
    // reason, not just "invalid". toHaveAccessibleDescription resolves the id
    // reference the way assistive tech does, so this fails if the link breaks.
    render(<Field label="Email" error="value is not a valid email address" />)
    const input = screen.getByLabelText('Email')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('value is not a valid email address')
  })

  it('keeps a description the caller supplied and adds the error to it', () => {
    render(
      <>
        <p id="hint">At least 8 characters</p>
        <Field label="Password" aria-describedby="hint" error="too short" />
      </>,
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'At least 8 characters too short',
    )
  })
})

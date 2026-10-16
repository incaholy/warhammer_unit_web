import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Toast } from './Toast'

describe('Toast', () => {
  it('renders nothing when not visible', () => {
    render(<Toast message="Army created" visible={false} />)
    expect(screen.queryByText('Army created')).not.toBeInTheDocument()
  })

  it('announces a confirmation politely', () => {
    render(<Toast message="Army created" visible />)
    const pill = screen.getByRole('status')
    expect(pill).toHaveTextContent('Army created')
    expect(pill).toHaveAttribute('aria-live', 'polite')
  })

  it('announces a failure as an alert, and looks different', () => {
    // A failed delete used to render the same pill as "Army created": the tone was
    // carried end to end and dropped on arrival.
    render(<Toast message="Couldn't delete this army" visible tone="error" />)
    const pill = screen.getByRole('alert')

    expect(pill).toHaveTextContent("Couldn't delete this army")
    expect(pill).toHaveAttribute('aria-live', 'assertive')
    // The error variant is an extra class on top of the base pill.
    expect(pill.className.split(' ').length).toBeGreaterThan(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

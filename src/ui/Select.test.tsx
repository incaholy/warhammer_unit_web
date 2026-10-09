import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Select } from './Select'

const FACTIONS = [
  { value: 'all', label: 'All factions' },
  { value: 'ktf1', label: 'Tyranids' },
  { value: 'ktf2', label: 'Aeldari' },
]

describe('Select', () => {
  it('labels its control', () => {
    render(<Select label="Faction" options={FACTIONS} />)
    expect(screen.getByLabelText('Faction')).toBeInTheDocument()
  })

  it('renders the options in the order given, not sorted', () => {
    // Order matters for every list this app shows: the catalog's own order is
    // `position`, and "All factions" has to lead whatever follows it. A component
    // that sorted would quietly break both.
    render(<Select label="Faction" options={FACTIONS} />)
    const labels = screen
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(labels).toEqual(['All factions', 'Tyranids', 'Aeldari'])
    expect(labels).not.toEqual([...labels].sort())
  })

  it('reports the chosen value to onChange', () => {
    // Read INSIDE the handler, which is both how a caller uses it and the only way
    // that works: this is a controlled select, so React writes the `value` prop back
    // onto the DOM node after the handler returns. Asserting on
    // `mock.calls[0][0].target.value` afterwards reads 'all' -- the value it was
    // reset to, not the one that was chosen.
    let chosen: string | undefined
    const onChange = vi.fn((event: { target: { value: string } }) => {
      chosen = event.target.value
    })
    render(<Select label="Faction" options={FACTIONS} value="all" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Faction'), { target: { value: 'ktf2' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(chosen).toBe('ktf2')
  })

  it('has no error description when there is no error', () => {
    render(<Select label="Faction" options={FACTIONS} />)
    const select = screen.getByLabelText('Faction')
    expect(select).not.toHaveAttribute('aria-invalid')
    expect(select).not.toHaveAttribute('aria-describedby')
  })

  it('ties the error text to the control, so it is read on focus and not only once', () => {
    // The same contract `Field` has, and for the same reason: role="alert" announces
    // an error when it appears, while aria-describedby makes it part of the control,
    // so a screen-reader user tabbing back hears the reason rather than just
    // "invalid". toHaveAccessibleDescription resolves the id reference the way
    // assistive tech does, so this fails if the link breaks rather than if the text
    // merely goes missing.
    render(<Select label="Faction" options={FACTIONS} error="pick a faction" />)
    const select = screen.getByLabelText('Faction')

    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAccessibleDescription('pick a faction')
    expect(screen.getByRole('alert')).toHaveTextContent('pick a faction')
  })

  it('keeps a description the caller supplied and adds the error to it', () => {
    render(
      <>
        <p id="hint">Narrows the team list</p>
        <Select label="Faction" options={FACTIONS} aria-describedby="hint" error="unknown faction" />
      </>,
    )
    expect(screen.getByLabelText('Faction')).toHaveAccessibleDescription(
      'Narrows the team list unknown faction',
    )
  })

  it('takes an explicit id instead of generating one', () => {
    render(<Select label="Faction" options={FACTIONS} id="faction-filter" />)
    expect(screen.getByLabelText('Faction')).toHaveAttribute('id', 'faction-filter')
  })

  it('forwards arbitrary select attributes', () => {
    render(<Select label="Faction" options={FACTIONS} disabled name="faction" />)
    const select = screen.getByLabelText('Faction')
    expect(select).toBeDisabled()
    expect(select).toHaveAttribute('name', 'faction')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentedToggle } from './SegmentedToggle'

const options = [
  { label: 'List', value: 'list' },
  { label: 'Grid', value: 'grid' },
]

describe('SegmentedToggle', () => {
  it('marks the active option via aria-pressed', () => {
    render(<SegmentedToggle options={options} value="grid" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('fires onChange with the clicked option value', () => {
    const onChange = vi.fn()
    render(<SegmentedToggle options={options} value="list" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }))
    expect(onChange).toHaveBeenCalledWith('grid')
  })
})

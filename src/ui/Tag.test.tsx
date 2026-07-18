import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Tag } from './Tag'

describe('Tag', () => {
  it('renders its keyword content', () => {
    render(<Tag>Infantry</Tag>)
    expect(screen.getByText('Infantry')).toBeInTheDocument()
  })
})

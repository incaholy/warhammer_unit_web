import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders its message and sub-text', () => {
    render(<EmptyState message="No units mustered yet" sub="Add from catalog" />)
    expect(screen.getByText('No units mustered yet')).toBeInTheDocument()
    expect(screen.getByText('Add from catalog')).toBeInTheDocument()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App shell (scaffold)', () => {
  it('renders without crashing and shows the Muster wordmark', () => {
    render(<App />)
    expect(screen.getByText('Muster')).toBeInTheDocument()
    expect(screen.getByText('Collection Index')).toBeInTheDocument()
  })
})

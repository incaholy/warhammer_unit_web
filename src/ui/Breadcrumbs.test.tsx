import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs } from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('renders linked crumbs and a current page', () => {
    render(
      <MemoryRouter>
        <Breadcrumbs
          items={[
            { label: 'Collection', to: '/' },
            { label: 'Ferrum Wardens' },
          ]}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/')
    const current = screen.getByText('Ferrum Wardens')
    expect(current).toHaveAttribute('aria-current', 'page')
  })
})

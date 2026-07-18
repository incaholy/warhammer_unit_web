import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { NewArmyModal } from './NewArmyModal'
import type { Faction_Read } from '../api/types'

const factions: Faction_Read[] = [
  { id: 'f-dominion', name: 'The Dominion', subfactions: [] },
  { id: 'f-hollow', name: 'Hollow Vigil', subfactions: [] },
]

function renderModal(open: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(['factions'], factions)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NewArmyModal open={open} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NewArmyModal', () => {
  it('renders the name field and faction options when open', () => {
    renderModal(true)

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('New Army')).toBeInTheDocument()

    expect(screen.getByLabelText('Army Name')).toBeInTheDocument()

    const select = screen.getByLabelText('Faction')
    expect(select).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'The Dominion' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Hollow Vigil' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    renderModal(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

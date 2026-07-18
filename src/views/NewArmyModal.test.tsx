import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { NewArmyModal } from './NewArmyModal'
import type { Army_Create, Army_Read, Faction_Read } from '../api/types'
import { createArmy } from '../api/armies'

// Mock only the create call so we can assert on the request body without a network
// round-trip. useFactions is fed via setQueryData below, so its queryFn never runs.
vi.mock('../api/armies', () => ({
  createArmy: vi.fn(),
}))

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const factions: Faction_Read[] = [
  {
    id: 'f-dominion',
    name: 'The Dominion',
    subfactions: [
      { id: 'sf-iron', name: 'Iron Choir' },
      { id: 'sf-ash', name: 'Ash Wardens' },
    ],
  },
  {
    id: 'f-hollow',
    name: 'Hollow Vigil',
    subfactions: [{ id: 'sf-lantern', name: 'Lantern Bearers' }],
  },
  { id: 'f-bare', name: 'Bare Host', subfactions: [] },
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
  beforeEach(() => {
    vi.mocked(createArmy).mockReset()
    navigateMock.mockReset()
  })

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

  it('renders the new subfaction, description, and points-limit fields', () => {
    renderModal(true)

    expect(screen.getByLabelText('Subfaction')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()

    const points = screen.getByLabelText('Points Limit')
    expect(points).toBeInTheDocument()
    expect(points).toHaveAttribute('type', 'number')
  })

  it('populates subfaction options from the selected faction and resets a stale selection when the faction changes', () => {
    renderModal(true)

    const factionSelect = screen.getByLabelText('Faction')
    const subfactionSelect = screen.getByLabelText('Subfaction') as HTMLSelectElement

    // Before a faction is chosen, only the "Any / none" placeholder is present.
    expect(within(subfactionSelect).queryByRole('option', { name: 'Iron Choir' })).toBeNull()

    fireEvent.change(factionSelect, { target: { value: 'f-dominion' } })
    expect(within(subfactionSelect).getByRole('option', { name: 'Iron Choir' })).toBeInTheDocument()
    expect(within(subfactionSelect).getByRole('option', { name: 'Ash Wardens' })).toBeInTheDocument()

    // Pick a subfaction, then switch factions: the stale selection must reset and
    // the options must reflect the new faction.
    fireEvent.change(subfactionSelect, { target: { value: 'sf-ash' } })
    expect(subfactionSelect.value).toBe('sf-ash')

    fireEvent.change(factionSelect, { target: { value: 'f-hollow' } })
    expect(subfactionSelect.value).toBe('')
    expect(within(subfactionSelect).queryByRole('option', { name: 'Ash Wardens' })).toBeNull()
    expect(within(subfactionSelect).getByRole('option', { name: 'Lantern Bearers' })).toBeInTheDocument()
  })

  it('passes description, points_limit, and subfaction_id through to the create-army mutation', async () => {
    const created: Army_Read = {
      id: 'a-1',
      name: 'The Long Watch',
      faction_id: 'f-dominion',
      subfaction_id: 'sf-iron',
      description: 'Sworn to the vigil.',
      points_limit: 1500,
      points_total: 0,
      units: [],
    }
    vi.mocked(createArmy).mockResolvedValue(created)

    renderModal(true)

    fireEvent.change(screen.getByLabelText('Army Name'), { target: { value: 'The Long Watch' } })
    fireEvent.change(screen.getByLabelText('Faction'), { target: { value: 'f-dominion' } })
    fireEvent.change(screen.getByLabelText('Subfaction'), { target: { value: 'sf-iron' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Sworn to the vigil.' },
    })
    fireEvent.change(screen.getByLabelText('Points Limit'), { target: { value: '1500' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(createArmy).toHaveBeenCalledTimes(1))

    const body = vi.mocked(createArmy).mock.calls[0][0] as Army_Create
    expect(body).toEqual({
      name: 'The Long Watch',
      faction_id: 'f-dominion',
      subfaction_id: 'sf-iron',
      description: 'Sworn to the vigil.',
      points_limit: 1500,
    })

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/armies/a-1'))
  })

  it('omits the optional fields when left blank', async () => {
    vi.mocked(createArmy).mockResolvedValue({
      id: 'a-2',
      name: 'Bare Bones',
      faction_id: 'f-bare',
      subfaction_id: null,
      description: null,
      points_limit: null,
      points_total: 0,
      units: [],
    })

    renderModal(true)

    fireEvent.change(screen.getByLabelText('Army Name'), { target: { value: 'Bare Bones' } })
    fireEvent.change(screen.getByLabelText('Faction'), { target: { value: 'f-bare' } })

    // A faction with no subfactions disables the dependent select.
    expect(screen.getByLabelText('Subfaction')).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(createArmy).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createArmy).mock.calls[0][0]).toEqual({
      name: 'Bare Bones',
      faction_id: 'f-bare',
    })
  })
})

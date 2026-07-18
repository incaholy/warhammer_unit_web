import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import UnitView from './UnitView'
import { queryKeys } from '../api/queries'
import type { Faction_Read, Unit_Read } from '../api/types'

const FACTION: Faction_Read = {
  id: 'f-imperium',
  name: 'Imperium',
  subfactions: [],
}

const UNIT: Unit_Read = {
  id: 'u-1',
  unit_name: 'Sepulchral Warden',
  faction_id: 'f-imperium',
  subfaction_id: null,
  movement: 6,
  toughness: 4,
  armor_save: 3,
  wounds: 5,
  invulnerable_save: 4,
  leadership: 6,
  objective_control: 2,
  points: 95,
  keywords: ['Infantry', 'Character', 'Vigil'],
  weapons: [
    {
      id: 'w-bolt',
      name: 'Bolt Carbine',
      category: 'range',
      keywords: ['Rapid Fire 1'],
      range_inches: 24,
      attacks: '2',
      weapon_skill: 3,
      strength: 4,
      armor_piercing: 1,
      damage: '1',
    },
    {
      id: 'w-blade',
      name: 'Reaper Blade',
      category: 'melee',
      keywords: [],
      range_inches: null,
      attacks: '4',
      weapon_skill: 2,
      strength: 6,
      armor_piercing: 2,
      damage: '2',
    },
  ],
  abilities: [
    { id: 'a-1', name: 'Undying Vigil', description: 'Ignore the first wound each turn.' },
  ],
}

/** Seed the QueryClient so the view resolves without touching the network. */
function renderView(ui: ReactElement = <UnitView />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(queryKeys.unit(UNIT.id), UNIT)
  client.setQueryData(queryKeys.factions, [FACTION])

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/units/${UNIT.id}`]}>
        <Routes>
          <Route path="/units/:unitId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UnitView', () => {
  it('renders the eyebrow (faction — role) and serif name', () => {
    renderView()
    // Character keyword derives the "Characters" role.
    expect(screen.getByText('Imperium — Characters')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sepulchral Warden' })).toBeInTheDocument()
  })

  it('renders the full profile stat line (M/T/Sv/W/Ld/OC)', () => {
    renderView()
    const profile = screen.getByRole('table', { name: 'Profile' })
    const scoped = within(profile)
    expect(scoped.getByText('6"')).toBeInTheDocument() // M
    expect(scoped.getByText('4')).toBeInTheDocument() // T
    expect(scoped.getByText('3+')).toBeInTheDocument() // Sv
    expect(scoped.getByText('5')).toBeInTheDocument() // W
    expect(scoped.getByText('6+')).toBeInTheDocument() // Ld
    expect(scoped.getByText('2')).toBeInTheDocument() // OC
  })

  it('splits weapons into the correct ranged and melee tables', () => {
    renderView()
    const ranged = screen.getByRole('table', { name: 'Ranged' })
    const melee = screen.getByRole('table', { name: 'Melee' })

    expect(within(ranged).getByText('Bolt Carbine')).toBeInTheDocument()
    expect(within(ranged).queryByText('Reaper Blade')).not.toBeInTheDocument()
    // Ranged table uses a BS skill column.
    expect(within(ranged).getByRole('columnheader', { name: 'BS' })).toBeInTheDocument()
    expect(within(ranged).getByText('24"')).toBeInTheDocument()

    expect(within(melee).getByText('Reaper Blade')).toBeInTheDocument()
    expect(within(melee).queryByText('Bolt Carbine')).not.toBeInTheDocument()
    // Melee weapons show "Melee" range and a WS column.
    expect(within(melee).getByRole('columnheader', { name: 'WS' })).toBeInTheDocument()
    expect(within(melee).getByText('Melee')).toBeInTheDocument()
  })

  it('renders abilities and keyword chips', () => {
    renderView()
    expect(screen.getByText('Undying Vigil')).toBeInTheDocument()
    expect(screen.getByText('Ignore the first wound each turn.')).toBeInTheDocument()
    for (const kw of UNIT.keywords) {
      expect(screen.getByText(kw)).toBeInTheDocument()
    }
  })

  it('shows a "+ Add to {army}" action when passed the addToArmy prop', () => {
    renderView(<UnitView addToArmy={{ armyName: 'The Hollow Vigil', onAdd: () => {} }} />)
    expect(
      screen.getByRole('button', { name: '+ Add to The Hollow Vigil' }),
    ).toBeInTheDocument()
  })

  it('shows an editable "In collection" quantity when passed the collection prop', () => {
    renderView(<UnitView collection={{ amount: 3, onChange: () => {} }} />)
    const input = screen.getByLabelText('In collection') as HTMLInputElement
    expect(input.value).toBe('3')
  })

  it('renders a skeleton datasheet while the unit query is pending', () => {
    // Seed only the factions; leaving the unit unseeded keeps `useUnit` pending
    // so the loading branch renders.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(queryKeys.factions, [FACTION])

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/units/${UNIT.id}`]}>
          <Routes>
            <Route path="/units/:unitId" element={<UnitView />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Skeleton placeholder is shown with a polite loading status…
    expect(screen.getByTestId('datasheet-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/loading datasheet/i)
    // …and the real datasheet has not rendered yet.
    expect(
      screen.queryByRole('heading', { name: UNIT.unit_name }),
    ).not.toBeInTheDocument()
  })
})

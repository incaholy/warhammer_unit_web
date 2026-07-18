import { describe, it, expect } from 'vitest'
import { deriveRole, groupByRole, OTHER_ROLE } from './roles'
import type { Unit_Read } from '../api/types'

function unit(name: string, keywords: string[]): Unit_Read {
  return {
    id: `id-${name}`,
    unit_name: name,
    faction_id: 'f1',
    subfaction_id: null,
    movement: 6,
    toughness: 4,
    armor_save: 3,
    wounds: 2,
    invulnerable_save: null,
    leadership: 6,
    objective_control: 2,
    points: 100,
    keywords,
    weapons: [],
    abilities: [],
  }
}

describe('deriveRole', () => {
  it('maps Epic Hero → Characters', () => {
    expect(deriveRole(['Epic Hero', 'Infantry'])).toBe('Characters')
  })

  it('maps Character → Characters', () => {
    expect(deriveRole(['Character'])).toBe('Characters')
  })

  it('maps Battleline → Battleline', () => {
    expect(deriveRole(['Infantry', 'Battleline'])).toBe('Battleline')
  })

  it('maps Vehicle → Vehicles', () => {
    expect(deriveRole(['Vehicle'])).toBe('Vehicles')
  })

  it('maps Walker → Vehicles', () => {
    expect(deriveRole(['Walker'])).toBe('Vehicles')
  })

  it('maps Monster → Monsters', () => {
    expect(deriveRole(['Monster'])).toBe('Monsters')
  })

  it('maps Mounted → Mounted', () => {
    expect(deriveRole(['Mounted'])).toBe('Mounted')
  })

  it('maps Beast → Beast', () => {
    expect(deriveRole(['Beast'])).toBe('Beast')
  })

  it('maps Swarm → Swarm', () => {
    expect(deriveRole(['Swarm'])).toBe('Swarm')
  })

  it('falls back to "Other Units" when no keyword matches', () => {
    expect(deriveRole(['Infantry', 'Grenades'])).toBe(OTHER_ROLE)
  })

  it('falls back to "Other Units" for an empty keyword list', () => {
    expect(deriveRole([])).toBe(OTHER_ROLE)
  })

  it('is case-insensitive', () => {
    expect(deriveRole(['epic hero'])).toBe('Characters')
    expect(deriveRole(['VEHICLE'])).toBe('Vehicles')
  })

  it('honors priority order: Character beats Vehicle when both present', () => {
    expect(deriveRole(['Vehicle', 'Character'])).toBe('Characters')
  })

  it('honors priority order: Battleline beats Monster when both present', () => {
    expect(deriveRole(['Monster', 'Battleline'])).toBe('Battleline')
  })
})

describe('groupByRole', () => {
  it('groups a mixed list into priority-ordered role buckets', () => {
    const units = [
      unit('Grunt', ['Infantry']), // Other Units
      unit('Captain', ['Character']), // Characters
      unit('Tank', ['Vehicle']), // Vehicles
      unit('Trooper', ['Battleline']), // Battleline
      unit('Beast', ['Monster']), // Monsters
    ]

    const groups = groupByRole(units)

    // Roles appear in the canonical priority order, with the fallback last.
    expect(groups.map((g) => g.role)).toEqual([
      'Characters',
      'Battleline',
      'Vehicles',
      'Monsters',
      OTHER_ROLE,
    ])
  })

  it('preserves input order of units within a role', () => {
    const a = unit('A', ['Character'])
    const b = unit('B', ['Character'])
    const groups = groupByRole([a, b])
    expect(groups).toHaveLength(1)
    expect(groups[0].units.map((u) => u.unit_name)).toEqual(['A', 'B'])
  })

  it('omits roles with no members', () => {
    const groups = groupByRole([unit('Captain', ['Character'])])
    expect(groups.map((g) => g.role)).toEqual(['Characters'])
  })

  it('accepts entry-shaped items ({ unit })', () => {
    const entries = [
      { unit: unit('Captain', ['Character']), amount: 1 },
      { unit: unit('Grunt', ['Infantry']), amount: 3 },
    ]
    const groups = groupByRole(entries)
    expect(groups.map((g) => g.role)).toEqual(['Characters', OTHER_ROLE])
    expect(groups[0].units[0].amount).toBe(1)
  })
})

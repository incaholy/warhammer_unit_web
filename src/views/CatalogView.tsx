/* CatalogView — the shared catalog browser (SPEC.md → "CatalogView").
 *
 * A `target` (an army or the inventory) decides what each row's "+ Add" does
 * (`POST …/units` vs `POST /me/inventory`) and the header's "Adding to —" label.
 * Left rail = faction filter (from `GET /factions`) with a live per-faction count;
 * main column = a search box bound to `q`, an Owned only / All units toggle that
 * cross-references the inventory, and paged unit rows (name, faction · role, an
 * owned tag, "+ Add"). "N of M" comes from the units query's `X-Total-Count` total. */

import { useMemo, useState } from 'react'
import {
  useAddArmyUnit,
  useAddInventoryUnit,
  useArmy,
  useFactions,
  useInventory,
  useUnits,
} from '../api/queries'
import type { UUID } from '../api/types'
import { Button, EmptyState, Eyebrow, Input, SegmentedToggle, Tag } from '../ui'
import { deriveRole } from '../lib/roles'
import styles from './CatalogView.module.css'

/** Where "+ Add" sends a unit — an army or the user's inventory. */
export type CatalogTarget =
  | { kind: 'inventory' }
  | { kind: 'army'; armyId: UUID }

export interface CatalogViewProps {
  /** Add destination; defaults to the inventory (`/catalog`). */
  target?: CatalogTarget
}

type OwnedMode = 'all' | 'owned'

const PAGE_SIZE = 25
const INDEX_LIMIT = 1000

const OWNED_OPTIONS: { label: string; value: OwnedMode }[] = [
  { label: 'All units', value: 'all' },
  { label: 'Owned only', value: 'owned' },
]

/** Sentinel for "no faction filter" (the "All units" rail entry). */
const ALL_FACTIONS = ''

export default function CatalogView({ target = { kind: 'inventory' } }: CatalogViewProps) {
  const [factionId, setFactionId] = useState<UUID | typeof ALL_FACTIONS>(ALL_FACTIONS)
  const [q, setQ] = useState('')
  const [ownedMode, setOwnedMode] = useState<OwnedMode>('all')
  const [offset, setOffset] = useState(0)

  const factionsQuery = useFactions()
  const inventoryQuery = useInventory()

  // Index query (search-filtered, unpaged) → live per-faction counts for the rail.
  const indexQuery = useUnits({ q: q || undefined, limit: INDEX_LIMIT })
  // Main list — the actual faction-filtered, paged rows plus the X-Total-Count total.
  const unitsQuery = useUnits({
    q: q || undefined,
    faction_id: factionId || undefined,
    limit: PAGE_SIZE,
    offset,
  })

  // Add mutations. `useAddArmyUnit` needs an id, so pass '' when targeting the
  // inventory — the disabled army hook simply never fires.
  const armyId = target.kind === 'army' ? target.armyId : ''
  const addArmyUnit = useAddArmyUnit(armyId)
  const addInventoryUnit = useAddInventoryUnit()
  const armyQuery = useArmy(armyId)

  const targetLabel =
    target.kind === 'army' ? armyQuery.data?.name ?? 'Army' : 'Inventory'

  const factionNames = useMemo(() => {
    const map = new Map<UUID, string>()
    for (const f of factionsQuery.data ?? []) map.set(f.id, f.name)
    return map
  }, [factionsQuery.data])

  const ownedIds = useMemo(() => {
    const set = new Set<UUID>()
    for (const entry of inventoryQuery.data ?? []) set.add(entry.unit.id)
    return set
  }, [inventoryQuery.data])

  // Per-faction counts (and the "All" total) from the search-filtered index.
  const factionCounts = useMemo(() => {
    const map = new Map<UUID, number>()
    for (const unit of indexQuery.data?.units ?? []) {
      map.set(unit.faction_id, (map.get(unit.faction_id) ?? 0) + 1)
    }
    return map
  }, [indexQuery.data])
  const allCount = indexQuery.data?.total ?? 0

  const total = unitsQuery.data?.total ?? 0
  const pageUnits = unitsQuery.data?.units ?? []
  // "Owned only" narrows the current page against the inventory.
  const visibleUnits =
    ownedMode === 'owned' ? pageUnits.filter((u) => ownedIds.has(u.id)) : pageUnits

  function resetPaging() {
    setOffset(0)
  }

  function handleAdd(unitId: UUID) {
    if (target.kind === 'army') addArmyUnit.mutate({ unit_id: unitId })
    else addInventoryUnit.mutate({ unit_id: unitId })
  }

  const isAdding = addArmyUnit.isPending || addInventoryUnit.isPending
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <Eyebrow>Adding to {targetLabel}</Eyebrow>
        <h1 className={styles.title}>Catalog</h1>
      </header>

      <div className={styles.layout}>
        <aside className={styles.rail} aria-label="Faction filter">
          <p className={styles.railLabel}>Factions</p>
          <FactionButton
            label="All units"
            count={allCount}
            active={factionId === ALL_FACTIONS}
            onClick={() => {
              setFactionId(ALL_FACTIONS)
              resetPaging()
            }}
          />
          {(factionsQuery.data ?? []).map((faction) => (
            <FactionButton
              key={faction.id}
              label={faction.name}
              count={factionCounts.get(faction.id) ?? 0}
              active={factionId === faction.id}
              onClick={() => {
                setFactionId(faction.id)
                resetPaging()
              }}
            />
          ))}
        </aside>

        <div className={styles.main}>
          <div className={styles.toolbar}>
            <Input
              className={styles.search}
              type="search"
              placeholder="Search units"
              aria-label="Search units"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                resetPaging()
              }}
            />
            <SegmentedToggle
              aria-label="Ownership filter"
              options={OWNED_OPTIONS}
              value={ownedMode}
              onChange={(value) => {
                setOwnedMode(value)
                resetPaging()
              }}
            />
          </div>

          <p className={styles.count}>
            {visibleUnits.length} of {total}
          </p>

          {unitsQuery.isPending ? (
            <p className={styles.loading}>Loading catalog…</p>
          ) : visibleUnits.length === 0 ? (
            <EmptyState
              message="No units match."
              sub="Try a different faction or search term."
            />
          ) : (
            <ul className={styles.rows}>
              {visibleUnits.map((unit) => {
                const owned = ownedIds.has(unit.id)
                const faction = factionNames.get(unit.faction_id) ?? 'Unknown'
                const role = deriveRole(unit.keywords)
                return (
                  <li key={unit.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <span className={styles.unitName}>{unit.unit_name}</span>
                      <span className={styles.meta}>
                        {faction} · {role}
                      </span>
                    </div>
                    <div className={styles.rowActions}>
                      {owned && <Tag>Owned</Tag>}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isAdding}
                        onClick={() => handleAdd(unit.id)}
                      >
                        + Add
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {total > PAGE_SIZE && (
            <div className={styles.pager}>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canPrev}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              >
                ← Prev
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!canNext}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

interface FactionButtonProps {
  label: string
  count: number
  active: boolean
  onClick: () => void
}

function FactionButton({ label, count, active, onClick }: FactionButtonProps) {
  const cls = [styles.factionBtn, active ? styles.factionActive : ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-pressed={active} onClick={onClick}>
      <span>{label}</span>
      <span className={styles.factionCount}>{count}</span>
    </button>
  )
}

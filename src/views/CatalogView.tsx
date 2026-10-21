/* CatalogView — the shared catalog browser (SPEC.md → "CatalogView").
 *
 * A `target` (an army or the inventory) decides what each row's "+ Add" does
 * (`POST …/units` vs `POST /me/inventory`) and the header's "Adding to —" label.
 * Left rail = faction filter (from `GET /factions`) with a live per-faction count;
 * main column = a search box bound to `q`, an Owned only / All units toggle that
 * cross-references the inventory, and paged unit rows (name, faction · role, an
 * owned tag, "+ Add"). "N of M" comes from the `total` in the units page body. */

import { useMemo, useState } from 'react'
import {
  useAddArmyUnit,
  useAddInventoryUnit,
  useArmy,
  useFactions,
  useInventory,
  useUnitFacets,
  useUnits,
} from '../api/queries'
import type { UUID } from '../api/types'
import { Button, EmptyState, Eyebrow, Input, SegmentedToggle, Tag } from '../ui'
import { deriveRole } from '../lib/roles'
import { withReference } from '../lib/errors'
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

const OWNED_OPTIONS: { label: string; value: OwnedMode }[] = [
  { label: 'All units', value: 'all' },
  { label: 'Owned only', value: 'owned' },
]

/** Sentinel for "no faction filter" (the "All units" rail entry). */
const ALL_FACTIONS = ''

export default function CatalogView({ target = { kind: 'inventory' } }: CatalogViewProps) {
  // `null` means the player has not chosen a faction yet, which is NOT the same as
  // choosing "All units" -- that distinction is the whole mechanism. While the choice is
  // null the army's own faction applies; the first click on the rail, including a click on
  // "All units", records a choice and wins from then on. So the filter DEFAULTS rather
  // than locks, and the rail stays usable with no extra control to clear it.
  //
  // A `useState` initialiser cannot do this: the army arrives from `useArmy` after the
  // first render, so there is nothing to initialise FROM. Deriving it instead of syncing
  // it in an effect means there is no frame where the wrong list is on screen.
  const [factionChoice, setFactionChoice] = useState<UUID | typeof ALL_FACTIONS | null>(null)
  const [q, setQ] = useState('')
  const [ownedMode, setOwnedMode] = useState<OwnedMode>('all')
  const [offset, setOffset] = useState(0)

  const factionsQuery = useFactions()
  const inventoryQuery = useInventory()

  // Read before the unit queries below, because the faction they filter on is derived
  // from it. `useArmy` is `enabled: Boolean(id)`, so this no-ops for the inventory target.
  const armyId = target.kind === 'army' ? target.armyId : ''
  const armyQuery = useArmy(armyId)

  // Adding to an army offers that army's faction first (F12). The screen already knew the
  // army -- its own eyebrow reads "Adding to <name>" -- and still opened on all 1,332
  // units, so a Space Marine army's first page was Chaos, Xenos, Xenos, Imperium,
  // Imperium, Chaos. Unfiltered is not merely unhelpful here: this app does bookkeeping
  // and not rules, so nothing downstream will ever say a list is illegal, and a catalog
  // that names the army and then offers Chaos units is asserting those are available.
  const defaultFactionId: UUID | typeof ALL_FACTIONS =
    target.kind === 'army' ? armyQuery.data?.faction_id ?? ALL_FACTIONS : ALL_FACTIONS
  const factionId = factionChoice ?? defaultFactionId

  // Per-faction counts for the rail — a server-side GROUP BY aggregate over the
  // same search filter (replaces downloading up to 1000 rows to count in JS).
  // "Owned only" is a server-side filter (backend `owned=true`). Filtering the
  // page here instead hid owned units that fell on other pages, and made the
  // "N of M" counter compare a filtered page against an unfiltered total --
  // filtering and pagination have to happen on the same side.
  const ownedOnly = ownedMode === 'owned'
  const facetsQuery = useUnitFacets({ q: q || undefined, owned: ownedOnly || undefined })
  // Main list — the actual faction-filtered, paged rows plus the total (in body).
  const unitsQuery = useUnits({
    q: q || undefined,
    faction_id: factionId || undefined,
    owned: ownedOnly || undefined,
    limit: PAGE_SIZE,
    offset,
  })

  // Add mutations. `useAddArmyUnit` needs an id, so pass '' when targeting the
  // inventory — the disabled army hook simply never fires.
  const addArmyUnit = useAddArmyUnit(armyId)
  const addInventoryUnit = useAddInventoryUnit()

  const targetLabel =
    target.kind === 'army' ? armyQuery.data?.name ?? 'Army' : 'Inventory'

  const factionNames = useMemo(() => {
    const map = new Map<UUID, string>()
    for (const f of factionsQuery.data?.items ?? []) map.set(f.id, f.name)
    return map
  }, [factionsQuery.data])

  const ownedIds = useMemo(() => {
    const set = new Set<UUID>()
    for (const entry of inventoryQuery.data?.items ?? []) set.add(entry.unit.id)
    return set
  }, [inventoryQuery.data])

  // Units already in the add target. POST is create-only (409 on a repeat), so an
  // already-added unit shows a disabled "Added" instead of a "+ Add" that would
  // conflict; quantity changes happen via PATCH in the target's own view.
  const targetMemberIds = useMemo(() => {
    if (target.kind === 'inventory') return ownedIds
    const set = new Set<UUID>()
    for (const entry of armyQuery.data?.units ?? []) set.add(entry.unit.id)
    return set
  }, [target.kind, ownedIds, armyQuery.data])

  // Per-faction counts (and the "All" total) from the server-side facets aggregate.
  const factionCounts = useMemo(
    () => new Map<UUID, number>(Object.entries(facetsQuery.data?.by_faction ?? {})),
    [facetsQuery.data],
  )
  const allCount = facetsQuery.data?.total ?? 0

  const total = unitsQuery.data?.total ?? 0
  // The server already applied every filter, so the page IS what to render and
  // `total` counts the same set -- "N of M" is correct by construction.
  const visibleUnits = unitsQuery.data?.items ?? []

  function resetPaging() {
    setOffset(0)
  }

  // The default arrives asynchronously, so a player who pages before the army loads would
  // otherwise land on page 2 of a list they never saw page 1 of. Adjusting during render
  // rather than in an effect, which is React's own pattern for this.
  const [appliedDefault, setAppliedDefault] = useState(defaultFactionId)
  if (appliedDefault !== defaultFactionId) {
    setAppliedDefault(defaultFactionId)
    if (offset !== 0) setOffset(0)
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
              setFactionChoice(ALL_FACTIONS)
              resetPaging()
            }}
          />
          {(factionsQuery.data?.items ?? []).map((faction) => (
            <FactionButton
              key={faction.id}
              label={faction.name}
              count={factionCounts.get(faction.id) ?? 0}
              active={factionId === faction.id}
              onClick={() => {
                setFactionChoice(faction.id)
                resetPaging()
              }}
            />
          ))}
          {factionsQuery.isError && (
            <p role="alert" className={styles.error}>
              {withReference("Couldn't load factions.", factionsQuery.error)}
            </p>
          )}
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
            <div role="status" aria-label="Loading units" className={styles.skeleton}>
              <span className={styles.srOnly}>Loading units…</span>
              <ul className={styles.rows} aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className={styles.skeletonRow}>
                    <div className={styles.rowMain}>
                      <span className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
                      <span className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
                    </div>
                    <span className={`${styles.skeletonBlock} ${styles.skeletonAction}`} />
                  </li>
                ))}
              </ul>
            </div>
          ) : unitsQuery.isError ? (
            /* Above the empty check on purpose. A failed fetch also leaves
               `visibleUnits` empty, so without this branch the screen reported a
               server fault as "No units match." — blaming the player's search for
               it, on the view that runs the most queries of any in the app. */
            <p role="alert" className={styles.error}>
              {withReference("Couldn't load the catalog.", unitsQuery.error)}
            </p>
          ) : visibleUnits.length === 0 ? (
            <EmptyState
              message="No units match."
              sub="Try a different faction or search term."
            />
          ) : (
            <ul className={styles.rows}>
              {visibleUnits.map((unit) => {
                const owned = ownedIds.has(unit.id)
                const alreadyInTarget = targetMemberIds.has(unit.id)
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
                        disabled={isAdding || alreadyInTarget}
                        onClick={() => handleAdd(unit.id)}
                      >
                        {alreadyInTarget ? 'Added' : '+ Add'}
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
  const unitWord = count === 1 ? 'unit' : 'units'
  return (
    <button
      type="button"
      className={cls}
      aria-pressed={active}
      aria-label={`${label}, ${count} ${unitWord}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <span className={styles.factionCount}>{count}</span>
    </button>
  )
}

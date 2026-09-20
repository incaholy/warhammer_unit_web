/* InventoryView (`/inventory`) — the user's owned datasheets, grouped into
 * collapsible role sections with editable owned quantities. See SPEC.md →
 * "InventoryView". */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  useInventory,
  useRemoveInventoryUnit,
  useSetInventoryAmount,
} from '../api/queries'
import type { UserUnit_Read } from '../api/types'
import { deriveRole, groupByRole } from '../lib/roles'
import { pluralize } from '../lib/format'
import { withReference } from '../lib/errors'
import { Button, EmptyState, Eyebrow, Input, QuantityInput, Tag } from '../ui'
import styles from './InventoryView.module.css'

export function InventoryView() {
  const navigate = useNavigate()
  const { data: inventory, isLoading, isError, error } = useInventory()
  const [query, setQuery] = useState('')

  const owned = useMemo(() => inventory?.items ?? [], [inventory])

  // Header meta: owned datasheets (distinct entries) · total models (sum of amounts).
  // `total` rather than `owned.length`: the count states a fact about the whole
  // inventory, so it should come from the server's count, not from however many
  // rows happen to be in hand. They agree today because the inventory is fetched
  // complete (src/api/paging.ts) -- reading `total` means they still agree if that
  // ever changes, instead of quietly reporting a page size as a collection size.
  const datasheetCount = inventory?.total ?? owned.length
  const modelCount = owned.reduce((sum, entry) => sum + entry.amount, 0)
  const meta = `${pluralize(datasheetCount, 'owned datasheet')} · ${pluralize(
    modelCount,
    'model',
  )}`

  // Client-side search over the unit name.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return owned
    return owned.filter((entry) => entry.unit.unit_name.toLowerCase().includes(q))
  }, [owned, query])

  const groups = useMemo(() => groupByRole(filtered), [filtered])

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        <div>
          <Eyebrow>Collection Index</Eyebrow>
          <h1 className={styles.title}>Inventory</h1>
          <p className={styles.meta}>{meta}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/catalog')}>
          + Add to Inventory
        </Button>
      </header>

      <div className={styles.toolbar}>
        <Input
          type="search"
          placeholder="Search owned units…"
          aria-label="Search inventory"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {isLoading ? (
        <InventorySkeleton />
      ) : isError ? (
        <p className={styles.status}>{withReference('Couldn’t load your inventory.', error)}</p>
      ) : owned.length === 0 ? (
        <EmptyState
          message="Nothing in your collection yet"
          sub="Record what you own from the catalog"
        >
          <Button variant="secondary" onClick={() => navigate('/catalog')}>
            + Add to Inventory
          </Button>
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState message="No owned units match your search" />
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <RoleSection key={group.role} role={group.role} entries={group.units} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Placeholder group/rows shown while the inventory query is pending, mirroring
 * the real section → row layout so the switch-in doesn't shift the page. */
function InventorySkeleton() {
  return (
    <div
      className={styles.groups}
      role="status"
      aria-label="Loading inventory"
      data-testid="inventory-skeleton"
    >
      {[0, 1].map((section) => (
        <section key={section} className={styles.section} aria-hidden="true">
          <div className={styles.sectionHeader}>
            <span className={`${styles.skeleton} ${styles.skeletonLabel}`} />
          </div>
          <ul className={styles.rows}>
            {[0, 1, 2].map((row) => (
              <li key={row} className={styles.row}>
                <span className={`${styles.skeleton} ${styles.skeletonName}`} />
                <span className={`${styles.skeleton} ${styles.skeletonTag}`} />
                <span className={`${styles.skeleton} ${styles.skeletonQty}`} />
                <span className={`${styles.skeleton} ${styles.skeletonRemove}`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface RoleSectionProps {
  role: string
  entries: UserUnit_Read[]
}

function RoleSection({ role, entries }: RoleSectionProps) {
  const [expanded, setExpanded] = useState(true)
  const totalModels = entries.reduce((sum, entry) => sum + entry.amount, 0)

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          aria-hidden="true"
        >
          ▸
        </span>
        <span className={styles.sectionName}>{role}</span>
        <span className={styles.sectionCount}>
          {pluralize(entries.length, 'unit')} · {pluralize(totalModels, 'model')}
        </span>
      </button>

      {expanded && (
        <ul className={styles.rows}>
          {entries.map((entry) => (
            <InventoryRow key={entry.unit.id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  )
}

interface InventoryRowProps {
  entry: UserUnit_Read
}

function InventoryRow({ entry }: InventoryRowProps) {
  const { unit, amount } = entry
  const role = deriveRole(unit.keywords)
  const setAmount = useSetInventoryAmount()
  const remove = useRemoveInventoryUnit()

  return (
    <li className={styles.row}>
      <span className={styles.unitName}>{unit.unit_name}</span>
      <Tag className={styles.roleTag}>{role}</Tag>
      <label className={styles.qty}>
        <span className={styles.qtyLabel}>Owned</span>
        <QuantityInput
          value={amount}
          className={styles.qtyInput}
          label={`Owned quantity of ${unit.unit_name}`}
          onCommit={(next) => setAmount.mutateAsync({ unitId: unit.id, amount: next })}
        />
      </label>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Remove ${unit.unit_name}`}
        disabled={remove.isPending}
        onClick={() => remove.mutate(unit.id)}
      >
        Remove
      </Button>
    </li>
  )
}

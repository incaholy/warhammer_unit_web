/* InventoryView (`/inventory`) — the user's owned datasheets, grouped into
 * collapsible role sections with editable owned quantities. See SPEC.md →
 * "InventoryView". */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  useInventory,
  useRemoveInventoryUnit,
  useSetInventoryAmount,
} from '../api/queries'
import type { UserUnit_Read } from '../api/types'
import { deriveRole, groupByRole } from '../lib/roles'
import { pluralize } from '../lib/format'
import { Button, EmptyState, Eyebrow, Input, Tag } from '../ui'
import styles from './InventoryView.module.css'

/** How long to wait after the last keystroke before persisting an amount. */
const AMOUNT_DEBOUNCE_MS = 400

export function InventoryView() {
  const navigate = useNavigate()
  const { data: inventory, isLoading, isError } = useInventory()
  const [query, setQuery] = useState('')

  const owned = useMemo(() => inventory ?? [], [inventory])

  // Header meta: owned datasheets (distinct entries) · total models (sum of amounts).
  const datasheetCount = owned.length
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
        <p className={styles.status}>Couldn’t load your inventory.</p>
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

  // Local, immediately-responsive quantity; persisted on a debounce.
  const [qty, setQty] = useState(String(amount))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the field in sync when the server value changes (e.g. after refetch),
  // but only when the user isn't mid-edit (no pending debounce).
  useEffect(() => {
    if (timer.current === null) setQty(String(amount))
  }, [amount])

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  function onQtyChange(next: string) {
    setQty(next)
    const parsed = Number(next)
    if (timer.current !== null) clearTimeout(timer.current)
    if (next === '' || Number.isNaN(parsed) || parsed < 0) return
    timer.current = setTimeout(() => {
      timer.current = null
      setAmount.mutate({ unitId: unit.id, amount: parsed })
    }, AMOUNT_DEBOUNCE_MS)
  }

  return (
    <li className={styles.row}>
      <span className={styles.unitName}>{unit.unit_name}</span>
      <Tag className={styles.roleTag}>{role}</Tag>
      <label className={styles.qty}>
        <span className={styles.qtyLabel}>Owned</span>
        <Input
          type="number"
          min={0}
          className={styles.qtyInput}
          aria-label={`Owned quantity of ${unit.unit_name}`}
          value={qty}
          onChange={(e) => onQtyChange(e.target.value)}
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

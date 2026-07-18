import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  EmptyState,
  Eyebrow,
  SegmentedToggle,
  type SegmentedOption,
} from '../ui'
import { useArmies, useFactions } from '../api/queries'
import type { Army_Read } from '../api/types'
import { formatArmiesMeta, formatPoints, pluralize } from '../lib/format'
import { NewArmyModal } from './NewArmyModal'
import styles from './CollectionView.module.css'

type Layout = 'list' | 'grid'

const LAYOUT_KEY = 'muster:collection-layout'

const LAYOUT_OPTIONS: SegmentedOption<Layout>[] = [
  { label: 'List', value: 'list' },
  { label: 'Grid', value: 'grid' },
]

/** Read the persisted layout choice, defaulting to `list`. */
function readLayout(): Layout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY)
    if (stored === 'list' || stored === 'grid') return stored
  } catch {
    /* localStorage may be unavailable (private mode, tests) — fall through. */
  }
  return 'list'
}

/** Total unit count for an army = the sum of every entry's amount. */
function armyUnitCount(army: Army_Read): number {
  return army.units.reduce((sum, entry) => sum + entry.amount, 0)
}

/** The armies index (SPEC.md → "CollectionView"). */
export function CollectionView() {
  const navigate = useNavigate()
  const armiesQuery = useArmies()
  const factionsQuery = useFactions()

  const [layout, setLayout] = useState<Layout>(readLayout)
  const [modalOpen, setModalOpen] = useState(false)

  const setAndPersistLayout = (next: Layout) => {
    setLayout(next)
    try {
      localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      /* Persisting is best-effort; ignore storage failures. */
    }
  }

  const factionName = useMemo(() => {
    const byId = new Map((factionsQuery.data ?? []).map((f) => [f.id, f.name]))
    return (id: string) => byId.get(id) ?? ''
  }, [factionsQuery.data])

  const armies = useMemo(() => armiesQuery.data ?? [], [armiesQuery.data])

  const totals = useMemo(() => {
    let units = 0
    let points = 0
    for (const army of armies) {
      units += armyUnitCount(army)
      points += army.points_total
    }
    return { armies: armies.length, units, points }
  }, [armies])

  const openArmy = (id: string) => navigate(`/armies/${id}`)

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <Eyebrow>Field Index</Eyebrow>
          <h1 className={styles.title}>Collection</h1>
          <p className={styles.meta}>
            {formatArmiesMeta(totals.armies, totals.units, totals.points)}
          </p>
        </div>
        <div className={styles.controls}>
          <SegmentedToggle
            options={LAYOUT_OPTIONS}
            value={layout}
            onChange={setAndPersistLayout}
            aria-label="Layout"
          />
          <Button onClick={() => setModalOpen(true)}>+ New Army</Button>
        </div>
      </header>

      {armiesQuery.isLoading ? (
        <p className={styles.meta}>Loading armies…</p>
      ) : armiesQuery.isError ? (
        <EmptyState
          message="Could not load your armies."
          sub="Please try again"
        />
      ) : armies.length === 0 ? (
        <EmptyState
          message="No armies mustered yet."
          sub="Start your first list"
        >
          <Button onClick={() => setModalOpen(true)}>+ New Army</Button>
        </EmptyState>
      ) : layout === 'list' ? (
        <div className={styles.list}>
          {armies.map((army) => (
            <button
              key={army.id}
              type="button"
              className={styles.row}
              onClick={() => openArmy(army.id)}
            >
              <div className={styles.rowMain}>
                <p className={styles.faction}>{factionName(army.faction_id)}</p>
                <h2 className={styles.name}>{army.name}</h2>
                {army.description && <p className={styles.desc}>{army.description}</p>}
              </div>
              <div className={styles.stats}>
                <span className={styles.points}>{formatPoints(army.points_total)}</span>
                <span className={styles.units}>
                  {pluralize(armyUnitCount(army), 'unit')}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.grid}>
          {armies.map((army) => (
            <button
              key={army.id}
              type="button"
              className={styles.card}
              onClick={() => openArmy(army.id)}
            >
              <p className={styles.faction}>{factionName(army.faction_id)}</p>
              <h2 className={styles.name}>{army.name}</h2>
              {army.description && <p className={styles.desc}>{army.description}</p>}
              <div className={styles.cardFoot}>
                <span className={styles.points}>{formatPoints(army.points_total)}</span>
                <span className={styles.units}>
                  {pluralize(armyUnitCount(army), 'unit')}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <NewArmyModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  )
}

export default CollectionView

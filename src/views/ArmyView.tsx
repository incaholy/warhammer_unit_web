/* Army detail view (SPEC.md → "ArmyView"). Renders an army header and its
 * "Order of Battle" — units grouped by derived role, each row linking to the
 * datasheet with a Remove action — plus a link into the catalog to add more.
 * Data comes from the single-army query hook keyed by the `:armyId` route param. */

import { useParams, useNavigate, Link } from 'react-router-dom'

import { Button, Eyebrow, EmptyState } from '../ui'
import { useArmy, useFactions, useRemoveArmyUnit } from '../api/queries'
import { groupByRole } from '../lib/roles'
import { formatPoints, pluralize, formatCreatedLabel } from '../lib/format'
import type { Army_Read, ArmyUnit_Read, UUID } from '../api/types'
import styles from './ArmyView.module.css'

/** The army's total fielded models — the sum of each entry's amount. */
function totalUnits(units: ArmyUnit_Read[]): number {
  return units.reduce((sum, entry) => sum + entry.amount, 0)
}

/** The API's Army_Read schema doesn't type a timestamp, but the record carries
 * one; read it defensively so the "Created …" label appears when present. */
function createdLabel(army: Army_Read): string {
  const created = (army as { created_at?: string | number | Date }).created_at
  return created != null ? formatCreatedLabel(created) : ''
}

export default function ArmyView() {
  const { armyId = '' } = useParams<{ armyId: string }>()
  const navigate = useNavigate()

  const armyQuery = useArmy(armyId)
  const factionsQuery = useFactions()
  const removeUnit = useRemoveArmyUnit(armyId)

  if (armyQuery.isPending) {
    return <div className={styles.status}>Loading army…</div>
  }
  if (armyQuery.isError || !armyQuery.data) {
    return <div className={styles.status}>Army not found</div>
  }

  const army = armyQuery.data
  const factionName =
    factionsQuery.data?.find((f) => f.id === army.faction_id)?.name ?? ''

  const meta = [
    formatPoints(army.points_total),
    pluralize(totalUnits(army.units), 'unit'),
    createdLabel(army),
  ]
    .filter(Boolean)
    .join(' · ')

  const groups = groupByRole(army.units)

  function handleRemove(unitId: UUID) {
    removeUnit.mutate(unitId)
  }

  return (
    <div className={styles.view}>
      <header className={styles.header}>
        {factionName && <Eyebrow>{factionName}</Eyebrow>}
        <h1 className={styles.name}>{army.name}</h1>
        <p className={styles.meta}>{meta}</p>
      </header>

      <section className={styles.battle}>
        <div className={styles.battleHead}>
          <h2 className={styles.sectionTitle}>Order of Battle</h2>
          <Button
            variant="secondary"
            onClick={() => navigate(`/armies/${army.id}/catalog`)}
          >
            + Add From Catalog
          </Button>
        </div>

        {army.units.length === 0 ? (
          <EmptyState
            message="No units mustered yet"
            sub="Add datasheets from the catalog to build your order of battle."
          >
            <Button onClick={() => navigate(`/armies/${army.id}/catalog`)}>
              + Add From Catalog
            </Button>
          </EmptyState>
        ) : (
          groups.map((group) => (
            <div key={group.role} className={styles.group}>
              <p className={styles.groupLabel}>{group.role}</p>
              {group.units.map(({ unit, amount }) => (
                <div key={unit.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <Link to={`/units/${unit.id}`} className={styles.unitLink}>
                      {unit.unit_name}
                    </Link>
                    {amount > 1 && <span className={styles.qty}>×{amount}</span>}
                  </div>
                  <span className={styles.rowPoints}>
                    {formatPoints(unit.points * amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(unit.id)}
                    disabled={removeUnit.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

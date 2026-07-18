/* Army detail view (SPEC.md → "ArmyView"). Renders an army header and its
 * "Order of Battle" — units grouped by derived role, each row linking to the
 * datasheet with a Remove action — plus a link into the catalog to add more.
 * Data comes from the single-army query hook keyed by the `:armyId` route param. */

import { useParams, useNavigate, Link } from 'react-router-dom'

import { Button, Eyebrow, EmptyState, Tag } from '../ui'
import {
  useArmy,
  useFactions,
  useRemoveArmyUnit,
  useArmyValidation,
  useArmyShortfall,
} from '../api/queries'
import { groupByRole } from '../lib/roles'
import { formatPoints, pluralize, formatCreatedLabel } from '../lib/format'
import type {
  Army_Read,
  ArmyUnit_Read,
  Validation_Read,
  ValidationIssue_Read,
  Shortfall_Read,
  UUID,
} from '../api/types'
import styles from './ArmyView.module.css'

/** Human labels for the backend's validation issue `kind`s. Unknown kinds fall
 * back to a title-cased version of the raw kind. */
const ISSUE_LABELS: Record<string, string> = {
  over_points: 'Over Points',
  wrong_faction: 'Wrong Faction',
  wrong_subfaction: 'Wrong Subfaction',
}

function issueLabel(kind: string): string {
  return ISSUE_LABELS[kind] ?? kind.replace(/_/g, ' ')
}

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
  const validationQuery = useArmyValidation(armyId)
  const shortfallQuery = useArmyShortfall(armyId)
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
        <PointsLimit army={army} />
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

      <div className={styles.panels}>
        <ValidationPanel
          data={validationQuery.data}
          isPending={validationQuery.isPending}
          isError={validationQuery.isError}
        />
        <ShortfallPanel
          data={shortfallQuery.data}
          isPending={shortfallQuery.isPending}
          isError={shortfallQuery.isError}
        />
      </div>
    </div>
  )
}

/** Header sub-panel: a `points_total / points_limit` progress bar, flagged when
 * the list is over its limit. Renders nothing when no limit is set. */
function PointsLimit({ army }: { army: Army_Read }) {
  if (army.points_limit == null) return null

  const limit = army.points_limit
  const total = army.points_total
  const over = total > limit
  const pct = limit > 0 ? Math.min((total / limit) * 100, 100) : 0

  const barCls = [styles.pointsBar, over && styles.pointsBarOver]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={styles.points}>
      <div className={styles.pointsHead}>
        <span className={styles.pointsCount} data-over={over || undefined}>
          {total} / {limit} pts
        </span>
        {over && <Tag className={styles.overTag}>Over Limit</Tag>}
      </div>
      <div
        className={barCls}
        role="progressbar"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={limit}
      >
        <span className={styles.pointsFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Legality panel fed by `GET …/validate`. A subtle "Legal" state when `ok`,
 * otherwise one row per issue (kind tag, detail, offending unit when present). */
function ValidationPanel({
  data,
  isPending,
  isError,
}: {
  data: Validation_Read | undefined
  isPending: boolean
  isError: boolean
}) {
  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>Legality</h2>
      {isPending ? (
        <p className={styles.panelStatus}>Checking…</p>
      ) : isError || !data ? (
        <p className={styles.panelStatus}>Validation unavailable</p>
      ) : data.ok ? (
        <p className={styles.legal}>Legal — no issues found</p>
      ) : (
        <ul className={styles.issueList}>
          {data.issues.map((issue, i) => (
            <IssueRow key={`${issue.kind}-${i}`} issue={issue} />
          ))}
        </ul>
      )}
    </section>
  )
}

function IssueRow({ issue }: { issue: ValidationIssue_Read }) {
  return (
    <li className={styles.issue}>
      <div className={styles.issueHead}>
        <Tag className={styles.issueKind}>{issueLabel(issue.kind)}</Tag>
        {issue.unit && (
          <span className={styles.issueUnit}>{issue.unit.unit_name}</span>
        )}
      </div>
      <p className={styles.issueDetail}>{issue.detail}</p>
    </li>
  )
}

/** "What to buy" panel fed by `GET …/shortfall`: the units the list fields more
 * of than the collection owns. Hidden noise when nothing is needed. */
function ShortfallPanel({
  data,
  isPending,
  isError,
}: {
  data: Shortfall_Read[] | undefined
  isPending: boolean
  isError: boolean
}) {
  const needed = (data ?? []).filter((row) => row.need > 0)

  return (
    <section className={styles.panel}>
      <h2 className={styles.panelTitle}>What to Buy</h2>
      {isPending ? (
        <p className={styles.panelStatus}>Checking…</p>
      ) : isError || !data ? (
        <p className={styles.panelStatus}>Shortfall unavailable</p>
      ) : needed.length === 0 ? (
        <p className={styles.legal}>Nothing needed — your collection covers it</p>
      ) : (
        <ul className={styles.shortfallList}>
          {needed.map((row) => (
            <li key={row.unit.id} className={styles.shortfallRow}>
              <span className={styles.shortfallUnit}>{row.unit.unit_name}</span>
              <span className={styles.shortfallMeta}>
                {row.in_list} in list · {row.owned} owned ·{' '}
                <strong className={styles.shortfallNeed}>+{row.need} to buy</strong>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

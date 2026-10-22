/* Army detail view (SPEC.md → "ArmyView"). Renders an army header and its
 * "Order of Battle" — units grouped by derived role, each row linking to the
 * datasheet with a Remove action — plus a link into the catalog to add more.
 * Data comes from the single-army query hook keyed by the `:armyId` route param. */

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'

import { Button, Eyebrow, EmptyState, Input, LinkButton, Modal, QuantityInput, Tag } from '../ui'
import { ApiError } from '../api/client'
import {
  useArmy,
  useFactions,
  useRemoveArmyUnit,
  useSetArmyUnitAmount,
  useUpdateArmy,
  useDeleteArmy,
  useArmyValidation,
  useArmyShortfall,
} from '../api/queries'
import { groupByRole } from '../lib/roles'
import { withReference } from '../lib/errors'
import { formatPoints, pluralize, formatCreatedLabel } from '../lib/format'
import type {
  Unit_Read,
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

/** The "Created …" label from the army's timestamp (now typed on Army_Read). */
function createdLabel(army: Army_Read): string {
  return army.created_at ? formatCreatedLabel(army.created_at) : ''
}

export default function ArmyView() {
  const { armyId = '' } = useParams<{ armyId: string }>()
  const navigate = useNavigate()

  const armyQuery = useArmy(armyId)
  const factionsQuery = useFactions()
  const validationQuery = useArmyValidation(armyId)
  const shortfallQuery = useArmyShortfall(armyId)
  const removeUnit = useRemoveArmyUnit(armyId)
  const deleteArmy = useDeleteArmy()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (armyQuery.isPending) {
    return <ArmySkeleton />
  }
  if (armyQuery.isError || !armyQuery.data) {
    // Only a genuine 404 is "not found"; anything else (500, network, …) is a
    // load failure. A 401 has already bounced to /login via the client.
    const notFound = armyQuery.error instanceof ApiError && armyQuery.error.code === 'NOT_FOUND'
    // `withReference` appends the request id on a server fault and nothing
    // otherwise, so a 404 stays clean.
    return (
      <div className={styles.status}>
        {withReference(notFound ? 'Army not found' : "Couldn't load this army.", armyQuery.error)}
      </div>
    )
  }

  const army = armyQuery.data
  const factionName =
    factionsQuery.data?.items.find((f) => f.id === army.faction_id)?.name ?? ''

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
        <ArmyName army={army} />
        <p className={styles.meta}>{meta}</p>
        <PointsLimit army={army} />
        <div className={styles.headerActions}>
          <Button
            variant="dangerOutline"
            size="sm"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteArmy.isPending}
          >
            Delete Army
          </Button>
        </div>
      </header>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this army?"
        // Passed as the dialog's description rather than rendered as body copy, so
        // `aria-describedby` reaches it: the consequence is read with the title
        // instead of being text a screen-reader user has to go looking for.
        description={`${army.name} and its order of battle will be removed. This cannot be undone.`}
      >
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteArmy.mutate(army.id, { onSuccess: () => navigate('/army-list') })}
            disabled={deleteArmy.isPending}
          >
            {deleteArmy.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>

      <section className={styles.battle}>
        <div className={styles.battleHead}>
          <h2 className={styles.sectionTitle}>Order of Battle</h2>
          <LinkButton variant="secondary" to={`/army-list/armies/${army.id}/catalog`}>
            + Add From Catalog
          </LinkButton>
        </div>

        {army.units.length === 0 ? (
          <EmptyState
            message="No units mustered yet"
            sub="Add datasheets from the catalog to build your order of battle."
          >
            <LinkButton to={`/army-list/armies/${army.id}/catalog`}>
              + Add From Catalog
            </LinkButton>
          </EmptyState>
        ) : (
          groups.map((group) => (
            <div key={group.role} className={styles.group}>
              <p className={styles.groupLabel}>{group.role}</p>
              {group.units.map(({ unit, amount }) => (
                <div key={unit.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <Link to={`/army-list/units/${unit.id}`} className={styles.unitLink}>
                      {unit.unit_name}
                    </Link>
                  </div>
                  <UnitAmount armyId={army.id} unit={unit} amount={amount} />
                  <span className={styles.rowPoints}>
                    {formatPoints(unit.points * amount)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(unit.id)}
                    disabled={removeUnit.isPending}
                    aria-label={`Remove ${unit.unit_name}`}
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
          error={validationQuery.error}
        />
        <ShortfallPanel
          data={shortfallQuery.data}
          isPending={shortfallQuery.isPending}
          error={shortfallQuery.error}
        />
      </div>
    </div>
  )
}

/** A single shimmering placeholder block. Purely decorative — hidden from the
 * accessibility tree; the surrounding region carries the "loading" status. */
/** The army name, editable in place.
 *
 * Inline rather than a modal: renaming is a single field, and a dialog for one
 * text input is more ceremony than the task. Escape cancels and Enter saves, so
 * the keyboard path matches what the shape implies. */
function ArmyName({ army }: { army: Army_Read }) {
  const updateArmy = useUpdateArmy(army.id)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(army.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus explicitly rather than with `autoFocus`. Same reason the dialog's field
  // is focused by Modal's effect: an attribute applied during commit is easy to
  // have silently overridden, and this is also what the a11y rule asks for --
  // focus moved by an action the user took, not stolen on render.
  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function save() {
    // Guarded here rather than only on the Save button: Enter reaches this directly,
    // so three quick presses used to send three PATCHes and raise three toasts.
    // Harmless (the write is idempotent) but noise, and the button already refused.
    if (updateArmy.isPending) return
    const name = draft.trim()
    // An unchanged or empty name is not a request worth making. Note the client is
    // what enforces non-empty: `Army_Update.name` carries no length constraint and
    // `update_army` only rejects an explicit null, so an empty string WOULD be
    // written. Do not rely on a server check that is not there.
    if (!name || name === army.name) return setEditing(false)
    updateArmy.mutate({ name }, { onSuccess: () => setEditing(false) })
  }

  if (!editing) {
    return (
      <div className={styles.nameRow}>
        <h1 className={styles.name}>{army.name}</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(army.name)
            setEditing(true)
          }}
          aria-label={`Rename ${army.name}`}
        >
          Rename
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.nameRow}>
      <Input
        ref={inputRef}
        aria-label="Army name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
      <Button size="sm" onClick={save} disabled={updateArmy.isPending}>
        {updateArmy.isPending ? 'Saving…' : 'Save'}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  )
}

/** Editable quantity for one unit in the army.
 *
 * The debounce, the `min` guard and the reset on a refused write all live in
 * `QuantityInput`, shared with InventoryView's owned quantity -- the two were
 * copies that had already drifted apart. Removal stays the Remove button's job:
 * the backend refuses 0 with `amount: must be >= 1 (use remove_unit to remove)`. */
function UnitAmount({
  armyId,
  unit,
  amount,
}: {
  armyId: UUID
  unit: Unit_Read
  amount: number
}) {
  const setAmount = useSetArmyUnitAmount(armyId)

  return (
    <label className={styles.qty}>
      <span className={styles.srOnly}>Quantity of {unit.unit_name}</span>
      <QuantityInput
        value={amount}
        className={styles.qtyInput}
        label={`Quantity of ${unit.unit_name}`}
        onCommit={(next) => setAmount.mutateAsync({ unitId: unit.id, amount: next })}
      />
    </label>
  )
}

function SkeletonBlock({ className }: { className?: string }) {
  const cls = [styles.skeleton, className].filter(Boolean).join(' ')
  return <span className={cls} aria-hidden="true" />
}

/** Full-page loading placeholder shown while the army query is pending: a
 * skeleton header, a few order-of-battle rows, and quiet panel placeholders.
 * The whole tree is a polite `status` region so assistive tech is told the
 * page is loading rather than reading disjointed placeholder shapes. */
function ArmySkeleton() {
  return (
    <div
      className={styles.view}
      role="status"
      aria-busy="true"
      aria-label="Loading army"
      data-testid="army-skeleton"
    >
      <header className={styles.header}>
        <SkeletonBlock className={styles.skelEyebrow} />
        <SkeletonBlock className={styles.skelName} />
        <SkeletonBlock className={styles.skelMeta} />
        <div className={styles.points}>
          <SkeletonBlock className={styles.skelPointsCount} />
          <SkeletonBlock className={styles.skelBar} />
        </div>
      </header>

      <section className={styles.battle}>
        <div className={styles.battleHead}>
          <SkeletonBlock className={styles.skelSectionTitle} />
        </div>
        <div className={styles.group}>
          <SkeletonBlock className={styles.skelGroupLabel} />
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.row}>
              <SkeletonBlock className={styles.skelUnit} />
              <SkeletonBlock className={styles.skelPoints} />
            </div>
          ))}
        </div>
      </section>

      <div className={styles.panels}>
        <PanelSkeleton titled />
        <PanelSkeleton titled />
      </div>
    </div>
  )
}

/** Quiet pending placeholder for the legality / shortfall panels. `titled`
 * also draws a placeholder for the panel heading (used inside the full-page
 * skeleton, where no real heading is rendered). Decorative; the `label` is
 * exposed to assistive tech so the panel announces what it is checking. */
function PanelSkeleton({ titled = false, label }: { titled?: boolean; label?: string }) {
  return (
    <div className={styles.panelSkeleton} role="status" aria-label={label}>
      {titled && <SkeletonBlock className={styles.skelPanelTitle} />}
      <SkeletonBlock className={styles.skelLineWide} />
      <SkeletonBlock className={styles.skelLine} />
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
        aria-label="Points used against limit"
        aria-valuenow={total}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuetext={`${total} of ${limit} points${over ? ', over limit' : ''}`}
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
  error,
}: {
  data: Validation_Read | undefined
  isPending: boolean
  error: unknown
}) {
  return (
    <section className={styles.panel} aria-labelledby="legality-title">
      <h2 className={styles.panelTitle} id="legality-title">
        Legality
      </h2>
      {isPending ? (
        <PanelSkeleton label="Checking legality" />
      ) : error || !data ? (
        <p className={styles.panelStatus}>{withReference('Validation unavailable', error)}</p>
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
  error,
}: {
  data: Shortfall_Read[] | undefined
  isPending: boolean
  error: unknown
}) {
  const needed = (data ?? []).filter((row) => row.need > 0)

  return (
    <section className={styles.panel} aria-labelledby="what-to-buy-title">
      <h2 className={styles.panelTitle} id="what-to-buy-title">
        What to Buy
      </h2>
      {isPending ? (
        <PanelSkeleton label="Checking your collection" />
      ) : error || !data ? (
        <p className={styles.panelStatus}>{withReference('Shortfall unavailable', error)}</p>
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

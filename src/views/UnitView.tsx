/* UnitView (`/units/:unitId`) — the full unit datasheet.
 *
 * Reads the unit id from the router and loads it with `useUnit`. Renders the
 * design's datasheet: an eyebrow (`faction — role`), the serif unit name, a
 * 6-column profile grid (M / T / Sv / W / Ld / OC), Ranged and Melee weapon
 * tables split by `weapon.category`, an Abilities list, and Keyword chips.
 *
 * Context actions on the right are optional so the view works standalone: pass
 * `addToArmy` when arrived from an army, or `collection` for an editable "in
 * collection" quantity when arrived from inventory; otherwise a read-only owned
 * label (or nothing). See SPEC.md → "UnitView". */

import { useParams } from 'react-router-dom'
import { Button, Eyebrow, Input, Tag } from '../ui'
import { useFactions, useUnit } from '../api/queries'
import { deriveRole } from '../lib/roles'
import type { Ability_Read, Unit_Read, Weapon_Read } from '../api/types'
import styles from './UnitView.module.css'

/** Add-to-army action, shown when the datasheet was opened from an army. */
export interface AddToArmyAction {
  /** Army name for the "+ Add to {army}" label. */
  armyName: string
  onAdd: () => void
  pending?: boolean
}

/** Editable owned-quantity action, shown when opened from the collection. */
export interface CollectionAction {
  amount: number
  onChange: (amount: number) => void
  pending?: boolean
}

export interface UnitViewProps {
  /** Show a "+ Add to {army}" button. */
  addToArmy?: AddToArmyAction
  /** Show an editable "In collection" quantity input. */
  collection?: CollectionAction
  /** Read-only owned label when neither interactive action applies. */
  ownedLabel?: string
}

/** Weapon stats render as "3+", saves as "3+", movement as `6"`. `null` → "—". */
function plus(value: number | null): string {
  return value === null ? '—' : `${value}+`
}

function inches(value: number | null): string {
  return value === null ? 'Melee' : `${value}"`
}

/** Armour piercing is stored as a magnitude; the datasheet shows it signed. */
function ap(value: number): string {
  return value === 0 ? '0' : `-${value}`
}

const PROFILE: ReadonlyArray<{ label: string; get: (u: Unit_Read) => string }> = [
  { label: 'M', get: (u) => `${u.movement}"` },
  { label: 'T', get: (u) => String(u.toughness) },
  { label: 'Sv', get: (u) => plus(u.armor_save) },
  { label: 'W', get: (u) => String(u.wounds) },
  { label: 'Ld', get: (u) => plus(u.leadership) },
  { label: 'OC', get: (u) => String(u.objective_control) },
]

function ProfileGrid({ unit }: { unit: Unit_Read }) {
  return (
    <div className={styles.profile} role="table" aria-label="Profile">
      <div className={styles.profileRow} role="row">
        {PROFILE.map(({ label, get }) => (
          <div
            key={label}
            className={styles.stat}
            role="cell"
            aria-label={`${label} ${get(unit)}`}
          >
            <div className={styles.statLabel} aria-hidden="true">
              {label}
            </div>
            <div className={styles.statValue} aria-hidden="true">
              {get(unit)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WeaponTable({
  title,
  weapons,
  skillLabel,
}: {
  title: string
  weapons: Weapon_Read[]
  /** "BS" for ranged, "WS" for melee. */
  skillLabel: 'BS' | 'WS'
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {/* The table can overflow its container on narrow screens; this wrapper
       * scrolls horizontally on its own so the page body never does. It is
       * focusable so keyboard users can reach and scroll it. */}
      <div
        className={styles.tableScroll}
        tabIndex={0}
        role="group"
        aria-label={`${title} weapons`}
      >
        <table className={styles.table} aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Weapon</th>
              <th scope="col" className={styles.num}>
                Range
              </th>
              <th scope="col" className={styles.num}>
                A
              </th>
              <th scope="col" className={styles.num}>
                {skillLabel}
              </th>
              <th scope="col" className={styles.num}>
                S
              </th>
              <th scope="col" className={styles.num}>
                AP
              </th>
              <th scope="col" className={styles.num}>
                D
              </th>
            </tr>
          </thead>
          <tbody>
          {weapons.length === 0 ? (
            <tr>
              <td className={styles.emptyRow} colSpan={7}>
                No {title.toLowerCase()} weapons.
              </td>
            </tr>
          ) : (
            weapons.map((w) => (
              <tr key={w.id}>
                <td>
                  <div className={styles.wpnName}>{w.name}</div>
                  {w.keywords.length > 0 && (
                    <div className={styles.wpnKeywords}>{w.keywords.join(' · ')}</div>
                  )}
                </td>
                <td className={styles.num}>{inches(w.range_inches)}</td>
                <td className={styles.num}>{w.attacks}</td>
                <td className={styles.num}>{plus(w.weapon_skill)}</td>
                <td className={styles.num}>{w.strength}</td>
                <td className={styles.num}>{ap(w.armor_piercing)}</td>
                <td className={styles.num}>{w.damage}</td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Abilities({ abilities }: { abilities: Ability_Read[] }) {
  if (abilities.length === 0) return null
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Abilities</h2>
      <div>
        {abilities.map((a) => (
          <div key={a.id} className={styles.ability}>
            <div className={styles.abilityName}>{a.name}</div>
            <p className={styles.abilityDesc}>{a.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ContextActions({ addToArmy, collection, ownedLabel }: UnitViewProps) {
  if (addToArmy) {
    return (
      <div className={styles.actions}>
        <span className={styles.actionLabel}>Adding to</span>
        <Button onClick={addToArmy.onAdd} disabled={addToArmy.pending}>
          + Add to {addToArmy.armyName}
        </Button>
      </div>
    )
  }
  if (collection) {
    return (
      <div className={styles.actions}>
        <span className={styles.actionLabel}>In collection</span>
        <div className={styles.qtyRow}>
          <Input
            type="number"
            min={0}
            className={styles.qtyInput}
            aria-label="In collection"
            value={collection.amount}
            disabled={collection.pending}
            onChange={(e) => collection.onChange(Number(e.target.value))}
          />
        </div>
      </div>
    )
  }
  if (ownedLabel) {
    return (
      <div className={styles.actions}>
        <span className={styles.ownedLabel}>{ownedLabel}</span>
      </div>
    )
  }
  return null
}

/** A single shimmering placeholder block. Presentational only. */
function Skel({ className }: { className?: string }) {
  return (
    <span
      className={className ? `${styles.skel} ${className}` : styles.skel}
      aria-hidden="true"
    />
  )
}

/** Placeholder datasheet shown while `useUnit` is pending. Mirrors the real
 * layout (header, 6-stat profile, two weapon tables) so the page does not jump
 * when data arrives. The shimmer is decorative; a single polite status message
 * carries the loading state to assistive tech. */
function DatasheetSkeleton() {
  return (
    <main className={styles.page} aria-busy="true" data-testid="datasheet-skeleton">
      <p role="status" className={styles.srOnly}>
        Loading datasheet…
      </p>

      <header className={styles.head}>
        <div className={styles.skelHead}>
          <Skel className={styles.skelEyebrow} />
          <Skel className={styles.skelName} />
          <Skel className={styles.skelPoints} />
        </div>
      </header>

      <div className={styles.profile} aria-hidden="true">
        <div className={styles.profileRow}>
          {PROFILE.map(({ label }) => (
            <div key={label} className={styles.stat}>
              <Skel className={styles.skelStatLabel} />
              <Skel className={styles.skelStatValue} />
            </div>
          ))}
        </div>
      </div>

      {['Ranged', 'Melee'].map((title) => (
        <section key={title} className={styles.section} aria-hidden="true">
          <Skel className={styles.skelSectionTitle} />
          <div className={styles.skelTable}>
            {[0, 1, 2].map((row) => (
              <div key={row} className={styles.skelRow}>
                <Skel className={styles.skelCellWide} />
                <Skel className={styles.skelCell} />
                <Skel className={styles.skelCell} />
                <Skel className={styles.skelCell} />
                <Skel className={styles.skelCell} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}

export default function UnitView(props: UnitViewProps) {
  const { unitId = '' } = useParams<{ unitId: string }>()
  const { data: unit, isPending, isError } = useUnit(unitId)
  const { data: factions } = useFactions()

  if (isPending) {
    return <DatasheetSkeleton />
  }

  if (isError || !unit) {
    return (
      <main className={styles.page}>
        <p className={styles.placeholder}>This datasheet could not be found.</p>
      </main>
    )
  }

  const role = deriveRole(unit.keywords)
  const factionName = factions?.find((f) => f.id === unit.faction_id)?.name
  const eyebrow = factionName ? `${factionName} — ${role}` : role

  const ranged = unit.weapons.filter((w) => w.category === 'range')
  const melee = unit.weapons.filter((w) => w.category === 'melee')

  return (
    <main className={styles.page}>
      <header className={styles.head}>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className={styles.name}>{unit.unit_name}</h1>
          <div className={styles.points}>{unit.points} pts</div>
        </div>
        <ContextActions {...props} />
      </header>

      <ProfileGrid unit={unit} />

      <WeaponTable title="Ranged" weapons={ranged} skillLabel="BS" />
      <WeaponTable title="Melee" weapons={melee} skillLabel="WS" />

      <Abilities abilities={unit.abilities} />

      {unit.keywords.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Keywords</h2>
          <div className={styles.keywords}>
            {unit.keywords.map((kw) => (
              <Tag key={kw}>{kw}</Tag>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

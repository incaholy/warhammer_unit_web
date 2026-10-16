/* The datacard pieces both Kill Team screens render: the stat line, the weapon
 * table, the ability list, and the reference blocks.
 *
 * A shared module at VIEW level rather than a `src/ui/` primitive, because these are
 * domain shapes and not design-system ones — `src/ui/` holds Button and Field, not a
 * Kill Team weapon table. The house rule is that a feature-specific piece lives in
 * its view; this is the case the rule does not quite cover, where two views in the
 * SAME feature render the same thing. Duplicating a weapon table and its stylesheet
 * between the team page and the roster page is the worse option: the two would drift,
 * and a footnote marker dropped from one would be invisible in the other.
 *
 * `KTOperative_ListRead` is `KTOperative_Read` plus `kill_team_id`, so one set of
 * components serves the catalog listing, the team detail and a roster row.
 *
 * KF4e adds a fourth caller, the battle screen, and it reads from the GAME's snapshot
 * rather than the catalog (#22, #24). Those shapes are strict SUBSETS: a snapshotted
 * weapon has no `id` and no `position`, because a copy taken for one battle needs
 * neither — nothing addresses it and nothing reorders it. So the three components the
 * battle screen shares now declare the fields they actually READ instead of a whole
 * catalog row. That is a widening, so every existing caller still satisfies them.
 *
 * The alternative was a second weapon table for the game screen, which is the exact
 * drift this module's first paragraph exists to prevent -- and the stakes are higher
 * here than on the catalog page, because the game card is the one a player reads
 * mid-activation to check a weapon rule. */

import type { KillTeamRule_Read, KTEquipment_Read, KTPloy_Read } from '../api/types'
import styles from './killTeamCards.module.css'

/* ---- What the shared pieces actually read ----
 *
 * Declared as the minimum rather than as a catalog row, so the game's snapshot
 * satisfies them too.
 *
 * `weapon_rules` is REQUIRED here, which took a correction. `openapi.json` lists it in
 * `required` for `KTWeapon_Read` and not for `KTGameWeapon_Read`, so this first declared
 * it optional and guarded it. But a defaulted RESPONSE field is always present, and
 * `openapi-typescript` emits both as `weapon_rules: string[]` while the generated zod
 * schema requires it in both -- so `undefined` was not expressible, the guard could not
 * run, and no test could cover it. The raw `required` list is the wrong thing to read
 * here; the generated types are what the client is held to. */

/** The four numbers a stat line prints. */
export interface StattedCard {
  apl: number
  move: number
  save: number
  wounds: number
}

/** One row of the weapon table. */
export interface WeaponProfile {
  name: string
  category: string
  range: number
  attacks: number
  hit: number
  normal_damage: number
  crit_damage: number
  weapon_rules: string[]
}

/** One entry in the ability list. */
export interface AbilityEntry {
  name: string
  description: string
}

export function StatLine({ operative }: { operative: StattedCard }) {
  return (
    <dl className={styles.stats}>
      <Stat label="APL" value={operative.apl} />
      <Stat label="Move" value={`${operative.move}"`} />
      <Stat label="Save" value={`${operative.save}+`} />
      <Stat label="Wounds" value={operative.wounds} />
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  )
}

export function Weapons({ weapons }: { weapons: WeaponProfile[] }) {
  return (
    <table className={styles.weapons}>
      <thead>
        <tr>
          <th scope="col">Weapon</th>
          <th scope="col">A</th>
          <th scope="col">Hit</th>
          <th scope="col">Dmg</th>
          <th scope="col">Rules</th>
        </tr>
      </thead>
      <tbody>
        {/* Keyed by name and index, not by `id`: a snapshotted weapon has none. Safe
          * because these lists are static for the card's life -- nothing filters,
          * reorders or inserts -- and the index alone would be less readable in
          * devtools. Two profiles CAN share a name, which is why the index is in it. */}
        {weapons.map((weapon, index) => (
          <tr key={`${weapon.name}-${index}`}>
            <th scope="row" className={styles.weaponName}>
              {weapon.name}
              <span className={styles.weaponCategory}>
                {weapon.category === 'melee' ? 'melee' : `${weapon.range}"`}
              </span>
            </th>
            <td>{weapon.attacks}</td>
            <td>{weapon.hit}+</td>
            <td>
              {weapon.normal_damage}/{weapon.crit_damage}
            </td>
            <td className={styles.weaponRules}>
              {/* Printed verbatim, footnote markers included: `Torrent 0"` and
                * `Torrent 0"*` are different printed strings, and #56 leaves it to
                * the frontend whether they are one chip or two. One per string is
                * the honest rendering — collapsing them would drop the marker. */}
              {weapon.weapon_rules.length > 0 ? weapon.weapon_rules.join(', ') : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Abilities({ abilities }: { abilities: AbilityEntry[] }) {
  return (
    <dl className={styles.entries}>
      {abilities.map((ability, index) => (
        <div key={`${ability.name}-${index}`} className={styles.entry}>
          <dt className={styles.entryName}>{ability.name}</dt>
          <dd className={styles.entryText}>{ability.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Keywords({ keywords }: { keywords: string[] }) {
  if (keywords.length === 0) return null
  return <p className={styles.keywords}>{keywords.join(' · ')}</p>
}

export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{title}</h2>
      {children}
    </section>
  )
}

export function Rules({ rules }: { rules: KillTeamRule_Read[] }) {
  if (rules.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <dl className={styles.entries}>
      {rules.map((rule) => (
        <div key={rule.id} className={styles.entry}>
          <dt className={styles.entryName}>
            {rule.name}
            {/* A rule's group is printed beside it when it has one. */}
            {rule.group && <span className={styles.aside}>{rule.group}</span>}
          </dt>
          <dd className={styles.entryText}>{rule.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Ploys({ ploys }: { ploys: KTPloy_Read[] }) {
  if (ploys.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <dl className={styles.entries}>
      {ploys.map((ploy) => (
        <div key={ploy.id} className={styles.entry}>
          <dt className={styles.entryName}>
            {ploy.name}
            <span className={styles.aside}>
              {ploy.kind} · {ploy.cp_cost} CP
            </span>
          </dt>
          <dd className={styles.entryText}>{ploy.description}</dd>
        </div>
      ))}
    </dl>
  )
}

export function EquipmentList({ items }: { items: KTEquipment_Read[] }) {
  if (items.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <dl className={styles.entries}>
      {items.map((item) => (
        <div key={item.id} className={styles.entry}>
          <dt className={styles.entryName}>{item.name}</dt>
          <dd className={styles.entryText}>{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The team's reference, plus the rows no team owns.
 *
 * Shared because the team page and the roster page show the same thing from two
 * different reads: the catalog's `KillTeam_Detail` plus `/universal`, and the
 * roster's own read, which carries both lists already (#52). */
export function Reference({
  rules,
  ploys,
  equipment,
  universalPloys,
  universalEquipment,
}: {
  rules: KillTeamRule_Read[]
  ploys: KTPloy_Read[]
  equipment: KTEquipment_Read[]
  universalPloys?: KTPloy_Read[]
  universalEquipment?: KTEquipment_Read[]
}) {
  return (
    <div className={styles.reference}>
      <Block title="Team rules">
        <Rules rules={rules} />
      </Block>

      <Block title="Ploys">
        <Ploys ploys={ploys} />
        {universalPloys && universalPloys.length > 0 && (
          <>
            <p className={styles.subhead}>Universal — every team may use these</p>
            <Ploys ploys={universalPloys} />
          </>
        )}
      </Block>

      <Block title="Equipment">
        <EquipmentList items={equipment} />
        {universalEquipment && universalEquipment.length > 0 && (
          <>
            <p className={styles.subhead}>Universal</p>
            <EquipmentList items={universalEquipment} />
          </>
        )}
      </Block>
    </div>
  )
}

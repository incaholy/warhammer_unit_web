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
 * components serves the catalog listing, the team detail and a roster row. */

import type {
  KillTeamRule_Read,
  KTAbility_Read,
  KTEquipment_Read,
  KTOperative_Read,
  KTPloy_Read,
  KTWeapon_Read,
} from '../api/types'
import styles from './killTeamCards.module.css'

export function StatLine({ operative }: { operative: KTOperative_Read }) {
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

export function Weapons({ weapons }: { weapons: KTWeapon_Read[] }) {
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
        {weapons.map((weapon) => (
          <tr key={weapon.id}>
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

export function Abilities({ abilities }: { abilities: KTAbility_Read[] }) {
  return (
    <dl className={styles.entries}>
      {abilities.map((ability) => (
        <div key={ability.id} className={styles.entry}>
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

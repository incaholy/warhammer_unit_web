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

import type { KTEquipment_Read, KTSelectionRule_Read } from '../api/types'
import { Fragment } from 'react'
import { PLOY_KINDS, ployKindLabel } from '../lib/killTeamGame'
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

/** One entry in the team-rules list (KF5). */
export interface RuleEntry {
  name: string
  description: string
  group?: string | null
}

/** One entry in the ploy list (KF5). */
export interface PloyEntry {
  name: string
  kind: string
  cp_cost: number
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

export function Rules({ rules }: { rules: RuleEntry[] }) {
  if (rules.length === 0) return <p className={styles.quiet}>None printed.</p>

  // Grouped under a heading where a group exists, flat where it does not -- and the
  // second case is the common one. Measured over the real scrape: 30 of 127 team rules
  // carry a group, and they belong to 6 of the 48 teams (three Aspect Techniques sets and
  // three Upgrade sets, five rules each). A median team has TWO rules, and grouping two
  // things is noise. So this is a real improvement for six teams and invisible for the
  // other forty-two, which is the opposite of how it was first planned.
  const ungrouped = rules.filter((rule) => !rule.group)
  const groups = new Map<string, RuleEntry[]>()
  for (const rule of rules) {
    if (!rule.group) continue
    const existing = groups.get(rule.group)
    if (existing) existing.push(rule)
    else groups.set(rule.group, [rule])
  }

  return (
    <>
      {ungrouped.length > 0 && (
        <ul className={styles.entries}>
          {/* Keyed by name and index, not `id`: a game's snapshotted rule has none. Same
            * reason the weapon table is (KF4e), and safe for the same reason -- these
            * lists are static for the read's life. */}
          {ungrouped.map((rule, index) => (
            <Disclosure
              key={`${rule.name}-${index}`}
              name={rule.name}
              text={rule.description}
            />
          ))}
        </ul>
      )}

      {[...groups].map(([group, members]) => (
        <section key={group}>
          <p className={styles.subhead}>{group}</p>
          <ul className={styles.entries}>
            {members.map((rule, index) => (
              <Disclosure
                key={`${rule.name}-${index}`}
                name={rule.name}
                text={rule.description}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

export function Ploys({ ploys, showKind = true }: { ploys: PloyEntry[]; showKind?: boolean }) {
  if (ploys.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <ul className={styles.entries}>
      {ploys.map((ploy, index) => (
        <Disclosure
          key={`${ploy.name}-${index}`}
          name={ploy.name}
          // The kind is dropped when the list is already grouped by it: repeating it on
          // every row would say the subhead again, once per ploy.
          aside={showKind ? `${ploy.kind} · ${ploy.cp_cost} CP` : `${ploy.cp_cost} CP`}
          text={ploy.description}
        />
      ))}
    </ul>
  )
}

/** The same ploys, split into the two kinds (KF11).
 *
 *  Shared by the battle screen's Reference tab and the team page, which had the same flat
 *  list and the same reason to stop having one: every one of the 48 kill teams carries
 *  exactly four strategy and four firefight ploys, so the split is even and universal
 *  rather than ragged — the opposite of what KF7 group B measured about team RULES, where
 *  30 of 127 carried a group across 6 of 48 teams and grouping was dropped as noise.
 *
 *  A kind with nothing in it prints no heading, so the one team whose scrape is
 *  incomplete does not get an empty section. */
export function PloysByKind({ ploys }: { ploys: PloyEntry[] }) {
  if (ploys.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <>
      {PLOY_KINDS.map((kind) => {
        const forKind = ploys.filter((ploy) => ploy.kind === kind)
        if (forKind.length === 0) return null
        return (
          <Fragment key={kind}>
            <p className={styles.subhead}>{ployKindLabel(kind)}s</p>
            <Ploys ploys={forKind} showKind={false} />
          </Fragment>
        )
      })}
    </>
  )
}

/** One collapsible reference entry: a line you can scan, prose you can open (KF7 group B).
 *
 * Collapsed per ENTRY rather than per block, which is the level that matters. A single
 * `<details>` around "Ploys" still opens nine paragraphs at once, and nine is what every
 * team has; the complaint was that remembering one rule leaves it in the way of the next.
 *
 * The numbers that decided this, measured over the real scrape: every team has exactly 8
 * ploys and 4 pieces of equipment, and a RULE's prose runs to a median of 470 characters
 * against a ploy's 282 — so the rules are the densest text on the tab even though a median
 * team has only two of them. Volume per entry, not count, is the reading problem.
 *
 * The same pattern the datacard has used since KF4e, one level further in.
 *
 * A `<ul>` of `<details>` rather than the `<dl>` these lists used to be: `<details>` is not
 * valid inside a `<dl>`, and list semantics give a reader a count before they open
 * anything. */
function Disclosure({ name, aside, text }: { name: string; aside?: string | null; text: string }) {
  return (
    <li className={styles.entryItem}>
      <details>
        <summary className={styles.entrySummary}>
          <span className={styles.entryName}>{name}</span>
          {aside && <span className={styles.aside}>{aside}</span>}
        </summary>
        <p className={styles.entryText}>{text}</p>
      </details>
    </li>
  )
}

/** One name-and-prose entry, with an optional note beside the name. */
export interface Entry {
  name: string
  text: string
  aside?: string | null
}

/** The name-and-prose list the reference blocks are built from (KF5).
 *
 * Exported so a caller with a shape none of the three typed lists fit can still render
 * into the same styling rather than copying four class names into its own stylesheet.
 * The battle screen's TAKEN equipment is that caller: its prose field is `text` where the
 * catalog's is `description`, and it carries `revealed`, which no catalog row has. */
export function Entries({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className={styles.quiet}>None.</p>
  return (
    <ul className={styles.entries}>
      {entries.map((entry, index) => (
        <Disclosure
          key={`${entry.name}-${index}`}
          name={entry.name}
          aside={entry.aside}
          text={entry.text}
        />
      ))}
    </ul>
  )
}

/** Catalog equipment only, and the ONE reference component that does not widen (KF5).
 *
 * `Rules` and `Ploys` take the fields they read, so a game's snapshotted rows satisfy
 * them -- those are subsets, missing only `id` and `position`. A snapshotted piece of
 * equipment is NOT a subset: the catalog calls the prose `description` and the game
 * calls it `text`, and the game row adds `revealed` and `equipment_id`. A rename is not
 * a narrowing, so the battle screen renders its taken pieces itself rather than this
 * being widened into something that takes either name. */
export function EquipmentList({ items }: { items: KTEquipment_Read[] }) {
  if (items.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <ul className={styles.entries}>
      {items.map((item) => (
        <Disclosure key={item.id} name={item.name} text={item.description} />
      ))}
    </ul>
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
  rules: RuleEntry[]
  ploys: PloyEntry[]
  equipment: KTEquipment_Read[]
  universalPloys?: PloyEntry[]
  universalEquipment?: KTEquipment_Read[]
}) {
  return (
    <div className={styles.reference}>
      <Block title="Team rules">
        <Rules rules={rules} />
      </Block>

      <Block title="Ploys">
        <PloysByKind ploys={ploys} />
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

/** A kill team's printed composition — what a legal team may field (#44, #47).
 *
 * Promoted out of `KillTeamView` (KF7 group C) now the roster page is a second caller,
 * which is the move `Tabs` and this module itself both made at the same point.
 *
 * **Indentation IS the information**, which a re-measure of the scrape settled. `kind`
 * has four values and only one of them is structural, so an earlier plan built on
 * `heading` rows — and there are **6 heading rows in the whole catalog, all in one team
 * of 48**. `depth` is the real shape: 204 rows at depth 0, 549 at 1, 144 at 2, with only
 * 2 of the 48 teams flat. Depth 0 is a requirement ("1 INTERROGATOR operative", "5
 * operatives selected from the following list:") and depth 1 the options under it.
 *
 * So nothing is derived and nothing is collapsed per row. #44's own stance is that
 * composition is text, "the page's own words in the page's own order", and a rendering
 * that keyed off a kind the pages mostly do not print would be deriving structure that
 * decision refused to derive. The rows are short — a median of 25 characters — so a
 * median team's 18 of them simply fit.
 *
 * `restriction` and `note` are styled apart from `line` because they are not options a
 * player can take: "still counts as one selection" is a condition on the list above it. */
export function Composition({ rules }: { rules: KTSelectionRule_Read[] }) {
  if (rules.length === 0) return <p className={styles.quiet}>No composition printed.</p>
  return (
    <ul className={styles.composition}>
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={[styles.compRow, styles[`comp_${rule.kind}`]].filter(Boolean).join(' ')}
          // Indent from `depth`, which is the only thing that restores the printed
          // shape. Inline because the depth is data, not one of a fixed set.
          style={{ paddingLeft: `${rule.depth * 22}px` }}
        >
          {rule.text}
        </li>
      ))}
    </ul>
  )
}

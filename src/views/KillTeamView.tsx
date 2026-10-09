/* KillTeamView (`/kill-team/teams/:killTeamId`) — one kill team, whole. See
 * ROADMAP.md → KF2, and KILLTEAM.md decisions #25, #44, #45, #30, #46, #47, #56.
 *
 * PUBLIC, like the rest of the catalog. One request: `KillTeam_Detail` nests the
 * datacards, rules, ploys, equipment AND the composition (#47), so the tabs below
 * cost no further reads. The universal ploys and equipment are the one extra call,
 * fetched once and kept for the session (#48).
 *
 * NOTHING here sorts. Every child of a team carries `position` and is read in that
 * order (#25): the page prints the leader first in 46 of 48 teams, Strategy ploys
 * before Firefight, and a rule beside the rule that refers to it. Alphabetical would
 * be wrong three different ways, and a weapon that appears as both a ranged and a
 * melee profile would be split.
 *
 * Tab semantics rather than the house's `SegmentedToggle`, which is a toggle group
 * (`role="group"` + `aria-pressed`) and right for a display mode like List/Grid.
 * These panels hold genuinely different content, so they are a `tablist` with
 * associated `tabpanel`s — `eslint.config.js` already allows `tabIndex` on a
 * tabpanel, which is where that expectation came from. Kept local to this view per
 * the house rule that only a genuinely cross-feature piece is promoted to `src/ui/`;
 * KF4's game screen needs a team tab too, and that is when to promote it. */

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useKillTeam, useKTFactions, useUniversal } from '../api/killTeamQueries'
import { ApiError } from '../api/client'
import type {
  KillTeamRule_Read,
  KTAbility_Read,
  KTEquipment_Read,
  KTOperative_Read,
  KTPloy_Read,
  KTSelectionRule_Read,
  KTWeapon_Read,
} from '../api/types'
import { withReference } from '../lib/errors'
import { Eyebrow, Tag } from '../ui'
import styles from './KillTeamView.module.css'

type TabId = 'datacards' | 'composition' | 'reference'

const TABS: { id: TabId; label: string }[] = [
  { id: 'datacards', label: 'Datacards' },
  { id: 'composition', label: 'Composition' },
  { id: 'reference', label: 'Rules & Ploys' },
]

export default function KillTeamView() {
  const { killTeamId = '' } = useParams()
  const [tab, setTab] = useState<TabId>('datacards')

  const teamQuery = useKillTeam(killTeamId)
  const factionsQuery = useKTFactions()
  const universalQuery = useUniversal()

  // `KillTeam_Detail` names its faction by id and never by a copy of the name (#46).
  const factionName = useMemo(() => {
    const id = teamQuery.data?.faction_id
    if (!id) return undefined
    return factionsQuery.data?.items.find((faction) => faction.id === id)?.name
  }, [teamQuery.data, factionsQuery.data])

  if (teamQuery.isPending) {
    return (
      <section className={styles.view}>
        <div role="status" aria-label="Loading kill team">
          <span className={styles.srOnly}>Loading kill team…</span>
          <div aria-hidden="true">
            <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
            <span className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
            <span className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
          </div>
        </div>
      </section>
    )
  }

  if (teamQuery.isError || !teamQuery.data) {
    // A withdrawn team reads as missing (#55), and so does a bad id — the same 404,
    // which is the point: the catalog does not say which.
    const missing = teamQuery.error instanceof ApiError && teamQuery.error.code === 'NOT_FOUND'
    return (
      <section className={styles.view}>
        <p role="alert" className={styles.error}>
          {missing
            ? 'That kill team is not in the catalog.'
            : withReference("Couldn't load this kill team.", teamQuery.error)}
        </p>
        <Link to="/kill-team" className={styles.back}>
          ← All kill teams
        </Link>
      </section>
    )
  }

  const team = teamQuery.data

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <Eyebrow>{factionName ?? 'Kill Team'}</Eyebrow>
        <h1 className={styles.title}>{team.name}</h1>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Team sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            className={[styles.tab, tab === id ? styles.tabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'datacards' && (
        <div role="tabpanel" id="panel-datacards" aria-labelledby="tab-datacards">
          <Datacards operatives={team.operatives} />
        </div>
      )}

      {tab === 'composition' && (
        <div role="tabpanel" id="panel-composition" aria-labelledby="tab-composition">
          <Composition rules={team.selection_rules} />
        </div>
      )}

      {tab === 'reference' && (
        <div role="tabpanel" id="panel-reference" aria-labelledby="tab-reference">
          <Reference
            rules={team.rules}
            ploys={team.ploys}
            equipment={team.equipment}
            universalPloys={universalQuery.data?.ploys}
            universalEquipment={universalQuery.data?.equipment}
          />
        </div>
      )}
    </section>
  )
}

function Datacards({ operatives }: { operatives: KTOperative_Read[] }) {
  if (operatives.length === 0) return <p className={styles.quiet}>No datacards.</p>
  return (
    <ul className={styles.cards}>
      {operatives.map((operative) => (
        <li key={operative.id} className={styles.card}>
          <div className={styles.cardHead}>
            <h2 className={styles.cardName}>{operative.name}</h2>
            {/* `in_battle` means the model is granted during a game rather than
              * rostered (#20). Shown as a marker, never as a refusal (#51). */}
            {operative.availability === 'in_battle' && <Tag>In battle only</Tag>}
          </div>

          <dl className={styles.stats}>
            <Stat label="APL" value={operative.apl} />
            <Stat label="Move" value={`${operative.move}"`} />
            <Stat label="Save" value={`${operative.save}+`} />
            <Stat label="Wounds" value={operative.wounds} />
          </dl>

          {operative.weapons.length > 0 && <Weapons weapons={operative.weapons} />}
          {operative.abilities.length > 0 && <Abilities abilities={operative.abilities} />}

          {operative.keywords.length > 0 && (
            <p className={styles.keywords}>{operative.keywords.join(' · ')}</p>
          )}
        </li>
      ))}
    </ul>
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

function Weapons({ weapons }: { weapons: KTWeapon_Read[] }) {
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
                * `Torrent 0"*` are different printed strings and #56 leaves it to the
                * frontend whether they are one chip or two. One chip per string is
                * the honest rendering -- collapsing them would drop the marker. */}
              {weapon.weapon_rules.length > 0 ? weapon.weapon_rules.join(', ') : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Abilities({ abilities }: { abilities: KTAbility_Read[] }) {
  return (
    <dl className={styles.abilities}>
      {abilities.map((ability) => (
        <div key={ability.id} className={styles.ability}>
          <dt className={styles.abilityName}>{ability.name}</dt>
          <dd className={styles.abilityText}>{ability.description}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The composition, as the page prints it.
 *
 * One row per `{position, depth, kind, text}` (#44, #45): read in `position` order,
 * indented by `depth`, and the section is back. Nothing is derived — no budget, no
 * model count, no caps, and no entry resolved to a datacard, because composition is
 * DESCRIPTION and the app never decides legality (#28).
 *
 * A footnote's body is its own `kind = 'note'` row rather than text appended to the
 * bullet above it (#30), so notes render as rows. */
function Composition({ rules }: { rules: KTSelectionRule_Read[] }) {
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

function Reference({
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
        {rules.length === 0 ? (
          <p className={styles.quiet}>None printed.</p>
        ) : (
          <dl className={styles.abilities}>
            {rules.map((rule) => (
              <div key={rule.id} className={styles.ability}>
                <dt className={styles.abilityName}>
                  {rule.name}
                  {/* A rule's group is printed beside it when it has one. */}
                  {rule.group && <span className={styles.group}>{rule.group}</span>}
                </dt>
                <dd className={styles.abilityText}>{rule.description}</dd>
              </div>
            ))}
          </dl>
        )}
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

function Ploys({ ploys }: { ploys: KTPloy_Read[] }) {
  if (ploys.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <dl className={styles.abilities}>
      {ploys.map((ploy) => (
        <div key={ploy.id} className={styles.ability}>
          <dt className={styles.abilityName}>
            {ploy.name}
            <span className={styles.ployMeta}>
              {ploy.kind} · {ploy.cp_cost} CP
            </span>
          </dt>
          <dd className={styles.abilityText}>{ploy.description}</dd>
        </div>
      ))}
    </dl>
  )
}

function EquipmentList({ items }: { items: KTEquipment_Read[] }) {
  if (items.length === 0) return <p className={styles.quiet}>None printed.</p>
  return (
    <dl className={styles.abilities}>
      {items.map((item) => (
        <div key={item.id} className={styles.ability}>
          <dt className={styles.abilityName}>{item.name}</dt>
          <dd className={styles.abilityText}>{item.description}</dd>
        </div>
      ))}
    </dl>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>{title}</h2>
      {children}
    </section>
  )
}

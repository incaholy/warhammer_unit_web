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
 * The tabs come from `src/ui/Tabs`, promoted out of this file in KF3 when the roster
 * screen became the second caller. Real tab semantics rather than
 * `SegmentedToggle`, and the reasoning lives there now. */

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useKillTeam, useKTFactions, useUniversal } from '../api/killTeamQueries'
import { ApiError } from '../api/client'
import type { KTOperative_Read } from '../api/types'
import { withReference } from '../lib/errors'
import { Eyebrow, TabPanel, Tabs, Tag, type Tab } from '../ui'
import { Abilities, Composition, Keywords, Reference, StatLine, Weapons } from './killTeamCards'
import cards from './killTeamCards.module.css'
import styles from './KillTeamView.module.css'

type TabId = 'datacards' | 'composition' | 'reference'

const TABS: Tab<TabId>[] = [
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

      <Tabs tabs={TABS} value={tab} onChange={setTab} aria-label="Team sections" idPrefix="team" />

      {tab === 'datacards' && (
        <TabPanel id="datacards" idPrefix="team">
          <Datacards operatives={team.operatives} />
        </TabPanel>
      )}

      {tab === 'composition' && (
        <TabPanel id="composition" idPrefix="team">
          <Composition rules={team.selection_rules} />
        </TabPanel>
      )}

      {tab === 'reference' && (
        <TabPanel id="reference" idPrefix="team">
          <Reference
            rules={team.rules}
            ploys={team.ploys}
            equipment={team.equipment}
            universalPloys={universalQuery.data?.ploys}
            universalEquipment={universalQuery.data?.equipment}
          />
        </TabPanel>
      )}
    </section>
  )
}

function Datacards({ operatives }: { operatives: KTOperative_Read[] }) {
  if (operatives.length === 0) return <p className={styles.quiet}>No datacards.</p>
  return (
    <ul className={cards.cards}>
      {operatives.map((operative) => (
        <li key={operative.id} className={cards.card}>
          <div className={cards.cardHead}>
            <h2 className={cards.cardName}>{operative.name}</h2>
            {/* `in_battle` means the model is granted during a game rather than
              * rostered (#20). Shown as a marker, never as a refusal (#51). */}
            {operative.availability === 'in_battle' && <Tag>In battle only</Tag>}
          </div>

          <StatLine operative={operative} />
          {operative.weapons.length > 0 && <Weapons weapons={operative.weapons} />}
          {operative.abilities.length > 0 && <Abilities abilities={operative.abilities} />}
          <Keywords keywords={operative.keywords} />
        </li>
      ))}
    </ul>
  )
}


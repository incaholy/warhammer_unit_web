/* KillTeamRosterView (`/kill-team/rosters/:rosterId`) — one roster, read-only for
 * now; the writes arrive in the next commit. See ROADMAP.md → KF3, and KILLTEAM.md
 * #50, #52, #53.
 *
 * AUTHENTICATED. Another player's roster is a 404 rather than a 403, so an id
 * reveals nothing about whether it exists.
 *
 * ONE request for the whole screen. `KTRoster_Read` carries the rows with their
 * datacards, the team's rules, ploys and equipment, and BOTH universal lists (#52) —
 * so the Reference tab costs nothing extra and no catalog call is made. The same
 * property the team page has, from a different read.
 *
 * Two rows can hold the same datacard (#50), so a row is identified by its own id
 * and labelled by its position rather than by its name — "which of my two Warriors"
 * is a question the screen has to be able to answer. */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useRoster } from '../api/killTeamQueries'
import { ApiError } from '../api/client'
import type { KTRosterOperative_Read } from '../api/types'
import { withReference } from '../lib/errors'
import { pluralize } from '../lib/format'
import { Eyebrow, TabPanel, Tabs, Tag, type Tab } from '../ui'
import { Abilities, Keywords, Reference, StatLine, Weapons } from './killTeamCards'
import styles from './KillTeamRosterView.module.css'

type TabId = 'operatives' | 'reference'

const TABS: Tab<TabId>[] = [
  { id: 'operatives', label: 'Operatives' },
  { id: 'reference', label: 'Reference' },
]

export default function KillTeamRosterView() {
  const { rosterId = '' } = useParams()
  const [tab, setTab] = useState<TabId>('operatives')
  const rosterQuery = useRoster(rosterId)

  if (rosterQuery.isPending) {
    return (
      <section className={styles.view}>
        <div role="status" aria-label="Loading roster">
          <span className={styles.srOnly}>Loading roster…</span>
          <div aria-hidden="true">
            <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
            <span className={`${styles.skeletonBlock} ${styles.skeletonLine}`} />
          </div>
        </div>
      </section>
    )
  }

  if (rosterQuery.isError || !rosterQuery.data) {
    const missing = rosterQuery.error instanceof ApiError && rosterQuery.error.code === 'NOT_FOUND'
    return (
      <section className={styles.view}>
        <p role="alert" className={styles.error}>
          {missing
            ? 'That roster does not exist.'
            : withReference("Couldn't load this roster.", rosterQuery.error)}
        </p>
        <Link to="/kill-team/rosters" className={styles.back}>
          ← Your rosters
        </Link>
      </section>
    )
  }

  const roster = rosterQuery.data

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <Eyebrow>
          {roster.kill_team_name} · {roster.faction_name}
        </Eyebrow>
        <h1 className={styles.title}>{roster.name}</h1>
        {roster.description && <p className={styles.desc}>{roster.description}</p>}
        <p className={styles.meta}>
          {pluralize(roster.operatives.length, 'operative')} ·{' '}
          <Link to={`/kill-team/teams/${roster.kill_team_id}`} className={styles.teamLink}>
            View the kill team
          </Link>
        </p>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} aria-label="Roster sections" idPrefix="roster" />

      {tab === 'operatives' && (
        <TabPanel id="operatives" idPrefix="roster">
          <Operatives rows={roster.operatives} />
        </TabPanel>
      )}

      {tab === 'reference' && (
        <TabPanel id="reference" idPrefix="roster">
          {/* Straight from the roster read — #52 puts both universal lists in it, so
            * unlike the team page this needs no second request. */}
          <Reference
            rules={roster.rules}
            ploys={roster.ploys}
            equipment={roster.equipment}
            universalPloys={roster.universal_ploys}
            universalEquipment={roster.universal_equipment}
          />
        </TabPanel>
      )}
    </section>
  )
}

function Operatives({ rows }: { rows: KTRosterOperative_Read[] }) {
  if (rows.length === 0) {
    return <p className={styles.quiet}>No operatives yet.</p>
  }
  return (
    <ol className={styles.rows}>
      {rows.map((row, index) => (
        <li key={row.id} className={styles.row}>
          <div className={styles.rowHead}>
            {/* The ORDINAL, not `row.position`. Position is a sort hint that is
              * neither contiguous nor distinct (#53) — showing it raw would print
              * "1, 2, 2" after a move. The place in the list is what a player means
              * by "third". */}
            <span className={styles.ordinal} data-testid="row-ordinal">
              {index + 1}
            </span>
            <h2 className={styles.rowName}>{row.operative.name}</h2>
            {row.operative.availability === 'in_battle' && <Tag>In battle only</Tag>}
          </div>

          <StatLine operative={row.operative} />

          {/* Collapsed by default: a roster of ten would be unreadable with every
            * weapon table open, and a player building one is comparing names and
            * stat lines. `<details>` rather than a toggle, so it works without
            * JavaScript and is keyboard-reachable for free. */}
          {(row.operative.weapons.length > 0 || row.operative.abilities.length > 0) && (
            <details className={styles.profile}>
              <summary className={styles.summary}>Datacard</summary>
              {row.operative.weapons.length > 0 && <Weapons weapons={row.operative.weapons} />}
              {row.operative.abilities.length > 0 && (
                <Abilities abilities={row.operative.abilities} />
              )}
              <Keywords keywords={row.operative.keywords} />
            </details>
          )}
        </li>
      ))}
    </ol>
  )
}

/* KillTeamRostersView (`/kill-team/rosters`) — the player's own rosters. See
 * ROADMAP.md → KF3, and KILLTEAM.md #50, #52.
 *
 * AUTHENTICATED, unlike the catalog beside it: a roster is user-owned, so this sits
 * inside `RequireAuth` and another player's roster is a 404 rather than a 403.
 *
 * Fetched whole rather than paged — a player has a handful, and the count in the
 * header is a fact about all of them. No pager, and no `Select`: the list row
 * already carries `kill_team_name` and `faction_name` (unlike the catalog's team
 * row, which carries only `faction_id`), so nothing is resolved here. */

import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useRosters } from '../api/killTeamQueries'
import { withReference } from '../lib/errors'
import { formatCreatedLabel, pluralize } from '../lib/format'
import { Button, EmptyState, Eyebrow } from '../ui'
import { NewRosterModal } from './NewRosterModal'
import styles from './KillTeamRostersView.module.css'

export default function KillTeamRostersView() {
  const [creating, setCreating] = useState(false)
  const rostersQuery = useRosters()

  const rosters = rostersQuery.data?.items ?? []
  const total = rostersQuery.data?.total ?? 0

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <div>
          <Eyebrow>Kill Team 2024</Eyebrow>
          <h1 className={styles.title}>Your rosters</h1>
          {/* `total` rather than `rosters.length`: the count states a fact about all of
          * them, so it comes from the server's count. The two agree here because
          * `useRosters` fetches the collection whole and `fetchAllPages` throws
          * rather than returning a short list — the same reasoning `InventoryView`
          * records. So this is not a difference a test can show, and it is written
          * down instead. */}
        {total > 0 && <p className={styles.meta}>{pluralize(total, 'roster')}</p>}
        </div>
        <Button onClick={() => setCreating(true)}>+ New Roster</Button>
      </header>

      {rostersQuery.isPending ? (
        <div role="status" aria-label="Loading rosters" className={styles.skeleton}>
          <span className={styles.srOnly}>Loading rosters…</span>
          <ul className={styles.rows} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className={styles.skeletonRow}>
                <span className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
                <span className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : rostersQuery.isError ? (
        <p role="alert" className={styles.error}>
          {withReference("Couldn't load your rosters.", rostersQuery.error)}
        </p>
      ) : rosters.length === 0 ? (
        <EmptyState
          message="No rosters yet."
          sub="Pick a kill team and name a roster to start one."
        >
          <Button onClick={() => setCreating(true)}>+ New Roster</Button>
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {rosters.map((roster) => (
            <li key={roster.id} className={styles.row}>
              <Link to={`/kill-team/rosters/${roster.id}`} className={styles.rowLink}>
                <span className={styles.rosterName}>{roster.name}</span>
                <span className={styles.meta}>
                  {roster.kill_team_name} · {roster.faction_name} ·{' '}
                  {formatCreatedLabel(roster.created_at)}
                </span>
                {roster.description && <span className={styles.desc}>{roster.description}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewRosterModal open={creating} onClose={() => setCreating(false)} />
    </section>
  )
}

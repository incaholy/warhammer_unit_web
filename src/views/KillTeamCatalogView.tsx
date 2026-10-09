/* KillTeamCatalogView (`/kill-team`) — the kill teams you can browse without an
 * account. See ROADMAP.md → KF2, and KILLTEAM.md decisions #11, #12, #46, #55.
 *
 * PUBLIC. All six catalog reads need no token, so this view renders for a visitor
 * with no session — which is why it sits outside `RequireAuth` in the route table
 * and why nothing here reads `useAuth`.
 *
 * Read-only. The catalog has no write routes (#21), so there is no "+ Add" here the
 * way the 40k catalog has one; a team links to its own page and that is all. */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useKillTeams, useKTFactions } from '../api/killTeamQueries'
import type { UUID } from '../api/types'
import { withReference } from '../lib/errors'
import { pluralize } from '../lib/format'
import { Button, EmptyState, Eyebrow, Select } from '../ui'
import styles from './KillTeamCatalogView.module.css'

const PAGE_SIZE = 25
const ALL_FACTIONS = 'all'

export default function KillTeamCatalogView() {
  const [factionId, setFactionId] = useState<UUID | typeof ALL_FACTIONS>(ALL_FACTIONS)
  const [offset, setOffset] = useState(0)

  const factionsQuery = useKTFactions()
  const teamsQuery = useKillTeams({
    ...(factionId === ALL_FACTIONS ? {} : { faction_id: factionId }),
    limit: PAGE_SIZE,
    offset,
  })

  // A team row carries `faction_id` and never a copy of the faction's name (#46),
  // so the name is resolved here -- the same move `CatalogView` makes against
  // `/factions`. `useKTFactions` fetches the whole list for exactly this reason: a
  // partial list would leave some rows labelled "Unknown" rather than wrong, which
  // is harder to notice.
  const factionNames = useMemo(() => {
    const map = new Map<UUID, string>()
    for (const faction of factionsQuery.data?.items ?? []) map.set(faction.id, faction.name)
    return map
  }, [factionsQuery.data])

  // Filtered rather than grouped. #12 says the frontend MAY group the team list by
  // faction, but the list is paged, so a group heading would split across a page
  // boundary and read as two different factions of the same name. A filter gives the
  // same answer -- "show me the Tyranids teams" -- without that.
  const factionOptions = useMemo(
    () => [
      { value: ALL_FACTIONS, label: 'All factions' },
      ...(factionsQuery.data?.items ?? []).map((faction) => ({
        value: faction.id,
        label: faction.name,
      })),
    ],
    [factionsQuery.data],
  )

  const teams = teamsQuery.data?.items ?? []
  const total = teamsQuery.data?.total ?? 0
  const canPrev = offset > 0
  const canNext = offset + PAGE_SIZE < total

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <Eyebrow>Kill Team</Eyebrow>
        <h1 className={styles.title}>Kill teams</h1>
        <p className={styles.lede}>
          Every team the catalog carries, with its datacards, rules, ploys and equipment. No
          account needed.
        </p>
      </header>

      <div className={styles.controls}>
        <Select
          label="Faction"
          options={factionOptions}
          value={factionId}
          // Reset to the first page: holding an offset across a filter change can
          // land on an empty page of a smaller result set.
          onChange={(event) => {
            setFactionId(event.target.value)
            setOffset(0)
          }}
          disabled={factionsQuery.isPending}
        />
        {total > 0 && (
          <p className={styles.count} role="status">
            {teams.length} of {pluralize(total, 'team')}
          </p>
        )}
      </div>

      {factionsQuery.isError && (
        <p className={styles.warning} role="status">
          {withReference('Faction names are unavailable.', factionsQuery.error)}
        </p>
      )}

      {teamsQuery.isPending ? (
        <div role="status" aria-label="Loading kill teams" className={styles.skeleton}>
          <span className={styles.srOnly}>Loading kill teams…</span>
          <ul className={styles.rows} aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className={styles.skeletonRow}>
                <span className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
                <span className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : teamsQuery.isError ? (
        <p role="alert" className={styles.error}>
          {withReference("Couldn't load the kill teams.", teamsQuery.error)}
        </p>
      ) : teams.length === 0 ? (
        <EmptyState
          message="No kill teams here."
          sub={
            factionId === ALL_FACTIONS
              ? 'The catalog has not been seeded yet.'
              : 'Try a different faction.'
          }
        />
      ) : (
        <ul className={styles.rows}>
          {teams.map((team) => (
            <li key={team.id} className={styles.row}>
              <Link to={`/kill-team/teams/${team.id}`} className={styles.rowLink}>
                <span className={styles.teamName}>{team.name}</span>
                <span className={styles.meta}>{factionNames.get(team.faction_id) ?? 'Unknown'}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className={styles.pager}>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canPrev}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
          >
            ← Prev
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!canNext}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next →
          </Button>
        </div>
      )}
    </section>
  )
}

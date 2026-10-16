/* KillTeamGamesView (`/kill-team/games`) — the player's own battles. See
 * ROADMAP.md → KF4, and KILLTEAM.md #1, #5, #22, #24.
 *
 * AUTHENTICATED, like the rosters beside it and unlike the catalog: a game is
 * user-owned, so this sits inside `RequireAuth` and another player's game is a 404
 * rather than a 403.
 *
 * PAGED, unlike the rosters, which are fetched whole. Nothing here aggregates over
 * every battle a player has ever played, so a page is the right shape and the list
 * grows without bound — a roster list does not. The newest page is also the useful
 * one: this screen exists to resume the game on the table. Reaching further back
 * needs a pager, which no slice has asked for yet; the count says how many there are
 * so the gap is visible rather than silent.
 *
 * The row is `KTGame_ListRead`, deliberately NOT the snapshot: it carries the names,
 * the status, the turning point, the phase and both scores, and none of the
 * operatives, rules or ploys. So a list of twenty battles is twenty short rows. */

import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useGames } from '../api/killTeamGamesQueries'
import { withReference } from '../lib/errors'
import { formatCreatedLabel, pluralize } from '../lib/format'
import { gameStateLabel, totalVictoryPoints } from '../lib/killTeamGame'
import { Button, EmptyState, Eyebrow } from '../ui'
import { NewGameModal } from './NewGameModal'
import styles from './KillTeamGamesView.module.css'

export default function KillTeamGamesView() {
  const [creating, setCreating] = useState(false)
  const gamesQuery = useGames()

  const games = gamesQuery.data?.items ?? []
  const total = gamesQuery.data?.total ?? 0

  return (
    <section className={styles.view}>
      <header className={styles.head}>
        <div>
          <Eyebrow>Kill Team 2024</Eyebrow>
          <h1 className={styles.title}>Your battles</h1>
          {total > 0 && (
            <p className={styles.meta}>
              {/* `total` is the count across every page, so it does not agree with
                * the rendered rows once a player has more than one page. Saying both
                * is what keeps that honest while there is no pager. */}
              {games.length < total
                ? `${games.length} of ${pluralize(total, 'battle')}`
                : pluralize(total, 'battle')}
            </p>
          )}
        </div>
        <Button onClick={() => setCreating(true)}>+ New Battle</Button>
      </header>

      {gamesQuery.isPending ? (
        <div role="status" aria-label="Loading battles" className={styles.skeleton}>
          <span className={styles.srOnly}>Loading battles…</span>
          <ul className={styles.rows} aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className={styles.skeletonRow}>
                <span className={`${styles.skeletonBlock} ${styles.skeletonName}`} />
                <span className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
              </li>
            ))}
          </ul>
        </div>
      ) : gamesQuery.isError ? (
        <p role="alert" className={styles.error}>
          {withReference("Couldn't load your battles.", gamesQuery.error)}
        </p>
      ) : games.length === 0 ? (
        <EmptyState
          message="No battles yet."
          sub="Start one from a roster to track it at the table."
        >
          <Button onClick={() => setCreating(true)}>+ New Battle</Button>
        </EmptyState>
      ) : (
        <ul className={styles.rows}>
          {games.map((game) => (
            <li key={game.id} className={styles.row}>
              <Link to={`/kill-team/games/${game.id}`} className={styles.rowLink}>
                <span className={styles.rowMain}>
                  <span className={styles.gameName}>
                    {game.kill_team_name}
                    {game.opponent_name ? ` vs ${game.opponent_name}` : ''}
                  </span>
                  <span className={styles.meta}>
                    {game.faction_name} · {gameStateLabel(game)} ·{' '}
                    {formatCreatedLabel(game.created_at)}
                  </span>
                </span>
                {/* Summed across sources, not read from a field: VP is stored BY
                  * source and the keys are free, so a lookup of known sources would
                  * drop whatever the player typed. The opponent's is a plain integer
                  * because it is entered by hand -- the asymmetry is deliberate. */}
                <span
                  className={styles.score}
                  aria-label={`Victory points, you ${totalVictoryPoints(game.victory_points)}, opponent ${game.opponent_victory_points}`}
                >
                  {totalVictoryPoints(game.victory_points)}
                  <span className={styles.scoreDash} aria-hidden="true">
                    –
                  </span>
                  {game.opponent_victory_points}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewGameModal open={creating} onClose={() => setCreating(false)} />
    </section>
  )
}

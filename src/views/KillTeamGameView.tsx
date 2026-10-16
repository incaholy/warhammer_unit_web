/* KillTeamGameView (`/kill-team/games/:gameId`) — the battle, as played. See
 * ROADMAP.md → KF4, and KILLTEAM.md #1, #7, #9, #22, #24, #57, #58, #61, #62, #78.
 *
 * This is the screen the feature exists for, and the requirement it answers to is a
 * layout one: `KILLTEAM.md`'s Frontend section asks for phone-first table-side use,
 * with turning point, CP and VP **always visible**. "Always visible" is a claim about
 * SCROLLING, so the page is deliberately two regions — a scoreboard that stays put and
 * a body that moves under it.
 *
 * `position: sticky` cannot be asserted by a test: jsdom has no layout engine, and the
 * one static guard this repo has over styles (`src/styles/cssModules.test.ts`) checks
 * that a class exists, not what it does. So the claim is verified by eye, which is why
 * this slice ships a real operative list rather than a placeholder — there has to be
 * something to scroll before anyone can judge whether the scoreboard stayed.
 *
 * NO TABS yet. The body is two stacked sections, not two alternatives; the `Tabs`
 * primitive arrives in KF5 when the team reference gives it a second panel to hold.
 *
 * READ-ONLY on the operatives, by design. Wounds, order, activation and the datacards
 * are KF4d and KF4e; CP and VP editing is KF4f. The one write here besides `advance`
 * and `undo` is spending a ploy, which is in because a section listing ploys used with
 * no way to use one would be empty on every new battle. */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  useAdvanceGame,
  useGame,
  useUndoGame,
  useUseGamePloy,
} from '../api/killTeamGamesQueries'
import type { KTGame_Read } from '../api/types'
import { ApiError } from '../api/client'
import { withReference } from '../lib/errors'
import {
  advanceLabel,
  gameStateLabel,
  hasActivated,
  initiativeLabel,
  ploysUsedThisTurningPoint,
  totalVictoryPoints,
} from '../lib/killTeamGame'
import { Button, EmptyState, Eyebrow, Select } from '../ui'
import styles from './KillTeamGameView.module.css'

export default function KillTeamGameView() {
  const { gameId = '' } = useParams()
  const gameQuery = useGame(gameId)

  if (gameQuery.isPending) {
    return (
      <div role="status" aria-label="Loading battle" className={styles.view}>
        <span className={styles.srOnly}>Loading battle…</span>
        <div aria-hidden="true">
          <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
          <span className={`${styles.skeletonBlock} ${styles.skeletonMeta}`} />
        </div>
      </div>
    )
  }

  if (gameQuery.isError) {
    const missing = gameQuery.error instanceof ApiError && gameQuery.error.code === 'NOT_FOUND'
    return (
      <section className={styles.view}>
        <p role="alert" className={styles.error}>
          {missing
            ? 'That battle does not exist.'
            : withReference("Couldn't load this battle.", gameQuery.error)}
        </p>
        <Link to="/kill-team/games" className={styles.back}>
          ← Battles
        </Link>
      </section>
    )
  }

  const game = gameQuery.data

  return (
    <section className={styles.view}>
      <Scoreboard game={game} />
      <Controls game={game} />
      <div className={styles.body}>
        <ThisTurningPoint game={game} />
        <Operatives game={game} />
      </div>
    </section>
  )
}

/** Turning point, phase, initiative, CP and both scores — the five things a player
 *  looks at between actions, and the reason the region is sticky.
 *
 *  Everything here is read from the one game query. No second request, and no catalog
 *  request ever (#22, #24), so the numbers are never waiting on anything. */
function Scoreboard({ game }: { game: KTGame_Read }) {
  const yours = totalVictoryPoints(game.victory_points)

  return (
    <header className={styles.scoreboard}>
      <div className={styles.identity}>
        <Eyebrow>{gameStateLabel(game)}</Eyebrow>
        <h1 className={styles.title}>
          {game.kill_team_name}
          {game.opponent_name ? ` vs ${game.opponent_name}` : ''}
        </h1>
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Initiative</dt>
          {/* `null` is "not yet rolled" (#62), never the opponent. */}
          <dd>{initiativeLabel(game.initiative, game.opponent_name)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>CP</dt>
          <dd className={styles.statNumber}>{game.command_points}</dd>
        </div>
        <div className={styles.stat}>
          <dt>VP</dt>
          {/* Summed across sources, which is what `victory_points` holds; the
            * opponent's is a hand-entered integer. */}
          <dd
            className={styles.statNumber}
            aria-label={`Victory points, you ${yours}, opponent ${game.opponent_victory_points}`}
          >
            {yours}
            <span className={styles.scoreDash} aria-hidden="true">
              –
            </span>
            {game.opponent_victory_points}
          </dd>
        </div>
      </dl>
    </header>
  )
}

/** `advance` and `undo` — the two controls pressed most, so they sit together and stay
 *  with the scoreboard rather than at the foot of a scrolling list.
 *
 *  The advance button NAMES its destination, which means mirroring the server's state
 *  machine; `advanceLabel` carries the reasoning and the test covers every state. The
 *  server still decides. */
function Controls({ game }: { game: KTGame_Read }) {
  const advance = useAdvanceGame(game.id)
  const undo = useUndoGame(game.id)
  const finished = game.status === 'finished'

  return (
    <div className={styles.controls}>
      <Button
        onClick={() => advance.mutate()}
        disabled={advance.isPending || finished}
      >
        {advance.isPending ? 'Advancing…' : advanceLabel(game)}
      </Button>
      {/* Not disabled on a finished battle: finishing is an ordinary event, so undo
        * reopens a game ended by accident (#58). That is the one thing a player most
        * needs from this control. */}
      <Button variant="secondary" onClick={() => undo.mutate()} disabled={undo.isPending}>
        {undo.isPending ? 'Undoing…' : 'Undo'}
      </Button>
    </div>
  )
}

/** The ploys spent in the turning point being played, and a way to spend one.
 *
 * What this says is a FACT it holds, not a rule it applies (#1): the ploy was spent,
 * and it was spent in this turning point. A strategy ploy chosen after the strategy
 * phase lasts the turning point and a firefight ploy does not, so each row shows its
 * `kind` from the game's own snapshot and the player reads the duration off that. The
 * app does not claim to know how long either lasts.
 *
 * The cost is shown but never enforced here. `use_ploy` reads the cost from the
 * snapshot and refuses a ploy the CP will not cover, with a message written for a
 * person — so the refusal is the server's, and the screen does not disable a control
 * on a rule it would have to duplicate. */
function ThisTurningPoint({ game }: { game: KTGame_Read }) {
  const [name, setName] = useState('')
  const usePloy = useUseGamePloy(game.id)

  const used = ploysUsedThisTurningPoint(game)
  const kinds = new Map(game.ploys.map((ploy) => [ploy.name, ploy.kind]))

  const options = [
    { value: '', label: 'Spend a ploy…' },
    ...game.ploys.map((ploy) => ({
      value: ploy.name,
      label: `${ploy.name} — ${ploy.cp_cost} CP (${ploy.kind})`,
    })),
  ]

  const submit = () => {
    if (!name || usePloy.isPending) return
    usePloy.mutate(name, { onSuccess: () => setName('') })
  }

  return (
    <section className={styles.section} aria-labelledby="ploys-heading">
      <h2 id="ploys-heading" className={styles.sectionTitle}>
        This turning point
      </h2>

      {used.length === 0 ? (
        <p className={styles.quiet}>No ploys spent this turning point.</p>
      ) : (
        <ul className={styles.ploys}>
          {used.map((ploy, index) => (
            // Keyed by name AND index: the same ploy can be spent twice in a turning
            // point as far as the tracker is concerned, because how many a turning
            // point allows is a rule it does not count (#1).
            <li key={`${ploy.name}-${index}`} className={styles.ploy}>
              <span className={styles.ployName}>{ploy.name}</span>
              <span className={styles.ployKind}>{kinds.get(ploy.name) ?? 'ploy'}</span>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.spend}>
        <Select
          label="Ploy"
          options={options}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button onClick={submit} disabled={!name || usePloy.isPending}>
          {usePloy.isPending ? 'Spending…' : 'Spend'}
        </Button>
      </div>
    </section>
  )
}

/** The whole team at a glance — name, wounds left, order, whether it has activated.
 *
 * The compact half of the two levels of detail `KILLTEAM.md` asks for; the full
 * datacard behind a card is KF4e, and every write on a row is KF4d. Read-only here,
 * and real rather than a placeholder, because the scoreboard above it has to have
 * something to stay put over.
 *
 * Rows are rendered in the order the server sent (#25), which is `position` with the
 * primary key as a tie-break — a client that re-sorted would break a tie it cannot
 * see. Each row is named by its ORDINAL as well as its name, because two rows can hold
 * the same datacard (#50). */
function Operatives({ game }: { game: KTGame_Read }) {
  if (game.operatives.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="operatives-heading">
        <h2 id="operatives-heading" className={styles.sectionTitle}>
          Operatives
        </h2>
        <EmptyState message="No operatives in this battle." />
      </section>
    )
  }

  return (
    <section className={styles.section} aria-labelledby="operatives-heading">
      <h2 id="operatives-heading" className={styles.sectionTitle}>
        Operatives
      </h2>
      <ul className={styles.rows}>
        {game.operatives.map((operative, index) => {
          const activated = hasActivated(operative.activated_in_turning_point, game.turning_point)
          const out = operative.current_wounds === 0
          return (
            <li
              key={operative.id}
              className={`${styles.row} ${out ? styles.rowOut : ''}`}
              aria-label={`${operative.name} at position ${index + 1}`}
            >
              <span className={styles.rowName}>
                <span className={styles.ordinal} data-testid="row-ordinal">
                  {index + 1}
                </span>
                {operative.name}
              </span>
              <span className={styles.rowState}>
                <span className={styles.wounds}>
                  {operative.current_wounds}/{operative.wounds}
                </span>
                <span className={styles.order}>{operative.order}</span>
                {/* Spelled out rather than a tick: a glyph alone has no accessible
                  * name, and "has it gone yet?" is the single most-read fact here.
                  * `hasActivated` is a COMPARISON against the current turning point
                  * (#61) -- `advance` clears nothing, so a non-null check would mark
                  * every operative that ever activated as activated for the battle. */}
                <span className={activated ? styles.activated : styles.notActivated}>
                  {activated ? 'Activated' : 'Not activated'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

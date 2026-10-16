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
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  useAdvanceGame,
  useDeleteGame,
  useGame,
  useUndoGame,
  useUpdateGame,
  useUseGamePloy,
} from '../api/killTeamGamesQueries'
import type { KTGame_Read } from '../api/types'
import { ApiError } from '../api/client'
import { withReference } from '../lib/errors'
import {
  advanceLabel,
  gameStateLabel,
  initiativeLabel,
  ploysUsedThisTurningPoint,
  totalVictoryPoints,
} from '../lib/killTeamGame'
import { Button, EmptyState, Eyebrow, Field, Modal, Select } from '../ui'
import { ChipEditor, Stepper } from './killTeamControls'
import { OperativeRow } from './killTeamGameRow'
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
        <ScoreAndCommand game={game} />
        <Killzone game={game} />
        <ThisTurningPoint game={game} />
        <Operatives game={game} />
        <DeleteBattle game={game} />
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

/** The whole team at a glance, and the writes a battle makes to it.
 *
 * The compact half of the two levels of detail `KILLTEAM.md` asks for; the full
 * datacard behind a card is KF4e. The row itself lives in `killTeamGameRow.tsx` --
 * this function owns the collection and the one thing derived ACROSS rows.
 *
 * Rows are rendered in the order the server sent (#25), which is `position` with the
 * primary key as a tie-break — a client that re-sorted would break a tie it cannot
 * see. Each row is named by its ORDINAL as well as its name, because two rows can hold
 * the same datacard (#50). */
function Operatives({ game }: { game: KTGame_Read }) {
  // Suggested to every row's add field. Gathered from the battle rather than from a
  // vocabulary, because tokens are team-specific and the column has no enum -- so the
  // only source that needs no knowledge of any team is what has already been used.
  const tokenSuggestions = [
    ...new Set(game.operatives.flatMap((operative) => operative.tokens)),
  ].sort()

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
        {game.operatives.map((operative, index) => (
          <OperativeRow
            key={operative.id}
            game={game}
            operative={operative}
            index={index}
            tokenSuggestions={tokenSuggestions}
          />
        ))}
      </ul>
    </section>
  )
}

/** CP, the player's victory points by source, and the opponent's score (KF4f).
 *
 * Editable here rather than in the scoreboard above, which has to stay compact enough
 * to remain visible while the list scrolls -- four steppers would make it most of a
 * phone. The scoreboard reports; this section writes.
 *
 * **This is the one place `version` is asserted.** `PATCH /{game_id}` answers the whole
 * `KTGame_Read`, so `useUpdateGame` can read the version at send time and apply the
 * response straight to the cache; the operative writes answer a row and cannot (KF4d).
 *
 * **VP by source is the third of KF4's open shapes**, and it closes like the other two:
 * free-text keys, no vocabulary. The sources are the players' (#1, #59) -- Tac Ops are
 * not scraped, stored or gated, so nothing in this project could enumerate them -- and
 * the service validates only that each value is a non-negative whole number, "or a
 * listing's total is nonsense". So the screen offers a name field and a stepper per
 * source, and totals them for the scoreboard.
 *
 * `opponent_name` and `status` are deliberately NOT editable. The name is set when the
 * battle starts and #67 (K8) drops the column outright, replacing it with a side row --
 * so an editor for it is work with a known expiry. `status` is in `_UPDATABLE`, but
 * `advance` already moves a game through every state including its end and `undo`
 * reopens one closed by accident (#58, #66), so a second path to the same field is
 * redundant and easier to misuse than to use. */
function ScoreAndCommand({ game }: { game: KTGame_Read }) {
  const update = useUpdateGame(game.id)
  const [source, setSource] = useState('')

  const sources = Object.keys(game.victory_points).sort()

  const writeVictoryPoints = (next: Record<string, number>) =>
    update.mutateAsync({ victory_points: next })

  const addSource = () => {
    const name = source.trim()
    if (!name || name in game.victory_points) {
      setSource('')
      return
    }
    // Absolute, like every write in a battle (#7): the whole document, not a patch of
    // one key. Added at zero, because adding a source is saying "we scored this kind of
    // thing", not how much.
    writeVictoryPoints({ ...game.victory_points, [name]: 0 })
    setSource('')
  }

  return (
    <section className={styles.section} aria-labelledby="score-heading">
      <h2 id="score-heading" className={styles.sectionTitle}>
        Score and command
      </h2>

      <div className={styles.scoreRow}>
        <span className={styles.scoreLabel}>Command points</span>
        <Stepper
          label="Command points"
          downLabel="Spend a command point"
          upLabel="Gain a command point"
          value={game.command_points}
          onCommit={(command_points) => update.mutateAsync({ command_points })}
        />
      </div>

      {sources.length === 0 ? (
        <p className={styles.quiet}>No victory points scored yet.</p>
      ) : (
        <ul className={styles.sources}>
          {sources.map((name) => (
            <li key={name} className={styles.scoreRow}>
              <span className={styles.scoreLabel}>{name}</span>
              <Stepper
                label={`Victory points from ${name}`}
                downLabel={`Lose a victory point from ${name}`}
                upLabel={`Score a victory point from ${name}`}
                value={game.victory_points[name]}
                onCommit={(points) =>
                  writeVictoryPoints({ ...game.victory_points, [name]: points })
                }
              />
              <button
                type="button"
                className={styles.removeSource}
                aria-label={`Remove the victory point source ${name}`}
                onClick={() => {
                  const next = { ...game.victory_points }
                  delete next[name]
                  writeVictoryPoints(next)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addSource}>
        <Field
          label="Victory point source"
          placeholder="Crit op: Hold"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addSource()
            }
          }}
        />
        <Button variant="secondary" onClick={addSource} disabled={!source.trim()}>
          Add source
        </Button>
      </div>

      <div className={styles.scoreRow}>
        {/* A plain integer, not a keyed document: the opponent's score is entered by
          * hand. The asymmetry is deliberate and is not a shape to unify. */}
        <span className={styles.scoreLabel}>
          {game.opponent_name ? `${game.opponent_name}'s victory points` : "Opponent's victory points"}
        </span>
        <Stepper
          label="Opponent victory points"
          downLabel="Lower the opponent's victory points"
          upLabel="Raise the opponent's victory points"
          value={game.opponent_victory_points}
          onCommit={(opponent_victory_points) => update.mutateAsync({ opponent_victory_points })}
        />
      </div>
    </section>
  )
}

/** Markers on the killzone — the game's own free-text list (KF4f).
 *
 * The same control as an operative's tokens, and the same reason it has no vocabulary:
 * markers are team-specific and NUMBERED, so Raveners place Tunnel markers 0 to 4 and no
 * enum could express "Tunnel 3". `KILLTEAM.md` keeps the column generic on purpose, "so
 * a new team needs no migration" -- a client-side enum would move that migration here. */
function Killzone({ game }: { game: KTGame_Read }) {
  const update = useUpdateGame(game.id)
  return (
    <section className={styles.section} aria-labelledby="killzone-heading">
      <h2 id="killzone-heading" className={styles.sectionTitle}>
        Killzone
      </h2>
      <ChipEditor
        noun="marker"
        on="the killzone"
        chips={game.markers}
        suggestions={game.markers}
        pending={update.isPending}
        onChange={(markers) => update.mutate({ markers })}
      />
    </section>
  )
}

/** Discarding a battle, behind a confirmation (KF4f).
 *
 * Confirmed because it is the one operation here with no way back: `undo` reverts an
 * event and a deleted game has no events left -- `kt_game_events.game_id` is
 * ON DELETE CASCADE, so the log goes with the row. #82 makes this host-only once a game
 * can have two participants, for exactly that reason. */
function DeleteBattle({ game }: { game: KTGame_Read }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const deleteGame = useDeleteGame()

  return (
    <section className={styles.section}>
      <Button variant="secondary" className={styles.danger} onClick={() => setConfirming(true)}>
        Delete battle
      </Button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete battle"
        description="This cannot be undone. The battle and its event log go with it."
      >
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            className={styles.danger}
            disabled={deleteGame.isPending}
            onClick={() =>
              deleteGame.mutate(game.id, {
                onSuccess: () => {
                  setConfirming(false)
                  navigate('/kill-team/games')
                },
              })
            }
          >
            {deleteGame.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </Modal>
    </section>
  )
}

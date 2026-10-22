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
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  useAddGameEquipment,
  useAddGameOperative,
  useAdvanceGame,
  useDeleteGame,
  useGame,
  useRemoveGameEquipment,
  useRevealGameEquipment,
  useUndoGame,
  useUpdateGame,
  useUseGamePloy,
} from '../api/killTeamGamesQueries'
import { useKillTeam, useUniversal } from '../api/killTeamQueries'
import type { KTGame_Read } from '../api/types'
import { ApiError } from '../api/client'
import { withReference } from '../lib/errors'
import {
  advanceFinishes,
  advanceLabel,
  gameStateLabel,
  initiativeLabel,
  NO_INITIATIVE,
  ploysUsedThisTurningPoint,
  strategyPloysThisTurningPoint,
  totalVictoryPoints,
  gameChoices,
} from '../lib/killTeamGame'
import type { InitiativeSide } from '../lib/killTeamGame'
import {
  Button,
  EmptyState,
  Field,
  Modal,
  SegmentedToggle,
  Select,
  TabPanel,
  Tabs,
  Tag,
  type Tab,
} from '../ui'
import { Block as RefBlock, Entries, Ploys, Rules } from './killTeamCards'
import { ChipEditor, Stepper } from './killTeamControls'
import { OperativeRow } from './killTeamGameRow'
import styles from './KillTeamGameView.module.css'

/** What the initiative control holds: the two allowed sides, plus a stand-in for the
 *  `null` the column also allows. Never sent as-is -- see `NO_INITIATIVE`. */
type InitiativeChoice = typeof NO_INITIATIVE | InitiativeSide

type TabId = 'battle' | 'reference'

/** Two panels, which is what finally justifies the tablist KF4c shipped without.
 *
 * `KILLTEAM.md`'s Frontend section asks for a "team tab" holding the rest of the
 * reference. The battle half writes and the reference half does not, which is the
 * cleanest line to draw: everything behind Battle can change the game, nothing behind
 * Reference can. */
const TABS: Tab<TabId>[] = [
  { id: 'battle', label: 'Battle' },
  { id: 'reference', label: 'Reference' },
]

export default function KillTeamGameView() {
  const { gameId = '' } = useParams()
  const [tab, setTab] = useState<TabId>('battle')
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
      {/* ONE sticky region, not three (KF8a). `position: sticky` does not stack: three
        * elements each given `top: 0` all pinned to the same strip and `z-index` decided
        * which was visible, so the controls and the tablist were entirely occluded by the
        * scoreboard once a player scrolled. Measured: scoreboard 0–96, controls 0–64,
        * tablist 0–48.
        *
        * Cumulative offsets were the alternative and the wrong one — the title wraps, the
        * controls wrap, the quick-reference chips come and go, so it would be three
        * numbers already known to change. One region needs none. */}
      <div className={styles.chrome}>
        <Scoreboard game={game} />
        <Controls game={game} />
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          aria-label="Battle sections"
          idPrefix="game"
        />
      </div>

      {tab === 'battle' && (
        <TabPanel id="battle" idPrefix="game">
          {/* Ordered by how often a player touches it, which is NOT the order these
            * were built in (KF7 group B). Operatives moved from fifth to first: they are
            * the most-touched thing on the screen and they sat under two sections that
            * are set once. Killzone markers and `choices` are setup, so they drop to the
            * bottom; deleting stays last. */}
          <div className={styles.body}>
            <FinalScore game={game} />
            <Operatives game={game} />
            <ThisTurningPoint game={game} />
            <Equipment game={game} />
            <ScoreAndCommand game={game} />
            <Killzone game={game} />
            <Choices game={game} />
            <DeleteBattle game={game} />
          </div>
        </TabPanel>
      )}

      {tab === 'reference' && (
        <TabPanel id="reference" idPrefix="game">
          <div className={styles.body}>
            <GameReference game={game} />
          </div>
        </TabPanel>
      )}
    </section>
  )
}

/** A battle-tab section that folds away (KF8c).
 *
 *  Measured at a 390px content width: the app header and the sticky chrome take 437px of
 *  an 844px phone, so 407px is left for everything else, and the six sections plus their
 *  operatives ran the page to 3,008px for a SIX-operative battle. A player reads one
 *  section at a time, so the rest should be possible to put away.
 *
 *  **The button lives inside the `<h2>`, which is the part worth not changing.** The
 *  heading element and its id have to survive, because `aria-labelledby` on the section
 *  points at it and the battle tab's order is asserted through
 *  `section[aria-labelledby]`. `InventoryView` solved this by replacing the heading with
 *  a bare `<button>`, which loses the document outline; putting the control inside the
 *  heading keeps both.
 *
 *  **`aria-expanded` and conditional rendering rather than `<details>`**, for two
 *  reasons. This view re-renders on every write, and `open` is a DOM attribute React
 *  re-applies each render -- the trap `KillTeamRosterView`'s `RosterComposition` records.
 *  And a closed `<details>` keeps its children in the DOM, so the saving would be a lie
 *  and no test could see it; here a closed section genuinely is not rendered. */
function CollapsibleSection({
  headingId,
  title,
  defaultOpen,
  children,
}: {
  headingId: string
  title: ReactNode
  defaultOpen: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = `${headingId}-body`

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionTitle}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.sectionMarker} aria-hidden="true">
            {open ? '−' : '+'}
          </span>
          {title}
        </button>
      </h2>
      {open && <div id={bodyId}>{children}</div>}
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
        {/* Inline with the eyebrow, so the one way back is always on screen and costs no
          * height. The breadcrumb links to `Battles` too and is not wrong -- it just
          * lives above the view and is not sticky, so it is gone the moment a long
          * battle screen is scrolled, which is how five slices of testing missed it. */}
        <div className={styles.eyebrowRow}>
          {/* The current stage, at real weight. It was an `Eyebrow` — 10px and `--faint`
            * — while the button naming the stage a player is advancing TO is a filled
            * control. So the loudest text named where you are going and the quietest
            * named where you are, and "Advance to firefight" read as a statement rather
            * than an action. The label was never the bug; its prominence relative to
            * this was. */}
          <span className={styles.stage}>{gameStateLabel(game)}</span>
          <Link to="/kill-team/games" className={styles.back}>
            ← Battles
          </Link>
        </div>
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
  const [confirming, setConfirming] = useState(false)
  const finished = game.status === 'finished'
  // A PREDICATE, never a comparison against the label: branching on the string
  // 'Finish battle' would make the button's copy load-bearing, so a reword would
  // silently drop the confirmation. `advanceFinishes` carries the reasoning.
  const willFinish = advanceFinishes(game)

  return (
    <div className={styles.controls}>
      <Button
        onClick={() => (willFinish ? setConfirming(true) : advance.mutate())}
        disabled={advance.isPending || finished}
      >
        {advance.isPending ? 'Advancing…' : advanceLabel(game)}
      </Button>

      <FinishSummary
        game={game}
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => advance.mutate(undefined, { onSuccess: () => setConfirming(false) })}
        pending={advance.isPending}
      />
      {/* Not disabled on a finished battle: finishing is an ordinary event, so undo
        * reopens a game ended by accident (#58). That is the one thing a player most
        * needs from this control. */}
      <Button variant="secondary" onClick={() => undo.mutate()} disabled={undo.isPending}>
        {undo.isPending ? 'Undoing…' : 'Undo'}
      </Button>

      <StrategyPloys game={game} />
    </div>
  )
}

/** The quick reference: which strategy ploys were spent this turning point (KF5).
 *
 * Inside the controls band rather than as a region of its own, deliberately. The sticky
 * stack is already the app header, this screen's scoreboard and these controls; a fourth
 * element would take most of a phone before an operative appeared. Riding along with the
 * buttons costs one row, which the controls paid for by laying out as a ROW on a phone
 * instead of a column -- two stacked buttons cost more height than this does.
 *
 * Names only. A ploy's description is several lines and belongs in the section below and
 * in the Reference tab, both one tap away; what a player wants at a glance is which ones
 * are running.
 *
 * Absent entirely when none are spent, so a battle with no ploys in play pays nothing. */
function StrategyPloys({ game }: { game: KTGame_Read }) {
  const inPlay = strategyPloysThisTurningPoint(game)
  if (inPlay.length === 0) return null
  return (
    <div className={styles.strategyPloys} aria-label="Strategy ploys spent this turning point">
      {inPlay.map((entry) => (
        <Tag key={entry.index} className={styles.strategyPloy}>
          {entry.name}
        </Tag>
      ))}
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
  const update = useUpdateGame(game.id)

  // Initiative lives HERE rather than in the scoreboard that displays it, because that
  // is its actual lifetime: `advance` "puts initiative back to nobody for its roll-off"
  // on every new turning point (#62, and the service's own docstring). A control in the
  // sticky chrome would also grow the one band KF8a and KF8c both went after -- measured
  // at 437px of an 844px phone before any content.
  //
  // Three options for a field with two allowed values, because `null` is a real state
  // and not an absence (#62): it MUST NOT read as the opponent holding initiative, which
  // is what a falsy check produces. `SegmentedToggle` is generic over `T extends string`
  // and cannot hold `null`, so `NO_INITIATIVE` stands in and is converted back on write.
  const initiativeOptions: { value: InitiativeChoice; label: string }[] = [
    { value: NO_INITIATIVE, label: initiativeLabel(null) },
    { value: 'player', label: initiativeLabel('player') },
    { value: 'opponent', label: initiativeLabel('opponent', game.opponent_name) },
  ]

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
    <CollapsibleSection headingId="ploys-heading" title="This turning point" defaultOpen={true}>
      {/* `scoreRow` is a generic label-and-control row despite its name -- `Equipment`
        * already reuses it -- so this adds no layout of its own. */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLabel}>Initiative</span>
        <SegmentedToggle
          aria-label="Initiative"
          options={initiativeOptions}
          value={(game.initiative as InitiativeChoice | null) ?? NO_INITIATIVE}
          onChange={(next) =>
            update.mutate({ initiative: next === NO_INITIATIVE ? null : next })
          }
        />
      </div>

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
    </CollapsibleSection>
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
      <CollapsibleSection headingId="operatives-heading" title="Operatives" defaultOpen={true}>
        <EmptyState message="No operatives in this battle." />
      </CollapsibleSection>
    )
  }

  return (
    <CollapsibleSection headingId="operatives-heading" title="Operatives" defaultOpen={true}>
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
      <FieldOperative game={game} />
    </CollapsibleSection>
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

  return (
    <CollapsibleSection headingId="score-heading" title="Score and command" defaultOpen={true}>

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

      <VictoryPoints game={game} />
    </CollapsibleSection>
  )
}

/** The victory points, editable: each source, the opponent's total, and a way to add one.
 *
 * Extracted (KF7 group A) because the finish summary needs exactly these controls. #66
 * closes a finished game to edits, so the only moment a player can correct the score is
 * BEFORE the advance that ends the battle -- which means the summary has to offer real
 * controls rather than a read-only recap. Two copies of them would drift, and the one in
 * the dialog is the copy that matters. */
function VictoryPoints({ game }: { game: KTGame_Read }) {
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
    <>
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
    </>
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
    <CollapsibleSection headingId="killzone-heading" title="Killzone" defaultOpen={false}>
      <ChipEditor
        noun="marker"
        on="the killzone"
        chips={game.markers}
        suggestions={game.markers}
        pending={update.isPending}
        onChange={(markers) => update.mutate({ markers })}
      />
    </CollapsibleSection>
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
      <Button variant="dangerOutline" size="sm" onClick={() => setConfirming(true)}>
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
            variant="danger"
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

/** A disclosure that fetches a catalog POOL only once opened.
 *
 * The seam KF4g needs and the reason the no-catalog claim narrowed rather than broke.
 * `KTGame_Read` carries `equipment` and `operatives` as what has been TAKEN and FIELDED,
 * never as pools -- unlike `ploys`, which IS the team's whole list, which is why
 * spending one needs nothing extra. So three operations name a catalog id and the rest
 * of the screen names none.
 *
 * Lazy rather than eager, because these are the RARE operations: equipment is normally
 * chosen before the battle, #18 fires for one team's single piece of kit and #19 for one
 * team's rule, so a typical battle uses none of them. Fetching the pools with every
 * battle would roughly double what opening one costs -- 16-46 KB for the team detail,
 * median 24 over all 48 teams (#52) -- to make three controls a player may never touch
 * feel instant.
 *
 * Fetched at most ONCE per session either way: both reads carry `staleTime: Infinity`,
 * which is a statement of fact rather than a tuning choice. The catalog has no write
 * route at all (#21), proven by #49's assertion that no path under `/api/v1/kill-team`
 * declares any method but `get`, so these rows cannot change while the app is open. */
function PoolDisclosure({
  summary,
  children,
}: {
  summary: string
  /** Given the open state, returns an ELEMENT. It must not call hooks itself: a
   *  function passed as a child is not a component, so hooks in it break the rules of
   *  hooks -- which the linter catches, and did. The picker that needs the pool is a
   *  component taking `open` as a prop instead. */
  children: (open: boolean) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className={styles.pool}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={styles.poolSummary}>{summary}</summary>
      <div className={styles.poolBody}>{children(open)}</div>
    </details>
  )
}

/** The equipment taken into this battle, and taking more (#17, #57).
 *
 * The ALLOWANCE is reported and never enforced. `equipment_limit` is a constant the read
 * carries rather than a column (#57), the service accepts a fifth piece on purpose so a
 * custom game can be built, and #1 is that the tracker records while the players apply.
 * So the count is shown against the limit and nothing is disabled by it.
 *
 * Revealing is its own operation with no body and no un-reveal: it can change what is on
 * the table (Gellerpox's vermin, #18). A piece already taken is filtered out of the
 * picker, because the same piece twice is a 409 -- that one IS integrity, not a rule. */
function Equipment({ game }: { game: KTGame_Read }) {
  const reveal = useRevealGameEquipment(game.id)
  const remove = useRemoveGameEquipment(game.id)

  return (
    <CollapsibleSection headingId="equipment-heading" title={<>Equipment · {game.equipment.length} of {game.equipment_limit}</>} defaultOpen={false}>

      {game.equipment.length === 0 ? (
        <p className={styles.quiet}>No equipment taken.</p>
      ) : (
        <ul className={styles.sources}>
          {game.equipment.map((row) => (
            <li key={row.id} className={styles.scoreRow}>
              <span className={styles.scoreLabel}>{row.name}</span>
              {row.revealed ? (
                <span className={styles.revealed}>Revealed</span>
              ) : (
                <Button
                  variant="secondary"
                  aria-label={`Reveal ${row.name}`}
                  disabled={reveal.isPending}
                  onClick={() => reveal.mutate(row.id)}
                >
                  Reveal
                </Button>
              )}
              <button
                type="button"
                className={styles.removeSource}
                aria-label={`Remove ${row.name} from the battle`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(row.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <PoolDisclosure summary="Take equipment">
        {(open) => <TakeEquipment game={game} open={open} />}
      </PoolDisclosure>
    </CollapsibleSection>
  )
}

/** The equipment picker, which only fetches once its disclosure is open.
 *
 * A component rather than a callback because it calls hooks. Two reads: the team's own
 * equipment and the universal list (#52). A piece already taken is filtered out, since
 * the same piece twice is a 409 -- that one is integrity, not a rule, so it is prevented
 * rather than reported. */
function TakeEquipment({ game, open }: { game: KTGame_Read; open: boolean }) {
  const add = useAddGameEquipment(game.id)
  const [choice, setChoice] = useState('')
  const team = useKillTeam(game.kill_team_id, open)
  const universal = useUniversal(open)

  const taken = new Set(game.equipment.map((row) => row.equipment_id))
  const pool = [...(team.data?.equipment ?? []), ...(universal.data?.equipment ?? [])].filter(
    (piece) => !taken.has(piece.id),
  )

  if (team.isPending || universal.isPending) {
    return (
      <p role="status" className={styles.quiet}>
        Loading equipment…
      </p>
    )
  }

  return (
    <div className={styles.addSource}>
      <Select
        label="Equipment"
        options={[
          { value: '', label: 'Choose a piece…' },
          ...pool.map((piece) => ({ value: piece.id, label: piece.name })),
        ]}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      />
      <Button
        variant="secondary"
        disabled={!choice || add.isPending}
        onClick={() => add.mutate(choice, { onSuccess: () => setChoice('') })}
      >
        Take
      </Button>
    </div>
  )
}

/** Fielding a datacard the battle produced (#18).
 *
 * The picker offers only `availability === 'in_battle'`, and that filter is narrower than
 * it looks. #20 derives the flag from a CONDITIONAL composition block, which only
 * Gellerpox print -- so it marks their three vermin and NOT Chaos Cult's Mutant and
 * Torment, which are named in rule prose "too loose to store as a column". So for most
 * teams this list is legitimately EMPTY, and the screen says so rather than showing an
 * empty dropdown. Chaos Cult's two arrive by TRANSFORM instead, which is why that picker
 * cannot use this filter.
 *
 * `source` records which half of #18 produced the card -- a piece of equipment or a rule
 * -- so the row can be told from a roster operative afterwards. */
function FieldOperative({ game }: { game: KTGame_Read }) {
  return (
    <PoolDisclosure summary="Field a datacard">
      {(open) => <FieldPicker game={game} open={open} />}
    </PoolDisclosure>
  )
}

function FieldPicker({ game, open }: { game: KTGame_Read; open: boolean }) {
  const add = useAddGameOperative(game.id)
  const [choice, setChoice] = useState('')
  const [source, setSource] = useState<'equipment' | 'rule'>('equipment')
  const team = useKillTeam(game.kill_team_id, open)

  const pool = (team.data?.operatives ?? []).filter(
    (operative) => operative.availability === 'in_battle',
  )

  if (team.isPending) {
    return (
      <p role="status" className={styles.quiet}>
        Loading datacards…
      </p>
    )
  }
  if (pool.length === 0) {
    return (
      <p className={styles.quiet}>
        This kill team prints no datacards that arrive mid-battle.
      </p>
    )
  }

  return (
          <div className={styles.field}>
            <Select
              label="Datacard"
              options={[
                { value: '', label: 'Choose a datacard…' },
                ...pool.map((operative) => ({ value: operative.id, label: operative.name })),
              ]}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            />
            <SegmentedToggle
              aria-label="What produced it"
              options={[
                { value: 'equipment', label: 'Equipment' },
                { value: 'rule', label: 'Rule' },
              ]}
              value={source}
              onChange={setSource}
            />
            <Button
              variant="secondary"
              disabled={!choice || add.isPending}
              onClick={() =>
                add.mutate(
                  { operativeId: choice, source },
                  { onSuccess: () => setChoice('') },
                )
              }
            >
              Field
            </Button>
          </div>
  )
}

/** The per-game picks the rules leave to the players (KF5).
 *
 * The last open shape, and the only writable field on a game that the service validates
 * not at all -- #59 keeps Tac Ops and archetypes out of the project, so nothing here
 * could enumerate the labels or the values. `gameChoices` explains the shape and why the
 * read is narrowed.
 *
 * The editor is the one `ScoreAndCommand` already uses for victory points by source,
 * because it is the same keyed document with strings where that has numbers. Writes send
 * the whole document (#7). */
function Choices({ game }: { game: KTGame_Read }) {
  const update = useUpdateGame(game.id)
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')

  const picks = gameChoices(game)

  const write = (next: Record<string, string>) => update.mutateAsync({ choices: next })

  const add = () => {
    const name = label.trim()
    const chosen = value.trim()
    if (!name || !chosen) return
    write({ ...asStrings(game.choices), [name]: chosen })
    setLabel('')
    setValue('')
  }

  return (
    <CollapsibleSection headingId="choices-heading" title="Choices" defaultOpen={false}>

      {picks.length === 0 ? (
        <p className={styles.quiet}>Nothing recorded. The Accursed Gift, a Tac Op taken.</p>
      ) : (
        <ul className={styles.sources}>
          {picks.map((pick) => (
            <li key={pick.label} className={styles.scoreRow}>
              <span className={styles.scoreLabel}>{pick.label}</span>
              <span className={styles.choiceValue}>{pick.value}</span>
              <button
                type="button"
                className={styles.removeSource}
                aria-label={`Remove the choice ${pick.label}`}
                onClick={() => {
                  const next = asStrings(game.choices)
                  delete next[pick.label]
                  write(next)
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.addChoice}>
        <Field
          label="Choice"
          placeholder="Tac Op"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Field
          label="What was chosen"
          placeholder="Seek and Destroy"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="secondary" onClick={add} disabled={!label.trim() || !value.trim()}>
          Record
        </Button>
      </div>
    </CollapsibleSection>
  )
}

/** The document to write back, with anything this client cannot have written removed.
 *
 * A write is absolute (#7), so it has to send the WHOLE document -- which means reading
 * back whatever is in there. Spreading `game.choices` raw would carry a non-string value
 * through untouched, and `gameChoices` has already decided not to show it: the screen
 * would then be editing a document it is not displaying. Dropping it on write is the
 * honest half of dropping it on read. */
function asStrings(choices: KTGame_Read['choices']): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(choices)) {
    if (typeof value === 'string') out[key] = value
  }
  return out
}

/** The reference half: what this battle was given, read-only (KF5).
 *
 * Entirely from the game's own snapshot (#22, #24), so this tab makes no request --
 * the same property KF4e's datacard has, and for the same reason.
 *
 * `Rules` and `Ploys` are the shared components the catalog and roster pages use, widened
 * in KF5 to take the fields they read; a snapshotted rule or ploy is a subset of the
 * catalog's, missing only `id` and `position`. The ploys split on the `universal` flag
 * the game read carries, which the catalog shapes do not have -- so this needs no second
 * list, unlike the team page that fetches `/universal` separately.
 *
 * Equipment is rendered HERE rather than through `EquipmentList`, which is the one
 * reference component that could not widen: the catalog calls the prose `description`
 * and a snapshot calls it `text`, and a rename is not a narrowing. The taken pieces also
 * carry `revealed`, which no catalog row has. */
function GameReference({ game }: { game: KTGame_Read }) {
  const teamPloys = game.ploys.filter((ploy) => !ploy.universal)
  const universalPloys = game.ploys.filter((ploy) => ploy.universal)

  return (
    <div className={styles.reference}>
      <RefBlock title="Team rules">
        <Rules rules={game.rules} />
      </RefBlock>

      <RefBlock title="Ploys">
        <Ploys ploys={teamPloys} />
        {universalPloys.length > 0 && (
          <>
            <p className={styles.subhead}>Universal — every team may use these</p>
            <Ploys ploys={universalPloys} />
          </>
        )}
      </RefBlock>

      <RefBlock title="Equipment taken">
        {/* Through `Entries` rather than `EquipmentList`: a snapshotted piece calls its
          * prose `text` where the catalog calls it `description`, and carries `revealed`,
          * which no catalog row has. Revealing can change what is on the table (#18), so
          * that state belongs beside the text and not only on the control. */}
        <Entries
          entries={game.equipment.map((piece) => ({
            name: piece.name,
            text: piece.text,
            aside: piece.revealed ? 'revealed' : null,
          }))}
        />
      </RefBlock>
    </div>
  )
}

/** The last chance to correct the score, because #66 means there is no later one.
 *
 * `advance` out of the last turning point's firefight phase FINISHES the battle, and a
 * finished game is closed to edits: the loader refuses one by default and only the shallow
 * read, `delete_game`, `advance` and `undo` opt out. So a victory-point write afterwards
 * answers 400 and "adjust the final score" is not something a later screen can offer.
 *
 * Which makes this a confirmation that EDITS rather than one that merely warns: the same
 * `VictoryPoints` controls the Battle tab has, so a player can add what they forgot and
 * then close the record. The dialog's `description` carries the consequence, which `Modal`
 * wires to `aria-describedby` -- so it is announced with the title rather than being body
 * text nothing points at. */
function FinishSummary({
  game,
  open,
  onClose,
  onConfirm,
  pending,
}: {
  game: KTGame_Read
  open: boolean
  onClose: () => void
  onConfirm: () => void
  pending: boolean
}) {
  const yours = totalVictoryPoints(game.victory_points)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Finish this battle?"
      description="A finished battle is closed to changes. Add any last victory points now; afterwards only Undo can reopen it."
    >
      <div className={styles.finish}>
        <ScoreLine game={game} yours={yours} />
        <VictoryPoints game={game} />

        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={onClose}>
            Keep playing
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? 'Finishing…' : 'Finish battle'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** What the battle came to, once it is over (KF7 group A).
 *
 * Renders nothing while a battle is being played, so it costs the common case nothing.
 *
 * Both scores, and NO verdict. Higher victory points is the basic win condition, so
 * naming a winner would be a small inference -- and #1 is that the tracker records while
 * the players apply. The numbers are the fact; who won is the players' to say. Revisit if
 * that reads as evasive in use rather than as careful.
 *
 * `Undo to reopen` is the only way back and there is no `reopen` route, deliberately:
 * #66 makes the finish an event like any other and always the newest one, so undoing it
 * IS reopening. The control names that rather than leaving a player to discover it. */
function FinalScore({ game }: { game: KTGame_Read }) {
  const undo = useUndoGame(game.id)
  if (game.status !== 'finished') return null

  return (
    <section className={styles.finalScore} aria-labelledby="final-heading">
      <h2 id="final-heading" className={styles.sectionTitle}>
        Battle finished
      </h2>
      <ScoreLine game={game} yours={totalVictoryPoints(game.victory_points)} large />
      {/* No `← Battles` here, though it is the moment a player most wants it: the
        * scoreboard's own link is STICKY and therefore already on screen beside this
        * panel, and two links with the same accessible name on one screen is the
        * duplicate-name problem KF4e had to fix on the action picker. */}
      <div className={styles.finalActions}>
        <Button
          variant="secondary"
          onClick={() => undo.mutate()}
          disabled={undo.isPending}
        >
          {undo.isPending ? 'Reopening…' : 'Undo to reopen'}
        </Button>
      </div>
    </section>
  )
}

/** Both scores side by side, named rather than numbered. */
function ScoreLine({
  game,
  yours,
  large = false,
}: {
  game: KTGame_Read
  yours: number
  large?: boolean
}) {
  return (
    <p
      className={large ? styles.scoreLineLarge : styles.scoreLine}
      aria-label={`Final score, you ${yours}, opponent ${game.opponent_victory_points}`}
    >
      <span>You {yours}</span>
      <span className={styles.scoreDash} aria-hidden="true">
        ·
      </span>
      <span>
        {game.opponent_name ?? 'Opponent'} {game.opponent_victory_points}
      </span>
    </p>
  )
}

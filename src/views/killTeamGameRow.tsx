/* One operative's row on the battle screen, and the four writes it carries. See
 * ROADMAP.md → KF4, and KILLTEAM.md #1, #7, #9, #50, #61, #63, #79.
 *
 * Split out of `KillTeamGameView` rather than added to it, for the reason KF4 names:
 * this is the heaviest view in the app and may need splitting internally. The row is
 * also the only part of the screen that writes to a model, so keeping it apart keeps
 * the view's own file about LAYOUT and this one about state.
 *
 * Every write sends an ABSOLUTE value, never a delta (#7) — `current_wounds: 7`, not
 * `-2`, and the whole `tokens` array, not an addition. That is what makes a duplicate
 * delivery of a request harmless, and it is why the wounds control can be tapped
 * quickly without arithmetic drifting.
 *
 * **`version` is deliberately NOT sent from this module**, which is the one place KF4
 * departs from `conventions.md`'s advice to send the version you read. The reason is a
 * property of the API rather than a preference: `PATCH …/operatives/{row_id}` answers
 * `KTGameOperative_Read`, which carries no `version` and no response header, so a
 * client cannot learn the game's new version from its own write. Since #9 means EVERY
 * write moves the version, sending the last-rendered one would make a second tap
 * conflict with the player's OWN first tap — a 409 on every rapid edit, which is the
 * normal case at a table. Omitting it is not unguarded: the column is the row's
 * SQLAlchemy `version_id_col`, so a genuine concurrent write still loses at flush and
 * answers the same 409. What is given up is the stale-READ overwrite — two devices, one
 * rendering wounds that have since changed.
 *
 * That cost would disappear if the write returned the new version (an `ETag` on the
 * response is the obvious shape, and #79 is already moving to `If-Match`). Recorded in
 * ROADMAP KF4 so the trade is reconsidered when that lands, rather than inherited. */

import { useState } from 'react'

import {
  useActivateGameOperative,
  useTransformGameOperative,
  useUpdateGameOperative,
} from '../api/killTeamGamesQueries'
import { useKillTeam } from '../api/killTeamQueries'
import type { KTGame_Read, KTGameOperative_Read } from '../api/types'
import {
  actionsUsed,
  hasActivated,
  operativeStatusLabel,
  SETTABLE_OPERATIVE_STATUSES,
} from '../lib/killTeamGame'
import { Button, SegmentedToggle, Select } from '../ui'
import { Abilities, Block, Keywords, StatLine, Weapons } from './killTeamCards'
import { ChipEditor, Stepper } from './killTeamControls'
import styles from './killTeamGameRow.module.css'

const ORDERS = [
  { value: 'engage' as const, label: 'Engage' },
  { value: 'conceal' as const, label: 'Conceal' },
]

/** Only the two a player may set. `incapacitated` is absent on purpose -- see
 *  `SETTABLE_OPERATIVE_STATUSES`. */
const BOARD_STATUSES = SETTABLE_OPERATIVE_STATUSES.map((value) => ({
  value,
  label: operativeStatusLabel(value),
}))

export interface OperativeRowProps {
  game: KTGame_Read
  operative: KTGameOperative_Read
  index: number
  /** Every token already on any operative in this battle, for the add field's
   *  suggestions. The vocabulary cannot be hard-coded: tokens are TEAM-specific
   *  (`KILLTEAM.md` — Raveners' Poison, their numbered Tunnel markers), which is
   *  exactly why the column has no enum and a new team needs no migration. */
  tokenSuggestions: string[]
}

export function OperativeRow({ game, operative, index, tokenSuggestions }: OperativeRowProps) {
  const update = useUpdateGameOperative(game.id)
  const activate = useActivateGameOperative(game.id)

  // Collapsed by default (KF8c). Measured at a 390px content width before this existed:
  // the app header and the sticky chrome take 437px of an 844px phone, leaving 407px, and
  // one row was 241px -- so 1.7 operatives fitted on screen and a 13-operative battle ran
  // to 3,133px of rows alone.
  //
  // What stays visible is set by `KILLTEAM.md`: the list is "compact enough to see the
  // whole team at a glance -- name, wounds, order, activated". Wounds and order are not
  // text on this screen, they ARE the controls, so collapsing cannot hide them. Tokens and
  // the datacard are the two parts a player reads occasionally rather than every
  // activation, so those are what folds away.
  //
  // State, not `<details>`: this view re-renders on every write, and `open` is a DOM
  // attribute React re-applies each time -- the trap `KillTeamRosterView`'s
  // `RosterComposition` already records, and this screen writes far more often than that
  // one does.
  const [open, setOpen] = useState(false)
  const detailsId = `operative-${operative.id}-details`

  // "At position N" on every control's accessible name, because two rows can hold the
  // same datacard (#50) and the tests address rows by it. The ordinal is the row's
  // place in the list the server sent, never `operative.position` (#53).
  const who = `${operative.name} at position ${index + 1}`

  const activated = hasActivated(operative.activated_in_turning_point, game.turning_point)
  const incapacitated = operative.status === 'incapacitated'

  return (
    <li className={`${styles.row} ${incapacitated ? styles.rowOut : ''}`} aria-label={who}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.name}
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={styles.marker} aria-hidden="true">
            {open ? '−' : '+'}
          </span>
          <span className={styles.ordinal} data-testid="row-ordinal">
            {index + 1}
          </span>
          {operative.name}
        </button>
        {/* Spelled out rather than a tick: a glyph alone has no accessible name, and
          * "has it gone yet?" is the most-read fact on this screen. */}
        <span className={activated ? styles.activated : styles.notActivated}>
          {activated ? 'Activated' : 'Not activated'}
        </span>
      </div>

      <div className={styles.controls}>
        {/* Wounds: the shared stepper. Absolute (#7), and the write never carries
          * `status` -- the service couples zero wounds to `incapacitated` in BOTH
          * directions, and its own comment says a caller who had to remember would
          * eventually not. */}
        <Stepper
          label={`Wounds for ${who}`}
          downLabel={`Take a wound from ${who}`}
          upLabel={`Heal a wound on ${who}`}
          value={operative.current_wounds}
          max={operative.wounds}
          onCommit={(current_wounds) =>
            update.mutateAsync({ rowId: operative.id, body: { current_wounds } })
          }
        />

        <SegmentedToggle
          className={styles.order}
          aria-label={`Order for ${who}`}
          options={ORDERS}
          value={operative.order === 'engage' ? 'engage' : 'conceal'}
          onChange={(order) => update.mutate({ rowId: operative.id, body: { order } })}
        />

        <Button
          variant="secondary"
          aria-label={`Activate ${who}`}
          onClick={() => activate.mutate(operative.id)}
          // Both of these are the service's own BOOKKEEPING, not rules it enforces
          // (#1): a model that is gone cannot act, and one activation per operative per
          // turning point. Disabling here mirrors a refusal the player would otherwise
          // meet as a toast. Deliberately NOT disabled for `reserve` -- whether an
          // operative can arrive and act in one turning point IS a rule, and the
          // service leaves that to the players.
          disabled={activate.isPending || activated || incapacitated}
        >
          {activate.isPending ? 'Activating…' : 'Activate'}
        </Button>
      </div>

      {/* Rendered only when open, rather than hidden with CSS. Removing it from the tree
        * is what makes the saving real -- and it is also the only form a test can see,
        * because jsdom lays nothing out and keeps a closed `<details>`'s children
        * queryable. */}
      {open && (
        <div id={detailsId} className={styles.details}>
          {/* Board status (KF7 D). In the folded half rather than the always-visible
            * strip: it is not one of the four `KILLTEAM.md` asks to see at a glance, and
            * that strip already wraps to two lines at 390px (KF8c).
            *
            * Until this existed nothing could write the column, so a team that starts
            * off the board -- Raveners' Burrow, which `KILLTEAM.md` names -- had no way
            * to record it. Every operative in the dev database read `on_board`. */}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Board status</span>
            {incapacitated ? (
              // Read-only, because the service couples zero wounds to `incapacitated` in
              // BOTH directions and its own comment warns that automating one half is
              // worse than automating neither. The wounds stepper is how this state is
              // entered and left, so the copy says so rather than offering a control the
              // server would overrule.
              <span className={styles.fieldDerived}>
                {operativeStatusLabel('incapacitated')} — heal a wound to change this
              </span>
            ) : (
              <SegmentedToggle
                aria-label={`Board status for ${who}`}
                options={BOARD_STATUSES}
                value={operative.status === 'reserve' ? 'reserve' : 'on_board'}
                onChange={(status) =>
                  update.mutate({ rowId: operative.id, body: { status } })
                }
              />
            )}
          </div>

          {/* Tokens: the shared chip editor. No vocabulary, because tokens are
            * team-specific and numbered (#1, #21) -- see `killTeamChips`. */}
          <ChipEditor
            noun="token"
            on={who}
            chips={operative.tokens}
            suggestions={tokenSuggestions}
            pending={update.isPending}
            onChange={(tokens) => update.mutate({ rowId: operative.id, body: { tokens } })}
          />

          <Datacard game={game} operative={operative} who={who} update={update} />
        </div>
      )}
    </li>
  )
}

/** The second of the two levels of detail `KILLTEAM.md` asks for (KF4e).
 *
 * The compact row above answers "how is it doing"; this answers "what can it do", and
 * the reason both exist is the moment a player needs a weapon rule or an ability
 * mid-activation. Collapsed by default: a battle has six to fourteen operatives and
 * fourteen open datacards is not a list anyone can scan.
 *
 * Read entirely from the GAME's snapshot (#22, #24) -- the stats, the weapon profiles,
 * the abilities and the keywords were all copied when the battle started, so this needs
 * no catalog request and the card cannot change under a player mid-game. An operative
 * that transforms (#19) gets its snapshot rewritten in place, so the card follows the
 * model without the row's id moving.
 *
 * The pieces come from `killTeamCards.tsx`, the module the catalog and roster pages
 * already share. Its own header says why: a second weapon table would drift from the
 * first, and a footnote marker dropped from one would be invisible in the other. The
 * stakes are higher here, because this is the card read mid-activation. */
function Datacard({
  game,
  operative,
  who,
  update,
}: {
  game: KTGame_Read
  operative: KTGameOperative_Read
  who: string
  update: UpdateMutation
}) {
  return (
    <details className={styles.card}>
      <summary className={styles.cardSummary} aria-label={`Datacard for ${who}`}>
        Datacard
      </summary>

      <div className={styles.cardBody}>
        {/* The stats the card was PRINTED with, beside the row's live wounds above --
          * a reference sheet and a status sheet at once, which is what a printed
          * datacard plus a handful of dice tokens does on the table. */}
        <StatLine operative={operative} />
        <Keywords keywords={operative.keywords} />

        <Block title="Weapons">
          <Weapons weapons={operative.weapons} />
        </Block>

        <Block title="Abilities">
          <Abilities abilities={operative.abilities} />
        </Block>

        <Block title="Actions used">
          <ActionsUsed game={game} operative={operative} who={who} update={update} />
        </Block>

        <Block title="Transform">
          <Transform game={game} operative={operative} who={who} />
        </Block>
      </div>
    </details>
  )
}

/** Which unique actions this operative has used, and when (#23).
 *
 * Shown for the WHOLE battle rather than this turning point, which is the opposite of
 * the ploys beside the scoreboard, and deliberately so. Unique actions are abilities on
 * the datacard whose limits differ -- once per battle, once per turning point -- and #23
 * is that recording what was used AND WHEN lets the screen answer both without the
 * tracker knowing either rule. Filtering to the current turning point would throw away
 * the half that answers "once per battle".
 *
 * So nothing here counts or blocks. The same action twice is legitimate as far as the
 * tracker is concerned, and the service agrees: `_validate_actions` checks only that the
 * name is an ability on this operative's OWN snapshot, which is bookkeeping -- the
 * difference between a tracker and a notepad -- and leaves the frequency to the players.
 *
 * The picker is built FROM `operative.abilities`, so a name the service would refuse
 * cannot be chosen. Writes the whole array, like every write on this row (#7). */
function ActionsUsed({
  game,
  operative,
  who,
  update,
}: {
  game: KTGame_Read
  operative: KTGameOperative_Read
  who: string
  update: UpdateMutation
}) {
  const [name, setName] = useState('')
  const used = actionsUsed(operative)

  const write = (actions: { [key: string]: unknown }[]) =>
    update.mutate({ rowId: operative.id, body: { actions_used: actions } })

  const mark = () => {
    if (!name) return
    // The turning point comes from the GAME, the way the server stamps an activation
    // (#61). An action recorded against a turning point that is not happening is a
    // wrong row in the log.
    write([...operative.actions_used, { name, turning_point: game.turning_point }])
    setName('')
  }

  return (
    <div className={styles.actions}>
      {used.length === 0 ? (
        <p className={styles.quiet}>None used.</p>
      ) : (
        <ul className={styles.actionList}>
          {used.map((entry) => (
            <li key={entry.index} className={styles.action}>
              <span className={styles.actionName}>{entry.name}</span>
              <span className={styles.actionWhen}>TP {entry.turningPoint}</span>
              <button
                type="button"
                className={styles.actionRemove}
                // Removed by its INDEX in the raw array, never by name: the same action
                // can appear twice, so "remove this one" has no other expression.
                aria-label={`Remove ${entry.name} used in turning point ${entry.turningPoint} from ${who}`}
                onClick={() =>
                  write(operative.actions_used.filter((_, i) => i !== entry.index))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {operative.abilities.length === 0 ? (
        <p className={styles.quiet}>This card prints no abilities.</p>
      ) : (
        <div className={styles.markAction}>
          <Select
            label="Action"
            // The accessible name carries the ordinal like every other control on this
            // row (#50): two open datacards would otherwise present two fields both
            // named "Action". It CONTAINS the visible label rather than replacing it,
            // so the name a person sees is still part of the name a screen reader
            // announces -- an `aria-label` of just the operative's name would break
            // that while fixing the ambiguity.
            aria-label={`Action for ${who}`}
            options={[
              { value: '', label: 'Mark an action used…' },
              ...operative.abilities.map((ability) => ({
                value: ability.name,
                label: ability.name,
              })),
            ]}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            variant="secondary"
            aria-label={`Mark the action used for ${who}`}
            onClick={mark}
            disabled={!name}
          >
            Mark used
          </Button>
        </div>
      )}
    </div>
  )
}

type UpdateMutation = ReturnType<typeof useUpdateGameOperative>

/** One card becomes another, in place (#19).
 *
 * Inside the datacard and behind its own disclosure, so opening a card to read a weapon
 * rule does not fetch the team. The pool is the team's WHOLE operative list, and it
 * deliberately does NOT use the `availability === 'in_battle'` filter the add-operative
 * picker uses. #20 derives that flag from a conditional composition block, which only
 * Gellerpox print -- so it marks their three vermin and NOT Chaos Cult's Mutant and
 * Torment, the two cards this operation exists for, which are named in rule prose "too
 * loose to store as a column". Filtering here would offer nothing to the only team that
 * transforms.
 *
 * In PLACE: the row keeps its id, its tokens, its actions used and its board status; only
 * the catalog pointer moves and the snapshot is rewritten. So the card a player is
 * looking at changes under them, which is correct -- it is the same model on the table.
 * How many transforms a turning point allows is the players' (#1). */
function Transform({
  game,
  operative,
  who,
}: {
  game: KTGame_Read
  operative: KTGameOperative_Read
  who: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className={styles.transform}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className={styles.transformSummary} aria-label={`Transform ${who}`}>
        Become another datacard
      </summary>
      <TransformPicker game={game} operative={operative} who={who} open={open} />
    </details>
  )
}

function TransformPicker({
  game,
  operative,
  who,
  open,
}: {
  game: KTGame_Read
  operative: KTGameOperative_Read
  who: string
  open: boolean
}) {
  const transform = useTransformGameOperative(game.id)
  const [choice, setChoice] = useState('')
  const team = useKillTeam(game.kill_team_id, open)

  // Every datacard the team prints, minus the one this row already holds.
  const pool = (team.data?.operatives ?? []).filter((o) => o.id !== operative.operative_id)

  if (team.isPending) {
    return (
      <p role="status" className={styles.quiet}>
        Loading datacards…
      </p>
    )
  }

  return (
    <div className={styles.transformPicker}>
      <Select
        label="Becomes"
        aria-label={`Becomes, for ${who}`}
        options={[
          { value: '', label: 'Choose a datacard…' },
          ...pool.map((o) => ({ value: o.id, label: o.name })),
        ]}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      />
      <Button
        variant="secondary"
        aria-label={`Transform ${who} into the chosen datacard`}
        disabled={!choice || transform.isPending}
        onClick={() =>
          transform.mutate(
            { rowId: operative.id, becomesOperativeId: choice },
            { onSuccess: () => setChoice('') },
          )
        }
      >
        {transform.isPending ? 'Transforming…' : 'Transform'}
      </Button>
    </div>
  )
}

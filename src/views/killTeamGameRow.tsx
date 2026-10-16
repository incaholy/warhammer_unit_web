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
  useUpdateGameOperative,
} from '../api/killTeamGamesQueries'
import type { KTGame_Read, KTGameOperative_Read } from '../api/types'
import { actionsUsed, hasActivated } from '../lib/killTeamGame'
import { Button, SegmentedToggle, Select } from '../ui'
import { Abilities, Block, Keywords, StatLine, Weapons } from './killTeamCards'
import { ChipEditor, Stepper } from './killTeamControls'
import styles from './killTeamGameRow.module.css'

const ORDERS = [
  { value: 'engage' as const, label: 'Engage' },
  { value: 'conceal' as const, label: 'Conceal' },
]

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

  // "At position N" on every control's accessible name, because two rows can hold the
  // same datacard (#50) and the tests address rows by it. The ordinal is the row's
  // place in the list the server sent, never `operative.position` (#53).
  const who = `${operative.name} at position ${index + 1}`

  const activated = hasActivated(operative.activated_in_turning_point, game.turning_point)
  const incapacitated = operative.status === 'incapacitated'

  return (
    <li className={`${styles.row} ${incapacitated ? styles.rowOut : ''}`} aria-label={who}>
      <div className={styles.head}>
        <span className={styles.name}>
          <span className={styles.ordinal} data-testid="row-ordinal">
            {index + 1}
          </span>
          {operative.name}
        </span>
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

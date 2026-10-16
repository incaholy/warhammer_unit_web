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

import { useEffect, useRef, useState } from 'react'

import {
  useActivateGameOperative,
  useUpdateGameOperative,
} from '../api/killTeamGamesQueries'
import type { KTGame_Read, KTGameOperative_Read } from '../api/types'
import { hasActivated } from '../lib/killTeamGame'
import { Button, Input, SegmentedToggle, Tag } from '../ui'
import styles from './killTeamGameRow.module.css'

/** Matches `QuantityInput`'s debounce. Shared by value rather than by import because
 *  that constant is module-private there, and prising it out to couple two unrelated
 *  controls would be worse than restating it with a comment. */
const COMMIT_DEBOUNCE_MS = 400

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
        <Wounds operative={operative} who={who} update={update} />

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

      <Tokens operative={operative} who={who} update={update} suggestions={tokenSuggestions} />
    </li>
  )
}

type UpdateMutation = ReturnType<typeof useUpdateGameOperative>

/** Wounds, as a pair of large buttons over a debounced absolute write.
 *
 * Not `QuantityInput`, which is this repo's one debounced quantity field. That control
 * is a typed number field built for "how many do I own", and it has no maximum. A
 * battle wants a single tap per wound with the card's own maximum respected, and the
 * value is read far more often than it is typed.
 *
 * The draft is local so the number moves on the tap rather than after a round-trip,
 * and the commit is debounced so five taps are ONE request carrying the final value
 * (#7). A rejected write resets the draft to what the server holds, which is the
 * behaviour `QuantityInput` documents and the reason it exists: a refused edit must not
 * sit on screen looking saved.
 *
 * The bounds are from the row's own snapshot, so disabling at them is bookkeeping and
 * not a rule — `_validate_operative_fields` refuses anything outside `0..row.wounds`
 * anyway. The service also couples zero wounds to `incapacitated` in BOTH directions,
 * so this never sends `status`: a client that had to remember would eventually not. */
function Wounds({
  operative,
  who,
  update,
}: {
  operative: KTGameOperative_Read
  who: string
  update: UpdateMutation
}) {
  const [draft, setDraft] = useState(operative.current_wounds)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read on the error path, which runs long after the render that queued the commit.
  const latest = useRef(operative.current_wounds)

  useEffect(() => {
    latest.current = operative.current_wounds
    if (timer.current === null) setDraft(operative.current_wounds)
  }, [operative.current_wounds])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const commit = (next: number) => {
    setDraft(next)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      update
        .mutateAsync({ rowId: operative.id, body: { current_wounds: next } })
        .catch(() => setDraft(latest.current))
    }, COMMIT_DEBOUNCE_MS)
  }

  return (
    <div className={styles.wounds}>
      <Button
        variant="secondary"
        aria-label={`Take a wound from ${who}`}
        disabled={draft <= 0}
        onClick={() => commit(draft - 1)}
      >
        −
      </Button>
      <span className={styles.woundsValue} aria-label={`Wounds for ${who}`}>
        {draft}/{operative.wounds}
      </span>
      <Button
        variant="secondary"
        aria-label={`Heal a wound on ${who}`}
        disabled={draft >= operative.wounds}
        onClick={() => commit(draft + 1)}
      >
        +
      </Button>
    </div>
  )
}

/** The tokens on one operative: free text, with the battle's own tokens suggested.
 *
 * One of the three shapes KF4 closes, and all three close the same way. `tokens` is
 * `string[]` with no enum because tokens are team-specific and numbered — Raveners put
 * Poison on an operative and Tunnel markers 0–4 on the killzone — so a client-side
 * vocabulary could not express "Tunnel 3" and would put the migration a new team needs
 * back into the frontend. Suggestions come from what this battle has already used,
 * which needs no knowledge of any team.
 *
 * Writes the WHOLE array, because every write here is absolute (#7). A duplicate is
 * refused locally rather than sent: the backend validates `tokens` not at all, so two
 * identical chips would simply both exist and neither could be told from the other. */
function Tokens({
  operative,
  who,
  update,
  suggestions,
}: {
  operative: KTGameOperative_Read
  who: string
  update: UpdateMutation
  suggestions: string[]
}) {
  const [draft, setDraft] = useState('')
  const listId = `tokens-${operative.id}`

  const write = (tokens: string[]) => update.mutate({ rowId: operative.id, body: { tokens } })

  const add = () => {
    const name = draft.trim()
    if (!name || operative.tokens.includes(name)) {
      setDraft('')
      return
    }
    write([...operative.tokens, name])
    setDraft('')
  }

  return (
    <div className={styles.tokens}>
      {operative.tokens.map((token) => (
        <Tag key={token} className={styles.token}>
          {token}
          <button
            type="button"
            className={styles.tokenRemove}
            aria-label={`Remove token ${token} from ${who}`}
            onClick={() => write(operative.tokens.filter((t) => t !== token))}
          >
            ×
          </button>
        </Tag>
      ))}

      <Input
        className={styles.tokenInput}
        aria-label={`Add a token to ${who}`}
        placeholder="Token"
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <Button variant="secondary" aria-label={`Add the token to ${who}`} onClick={add}>
        Add
      </Button>
    </div>
  )
}

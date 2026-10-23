/* The two controls a battle writes through, shared across the screen.
 * See ROADMAP.md → KF4, and KILLTEAM.md #1, #7, #21.
 *
 * `ChipEditor` is the free-text list -- an operative's TOKENS and a game's MARKERS.
 * `Stepper` is the number -- the game's CP, the opponent's VP and the value of each VP
 * source. THREE uses of one control, which is why it lives here rather than being copied:
 * the two it replaced had already drifted apart on whether the commit was debounced. It
 * was four until KF10 moved an operative's WOUNDS to a dialog, which is also what took
 * the control's `max`.
 *
 * Shared rather than copied for the reason `killTeamCards.tsx` gives about the weapon
 * table: two copies of one control drift, and here they would drift in behaviour rather
 * than in appearance -- whether a blank is refused, whether a duplicate is refused,
 * whether the write is absolute.
 *
 * **Free text, with no vocabulary.** Both columns are `string[]` with no enum, and that
 * is a specification rather than an omission: tokens are TEAM-specific and markers are
 * numbered -- Raveners put Poison on an operative and Tunnel markers 0-4 on the
 * killzone -- so `KILLTEAM.md` keeps them generic precisely "so a new team needs no
 * migration". A client-side enum could not express "Tunnel 3" and would move that
 * migration into the frontend. Suggestions come from what the battle has already used,
 * which needs no knowledge of any team.
 *
 * **Writes the whole array** (#7), because every write in a battle is absolute. An
 * "add this one" body would need the server to merge, and two devices merging would
 * both win. */

import { useEffect, useRef, useState } from 'react'

/** Matches `QuantityInput`'s debounce. Restated rather than imported: that constant is
 *  module-private there, and prising it out to couple two unrelated controls would be
 *  worse than one comment. */
const COMMIT_DEBOUNCE_MS = 400

import { Button, Input, Tag } from '../ui'
import styles from './killTeamControls.module.css'

export interface ChipEditorProps {
  /** What these chips are, for the controls' accessible names: "token", "marker". */
  noun: string
  /** Who or what they are on, carried into every accessible name. Two operatives can
   *  hold the same datacard (#50), so a bare noun is ambiguous on a battle screen. */
  on: string
  chips: string[]
  /** Offered in a `datalist`, gathered by the caller from the battle itself. */
  suggestions?: string[]
  /** Hand the WHOLE next array to the caller's mutation. */
  onChange: (next: string[]) => void
  /** A write is in flight, so the controls are refused rather than queued. */
  pending?: boolean
}

export function ChipEditor({
  noun,
  on,
  chips,
  suggestions = [],
  onChange,
  pending = false,
}: ChipEditorProps) {
  const [draft, setDraft] = useState('')
  const listId = `chips-${noun}-${on.replace(/\W+/g, '-')}`

  const add = () => {
    const name = draft.trim()
    // A blank or a duplicate is refused locally rather than sent. The backend validates
    // neither column at all, so two identical chips would simply both exist and neither
    // could be told from the other -- or removed independently.
    if (!name || chips.includes(name)) {
      setDraft('')
      return
    }
    onChange([...chips, name])
    setDraft('')
  }

  return (
    <div className={styles.chips}>
      {chips.map((chip) => (
        <Tag key={chip} className={styles.chip}>
          {chip}
          <button
            type="button"
            className={styles.remove}
            aria-label={`Remove ${noun} ${chip} from ${on}`}
            disabled={pending}
            onClick={() => onChange(chips.filter((c) => c !== chip))}
          >
            ×
          </button>
        </Tag>
      ))}

      <Input
        className={styles.input}
        aria-label={`Add a ${noun} to ${on}`}
        placeholder={noun.charAt(0).toUpperCase() + noun.slice(1)}
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
      <Button
        variant="secondary"
        aria-label={`Add the ${noun} to ${on}`}
        onClick={add}
        disabled={pending}
      >
        Add
      </Button>
    </div>
  )
}

/** A number with two large buttons, written ABSOLUTELY and debounced.
 *
 * Not `QuantityInput`, this repo's one debounced quantity FIELD. That control is a typed
 * number input built for "how many do I own"; a scoreboard wants one tap per point, and
 * these numbers are read far more often than they are typed. What it borrows is the two
 * behaviours that control exists for: a debounce, so five taps are one request carrying
 * the final value (#7), and a reset on rejection, so a refused edit never sits on screen
 * looking saved.
 *
 * It had an optional `max`, which was the UPPER bound and the `8/12` denominator both.
 * KF10 took the one caller that passed it -- wounds, now a dialog -- and nothing left is
 * bounded above: CP and every VP value are capped by nothing but `INT32_MAX`. An
 * un-passable prop is an untestable one, so it is gone; the three survivors are CP, the
 * VP source and the opponent's VP.
 *
 * `min` stays and comes from DATA, not from rules: CP and every VP value are non-negative
 * in the service AND in a CHECK constraint, so disabling at zero mirrors a refusal rather
 * than applying a rule (#1). */
export interface StepperProps {
  /** Accessible name for the value, e.g. "Command points". */
  label: string
  /** Accessible names for the buttons, which read differently per caller: taking a
   *  wound is not the same verb as spending a command point. */
  downLabel: string
  upLabel: string
  value: number
  min?: number
  /** Absolute next value. A REJECTED promise resets the display to `value`. */
  onCommit: (next: number) => Promise<unknown> | void
  debounceMs?: number
}

export function Stepper({
  label,
  downLabel,
  upLabel,
  value,
  min = 0,
  onCommit,
  debounceMs = COMMIT_DEBOUNCE_MS,
}: StepperProps) {
  const [draft, setDraft] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read on the error path, which runs long after the render that queued the commit.
  const latest = useRef(value)

  useEffect(() => {
    latest.current = value
    if (timer.current === null) setDraft(value)
  }, [value])

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
      Promise.resolve(onCommit(next)).catch(() => setDraft(latest.current))
    }, debounceMs)
  }

  return (
    <div className={styles.stepper}>
      <Button
        variant="secondary"
        aria-label={downLabel}
        disabled={draft <= min}
        onClick={() => commit(draft - 1)}
      >
        −
      </Button>
      <span className={styles.value} aria-label={label}>
        {draft}
      </span>
      <Button
        variant="secondary"
        aria-label={upLabel}
        onClick={() => commit(draft + 1)}
      >
        +
      </Button>
    </div>
  )
}

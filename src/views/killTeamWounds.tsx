/* Wounds, applied in one go (ROADMAP KF10).
 *
 * This replaces the `−`/`+` stepper on an operative's row. The stepper was one tap per
 * point, and the catalog says that is the wrong unit: 952 of ~1,364 Kill Team weapons
 * roll four attack dice, the commonest normal damage is 3 and crit damage 4, and
 * operatives average 9.7 wounds. One ordinary shooting attack — two hits at 3 and a crit
 * at 4 — is ten damage, so it was ten taps, and a 24-wound operative was twenty-four.
 * Damage of 1 is rare: 36 weapons out of 1,364.
 *
 * It asks for DAMAGE, not for the remainder, because the damage is the number a player
 * has in front of them. "12 − 7" done in the head at a table is exactly where a wrong
 * value comes from — which is also why the dialog shows the result before it is
 * committed.
 *
 * Nothing about the request changes: `current_wounds` is sent as an ABSOLUTE value (#7),
 * which is what makes a duplicate delivery harmless. */

import { useState } from 'react'
import { Button, Field, Modal, SegmentedToggle } from '../ui'
import { applyWounds } from '../lib/killTeamGame'
import styles from './killTeamWounds.module.css'

type Mode = 'damage' | 'heal'

const MODES = [
  { value: 'damage' as const, label: 'Damage' },
  { value: 'heal' as const, label: 'Heal' },
]

export interface WoundsControlProps {
  /** "<name> at position N" — because two rows can hold the same datacard (#50). It
   *  names the TRIGGER and the dialog's title; the dialog's own controls need no
   *  qualifier, because only one dialog is open at a time. */
  who: string
  current: number
  /** The datacard's maximum, which is also the constraint's upper bound. */
  max: number
  /** Fire-and-forget. The caller passes a mutation's `mutate`, NOT `mutateAsync`: a
   *  refused write has to reach the mutation's own `onError`, and a rejected promise
   *  returned to this component would be dropped on the floor. */
  onCommit: (currentWounds: number) => void
  /** A write for this operative is unacknowledged. The dialog refuses to open, because
   *  `current` is server state: reopening before the refetch lands would compute the
   *  damage from the PRE-write value and send a result that skips the first hit. */
  pending?: boolean
}

export function WoundsControl({ who, current, max, onCommit, pending }: WoundsControlProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('damage')
  const [amount, setAmount] = useState('')

  // Reset where the opening happens, not in an effect watching `open`. Setting state
  // synchronously inside an effect is a cascading render, and the reset has an obvious
  // owner: a dialog that remembered "7 damage" from the last operative would be one
  // Confirm away from applying it to this one.
  const openDialog = () => {
    setMode('damage')
    setAmount('')
    setOpen(true)
  }

  const parsed = amount === '' ? null : Number(amount)
  const next = parsed === null ? current : applyWounds(current, max, mode, parsed)
  const changes = parsed !== null && next !== current

  const confirm = () => {
    if (!changes) return
    onCommit(next)
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="secondary"
        // The value is IN the name, not only in the content: `aria-label` replaces what
        // a screen reader would read, so "Wounds for X" alone would announce the control
        // and hide the one fact it exists to carry (#50, SPEC "wounds ARE their control").
        aria-label={`Wounds for ${who}: ${current} of ${max}`}
        onClick={openDialog}
        disabled={pending}
      >
        {current}/{max}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Wounds"
        description={`${who} — ${current} of ${max}`}
      >
        <div className={styles.form}>
          <SegmentedToggle
            aria-label="Damage or heal"
            options={MODES}
            value={mode}
            onChange={setMode}
          />

          <Field
            label="Amount"
            // `inputMode` rather than `type="number"`: a number input brings spinners
            // that are poor targets on a phone, and several browsers accept `e`, `+`
            // and `-` in one. So "numbers only" is a filter this component owns rather
            // than a promise the platform keeps.
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D+/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirm()
              }
            }}
          />

          {/* The result, before it is committed. Damage and heal differ only by a sign,
            * so the one mistake this design can still produce is typing the number you
            * meant as a REMAINDER -- and that is only visible here. */}
          <p className={styles.preview} aria-live="polite">
            {changes ? `${current} → ${next}` : `${current} — no change yet`}
          </p>

          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm} disabled={!changes}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

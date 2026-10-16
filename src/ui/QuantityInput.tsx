import { useEffect, useRef, useState } from 'react'
import { Input } from './Input'

/** How long the field waits after the last keystroke before persisting. Typing
 *  "12" is one request, not two. */
const COMMIT_DEBOUNCE_MS = 400

export interface QuantityInputProps {
  /** The persisted amount. The field re-syncs to it whenever it changes, unless
   *  the user is mid-edit (an edit is still waiting to be sent). */
  value: number
  /** Smallest amount the API accepts. Below it, nothing is sent: the user is
   *  still typing (or is about to be told to use Remove instead). */
  min?: number
  /** Accessible name — there is no visible label inside this component. */
  label: string
  className?: string
  /** Persist a new amount. A REJECTED promise restores the field to `value`, so a
   *  refused edit never sits on screen looking saved. Callers pass their mutation's
   *  `mutateAsync`; the rejection is handled here, and the error still reaches the
   *  mutation cache, which is what toasts it. */
  onCommit: (amount: number) => Promise<unknown>
}

/** The one debounced quantity field, shared by the inventory rows and an army's
 *  order of battle.
 *
 * It exists because those two started as copies of each other and drifted: the
 * army control guarded `< 1` while the inventory control guarded `< 0`, so `0`
 * reached the backend, came back rejected, and — with no refetch on the error path
 * — left the field showing a number the server had never accepted. Both halves are
 * fixed once, here: the `min` guard and the reset on rejection.
 */
export function QuantityInput({
  value,
  min = 1,
  label,
  className,
  onCommit,
}: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read on the error path, which runs long after this render, so it must not close
  // over the `value` this render happened to see.
  const latest = useRef(value)

  // Re-sync from the server unless the user is mid-edit (a debounce is pending).
  useEffect(() => {
    latest.current = value
    if (timer.current === null) setDraft(String(value))
  }, [value])

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  function onChange(next: string) {
    setDraft(next)
    const parsed = Number(next)
    if (timer.current !== null) clearTimeout(timer.current)
    // An empty field, a non-number, or anything under `min` is a state the user
    // passes through while typing -- keep it on screen, send nothing.
    if (next === '' || Number.isNaN(parsed) || parsed < min) return
    timer.current = setTimeout(() => {
      timer.current = null
      onCommit(parsed).catch(() => setDraft(String(latest.current)))
    }, COMMIT_DEBOUNCE_MS)
  }

  return (
    <Input
      type="number"
      min={min}
      className={className}
      aria-label={label}
      value={draft}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

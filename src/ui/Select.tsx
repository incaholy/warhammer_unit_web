import { useId } from 'react'
import type { Ref, SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'

export interface SelectOption {
  value: string
  label: string
  /** Offered but not choosable. Rendered rather than removed, because the reason it
   *  cannot be chosen is usually the thing worth seeing — a ploy already spent this
   *  turning point is still a fact about the turning point (KF12). */
  disabled?: boolean
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  /** Mono uppercase label shown above the control. */
  label: string
  /** The choices. Passed as data rather than as `<option>` children, because every
   *  caller so far builds them from a fetched list and `map`s them anyway. */
  options: SelectOption[]
  /** Optional error text rendered in `--danger` below the control. */
  error?: string
  /** Forwarded to the underlying select, so a caller can move focus to it. */
  ref?: Ref<HTMLSelectElement>
}

/** Labelled dropdown — `Field`, but for a `<select>`.
 *
 *  Labelled rather than bare, which is the opposite split from `Input`/`Field`, and
 *  deliberate: the thing that was missing was never the styling. Before this, a
 *  dropdown meant a raw `<select>` plus `useId()` plus a hand-written
 *  `<label htmlFor>` copied per view (`NewArmyModal` is the first copy), and it is
 *  that wiring — not the border — that gets forgotten. A bare `Select` would have
 *  left the gap open.
 *
 *  Same ARIA contract as `Field`, for the same reason: `role="alert"` announces the
 *  error once when it appears, and `aria-describedby` is what makes the message part
 *  of the control, read again every time it takes focus. `jsx-a11y` cannot catch the
 *  omission — both halves are individually valid markup. */
export function Select({
  label,
  options,
  error,
  id,
  className,
  'aria-describedby': describedBy,
  ...rest
}: SelectProps) {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const errorId = `${selectId}-error`
  // Keep any description the caller supplied, and add the error to it.
  const describedByIds = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ')
  const cls = [styles.select, className].filter(Boolean).join(' ')
  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {label}
      </label>
      <select
        id={selectId}
        className={cls}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds || undefined}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span id={errorId} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  )
}

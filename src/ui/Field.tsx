import { useId } from 'react'
import type { InputProps } from './Input'
import { Input } from './Input'
import styles from './Field.module.css'

export interface FieldProps extends InputProps {
  /** Mono uppercase label shown above the input. */
  label: string
  /** Optional error text rendered in `--danger` below the input. */
  error?: string
}

/** Labelled input: a mono `--faint` label, an `Input`, and optional error
 *  copy. The label is associated to the input via a generated id, and the error
 *  via `aria-describedby`.
 *
 *  `role="alert"` announces the error once, when it appears. That is not enough on
 *  its own: a screen-reader user who tabs back to the field later hears "invalid"
 *  from `aria-invalid` with no reason attached. `aria-describedby` is what makes the
 *  message part of the field itself, read every time it takes focus. A linter can't
 *  catch the omission -- both halves are individually valid markup -- which is why
 *  this was still missing after `jsx-a11y` passed. */
export function Field({
  label,
  error,
  id,
  'aria-describedby': describedBy,
  ...inputProps
}: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  // Keep any description the caller supplied, and add the error to it.
  const describedByIds = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ')
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds || undefined}
        {...inputProps}
      />
      {error && (
        <span id={errorId} role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  )
}

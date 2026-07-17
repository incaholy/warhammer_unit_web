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
 *  copy. The label is associated to the input via a generated id. */
export function Field({ label, error, id, ...inputProps }: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <Input id={inputId} aria-invalid={error ? true : undefined} {...inputProps} />
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </div>
  )
}

import styles from './SegmentedToggle.module.css'

export interface SegmentedOption<T extends string> {
  label: string
  value: T
}

export interface SegmentedToggleProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}

/** Bordered button group where the active option inverts to ink-on-paper.
 *  Used for List/Grid, Log In/Sign Up, Owned only/All units, etc. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: SegmentedToggleProps<T>) {
  const cls = [styles.group, className].filter(Boolean).join(' ')
  return (
    <div className={cls} role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value
        const segCls = [styles.segment, active ? styles.active : '']
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={opt.value}
            type="button"
            className={segCls}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

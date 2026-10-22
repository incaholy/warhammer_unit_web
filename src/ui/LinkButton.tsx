import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './Button.module.css'
import type { ButtonSize, ButtonVariant } from './Button'

export interface LinkButtonProps {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
  'aria-label'?: string
}

/** A NAVIGATION that looks like a button (F13 tier 3).
 *
 *  It exists because the two halves of the app disagreed: the Kill Team views navigate
 *  with `<Link>` and the 40k views called `navigate()` from a `<button>`. Both are
 *  operable and both are labelled, so nothing was broken -- but a button cannot be
 *  cmd-clicked into a new tab, its address cannot be copied, and a screen reader
 *  announces it as a button, which tells the user the wrong thing about what will happen.
 *
 *  Shares `Button.module.css` rather than restating it, so a change to the kit's buttons
 *  reaches these too. `display: inline-flex` and `text-decoration: none` live in that
 *  file beside the rest, since an anchor needs them and a `<button>` is unharmed by
 *  them. */
export function LinkButton({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
  'aria-label': ariaLabel,
}: LinkButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ')
  return (
    <Link to={to} className={cls} aria-label={ariaLabel}>
      {children}
    </Link>
  )
}

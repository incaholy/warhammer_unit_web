import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** Mono uppercase action button. `primary` = ink-on-paper, `secondary` =
 *  bordered, `ghost` = borderless, `danger` = destructive (`--danger`),
 *  `dangerOutline` = destructive but bordered.
 *
 *  `danger` exists so the confirm step of a destructive action does not look
 *  identical to "Create": the kit had no such variant, so "Delete" rendered as the
 *  primary button. See SPEC.md → "Design language".
 *
 *  **The two destructive variants are a pair, and which goes where is decided
 *  (F12).** `dangerOutline` is the TRIGGER — the control that opens the dialog —
 *  and `danger` is the CONFIRM inside it. Keeping them distinct is the whole
 *  reason `danger` exists; a filled trigger makes the two steps look identical,
 *  and a `ghost` trigger made Delete the faintest control on a page that renders
 *  a solid black "+ ADD FROM CATALOG" bar.
 *
 *  Three screens had three treatments before this, because each chose locally. */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ')
  return <button type={type} className={cls} {...rest} />
}

import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

/** Mono uppercase action button. `primary` = ink-on-paper, `secondary` =
 *  bordered, `ghost` = borderless, `danger` = destructive (`--danger`).
 *
 *  `danger` exists so the confirm step of a destructive action does not look
 *  identical to "Create": the kit had no such variant, so "Delete" rendered as the
 *  primary button. See SPEC.md → "Design language". */
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

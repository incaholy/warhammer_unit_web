import type { InputHTMLAttributes } from 'react'
import styles from './Input.module.css'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

/** Panel-backed, mono-font text/password/number input with a 1px `--rule`
 *  border that darkens to `--ink` on focus. */
export function Input({ type = 'text', className, ...rest }: InputProps) {
  const cls = [styles.input, className].filter(Boolean).join(' ')
  return <input type={type} className={cls} {...rest} />
}

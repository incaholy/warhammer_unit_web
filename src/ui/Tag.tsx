import type { HTMLAttributes } from 'react'
import styles from './Tag.module.css'

export type TagProps = HTMLAttributes<HTMLSpanElement>

/** Bordered mono uppercase keyword chip (`--muted` text, `--rule` border). */
export function Tag({ className, children, ...rest }: TagProps) {
  const cls = [styles.tag, className].filter(Boolean).join(' ')
  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  )
}

import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

export interface EmptyStateProps {
  /** The primary italic-serif message. */
  message: ReactNode
  /** Optional mono sub-text below the message. */
  sub?: ReactNode
  /** Optional action(s), e.g. a Button, rendered under the copy. */
  children?: ReactNode
  className?: string
}

/** Dashed `--rule` box with an italic Newsreader message + optional
 *  sub-text, used for the "no armies / no inventory / no results" states. */
export function EmptyState({ message, sub, children, className }: EmptyStateProps) {
  const cls = [styles.empty, className].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <p className={styles.message}>{message}</p>
      {sub && <p className={styles.sub}>{sub}</p>}
      {children}
    </div>
  )
}

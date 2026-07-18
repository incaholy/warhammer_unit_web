import type { HTMLAttributes } from 'react'
import styles from './Eyebrow.module.css'

export type EyebrowProps = HTMLAttributes<HTMLParagraphElement>

/** Mono uppercase micro-label shown above a serif heading (e.g. FIELD
 *  INDEX → *Collection*). */
export function Eyebrow({ className, children, ...rest }: EyebrowProps) {
  const cls = [styles.eyebrow, className].filter(Boolean).join(' ')
  return (
    <p className={cls} {...rest}>
      {children}
    </p>
  )
}

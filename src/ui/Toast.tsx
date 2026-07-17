import type { ReactNode } from 'react'
import styles from './Toast.module.css'

export interface ToastProps {
  message: ReactNode
  visible: boolean
}

/** Presentational fixed bottom-center ink pill with mono text and the
 *  `toastIn` slide-up. Timing/queueing lives in the toast context. */
export function Toast({ message, visible }: ToastProps) {
  if (!visible) return null
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      {message}
    </div>
  )
}

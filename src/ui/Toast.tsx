import type { ReactNode } from 'react'
import styles from './Toast.module.css'

/** How a toast reads: a neutral confirmation, or a failure.
 *
 * Declared here, with the styles, and re-exported by the toast bus — tone is a
 * presentational fact, and the bus only ferries it. */
export type ToastTone = 'default' | 'error'

export interface ToastProps {
  message: ReactNode
  visible: boolean
  tone?: ToastTone
}

/** Presentational fixed bottom-center pill with mono text and the `toastIn`
 *  slide-up. Timing/queueing lives in the toast context.
 *
 *  An error is `--danger` rather than `--ink`, and announces as `alert` instead of
 *  a polite `status`: "Couldn't delete this army" has to interrupt, where "Army
 *  created" can wait for a pause. Colour is not the only signal — the message
 *  itself says what happened. */
export function Toast({ message, visible, tone = 'default' }: ToastProps) {
  if (!visible) return null
  const isError = tone === 'error'
  const cls = [styles.toast, isError && styles.error].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
    >
      {message}
    </div>
  )
}

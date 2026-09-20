/* A tiny module-level event bus for toasts — same decoupling pattern as
 * client.ts's onUnauthorized. The data layer (mutation cache) and components can
 * `emitToast(...)` without importing React; the ToastProvider subscribes and
 * renders. Keeps the data layer free of any UI dependency. */

// Tone is how the pill looks, so the primitive owns it (type-only import: no
// runtime dependency from the bus on the UI kit). Re-exported so callers can keep
// importing it from the bus they already use.
import type { ToastTone } from '../ui/Toast'

export type { ToastTone }

export interface ToastEvent {
  message: string
  tone: ToastTone
}

type Listener = (event: ToastEvent) => void

const listeners = new Set<Listener>()

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitToast(message: string, tone: ToastTone = 'default'): void {
  listeners.forEach((listener) => listener({ message, tone }))
}

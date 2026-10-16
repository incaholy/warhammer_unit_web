import { useEffect, useState, type ReactNode } from 'react'
import { Toast } from '../ui'
import { onToast, type ToastEvent } from './toastBus'

const TOAST_MS = 3200

/** Subscribes to the toast bus, shows one transient message at a time (the latest
 * wins), and renders the UI-kit Toast. Mounted once near the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  // The whole event, not just its message: the tone travelled all the way from
  // `emitToast(msg, 'error')` and used to be dropped here, so a failed delete
  // rendered the same pill as "Army created".
  const [toast, setToast] = useState<ToastEvent | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const off = onToast((event) => {
      setToast(event)
      clearTimeout(timer)
      timer = setTimeout(() => setToast(null), TOAST_MS)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  // No context and no `useToast`: there is nothing to provide. A component that
  // wants to raise its own toast calls `emitToast` from the bus, which is how the
  // mutation cache does it and needs no React at all. The hook that used to live
  // here had zero call sites and an `eslint-disable` keeping it lintable.
  return (
    <>
      {children}
      <Toast message={toast?.message ?? ''} visible={toast !== null} tone={toast?.tone} />
    </>
  )
}

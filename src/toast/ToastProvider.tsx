import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Toast } from '../ui'
import { emitToast, onToast, type ToastEvent, type ToastTone } from './toastBus'

interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastApi>({ showToast: emitToast })

/** Imperative toast access for components (e.g. a view firing its own message). */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  return useContext(ToastContext)
}

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

  const showToast = useCallback((msg: string, tone?: ToastTone) => emitToast(msg, tone), [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast message={toast?.message ?? ''} visible={toast !== null} tone={toast?.tone} />
    </ToastContext.Provider>
  )
}

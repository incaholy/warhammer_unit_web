import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Toast } from '../ui'
import { emitToast, onToast, type ToastTone } from './toastBus'

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
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const off = onToast((event) => {
      setMessage(event.message)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), TOAST_MS)
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
      <Toast message={message ?? ''} visible={message !== null} />
    </ToastContext.Provider>
  )
}

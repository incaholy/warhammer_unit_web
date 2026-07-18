import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  )
}

/** Dim overlay (`overlayIn`) + centered paper card (`cardIn`). Closes on
 *  Escape and on overlay click. While open it traps Tab/Shift+Tab within the
 *  dialog, moves focus to the first focusable element (or the card) on open,
 *  and restores focus to the previously-focused element on close. */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Escape to close.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus management: move focus in on open, restore it on close.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const card = cardRef.current
    if (card) {
      const focusables = focusableElements(card)
      ;(focusables[0] ?? card).focus()
    }
    return () => {
      previouslyFocused?.focus?.()
    }
  }, [open])

  // Trap Tab/Shift+Tab within the dialog.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const card = cardRef.current
      if (!card) return
      const focusables = focusableElements(card)
      if (focusables.length === 0) {
        e.preventDefault()
        card.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === card || !card.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div className={styles.overlay} data-testid="modal-overlay" onClick={onClose}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}

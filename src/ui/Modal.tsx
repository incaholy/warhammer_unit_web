import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './Modal.module.css'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** The consequence or explanation a screen reader should hear with the title.
   *
   *  Rendered above the body and wired to `aria-describedby`, which the dialog
   *  previously had none of: a confirm dialog announced "Delete this army?" and its
   *  buttons, while the sentence saying what that removes -- and that it cannot be
   *  undone -- was just text in the body that nothing pointed at. Optional, because
   *  pointing it at a form body would read the inputs as a description. */
  description?: ReactNode
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
 *  dialog, moves focus to the first focusable element in the body (falling back
 *  to the card) on open, and restores focus to the previously-focused element on
 *  close. */
export function Modal({ open, onClose, title, description, children }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()

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
  //
  // Prefer the first focusable in the BODY over the first in the card. The card's
  // first focusable is the header Close button, so a form dialog would otherwise
  // open with focus on "x" and the user has to tab to start typing. APG asks for
  // focus to land inside the dialog, and on the first input when it contains a
  // form -- which is what this does, once, for every dialog.
  //
  // This has to live here rather than as `autoFocus` on the field. React applies
  // `autoFocus` during commit and this effect runs after it, so the effect always
  // wins: an `autoFocus` in a dialog body is silently inert.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const card = cardRef.current
    if (card) {
      const body = bodyRef.current
      const inBody = body ? focusableElements(body) : []
      const target = inBody[0] ?? focusableElements(card)[0] ?? card
      target.focus()
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
    // The overlay is decorative (`role="presentation"`), so closing on a click of
    // the backdrop *itself* needs no keyboard equivalent of its own -- Escape
    // already closes, which is the keyboard parity that matters. Comparing target
    // to currentTarget replaces the card's stopPropagation handler: a click inside
    // the card bubbles here but is not the overlay, so it does not close.
    <div
      className={styles.overlay}
      data-testid="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
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
        <div ref={bodyRef} className={styles.body}>
          {description && (
            <p id={descriptionId} className={styles.description}>
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  )
}

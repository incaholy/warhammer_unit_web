import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Modal body')).toBeInTheDocument()
  })

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Modal body')).not.toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByTestId('modal-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the card is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    fireEvent.click(screen.getByText('Modal body'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sets aria-modal and labels the dialog by its title', () => {
    render(
      <Modal open onClose={() => {}} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // Accessible name comes from the title via aria-labelledby.
    expect(dialog).toHaveAccessibleName('New Army')
    const labelledby = dialog.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'New Army' })).toHaveAttribute(
      'id',
      labelledby!,
    )
  })

  it('moves focus to the first focusable element on open', () => {
    render(
      <Modal open onClose={() => {}} title="New Army">
        <input aria-label="army-name" />
      </Modal>,
    )
    // First focusable inside the dialog is the close button (rendered first).
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('focuses the card when there is no focusable content', () => {
    render(
      <Modal open onClose={() => {}}>
        <p>No focusables here</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('restores focus to the previously-focused element on close', () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(trigger).toHaveFocus()

    const { rerender } = render(
      <Modal open onClose={() => {}} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    expect(trigger).not.toHaveFocus()

    rerender(
      <Modal open={false} onClose={() => {}} title="New Army">
        <p>Modal body</p>
      </Modal>,
    )
    expect(trigger).toHaveFocus()

    document.body.removeChild(trigger)
  })

  it('traps Tab focus within the dialog', () => {
    render(
      <Modal open onClose={() => {}} title="New Army">
        <input aria-label="army-name" />
      </Modal>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    const input = screen.getByLabelText('army-name')
    // Tabbing forward from the last focusable wraps to the first.
    input.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()
    // Shift+Tab from the first wraps to the last.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(input).toHaveFocus()
  })
})

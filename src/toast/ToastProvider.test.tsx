import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider } from './ToastProvider'
import { emitToast } from './toastBus'

describe('ToastProvider', () => {
  it('renders children and no toast initially', () => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    )
    expect(screen.getByText('app')).toBeInTheDocument()
    expect(screen.queryByText('Army created')).not.toBeInTheDocument()
  })

  it('shows a message emitted on the toast bus', () => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    )
    act(() => emitToast('Army created'))
    expect(screen.getByText('Army created')).toBeInTheDocument()
  })

  it('passes the tone through, so a failure does not read as a confirmation', () => {
    // The provider used to keep only `event.message`, so `emitToast(msg, 'error')`
    // -- which is how every mutation failure arrives -- rendered the success pill.
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    )
    act(() => emitToast("Couldn't delete this army", 'error'))

    const pill = screen.getByRole('alert')
    expect(pill).toHaveTextContent("Couldn't delete this army")
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps a plain message polite', () => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    )
    act(() => emitToast('Army created'))

    expect(screen.getByRole('status')).toHaveTextContent('Army created')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

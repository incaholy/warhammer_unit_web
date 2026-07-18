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
})

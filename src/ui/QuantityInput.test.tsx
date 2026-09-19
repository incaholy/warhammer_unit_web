import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { QuantityInput } from './QuantityInput'

const PAST_DEBOUNCE = 500

afterEach(() => {
  vi.useRealTimers()
})

function renderQty(props: Partial<React.ComponentProps<typeof QuantityInput>> = {}) {
  const onCommit = props.onCommit ?? vi.fn().mockResolvedValue(undefined)
  const view = render(
    <QuantityInput value={2} label="Quantity of Intercessors" {...props} onCommit={onCommit} />,
  )
  return { onCommit, view, field: screen.getByLabelText('Quantity of Intercessors') }
}

async function runDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(PAST_DEBOUNCE)
  })
}

describe('QuantityInput', () => {
  it('sends one request per burst of edits, carrying the last value', async () => {
    vi.useFakeTimers()
    const { onCommit, field } = renderQty()

    fireEvent.change(field, { target: { value: '4' } })
    fireEvent.change(field, { target: { value: '12' } })
    expect(onCommit).not.toHaveBeenCalled()

    await runDebounce()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(12)
  })

  it('never sends a value below min, which the API would reject', async () => {
    // The bug this component exists to prevent: the inventory control guarded
    // `< 0`, so 0 was sent, the backend refused it ("use remove_unit to remove"),
    // and the field kept showing 0.
    vi.useFakeTimers()
    const { onCommit, field } = renderQty({ min: 1 })

    fireEvent.change(field, { target: { value: '0' } })
    await runDebounce()

    expect(onCommit).not.toHaveBeenCalled()
    // Still on screen: the user may be about to type another digit.
    expect(field).toHaveValue(0)
  })

  it('keeps an empty or half-typed field without sending anything', async () => {
    vi.useFakeTimers()
    const { onCommit, field } = renderQty()

    fireEvent.change(field, { target: { value: '' } })
    await runDebounce()

    expect(onCommit).not.toHaveBeenCalled()
    expect(field).toHaveValue(null)
  })

  it('restores the persisted value when a commit is rejected', async () => {
    // A refused edit must not sit on screen looking saved, and nothing else can fix
    // it: the stored value never changed, so no refetch and no prop change follows.
    vi.useFakeTimers()
    const onCommit = vi.fn().mockRejectedValue(new Error('amount: must be >= 1'))
    const { field } = renderQty({ onCommit })

    fireEvent.change(field, { target: { value: '9' } })
    await runDebounce()

    expect(onCommit).toHaveBeenCalledWith(9)
    expect(field).toHaveValue(2)
  })

  it('re-syncs when the persisted value changes and the user is not editing', () => {
    const { view, field } = renderQty()

    view.rerender(
      <QuantityInput
        value={7}
        label="Quantity of Intercessors"
        onCommit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(field).toHaveValue(7)
  })

  it('does not overwrite what the user is typing when a refetch lands', () => {
    vi.useFakeTimers()
    const { view, field } = renderQty()

    fireEvent.change(field, { target: { value: '5' } })
    // A background refetch resolves while the edit is still pending.
    view.rerender(
      <QuantityInput
        value={3}
        label="Quantity of Intercessors"
        onCommit={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(field).toHaveValue(5)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Create Army</Button>)
    expect(screen.getByRole('button', { name: 'Create Army' })).toBeInTheDocument()
  })

  it('fires onClick when pressed', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Add</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults to type="button"', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('gives a destructive action its own look, not the primary one', () => {
    // The kit had no `danger`, so a confirm dialog's "Delete" rendered identically
    // to "Create".
    const { container: danger } = render(<Button variant="danger">Delete</Button>)
    const { container: primary } = render(<Button>Create</Button>)

    const dangerClasses = danger.querySelector('button')!.className
    const primaryClasses = primary.querySelector('button')!.className
    expect(dangerClasses).not.toBe(primaryClasses)
  })

  it('keeps a destructive trigger distinct from its own confirm button', () => {
    // The PAIR is the point, not either variant alone (F12). `dangerOutline` opens the
    // dialog and `danger` is the button inside it, so if these two ever render alike the
    // two steps of a destructive action become indistinguishable -- which is the exact
    // thing `danger` was added to prevent, one level up.
    const { container: trigger } = render(<Button variant="dangerOutline">Delete army</Button>)
    const { container: confirm } = render(<Button variant="danger">Delete</Button>)
    const { container: primary } = render(<Button>Create</Button>)

    const cls = (c: HTMLElement) => c.querySelector('button')!.className
    expect(cls(trigger)).not.toBe(cls(confirm))
    expect(cls(trigger)).not.toBe(cls(primary))
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nope' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

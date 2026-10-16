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

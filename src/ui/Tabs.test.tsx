import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { Tabs, TabPanel, type Tab } from './Tabs'

type Id = 'one' | 'two'
const TABS: Tab<Id>[] = [
  { id: 'one', label: 'First' },
  { id: 'two', label: 'Second' },
]

describe('Tabs', () => {
  it('marks only the selected tab, and names the list', () => {
    render(<Tabs tabs={TABS} value="two" onChange={vi.fn()} aria-label="Sections" idPrefix="x" />)

    const list = screen.getByRole('tablist', { name: 'Sections' })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  })

  it('reports the chosen id', () => {
    const onChange = vi.fn()
    render(<Tabs tabs={TABS} value="one" onChange={onChange} aria-label="Sections" idPrefix="x" />)

    fireEvent.click(screen.getByRole('tab', { name: 'Second' }))

    expect(onChange).toHaveBeenCalledWith('two')
  })

  it('links a tab to its panel both ways', () => {
    render(
      <>
        <Tabs tabs={TABS} value="one" onChange={vi.fn()} aria-label="Sections" idPrefix="x" />
        <TabPanel id="one" idPrefix="x">
          content
        </TabPanel>
      </>,
    )

    const tab = screen.getByRole('tab', { name: 'First' })
    const panel = screen.getByRole('tabpanel')
    // Both directions: the tab points at the panel it controls, and the panel is
    // named by the tab. One without the other leaves assistive tech unable to
    // navigate between them.
    expect(tab).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAttribute('aria-labelledby', tab.id)
  })

  it('prefixes its ids, so two tablists on one page cannot collide', () => {
    // The reason `idPrefix` exists rather than being derived: a roster page and a
    // team page can be reached from each other, and `useId` would not have made the
    // relationship between a tab and its panel readable in a test or a DOM dump.
    render(
      <>
        <Tabs tabs={TABS} value="one" onChange={vi.fn()} aria-label="A" idPrefix="left" />
        <Tabs tabs={TABS} value="one" onChange={vi.fn()} aria-label="B" idPrefix="right" />
      </>,
    )

    const left = within(screen.getByRole('tablist', { name: 'A' })).getAllByRole('tab')
    const right = within(screen.getByRole('tablist', { name: 'B' })).getAllByRole('tab')
    expect(left[0].id).toBe('left-tab-one')
    expect(right[0].id).toBe('right-tab-one')
    expect(left[0].id).not.toBe(right[0].id)
  })
})

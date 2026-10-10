import type { ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface Tab<T extends string> {
  id: T
  label: string
}

export interface TabsProps<T extends string> {
  tabs: Tab<T>[]
  value: T
  onChange: (id: T) => void
  /** Names the tablist for assistive tech. Two tabbed screens on one route would
   *  otherwise be indistinguishable in a landmark list. */
  'aria-label': string
  /** Prefixes the generated `id`s, so two Tabs on one page cannot collide. */
  idPrefix: string
}

/** A tablist with real tab semantics — `role="tab"`, `aria-selected`,
 *  `aria-controls` — and a matching `TabPanel`.
 *
 *  Not `SegmentedToggle`, which is a toggle GROUP (`role="group"` plus
 *  `aria-pressed`) and is right for a display mode like List/Grid where the content
 *  is the same and only the layout changes. These panels hold different content, so
 *  a screen reader should announce "tab 2 of 3" and be able to reach the panel the
 *  tab controls. `eslint.config.js` has allowed `tabIndex` on a `tabpanel` since
 *  before anything used one.
 *
 *  Lived inside `KillTeamView` first, which was right then — the house rule is that
 *  a feature-specific piece stays in its view and only a genuinely cross-feature one
 *  is promoted. The roster screen is the second caller, so this is that promotion. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  'aria-label': ariaLabel,
  idPrefix,
}: TabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${id}`}
          aria-selected={value === id}
          aria-controls={`${idPrefix}-panel-${id}`}
          className={[styles.tab, value === id ? styles.tabActive : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export interface TabPanelProps {
  /** The tab this panel belongs to. Must match a `Tab.id` and the `idPrefix` given
   *  to `Tabs`, or the `aria-labelledby` link points at nothing. */
  id: string
  idPrefix: string
  children: ReactNode
}

/** The panel for one tab. Rendered only while its tab is selected — one panel at a
 *  time, so there is never a second `tabpanel` in the tree for the same tablist. */
export function TabPanel({ id, idPrefix, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`}>
      {children}
    </div>
  )
}

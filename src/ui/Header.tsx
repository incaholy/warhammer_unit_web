import { Link, NavLink } from 'react-router-dom'
import { Button } from './Button'
import styles from './Header.module.css'

export interface HeaderProps {
  /** The current pathname, so the bar can show the active section's own pages.
   *  Passed in rather than read from the router here, because this component is
   *  presentational and its tests render it without a route match. */
  pathname?: string
  onLogout?: () => void
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
}

/** The pages inside each section. Keyed by the section's path prefix, which is also
 *  what decides whether the second row renders at all — `/` is the chooser and has
 *  no pages of its own. Kill Team's entries arrive with the section (KF2). */
const SECTION_PAGES: Record<string, { to: string; label: string; end?: boolean }[]> = {
  '/army-list': [
    { to: '/army-list', label: 'Armies', end: true },
    { to: '/army-list/inventory', label: 'Inventory' },
  ],
}

function sectionFor(pathname: string): string | undefined {
  return Object.keys(SECTION_PAGES).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/** Sticky translucent app bar. Two rows, per KILLTEAM.md decision #11: the top row
 *  switches SECTION (Army List / Kill Team), the second shows the pages inside the
 *  section you are in. The rows are separate because they are different kinds of
 *  thing — a flat `Armies | Inventory | Kill Team` would put two pages and a whole
 *  section side by side, and would have nowhere to grow once Kill Team gains its own
 *  rosters and games.
 *
 *  Presentational — nav targets are routes; log-out is the `onLogout` prop. */
export function Header({ pathname = '/', onLogout }: HeaderProps) {
  const section = sectionFor(pathname)
  const pages = section ? SECTION_PAGES[section] : undefined

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <span className={styles.wordmark}>Muster</span>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.subtitle}>Collection Index</span>
        </Link>
        <nav className={styles.nav} aria-label="Sections">
          <NavLink to="/army-list" className={navLinkClass}>
            Army List
          </NavLink>
          {/* Kill Team has no route until KF2. Rendered as plain text rather than
           * omitted, so the bar does not change shape when the section lands, and
           * rather than as a link, which would bounce off the catch-all. */}
          <span className={[styles.navLink, styles.navPending].join(' ')} aria-disabled="true">
            Kill Team
          </span>
        </nav>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          Log Out
        </Button>
      </div>

      {pages && (
        <div className={styles.subBar}>
          <nav className={styles.subInner} aria-label="Army List pages">
            {pages.map((page) => (
              <NavLink key={page.to} to={page.to} end={page.end} className={navLinkClass}>
                {page.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

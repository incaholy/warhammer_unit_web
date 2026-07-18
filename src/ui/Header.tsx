import { Link, NavLink } from 'react-router-dom'
import { Button } from './Button'
import styles from './Header.module.css'

export interface HeaderProps {
  onLogout?: () => void
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
}

/** Sticky translucent app bar: MUSTER wordmark + "Collection Index" subtitle,
 *  a segmented `Armies | Inventory` nav, and a Log Out button. Presentational —
 *  nav targets are routes; log-out is the `onLogout` prop. */
export function Header({ onLogout }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <span className={styles.wordmark}>Muster</span>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.subtitle}>Collection Index</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary">
          <NavLink to="/" end className={navLinkClass}>
            Armies
          </NavLink>
          <NavLink to="/inventory" className={navLinkClass}>
            Inventory
          </NavLink>
        </nav>
        <Button variant="ghost" size="sm" onClick={onLogout}>
          Log Out
        </Button>
      </div>
    </header>
  )
}

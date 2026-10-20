import { useLayoutEffect, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Button } from './Button'
import styles from './Header.module.css'

export interface HeaderProps {
  /** The current pathname, so the bar can show the active section's own pages.
   *  Passed in rather than read from the router here, because this component is
   *  presentational and its tests render it without a route match. */
  pathname?: string
  /** Whether anyone is signed in. Defaults to FALSE, which is the safe default: the
   *  Kill Team catalog is public, so this bar renders for visitors, and a default of
   *  `true` would offer "Log Out" to someone who was never logged in. */
  signedIn?: boolean
  onLogout?: () => void
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return [styles.navLink, isActive ? styles.navActive : ''].filter(Boolean).join(' ')
}

interface Section {
  prefix: string
  label: string
  pages: { to: string; label: string; end?: boolean }[]
}

/** The two sections and the pages inside each (KILLTEAM.md #11).
 *
 *  One list, read by both rows: the top row maps it to section links and the second
 *  renders the matched section's `pages`. They were separate, which meant adding a
 *  section in two places and let the second row's accessible name drift — it said
 *  "Army List pages" whichever section you were in. */
const SECTIONS: Section[] = [
  {
    prefix: '/army-list',
    label: 'Army List',
    pages: [
      { to: '/army-list', label: 'Armies', end: true },
      { to: '/army-list/inventory', label: 'Inventory' },
    ],
  },
  {
    prefix: '/kill-team',
    label: 'Kill Team',
    pages: [
      { to: '/kill-team', label: 'Catalog', end: true },
      { to: '/kill-team/rosters', label: 'Rosters' },
      { to: '/kill-team/games', label: 'Battles' },
    ],
  },
]

function sectionFor(pathname: string): Section | undefined {
  return SECTIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

/** Sticky translucent app bar. Two rows, per KILLTEAM.md decision #11: the top row
 *  switches SECTION, the second shows the pages inside the section you are in. The
 *  rows are separate because they are different kinds of thing — a flat
 *  `Armies | Inventory | Kill Team` would put two pages and a whole section side by
 *  side, and would have nowhere to grow as Kill Team gains rosters and games.
 *
 *  `/` is the chooser: it matches no section, so the second row is absent there.
 *
 *  Presentational — nav targets are routes; log-out is the `onLogout` prop. */
export function Header({ pathname = '/', signedIn = false, onLogout }: HeaderProps) {
  const section = sectionFor(pathname)
  const ref = useRef<HTMLElement>(null)

  // Publishes its own height as `--app-header-h`, because a screen with its own sticky
  // region has to sit BELOW this one and the number is not knowable in CSS: the bar is
  // two rows inside a section and one on `/`, and either row wraps at narrow widths.
  // Measured rather than hardcoded for the same reason KF8a stopped hardcoding offsets.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Only publishes a REAL measurement. jsdom lays nothing out, so `offsetHeight` is 0
    // there; writing `0px` would override the stylesheet's own fallback and pin a second
    // region flush against this one in every test. Leaving the property unset lets the
    // fallback apply, which is the honest result when nothing has been measured.
    // `getBoundingClientRect` rather than `offsetHeight`: the rows measure 60.5 and 34.5,
    // and two truncations compound into a gap a second sticky region sits inside.
    // Rounded UP, because being a pixel low overlaps and being a pixel high does not.
    const publish = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > 0) document.documentElement.style.setProperty('--app-header-h', `${h}px`)
    }
    publish()
    // Web fonts change the row heights after first paint. Observed in a browser: the
    // value published at mount was 91px against a real 96px, so the battle screen's
    // sticky region sat 5px inside the header. A ResizeObserver alone did not catch it.
    document.fonts?.ready.then(publish).catch(() => {})
    // Absent in jsdom. Guarded rather than polyfilled: with no layout engine there is
    // nothing for it to observe, so a polyfill would only make the test pass louder.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [section])

  return (
    <header ref={ref} className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <span className={styles.wordmark}>Muster</span>
          <span className={styles.divider} aria-hidden="true" />
          <span className={styles.subtitle}>Collection Index</span>
        </Link>
        <nav className={styles.nav} aria-label="Sections">
          {SECTIONS.map(({ prefix, label }) => (
            <NavLink key={prefix} to={prefix} className={navLinkClass}>
              {label}
            </NavLink>
          ))}
        </nav>
        {/* A visitor browsing the public catalog gets a way in rather than an empty
          * slot; the bar keeps its shape either way. */}
        {signedIn ? (
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Log Out
          </Button>
        ) : (
          <Link to="/login" className={styles.signIn}>
            Sign in
          </Link>
        )}
      </div>

      {section && (
        <div className={styles.subBar}>
          <nav className={styles.subInner} aria-label={`${section.label} pages`}>
            {section.pages.map((page) => (
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

import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import styles from './Breadcrumbs.module.css'

export interface Crumb {
  label: string
  /** Link target; when omitted the crumb is the current (non-link) page. */
  to?: string
}

export interface BreadcrumbsProps {
  items: Crumb[]
  className?: string
}

/** The mono crumb bar: linked crumbs with `/` separators, the last (or any
 *  `to`-less) crumb rendered as the current page. */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const cls = [styles.crumbs, className].filter(Boolean).join(' ')
  return (
    <nav className={cls} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className={styles.sep} aria-hidden="true">
              /
            </span>
          )}
          {item.to ? (
            <Link to={item.to} className={styles.crumb}>
              {item.label}
            </Link>
          ) : (
            <span
              className={[styles.crumb, styles.current].join(' ')}
              aria-current="page"
            >
              {item.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  )
}

/* "Could not find …" — one screen for two cases (ROADMAP F13 tier 3).
 *
 * Until this existed, `App.tsx` answered an unknown URL with
 * `<Navigate to="/" replace />`: a mistyped, stale or shared-but-deleted link silently
 * became the home page, with nothing to say it had not worked. Found while walking the
 * product, by assuming `/kill-team/catalog` existed when the catalog is at `/kill-team`.
 *
 * It also covers a thing that USED to exist. Three views each had their own wording for
 * a deleted record and one of them -- `ArmyView` -- rendered a bare line of text with no
 * `role="alert"` and no way back at all. Those cases differ from a bad URL only in that
 * the player knows what they were looking for, which is what `what` carries. */

import { Link, useLocation } from 'react-router-dom'
import { returnTo } from '../lib/notFound'
import styles from './NotFound.module.css'

export interface NotFoundProps {
  /** The thing that is missing — "battle", "roster", "army". Omitted for a bad URL. */
  what?: string
}

export function NotFound({ what }: NotFoundProps) {
  const { pathname } = useLocation()
  const back = returnTo(pathname)

  // `alert` on the SECTION, not on the `h1`. An explicit role REPLACES the implicit one,
  // so `role="alert"` on the heading left these four screens with no `h1` in the
  // accessibility tree and no document outline at all. The announcement is what this view
  // adds -- the old behaviour said nothing -- and a region can carry it.
  return (
    <section role="alert" className={styles.view}>
      <h1 className={styles.title}>
        {what ? `Could not find that ${what}` : 'Could not find the page'}
      </h1>
      <p className={styles.body}>
        {what
          ? `It may have been deleted, or the link may be out of date.`
          : `The address may be mistyped, or the page may have moved.`}
      </p>
      <Link to={back.to} className={styles.back}>
        ← {back.label}
      </Link>
    </section>
  )
}

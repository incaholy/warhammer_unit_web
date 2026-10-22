/* Where "not found" sends you back to (ROADMAP F13 tier 3).
 *
 * Separated from the screen because it is the half a jsdom test can hold: given a
 * pathname, which section was the player in? The screen itself is markup. */

export interface ReturnTo {
  /** An in-app route. */
  to: string
  /** What the link says, in the section's own words. */
  label: string
}

/**
 * The nearest place above `pathname` that is worth returning to.
 *
 * Ordered most specific first, and the order is load-bearing: `/kill-team/games/x` has
 * to match Battles before it matches Kill Team, or every Kill Team miss would land on
 * the catalog. Sending someone to the top of the app from a deleted battle is
 * technically a destination and practically a shrug.
 *
 * An unknown path falls through to `/`, which is the only honest answer when the
 * pathname says nothing about where they meant to be.
 */
export function returnTo(pathname: string): ReturnTo {
  if (pathname.startsWith('/kill-team/games')) return { to: '/kill-team/games', label: 'Battles' }
  if (pathname.startsWith('/kill-team/rosters')) {
    return { to: '/kill-team/rosters', label: 'Your rosters' }
  }
  if (pathname.startsWith('/kill-team')) return { to: '/kill-team', label: 'Kill Team' }
  if (pathname.startsWith('/army-list')) return { to: '/army-list', label: 'Army List' }
  return { to: '/', label: 'Muster' }
}

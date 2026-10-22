/* When the battle screen's scoreboard gets out of the way (ROADMAP KF8d).
 *
 * `KILLTEAM.md` asked for turning point, CP and VP "always visible", and that is being
 * replaced: the scoreboard hides as you scroll DOWN and comes back as you scroll UP. The
 * reason is a measurement rather than a preference — KF9 put the pinned chrome at 481px
 * of a 664px viewport, 72%, leaving 183px for the battle itself.
 *
 * The DECISION lives here, separate from the listener that drives it, because this is the
 * half that goes wrong and the half a test can reach: jsdom has no layout engine and does
 * not fire scroll events, so the wiring is only observable in KF9's browser suite, while
 * the thresholds below are ordinary arithmetic. */

export interface ChromeScrollState {
  /** Whether the scoreboard is tucked away. */
  hidden: boolean
  /** The scroll position the last DECISION was made at — not the last position seen. */
  lastY: number
}

/** Movement smaller than this decides nothing.
 *
 * Without it the chrome flips on the jitter of a finger resting on a phone, and on the
 * sub-pixel scrolling a trackpad produces. `lastY` is deliberately NOT updated when a
 * move is ignored, so a slow drag still accumulates to a decision instead of being
 * thrown away one pixel at a time. */
export const SCROLL_NOISE_PX = 8

/** Near the top the scoreboard is always shown, whatever the direction.
 *
 * Arriving at a battle and nudging the page down by ten pixels should not hide the thing
 * you came to read. */
export const ALWAYS_SHOW_ABOVE_PX = 24

export function initialChromeState(): ChromeScrollState {
  return { hidden: false, lastY: 0 }
}

/**
 * The next state, given where the page is now.
 *
 * `hideBelowY` is the scoreboard's own height: it will not hide until it has been
 * scrolled fully past, because tucking a half-visible element away reads as a glitch
 * rather than as a response.
 */
export function nextChromeState(
  state: ChromeScrollState,
  y: number,
  hideBelowY: number,
): ChromeScrollState {
  if (y <= ALWAYS_SHOW_ABOVE_PX) return { hidden: false, lastY: y }

  const delta = y - state.lastY
  if (Math.abs(delta) < SCROLL_NOISE_PX) return state

  if (delta > 0) {
    // Scrolling down. Only hide once the scoreboard is wholly behind us.
    return { hidden: y > hideBelowY, lastY: y }
  }
  // Scrolling up: come back immediately, at any depth. This is the half that makes the
  // information reachable rather than merely absent, so it has no threshold of its own.
  return { hidden: false, lastY: y }
}

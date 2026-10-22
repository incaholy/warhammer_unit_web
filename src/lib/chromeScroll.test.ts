import { describe, it, expect } from 'vitest'
import {
  ALWAYS_SHOW_ABOVE_PX,
  SCROLL_NOISE_PX,
  initialChromeState,
  nextChromeState,
  type ChromeScrollState,
} from './chromeScroll'

/** The scoreboard's height in these tests. Named rather than inlined, because every
 *  threshold below is relative to it. */
const SCOREBOARD = 150

/** Replays a sequence of scroll positions, the way a real scroll arrives. */
function replay(positions: number[], from: ChromeScrollState = initialChromeState()) {
  return positions.reduce((s, y) => nextChromeState(s, y, SCOREBOARD), from)
}

describe('chromeScroll', () => {
  it('starts shown, because a battle opens at the top of itself', () => {
    expect(initialChromeState().hidden).toBe(false)
  })

  it('hides once the scoreboard has been scrolled wholly past', () => {
    expect(replay([200, 400]).hidden).toBe(true)
  })

  it('does NOT hide while the scoreboard is still partly on screen', () => {
    // Tucking away something half-visible reads as a glitch, not as a response.
    const part = Math.round(SCOREBOARD / 2)
    expect(replay([part]).hidden).toBe(false)
  })

  it('comes back on the first upward movement, at any depth', () => {
    // The half that makes the information reachable rather than merely absent. A
    // threshold here would mean scrolling up and seeing nothing happen.
    const deep = replay([200, 900, 1600])
    expect(deep.hidden).toBe(true)
    expect(nextChromeState(deep, 1600 - SCROLL_NOISE_PX - 1, SCOREBOARD).hidden).toBe(false)
  })

  it('ignores movement under the noise floor, and does not forget it either', () => {
    // A finger resting on a phone jitters by a pixel or two. Each step below is under
    // the floor on its own, but `lastY` is not advanced when a move is ignored, so
    // together they still decide -- a slow drag upward must eventually bring the
    // scoreboard back rather than being thrown away one pixel at a time.
    let s = replay([400])
    expect(s.hidden).toBe(true)

    for (const y of [397, 394]) s = nextChromeState(s, y, SCOREBOARD)
    expect(s.hidden, 'still ignored: 3px and 6px from the last decision').toBe(true)
    expect(s.lastY).toBe(400)

    s = nextChromeState(s, 391, SCOREBOARD)
    expect(s.hidden, '9px from the last decision clears the floor').toBe(false)
    expect(s.lastY).toBe(391)
  })

  it('a single sub-floor nudge changes nothing at all', () => {
    const s = replay([400])
    const nudged = nextChromeState(s, 400 + SCROLL_NOISE_PX - 1, SCOREBOARD)
    expect(nudged).toBe(s)
  })

  it('always shows near the top, even while scrolling down', () => {
    // Arriving and nudging the page down by ten pixels should not hide what you came for.
    const s = replay([600, 900])
    expect(s.hidden).toBe(true)
    expect(nextChromeState(s, ALWAYS_SHOW_ABOVE_PX, SCOREBOARD).hidden).toBe(false)
  })

  it('survives a scroll that jumps, which is what anchor navigation does', () => {
    expect(replay([0, 2000]).hidden).toBe(true)
    expect(replay([2000, 0]).hidden).toBe(false)
  })
})

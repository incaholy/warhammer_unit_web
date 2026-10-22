/* Seeding for the browser suite (KF9).
 *
 * The suite never signs in, never creates a battle and never touches a database: every
 * `/api/v1` request is fulfilled from the SAME fixtures the jsdom suite uses, so the two
 * cannot drift into disagreeing about the shape of a game. It means this file runs with
 * no backend, no Postgres and no account, which is what keeps it something you can run
 * while working rather than a thing you set up first. */

import type { Page } from '@playwright/test'
import { makeKTGame, makeKTGameOperative, makeUser } from '../src/test/fixtures'

export const GAME_ID = 'ktg-1'

/** A battle with enough operatives to scroll past.
 *
 *  Eight rather than the fixture's three: these assertions are about what happens AFTER
 *  scrolling, and a page shorter than the viewport cannot be scrolled at all — the
 *  sticky assertions would pass by never being exercised. Eight is also the middle of
 *  what the dev database holds, which runs from five to thirteen. */
export function seededGame() {
  const operatives = Array.from({ length: 8 }, (_, i) =>
    makeKTGameOperative({
      id: `ktgo-${i + 1}`,
      position: i,
      operative_id: `kto-${i + 1}`,
      name: `Operative ${i + 1}`,
      current_wounds: 8,
      wounds: 8,
      order: i % 2 === 0 ? 'conceal' : 'engage',
      status: 'on_board',
    }),
  )
  return makeKTGame({ id: GAME_ID, operatives })
}

/** Fulfils every API call the app makes, so no route can hang waiting on a backend.
 *
 *  The catch-all matters as much as the specific routes: a view that waits forever on an
 *  unstubbed request renders its loading state, and a loading state has no sticky regions
 *  and no operatives — so an assertion would pass against a screen that never arrived. */
export async function seed(page: Page, game = seededGame()) {
  await page.addInitScript(() => {
    window.localStorage.setItem('muster.token', 'browser-suite-token')
  })

  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '')
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/me') return json(makeUser())
    if (path === `/me/kill-team/games/${game.id}`) return json(game)
    // Everything else: an empty page, so a list route renders its empty state rather
    // than its skeleton.
    return json({ items: [], total: 0, limit: 50, offset: 0 })
  })
}

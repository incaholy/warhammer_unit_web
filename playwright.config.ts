/* The browser suite's config (ROADMAP KF9).
 *
 * ONE project, ONE viewport, ONE spec file, and deliberately not in CI. This exists to
 * assert the handful of claims that are about LAYOUT, which `jsdom` cannot hold: it
 * implements the DOM and parses CSS but lays nothing out, so an element declared
 * `position: sticky; top: 0; height: 120px` reports those values back with a bounding
 * rect of 0x0.
 *
 * WebKit, because testing sticky behaviour in Chromium and shipping to iPhones tests the
 * wrong engine. `devices['iPhone 14']` also brings `hasTouch`, which is load-bearing
 * rather than decorative: KF8b scoped the 44px rule to `@media (pointer: coarse)`, so a
 * context without touch reports a fine pointer, the rule never applies, and the tap-target
 * assertion would quietly measure the desktop rendering instead.
 *
 * `workers: 1` because every assertion here measures a viewport, and parallel workers on
 * one machine make scroll settling the flakiest thing in the file. */

import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './browser',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  // Geometry settles fast or not at all; a long timeout here only slows a real failure.
  timeout: 20_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: BASE_URL,
    ...devices['iPhone 14'],
  },

  projects: [{ name: 'webkit · iPhone 14', use: { ...devices['iPhone 14'] } }],

  // Reuses the dev server if one is already up, which it usually is while working.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

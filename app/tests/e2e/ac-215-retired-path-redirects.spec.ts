/*
AC-215: given /app/planned and /app/tasks, then the browser lands on
/app/scheduled and /app respectively.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. Red until S9 rewires the router: the client this leg drives today
serves Planned at /app/planned and Tasks at /app/tasks, so neither
navigation moves.

**It is a redirect and not an alias, and the URL is what is asserted.** 9.1's
sentence is "the two retired v1 paths redirect rather than 404, because
bookmarks exist": the old address must put the person at the new one, so the
address bar, a later bookmark and a shared link all carry the page's real
path. A client rendering Scheduled at /app/planned without moving the URL
keeps the retired path alive as a second name, which is the drift the routes
table exists to prevent.

Spec: 9.1 (the v2 routes table and its redirect sentence), DES-152.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routes,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-215: the retired v1 paths redirect', () => {
  test('AC-215: /app/planned lands on /app/scheduled', async ({ page }) => {
    await page.goto(routes.planned)
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message:
          'spec 9.1: /app/planned redirects to /app/scheduled, because bookmarks exist. ' +
          'The v1 client serves Planned at the old path and moves nowhere, which is the ' +
          'red this shows until S9 rewires the router',
      })
      .toBe(routesV2.scheduled)
  })

  test('AC-215: /app/tasks lands on /app', async ({ page }) => {
    await page.goto(routes.tasks)
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message:
          'spec 9.1: /app/tasks redirects to /app, Desk being where the undated unfiled ' +
          'work lives now (DES-152)',
      })
      .toBe(routesV2.desk)
  })
})

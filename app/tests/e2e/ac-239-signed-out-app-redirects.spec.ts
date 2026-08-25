/*
AC-239: given no session, when any /app route is visited, then the browser
lands on / rather than rendering the shell; given a session, the same visit
renders the shell as it always did.

F-8, ruled at RFC 0005 change control item 18's amendment (ed33d2f), found
by running rather than reading: the shell rendered for the signed-out and
then failed every read, "Couldn't load this" over an empty Library, which
tells a lapsed session that Dana broke rather than that it ended. 10.1
gives sessions 30 days, so every account meets this screen eventually; a
bookmark, a shared link or a second browser reaches it on the first click.
The API was correct throughout, answering 401 to each read; the fault and
the fix are the client's alone.

The signed-in arm is the guard's other half: a redirect that fires on a
slow /me rather than on a refused one would bounce every real session to
the landing, which would pass the first arm and fail this one.

Spec: 9.1 (the sentence the ruling adds at the fold), 10.1, ed33d2f.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-239: the signed-out client is sent to the landing', () => {
  test('AC-239: /app with no session lands on /', async ({ page }) => {
    await page.goto(routesV2.desk)
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message:
          'spec ed33d2f (item 18, F-8): an unauthenticated visit to /app is sent to /, ' +
          'never shown the shell over a wall of 401s',
      })
      .toBe(routesV2.landing)
  })

  test('AC-239: a deeper /app route with no session lands on / too', async ({ page }) => {
    await page.goto(routesV2.scheduled)
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message:
          'spec ed33d2f (item 18, F-8): the ruling says any /app route, so the deep ' +
          'link a bookmark or a shared tab carries redirects the same way',
      })
      .toBe(routesV2.landing)
  })

  test('AC-239: a session renders the shell where it always did', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
    await expect(
      page.getByRole('navigation'),
      'a real session must keep the shell: a redirect firing on a slow /me rather than a refused one would bounce everyone',
    ).toBeVisible()
    expect(new URL(page.url()).pathname).toBe(routesV2.desk)
  })
})

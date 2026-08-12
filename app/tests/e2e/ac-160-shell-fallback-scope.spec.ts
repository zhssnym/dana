/*
AC-160: given a prior online load, then every /app path falls back
to the cached shell offline while / does not.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

9.1's route table closes with the sentence this criterion is: "Every /app
path falls back to the cached shell per 10.6; / does not." It is a rule the
specification states, which is the standard the P4 batch was admitted under,
and AC-091 asserts only the half that is easy to get right. The other half
is a scope, and a scope is what a precache gets wrong: a navigation fallback
registered at the origin serves the application shell for / as well, so an
offline visitor who has been here once lands on a signed-out application
instead of on the page 9.2 wrote for them, or on nothing at all if the shell
needs a session to render.

**The two halves are asserted in one case, against one cache.** Separately,
each is satisfiable by a client with no service worker at all: /app would
fail to load, which is not a fallback, and / would fail to load, which is
what the criterion asks for. Together they can only both hold when a
fallback exists and is scoped.

**A deep /app path is used rather than the one that was visited.** 10.6's
sentence is about navigations to paths the cache has never seen, which is
the whole reason the installed application always opens; reloading the page
that populated the cache proves nothing about the fallback.

Spec: 9.1 (the route table and its closing sentence), 10.6 (precache,
navigation fallback, network-only API), 9.2.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  expectServiceWorkerControl,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.afterEach(async ({ context }) => {
  await context.setOffline(false)
})

test.describe('AC-160: what the cached shell answers for', () => {
  test('AC-160: an unvisited /app path opens offline and / does not', async ({
    page,
    context,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routes.myDay)
    await expectServiceWorkerControl(page)

    await context.setOffline(true)

    // A path this session has not loaded, which is what the fallback is for.
    await page.goto(routes.folder(seedIds.groceries))
    await expect(
      page.getByRole('link', { name: 'My Day', exact: true }),
      'spec 10.6: navigations fall back to the cached shell so the installed app always ' +
        'opens, and 9.1 says every /app path. A fallback that serves only the paths already ' +
        'visited is a cache, not a fallback',
    ).toBeVisible()

    // The other half of the same sentence. Either the navigation fails, which
    // is what an origin with no fallback for / does offline, or it succeeds
    // and answers something that is not the application shell. Served from
    // the shell is the one outcome 9.1 rules out, so that is what is
    // asserted, as one thing rather than as a branch.
    const reached = await page
      .goto(routes.landing)
      .then(() => true)
      .catch(() => false)
    const shellHere =
      reached &&
      (await page.getByRole('link', { name: 'My Day', exact: true }).count()) > 0
    expect(
      shellHere,
      'spec 9.1: "/ does not" fall back to the cached shell. A navigation fallback registered ' +
        'at the origin catches / too, and an offline visitor who has been here once then ' +
        'lands on a signed-out application instead of the public page 9.2 wrote for them',
    ).toBe(false)
  })

  test('AC-160: the shell that opens offline is the shell, not a saved page', async ({
    page,
    context,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routes.tasks)
    await expectServiceWorkerControl(page)

    await context.setOffline(true)
    await page.goto(routes.important)

    // 10.6 precaches the versioned application shell, which is HTML, JS, CSS,
    // fonts and icons: chrome without data. So the sidebar is there and the
    // rows are not, and a fallback serving the last HTML response for every
    // route would show the wrong page's rows instead.
    await expect(
      page.getByRole('link', { name: 'Tasks', exact: true }),
      'spec 10.6: the shell is precached, so the global chrome of 9.1 renders',
    ).toBeVisible()
    await expect(
      page.getByText('Sort inbox'),
      'spec 10.6: API requests are network-only and never cached, so the rows of the page ' +
        'that was open when the connection went are not the rows this one opens with',
    ).toHaveCount(0)
  })
})

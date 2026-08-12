/*
AC-174: given the application shell, then the sidebar is a navigation
landmark carrying the app name, the global search control and the avatar
menu, the app name links to My Day, and no chrome exists above or outside it.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

It exists because two separate things this package changes meet on one
surface and neither is visible to any criterion that already passes. 9.1 lost
its top bar on the owner's ruling of 2026-08-13, which moves the app name,
the search control and the avatar menu into the sidebar; and 9.1's new roles
table fixes the sidebar as a navigation landmark, which the designer's
prototype does not carry at all. Measured on 2026-08-13 against the running
prototype: zero nav elements and zero role="navigation" anywhere in its
sidebar. So the port has to add a landmark that the code being ported does
not have, and a landmark nobody asserts is a landmark the port loses.

**"No chrome above or outside it" is asserted as the absence of a banner
landmark.** That is what the removed top bar was: a header of the application
rather than of a page. Measured on 2026-08-13, the current client exposes
exactly one banner, the shell top bar, and its per-page headers expose none,
being header elements inside main; the designer's prototype exposes none at
all. So this assertion separates the two shells precisely and reads nothing
about a page's own header, which is content rather than chrome.

**The three relocated controls are asserted inside the landmark and asserted
to be there once.** 9.1's own paragraph says what it has ever required of
them is that they exist, that the app name links to My Day, and that each is
reachable by its role and its name. A client that leaves a second copy in a
bar above satisfies "inside the sidebar" while still carrying the chrome this
criterion says is gone.

**The avatar menu is addressed by the viewer, which is the datum it is
generated from.** 9.1 names the search control "Search" in its control table
and names the avatar menu nowhere, describing it only as the avatar menu with
Settings and Sign out inside it. An avatar is the person, so the viewer's own
display name is what generates this control exactly as a folder's name
generates its row, which is 9.1's sections rule applied one level out; the
prototype and the current client both satisfy it. The naming gap is routed to
the Integration Steward all the same, because a description is a locator that
finds the wrong control on the day a second one resembles it, and that is the
reason 9.1 named eight controls in the first place.

Spec: 9.1 (the sidebar as the only chrome and what its header and footer
carry, the roles table, the control table, the routes table), 9.2 (the
callback lands on My Day, which is what the app name links to), 9.7 (Settings
and Sign out are what the avatar menu offers).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routes,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The seeded viewer's display name, which generates the avatar menu. */
const VIEWER = 'Hassan'

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-174: the sidebar is the application\'s only chrome', () => {
  test('AC-174: it is a navigation landmark', async ({ page }) => {
    await page.goto(routes.myDay)

    await expect(
      sidebar(page),
      "spec 9.1's roles table, added at the RFC 0002 change control on 2026-08-13: the sidebar " +
        'is a navigation landmark, on the ground that it is this section\'s only chrome and ' +
        'holds the page set, and a landmark is what lets a person skip to it. The markup this ' +
        'package adopts carries no nav element and no role="navigation" anywhere in its ' +
        'sidebar, which is why the roles table exists and why this is asserted by number',
    ).toHaveCount(1)
  })

  test('AC-174: it carries the app name, the search control and the avatar menu', async ({
    page,
  }) => {
    await page.goto(routes.myDay)
    const nav = sidebar(page)

    const appName = nav.getByRole('link', { name: /Dana/ })
    await expect(
      appName,
      "spec 9.1: the sidebar's header carries the app name. It sat in a top bar until the " +
        "owner's ruling of 2026-08-13 removed the bar, and what this section has ever required " +
        'of the control is that it exists and is reachable by its role and its name',
    ).toHaveCount(1)
    await expect(
      appName,
      "spec 9.1 and 9.2: the app name links to My Day, which 9.1's routes table puts at /app " +
        'and which 9.2 makes where first-run lands. A link rather than a handler, since a page ' +
        'you can reach at a URL is navigated to',
    ).toHaveAttribute('href', routes.myDay)

    await expect(
      nav.getByRole('button', { name: 'Search', exact: true }),
      "spec 9.1: the sidebar's header carries the global search control, named \"Search\" in " +
        'that section\'s control table. Exact, for the reason every control match in this leg ' +
        'is exact',
    ).toHaveCount(1)

    await expect(
      nav.getByRole('button', { name: new RegExp(VIEWER) }),
      "spec 9.1: the sidebar's footer carries the avatar menu. Addressed by the viewer because " +
        'an avatar is the person and this section names no string for it, which is the same ' +
        "rule 9.1's sections table uses where a region's name comes from data",
    ).toHaveCount(1)
  })

  test('AC-174: the avatar menu offers Settings and Sign out', async ({ page }) => {
    await page.goto(routes.myDay)
    await clickControl(
      sidebar(page).getByRole('button', { name: new RegExp(VIEWER) }),
      'spec 9.1: the avatar menu is in the sidebar footer and it opens',
    )

    await expect(
      page.getByRole('menuitem', { name: /settings/i }),
      'spec 9.1: the avatar menu carries Settings and Sign out. Without this the menu is a ' +
        'control that opens nothing, which satisfies every assertion above',
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /sign out/i }),
      'spec 9.1: the avatar menu carries Settings and Sign out',
    ).toBeVisible()
  })

  test('AC-174: no chrome exists above or outside it', async ({ page }) => {
    // Every page rather than one, because a bar rendered by one route and not
    // another is exactly the shape a partial port leaves behind.
    for (const path of [routes.myDay, routes.tasks, routes.planned, routes.settings]) {
      await page.goto(path)
      await expect(
        sidebar(page),
        `spec 9.1 at ${path}: the sidebar is the application's only chrome, so it is on every ` +
          'page',
      ).toHaveCount(1)
      await expect(
        page.getByRole('banner'),
        `spec 9.1 at ${path}: the top bar is removed, transcribed into that section from the ` +
          "owner's ruling of 2026-08-13, and the sidebar is what the section calls the " +
          "application's only chrome. A banner landmark is what an application header is; a " +
          "page's own header sits inside main and is content rather than chrome, so this " +
          'assertion reads the bar and nothing else',
      ).toHaveCount(0)
    }
  })
})

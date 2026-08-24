/*
AC-214: given the sidebar, then Desk, Today, Scheduled, Assignments,
Important, and All are links in that order, Done is absent until pinned, and
the folder block is headed Library.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. It runs in the browser leg (the RFC's own split at its Append
unit), and it is red until S9 lands the DES-152 shell: the client this leg
drives today renders My Day, Tasks and Planned, no Desk entry, and a folder
block with no heading at all, which is the right reason for the red.

**The order is asserted, not only the presence.** DES-152's model is a fixed
page block in a fixed order, 9.1 restating it as "in fixed order"; a sidebar
holding all six as links in some other order satisfies every per-entry
assertion and is still not the specified sidebar.

**Done's absence is asserted against the default pins and its presence
against a written pin**, in that order, because the criterion's word is
"until". The pin list is 4.19's pinned_views behind the v2 /settings surface,
which is what the Settings page of 9.7 writes; the account's own default is
what ships Done unpinned (DES-152).

Spec: 9.1 (the page block, its order, the Library heading, the roles table),
9.7 (the pin list), 4.19 (pinned_views), DES-152.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  patchBundle,
  routes,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's page block in its fixed order, with the v2 routes table's paths. */
const PAGES = [
  ['Desk', routesV2.desk],
  ['Today', routesV2.today],
  ['Scheduled', routesV2.scheduled],
  ['Assignments', routesV2.assignments],
  ['Important', routes.important],
  ['All', routes.all],
] as const

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-214: the v2 sidebar', () => {
  test('AC-214: the six page entries are links in the fixed order', async ({ page }) => {
    // The default pins are the six permanent pages exactly, so this case
    // runs against the account as it ships rather than after a write.
    await patchBundle(page, {
      pinned_views: ['desk', 'today', 'scheduled', 'assignments', 'important', 'all'],
    })
    await page.goto(routesV2.desk)
    const nav = sidebar(page)

    for (const [name, path] of PAGES) {
      const entry = nav.getByRole('link', { name, exact: true })
      await expect(
        entry,
        `spec 9.1: the page block holds "${name}" as a link. The v1 client renders no such ` +
          'entry, which is the red this criterion shows until S9 lands the DES-152 shell',
      ).toHaveCount(1)
      await expect(
        entry,
        `spec 9.1's routes table: "${name}" is at ${path}`,
      ).toHaveAttribute('href', path)
    }

    // The order, read off the page rather than implied by six passes. The
    // sidebar may hold links this list does not name (folders, the footer),
    // so the assertion is that these six appear in this relative order.
    const links = await nav.getByRole('link').allTextContents()
    const positions = PAGES.map(([name]) =>
      links.findIndex((text) => text.trim().startsWith(name)),
    )
    expect(
      positions.every((at, i) => at >= 0 && (i === 0 || at > (positions[i - 1] ?? -1))),
      `spec 9.1: the page block's order is fixed as Desk, Today, Scheduled, Assignments, ` +
        `Important, All. Read from the sidebar: ${JSON.stringify(links)}`,
    ).toBe(true)
  })

  test('AC-214: Done is absent until pinned', async ({ page }) => {
    await patchBundle(page, {
      pinned_views: ['desk', 'today', 'scheduled', 'assignments', 'important', 'all'],
    })
    await page.goto(routesV2.desk)
    const nav = sidebar(page)
    await expect(
      nav.getByRole('link', { name: 'Done', exact: true }),
      'spec 9.1: an unpinned view is "present only when pinned", and DES-152 ships Done ' +
        'unpinned. A sidebar showing Done against the default pins has hardcoded the v1 six',
    ).toHaveCount(0)

    await patchBundle(page, {
      pinned_views: ['desk', 'today', 'scheduled', 'assignments', 'important', 'all', 'done'],
    })
    await page.goto(routesV2.desk)
    await expect(
      nav.getByRole('link', { name: 'Done', exact: true }),
      'spec 9.1 and 9.7: pinning Done through the pin list puts it in the page block, which ' +
        'is what "until pinned" means; a pin that writes and never renders is 9.7 lying',
    ).toHaveCount(1)
  })

  test('AC-214: the folder block is headed Library', async ({ page }) => {
    await page.goto(routesV2.desk)
    await expect(
      sidebar(page).getByRole('heading', { name: 'Library' }),
      'spec 9.1: the Library block is "a collapsible block headed ‘Library’", holding ' +
        'the shelves and folders. The v1 sidebar renders its folder list with no heading',
    ).toBeVisible()
  })
})

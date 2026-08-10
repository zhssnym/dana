/*
AC-095: given Important, All, and Done toggled hidden, then the sidebar omits
them while their URLs still render the pages (visibility is navigation
preference only).

This is the criterion the 9.1 route table was landed for. Its second half is
a statement about URLs, and until the P8 kickoff the paths existed only
inside a router nobody had written, so the criterion could be read but not
addressed. 9.1 carries them now and this file navigates to them as
specification text.

**Rendered, not merely reachable.** A route that answers with an empty page,
a redirect to My Day, or a "this page is hidden" notice satisfies "the URL
still renders" in the loosest reading and defeats the parenthesis, which is
the operative half: visibility is a navigation preference only, the sentence
AC-123 pins on the server side. So each hidden page is asserted to show a
seeded row that belongs on it, which is the only evidence that the page
under the URL is the page and not a placeholder standing where it was.

**The default state is the first case and needs no toggling.** 4.10 ships
show_done false, so a seeded account already has one hidden page. It is the
sharper of the two directions, because an implementation that renders the
sidebar from a static list and never reads settings passes every toggling
case by accident and fails here.

**This spec restores the 4.10 defaults after each case.** Every other spec in
this leg reads the same sidebar out of the same shared database, so leaving
Important and All hidden would change what they see. Restored through 7.2
rather than through the page, so the restoration cannot fail for the reason
the test is about.

Spec: 9.7 (the three toggles and the always-shown note), 9.1 (the sidebar's
fixed order and its route table), 7.2, 4.10, 6 Q4, Q5, Q6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  csrfToken,
  routes,
  seedSubs,
  sidebarLink,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The three pages 9.7 makes toggleable, with the row each one must show. */
const TOGGLEABLE = [
  { name: 'Important', path: routes.important, key: 'show_important', row: 'Buy milk' },
  { name: 'All', path: routes.all, key: 'show_all', row: 'Sort inbox' },
  { name: 'Done', path: routes.done, key: 'show_done', row: 'Pay rent' },
] as const

/** The three 9.7 says are always shown. */
const PERMANENT = ['My Day', 'Tasks', 'Planned'] as const

async function setPages(page: Page, values: Record<string, boolean>): Promise<void> {
  const token = await csrfToken(page.context())
  const response = await page.request.patch('/api/v1/me/settings', {
    data: values,
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `PATCH /me/settings answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.afterEach(async ({ page }) => {
  // Back to 4.10's defaults, which is the state the seed leaves and every
  // other spec in this leg assumes.
  await setPages(page, { show_important: true, show_all: true, show_done: false })
})

test.describe('AC-095: hidden pages are a navigation preference', () => {
  test('AC-095: Done ships hidden and its URL renders the page', async ({ page }) => {
    await page.goto(routes.myDay)
    await expect(
      sidebarLink(page, 'Done'),
      'spec 4.10 defaults show_done to false and 9.7 makes Done one of the three toggles, so ' +
        'a seeded account opens with Done absent from the sidebar of 9.1',
    ).toHaveCount(0)

    await page.goto(routes.done)
    await expect(
      page.getByText('Pay rent'),
      'spec 9.1 route table: /app/done is the Done page whether or not the sidebar links to ' +
        'it, and 6 Q6 puts the seeded completed task on it. A route that renders nothing, or ' +
        'renders a notice, or redirects, defeats "navigation preference only"',
    ).toBeVisible()
  })

  test('AC-095: all three toggled hidden are omitted and all three still render', async ({
    page,
  }) => {
    await setPages(page, { show_important: false, show_all: false, show_done: false })
    await page.goto(routes.myDay)

    for (const surface of TOGGLEABLE) {
      await expect(
        sidebarLink(page, surface.name),
        `spec 9.7: ${surface.name} is toggled off, and 9.1's sidebar lists a page only if it ` +
          'is permanent or toggled visible',
      ).toHaveCount(0)
    }

    for (const surface of TOGGLEABLE) {
      await page.goto(surface.path)
      await expect(
        page.getByText(surface.row),
        `spec 9.1 route table: ${surface.path} renders ${surface.name} while it is hidden, ` +
          `and a rendered ${surface.name} carries the seeded row that belongs on it`,
      ).toBeVisible()
    }
  })

  test('AC-095: the three permanent pages are never omitted', async ({ page }) => {
    await setPages(page, { show_important: false, show_all: false, show_done: false })
    await page.goto(routes.myDay)

    for (const name of PERMANENT) {
      await expect(
        sidebarLink(page, name),
        `spec 9.7: "My Day, Tasks, and Planned are always shown", so hiding everything ` +
          `hideable leaves ${name} in the sidebar. An implementation reading the three ` +
          'booleans as a filter over all six pages fails here',
      ).toBeVisible()
    }
  })

  test('AC-095: toggling a page back on returns it to the sidebar', async ({ page }) => {
    await setPages(page, { show_important: false, show_all: false, show_done: false })
    await page.goto(routes.myDay)
    await expect(
      sidebarLink(page, 'Important'),
      'spec 9.7: the page starts hidden here, which is the state the restoration below is ' +
        'measured against',
    ).toHaveCount(0)

    await setPages(page, { show_important: true, show_all: true, show_done: true })
    await page.goto(routes.myDay)
    for (const surface of TOGGLEABLE) {
      await expect(
        sidebarLink(page, surface.name),
        `spec 9.7: ${surface.name} is toggled visible, so 9.1's sidebar lists it. Hiding that ` +
          'is reversible is what makes it a preference rather than a deletion',
      ).toBeVisible()
    }
  })

  test('AC-095: the toggles on the Settings page drive the sidebar', async ({ page }) => {
    // The criterion says "toggled hidden", and 9.7 is where a person toggles.
    // The four cases above set the state through 7.2 so that they measure the
    // sidebar and the routes rather than the Settings page; this one measures
    // the control, so the two halves of the surface fail separately and each
    // red names one of them.
    await page.goto(routes.settings)
    await clickControl(
      page.getByRole('switch', { name: 'Important' }),
      'spec 9.7: the Pages section carries three toggles, one per hideable page',
    )
    await page.goto(routes.myDay)
    await expect(
      sidebarLink(page, 'Important'),
      'spec 9.7: the Pages section carries three toggles, and turning one off is what hides ' +
        'its page from the sidebar of 9.1',
    ).toHaveCount(0)

    await page.goto(routes.important)
    await expect(
      page.getByText('Buy milk'),
      'spec 9.1 route table: the page is still at its URL after a person hid it, which is ' +
        'the whole of AC-095 stated from the control that does the hiding',
    ).toBeVisible()
  })
})

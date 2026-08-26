/*
AC-095: given Important, All, and Done toggled hidden, then the sidebar omits
them while their URLs still render the pages (visibility is navigation
preference only).

This is the criterion the 9.1 route table was landed for. Its second half is
a statement about URLs, and until the P8 kickoff the paths existed only
inside a router nobody had written, so the criterion could be read but not
addressed. 9.1 carries them now and this file navigates to them as
specification text.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and the toggle is
what moved.** The criterion's own sentence is untouched and stays true:
Important, All and Done are all three still hideable, and their paths are the
three rows of 9.1's table that did not move. What changed is what "toggled"
means. v1's 9.7 carried three booleans and a note that My Day, Tasks and
Planned were always shown; v2's 9.7 carries the pin list, "every view Dana
has, native and saved alike, each with the page's own mark, its one-line
question, and a pin switch; Desk locked", and only Desk is locked. So the
three cases that set the state set `pinned_views` through the /settings
bundle of 4.19, which is what the Settings page writes, and the case about
what cannot be hidden is about Desk rather than about three pages.

**The order of the cases below is load-bearing, which is unusual enough to
say.** S7's fold makes `pinned_views` the record from the moment it is first
written, and derives it from the three v1 flags until then. The case that
measures the Settings control is therefore first, while the derivation is
still live; every case after it writes pins outright. A reader reordering
this file will find the Settings case failing for a reason that has nothing
to do with the Settings page.

**Rendered, not merely reachable.** A route that answers with an empty page,
a redirect to Desk, or a "this page is hidden" notice satisfies "the URL
still renders" in the loosest reading and defeats the parenthesis, which is
the operative half: visibility is a navigation preference only, the sentence
AC-123 pins on the server side. So each hidden page is asserted to show a
seeded row that belongs on it, which is the only evidence that the page under
the URL is the page and not a placeholder standing where it was.

**The default state is a case of its own and needs no toggling.** 9.7 ships
Done, Abandoned and Anytime unpinned, so a seeded account already has hidden
pages. It is the sharper direction, because an implementation that renders
the sidebar from a static list and never reads the pin list passes every
toggling case by accident and fails there.

**This spec restores the defaults after each case.** Every other spec in this
leg reads the same sidebar out of the same shared database, so leaving
Important and All unpinned would change what they see. Restored through the
API rather than through the page, so the restoration cannot fail for the
reason the test is about, and restored as pins rather than as flags because
after the first write the flags no longer reach this surface.

Spec: 9.7 (the pin list, and Desk locked), 9.1 (the sidebar's page block in
its fixed order, and the v2 routes table), 4.19 (pinned_views), 7.2 and 4.10
(the v1 flags the fold derives from), 6 Q4, Q5, Q6.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  DEFAULT_PINS,
  patchBundle,
  patchSettings,
  routesV2,
  seedSubs,
  sidebarLink,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The three pages this criterion names, with the row each one must show. */
const HIDEABLE = [
  { name: 'Important', path: routesV2.important, key: 'important', row: 'Buy milk' },
  { name: 'All', path: routesV2.all, key: 'all', row: 'Sort inbox' },
  { name: 'Done', path: routesV2.done, key: 'done', row: 'Pay rent' },
] as const

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.afterEach(async ({ page }) => {
  // Back to the pin list 9.7 ships, which is the state every other spec in
  // this leg assumes, and back to 4.10's flags for the same reason.
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS] })
  await patchSettings(page, { show_important: true, show_all: true, show_done: false })
})

test.describe('AC-095: hidden pages are a navigation preference', () => {
  // First in the file, deliberately: see the header. The fold derives the pin
  // list from the v1 flags until pins are written, and this is the case that
  // measures the control a person actually reaches.
  test('AC-095: the toggle on the Settings page drives the sidebar', async ({ page }) => {
    // The criterion says "toggled hidden", and 9.7 is where a person toggles.
    // The cases below set the state through the API so that they measure the
    // sidebar and the routes rather than the Settings page; this one measures
    // the control, so the two halves of the surface fail separately and each
    // red names one of them.
    await page.goto(routesV2.settings)
    await clickControl(
      page.getByRole('switch', { name: 'Pin Important to the sidebar', exact: true }),
      'spec 9.7: the Settings page carries one pin switch per view in its Views list, and a ' +
        'pin switch is named for what it does to the view it names. This case pressed a ' +
        'switch called "Important" on the v1 page of three booleans until S16 built the list ' +
        'the section has always described; AC-241 owns the list itself, and this owns what ' +
        'pressing one row of it does to the sidebar',
    )
    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Important'),
      'spec 9.7 and 9.1: turning a view off is what takes its entry out of the sidebar page ' +
        'block',
    ).toHaveCount(0)

    await page.goto(routesV2.important)
    await expect(
      page.getByText('Buy milk'),
      "spec 9.1 route table: the page is still at its URL after a person hid it, which is " +
        'the whole of AC-095 stated from the control that does the hiding',
    ).toBeVisible()
  })

  test('AC-095: Done ships unpinned and its URL renders the page', async ({ page }) => {
    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Done'),
      'spec 9.7: "Done, Abandoned and Anytime ship unpinned", so a seeded account opens with ' +
        "Done absent from 9.1's page block. This is the direction an implementation that " +
        'renders a static list passes every other case by accident and fails',
    ).toHaveCount(0)

    await page.goto(routesV2.done)
    await expect(
      page.getByText('Pay rent'),
      'spec 9.1 route table: /app/done is the Done page whether or not the sidebar links to ' +
        'it, and 6 Q6 puts the seeded completed task on it. A route that renders nothing, or ' +
        'renders a notice, or redirects, defeats "navigation preference only"',
    ).toBeVisible()
  })

  test('AC-095: all three unpinned are omitted and all three still render', async ({
    page,
  }) => {
    await patchBundle(page, {
      pinned_views: ['desk', 'today', 'scheduled', 'assignments'],
    })
    await page.goto(routesV2.desk)

    for (const surface of HIDEABLE) {
      await expect(
        sidebarLink(page, surface.name),
        `spec 9.7: ${surface.name} is unpinned, and 9.1's page block lists a view only when ` +
          'the pin list has pinned it',
      ).toHaveCount(0)
    }

    for (const surface of HIDEABLE) {
      await page.goto(surface.path)
      await expect(
        page.getByText(surface.row),
        `spec 9.1 route table: ${surface.path} renders ${surface.name} while it is hidden, ` +
          `and a rendered ${surface.name} carries the seeded row that belongs on it`,
      ).toBeVisible()
    }
  })

  test('AC-095: Desk cannot be unpinned', async ({ page }) => {
    // v1's 9.7 kept three pages permanent and said so in a note; v2 keeps
    // one, and gives the reason in the section itself: "Desk cannot be
    // unpinned: it is where a task goes when you have not said where, so it
    // has to stay reachable." A person who hid it would go on filling it with
    // no way back to what they had filed.
    await patchBundle(page, { pinned_views: [] })
    await page.goto(routesV2.desk)

    await expect(
      sidebarLink(page, 'Desk'),
      'spec 9.7: Desk is locked pinned, so a write that names no pins at all still leaves it ' +
        'in the sidebar. An implementation reading the pin list as a plain filter empties the ' +
        'page block here and strands a person on whatever page they are standing on',
    ).toBeVisible()
    await expect(
      sidebarLink(page, 'Today'),
      'and the write did take: every view but Desk carries a pin switch, so Today goes when ' +
        'the pin list drops it. Without this half the assertion above passes against a client ' +
        'that ignored the write',
    ).toHaveCount(0)
  })

  test('AC-095: pinning a page back returns it to the sidebar', async ({ page }) => {
    await patchBundle(page, {
      pinned_views: ['desk', 'today', 'scheduled', 'assignments'],
    })
    await page.goto(routesV2.desk)
    await expect(
      sidebarLink(page, 'Important'),
      'spec 9.7: the page starts hidden here, which is the state the restoration below is ' +
        'measured against',
    ).toHaveCount(0)

    await patchBundle(page, {
      pinned_views: [...DEFAULT_PINS, 'done'],
    })
    await page.goto(routesV2.desk)
    for (const surface of HIDEABLE) {
      await expect(
        sidebarLink(page, surface.name),
        `spec 9.7: ${surface.name} is pinned, so 9.1's page block lists it. That hiding is ` +
          'reversible is what makes it a preference rather than a deletion',
      ).toBeVisible()
    }
  })
})

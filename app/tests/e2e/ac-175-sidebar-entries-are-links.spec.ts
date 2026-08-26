/*
AC-175: given the six page entries and each folder row in the sidebar, then
each is a link whose destination is that surface's path in 9.1's routes
table, and the entry for the current page is marked as current.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

It exists because the markup this package adopts renders these entries the
other way. Measured on 2026-08-13 against the running prototype: the six page
entries are button elements carrying aria-current="page", and the only anchor
in its sidebar is the brand. 9.1's roles table, added at the same change
control and carried into v2 unchanged in this respect, fixes them as links
and gives the ground: the routes table makes every page a URL, and a page
reachable at a URL is navigated to. AC-095's second half, that a page hidden
from the sidebar still renders at its path, is meaningful only if the client
agrees.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and the count
survives the rework.** DES-152 replaced the six v1 pages with a page block of
its own, and it is also six: Desk, Today, Scheduled, Assignments, Important
and All, in that fixed order, plus whichever of Done, Abandoned, Anytime and
the viewer's saved views the pin list has pinned. So this criterion's "the
six page entries" still reads true, of a different six, and what moved is the
names and three of the paths. The roles table moved too, but not here: it
still says the page entries and each folder and shelf row are links, on the
same ground.

**The destination is asserted and not merely the role.** A link with no
destination is an anchor a person cannot open in a new tab, cannot bookmark
and cannot follow with scripting unavailable, which is the whole of what the
roles table's reason turns on, and it satisfies every assertion that only
reads the role. Each href is compared to the routes table restated in the
harness rather than to a string this file invents. It matters more in v2 than
it did in v1, because 9.1 now makes "Open in a new tab" a first-class act of
the tab strip, and a button cannot serve it.

**The six are made present first.** 9.1's page block holds a view only when
the pin list has pinned it, so the pins are written through the /settings
bundle before the sidebar is read, which is the same state a person reaches
from 9.7's Views list. Written rather than derived: after the first write the
v1 flags no longer reach this surface, so a file that set flags here would be
asserting whichever of the two records happened to be live.

**The current entry is asserted on a page that is not the first one.** A
client that marks Desk as current unconditionally passes on /app and fails
nowhere else, so the assertion is made on Scheduled and the negative is made
on Desk in the same case.

**Folder rows are asserted for every kind the sidebar lists, not for one.**
9.1's Library holds shelves and folders as one ordered list, and the seeded
account carries the default folder and a labeled shared one, so two kinds are
on the page. A client can perfectly well render one kind as a link and
another as a button.

Spec: 9.1 (the roles table, the v2 routes table, the page block and its fixed
order, the Library), 9.7 (the pin list), 4.19 (pinned_views), AC-095 (the
hidden page this criterion's ground refers to), AC-214 (the page block's own
criterion).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  DEFAULT_PINS,
  patchBundle,
  routesV2,
  seedIds,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's page block in its fixed order, with the paths its routes table gives. */
const PAGES = [
  ['Desk', routesV2.desk],
  ['Today', routesV2.today],
  ['Scheduled', routesV2.scheduled],
  ['Assignments', routesV2.assignments],
  ['Important', routesV2.important],
  ['All', routesV2.all],
] as const

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  // 9.7's pin list decides whether a view is in the block at all, so the
  // state this criterion is about is made rather than assumed.
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS] })
})

test.describe('AC-175: the sidebar entries are links', () => {
  test('AC-175: each of the six pages is a link to its path', async ({ page }) => {
    await page.goto(routesV2.desk)
    const nav = sidebar(page)

    for (const [name, path] of PAGES) {
      const entry = nav.getByRole('link', { name, exact: true })
      await expect(
        entry,
        `spec 9.1's roles table: the page entry "${name}" is a link, on the ground that the ` +
          'routes table makes every page a URL and a page reachable at a URL is navigated to. ' +
          'The markup this package adopts renders these six as buttons, which is why the table ' +
          'was written and why this is asserted by number',
      ).toHaveCount(1)
      await expect(
        entry,
        `spec 9.1's routes table: "${name}" is at ${path}. A link with no destination cannot ` +
          'be opened in a new tab, bookmarked or followed with scripting unavailable, which is ' +
          'the whole of what the roles table\'s reason turns on, and it satisfies any assertion ' +
          'that reads only the role',
      ).toHaveAttribute('href', path)
    }
  })

  test('AC-175: each folder row is a link to that folder', async ({ page }) => {
    await page.goto(routesV2.desk)
    const nav = sidebar(page)

    // The default folder and the labeled shared one, which are the two kinds
    // of row the seeded account puts in 9.1's Library. A client can render a
    // row on a shelf and a row off one differently, and one of them being a
    // link says nothing about the other.
    for (const [what, id, label] of [
      ['the default folder', seedIds.hassanInbox, 'Inbox'],
      ['a folder carrying a member label', seedIds.groceries, 'Groceries'],
    ] as const) {
      const row = nav.getByRole('link', { name: new RegExp(label) })
      await expect(
        row,
        `spec 9.1's roles table: ${what} is a link, the table naming "the page entries, and ` +
          'each folder and shelf row" together',
      ).toHaveCount(1)
      await expect(
        row,
        `spec 9.1's routes table: a folder page is at /app/folders/:id, so ${what} points at ` +
          'that folder and not at a handler',
      ).toHaveAttribute('href', routesV2.folder(id))
    }
  })

  test('AC-175: the entry for the current page is marked as current', async ({ page }) => {
    await page.goto(routesV2.scheduled)
    const nav = sidebar(page)

    await expect(
      nav.getByRole('link', { name: 'Scheduled', exact: true }),
      'spec 9.1: the entry for the current page is marked as current, which is what tells a ' +
        'screen reader which of six links names the page it is already on. Asserted on ' +
        'Scheduled rather than on Desk so that a client marking the first entry ' +
        'unconditionally fails here',
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      nav.getByRole('link', { name: 'Desk', exact: true }),
      'spec 9.1: and exactly one entry is current, so the page that is not current is not ' +
        'marked. Both halves in one case, a client marking everything being as wrong as one ' +
        'marking nothing',
    ).not.toHaveAttribute('aria-current', 'page')

    await page.goto(routesV2.folder(seedIds.groceries))
    await expect(
      nav.getByRole('link', { name: /Groceries/ }),
      'spec 9.1: a folder row is an entry of this list like the six above it, so the rule ' +
        'reaches it. A folder page is where a person spends most of their time and is the one ' +
        'place a sidebar with nothing marked is easiest to ship',
    ).toHaveAttribute('aria-current', 'page')
  })
})

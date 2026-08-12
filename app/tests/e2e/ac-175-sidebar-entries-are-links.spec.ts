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
control, fixes them as links and gives the ground: the routes table makes
every page a URL, and a page reachable at a URL is navigated to. AC-095's
second half, that a page hidden from the sidebar still renders at its path,
is meaningful only if the client agrees.

**The destination is asserted and not merely the role.** A link with no
destination is an anchor a person cannot open in a new tab, cannot bookmark
and cannot follow with scripting unavailable, which is the whole of what the
roles table's reason turns on, and it satisfies every assertion that only
reads the role. Each href is compared to the routes table restated in the
harness rather than to a string this file invents.

**All six pages are made visible first.** 9.1 puts six entries in a fixed
order "each present only if permanent or toggled visible", and 9.7 owns the
three toggles. The seeded account leaves Done hidden, so a case asserting six
entries against the defaults would be asserting 9.7's defaults instead. The
toggles are set through frozen 7.2 before the page is read, which is the same
state a person reaches from the Settings page.

**The current entry is asserted on a page that is not the first one.** A
client that marks My Day as current unconditionally passes on /app and fails
nowhere else, so the assertion is made on Planned and the negative is made on
My Day in the same case.

**Folder rows are asserted for every folder the sidebar lists, not for one.**
9.1's folder list holds Inbox, the label groups and the unlabeled folders,
and a client can perfectly well render one of those three kinds as a link and
another as a button; the seeded account carries Inbox and a labeled folder,
so both kinds are on the page.

Spec: 9.1 (the roles table, the routes table, the folder list, the page set
and its order), 9.7 (the three page toggles), 7.2 (the settings the toggles
write), AC-095 (the hidden page this criterion's ground refers to).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  patchSettings,
  routes,
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

/** 9.1's six pages in its fixed order, with the paths its routes table gives. */
const PAGES = [
  ['My Day', routes.myDay],
  ['Tasks', routes.tasks],
  ['Planned', routes.planned],
  ['Important', routes.important],
  ['All', routes.all],
  ['Done', routes.done],
] as const

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  // 9.7's three toggles decide whether Important, All and Done are present at
  // all, so the state this criterion is about is made rather than assumed.
  await patchSettings(page, { show_important: true, show_all: true, show_done: true })
})

test.describe('AC-175: the sidebar entries are links', () => {
  test('AC-175: each of the six pages is a link to its path', async ({ page }) => {
    await page.goto(routes.myDay)
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
    await page.goto(routes.myDay)
    const nav = sidebar(page)

    // Inbox and the labeled shared folder, which are the two of 9.1's three
    // kinds of folder row the seeded account carries. A client can render the
    // pinned row and a row inside a label group differently, and one of them
    // being a link says nothing about the other.
    for (const [what, id] of [
      ['the pinned Inbox', seedIds.hassanInbox],
      ['a folder inside a label group', seedIds.groceries],
    ] as const) {
      const row = nav.getByRole('link', { name: new RegExp(id === seedIds.hassanInbox ? 'Inbox' : 'Groceries') })
      await expect(
        row,
        `spec 9.1's roles table: ${what} is a link, the table naming "the six page entries, ` +
          'and each folder row" together',
      ).toHaveCount(1)
      await expect(
        row,
        `spec 9.1's routes table: a folder page is at /app/folders/:id, so ${what} points at ` +
          'that folder and not at a handler',
      ).toHaveAttribute('href', routes.folder(id))
    }
  })

  test('AC-175: the entry for the current page is marked as current', async ({ page }) => {
    await page.goto(routes.planned)
    const nav = sidebar(page)

    await expect(
      nav.getByRole('link', { name: 'Planned', exact: true }),
      'spec 9.1: the entry for the current page is marked as current, which is what tells a ' +
        'screen reader which of six links names the page it is already on. Asserted on Planned ' +
        'rather than on My Day so that a client marking the first entry unconditionally fails ' +
        'here',
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      nav.getByRole('link', { name: 'My Day', exact: true }),
      'spec 9.1: and exactly one entry is current, so the page that is not current is not ' +
        'marked. Both halves in one case, a client marking everything being as wrong as one ' +
        'marking nothing',
    ).not.toHaveAttribute('aria-current', 'page')

    await page.goto(routes.folder(seedIds.groceries))
    await expect(
      nav.getByRole('link', { name: /Groceries/ }),
      'spec 9.1: a folder row is an entry of this list like the six above it, so the rule ' +
        'reaches it. A folder page is where a person spends most of their time and is the one ' +
        'place a sidebar with nothing marked is easiest to ship',
    ).toHaveAttribute('aria-current', 'page')
  })
})

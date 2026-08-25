/*
One whole path signed in through the development login against the seed
dataset.

The other files in this leg each assert one clause against one rendered
page. This one exists because the RFC 0001 P8 row asks for something those
cannot give between them: the data layer, the `tz` on every view request,
the CSRF header on every mutation and the 10.2 chokepoint exercised as one
thing rather than page by page. A client can carry `tz` on the one endpoint
a criterion happens to read and omit it elsewhere, and every criterion still
passes.

So this file walks the application the way a person does, sidebar link by
sidebar link, and asserts three properties over everything the client sent
while it did:

- **Every view request carried a tz.** 7.0 makes it required on every view
  endpoint and its absent half was ruled onto that section on 2026-08-07,
  which is the sharper of the two failures: an implementation reading `tz`
  through a schema with a UTC default satisfies an invalid value exactly and
  never notices an absent one. AC-130 pins the server's refusal; nothing
  pins that the client sends it.
- **Every mutation carried the X-CSRF-Token header.** 11.6's double-submit
  pattern is refused server-side by AC-111, so a client that omits the
  header does not corrupt anything: it simply cannot write, and it will do
  that on whichever mutation nobody exercised.
- **An inaccessible folder is a 404 the client renders as one.** 10.2 puts
  every existence answer at 404 rather than 403; the client's half is not
  turning that into a blank page or a crash. The other seeded user's Inbox
  is the resource, and it exists, which is what makes the case worth
  running.

The walk is deliberately not a re-assertion of server behavior through a
browser, which the RFC row rules out as buying latency rather than truth.
Each page is confirmed to have rendered by one row the seed guarantees it,
and no page's ordering, grouping or paging is re-checked here: those are
green in the vitest leg, by number, where they belong.

The one mutation is a completion of a task this file creates, so nothing
seeded transitions and no later spec sees a changed row. It is written through
the quick-add's opened state, corrected on 2026-08-13 after 9.1 made that
control a disclosure at the RFC 0002 change control: this file reached for the
text box directly, which AC-166 now forbids, and what it owes is one
activation. Nothing about the three properties above moves, none of them being
about that control at all.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** The three
properties are unchanged and so is every assertion; the walk is a different
walk because 9.1's page block is. It now starts at Desk, which is the folder
page of the account's default folder and so reaches a folder-tasks endpoint
rather than a view one, and it takes Today, Scheduled, Important, All, Done
and Anytime through the six view endpoints section 6 still defines. The
sidebar reaches all of them because the pin list is written first, which is
what 9.7's Views section is for; that also retires the special case the old
walk carried for Done, so every stop is now a link click and the property
"one session rather than seven page loads" holds over the whole of it.

Assignments is deliberately not a stop. 9.1 puts it in the page block and
section 6's new preamble paragraph says why it is not here: "Assignments is
not a query of its own: it is a client-side composition over the open tasks
the viewer can already read." Its page is S10's, and it joins this walk when
there is a page to walk to.

Spec: 11.10 (the development login as this leg's session source), 7.0 (the
tz rule and the envelope), 11.6 (CSRF), 10.2 (the chokepoint), 9.1 (the
sidebar, the v2 route table and the quick-add's two states), 9.7 (the pin
list), 6 (the five renamed query headings and the Assignments paragraph),
8.3.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  checkControl,
  clickControl,
  fillControl,
  openQuickAdd,
  patchBundle,
  routesV2,
  seedIds,
  seedSubs,
  sidebarLink,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  tzOf,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The pin list this walk needs, so that every stop is reachable from the
 * sidebar. 9.7 ships Done and Anytime unpinned and this account pins them,
 * which is exactly what a person does from that section's Views list.
 */
const WALK_PINS = [
  'desk',
  'today',
  'scheduled',
  'assignments',
  'important',
  'all',
  'done',
  'anytime',
]

/**
 * Each surface, and one seeded row that proves it rendered.
 *
 * Desk answers from a folder-tasks endpoint rather than a view one, being
 * 9.1's "the account's default folder" rather than a query over tasks that
 * live elsewhere. Its seeded row is the undated task the seed files there.
 */
const WALK = [
  {
    link: 'Desk',
    row: 'Sort inbox',
    viewPath: `/api/v1/folders/${seedIds.hassanInbox}/tasks`,
  },
  { link: 'Today', row: 'Buy milk', viewPath: '/api/v1/views/my-day' },
  { link: 'Scheduled', row: 'Call plumber', viewPath: '/api/v1/views/planned' },
  { link: 'Important', row: 'Buy milk', viewPath: '/api/v1/views/important' },
  { link: 'All', row: 'Water plants', viewPath: '/api/v1/views/all' },
  { link: 'Done', row: 'Pay rent', viewPath: '/api/v1/views/done' },
  { link: 'Anytime', row: 'Sort inbox', viewPath: '/api/v1/views/tasks' },
] as const

test.describe('The signed-in path', () => {
  test('the walk carries tz on every view request and CSRF on every mutation', async ({
    page,
  }) => {
    const wire = watchWire(page)
    await signIn(page, seedSubs.hassan)

    // Every stop is pinned, so every stop is a link, which is what makes the
    // walk one session rather than seven page loads. The pins are written
    // through 9.7's own surface rather than assumed, Done and Anytime
    // shipping unpinned.
    await patchBundle(page, { pinned_views: WALK_PINS })
    await page.goto(routesV2.desk)
    for (const stop of WALK) {
      await clickControl(
        sidebarLink(page, stop.link),
        `spec 9.1: the sidebar page block lists ${stop.link}, and walking it is what makes ` +
          'these seven pages one session rather than seven loads',
      )
      await expect(
        page.getByText(stop.row),
        `spec 9.1 route table: ${stop.link} rendered, which the seeded row ${stop.row} is the ` +
          'evidence of. This is not a re-assertion of the page\'s ordering, which is green in ' +
          'the vitest leg by number',
      ).toBeVisible()
      await expect
        .poll(
          () => wire.viewCalls().map((call) => new URL(call.url).pathname),
          {
            message:
              `spec 7.10: ${stop.link} reaches ${stop.viewPath} before the walk continues; ` +
              'a row shared with the previous page must not let this case outrun the request',
          },
        )
        .toContain(stop.viewPath)
    }

    await page.goto(routesV2.folder(seedIds.groceries))
    await expect(
      page.getByText('Buy milk'),
      'spec 9.1 route table: the folder page rendered, which 6 Q7 puts this seeded row on',
    ).toBeVisible()
    const folderTasksPath = `/api/v1/folders/${seedIds.groceries}/tasks`
    await expect
      .poll(() => wire.viewCalls().map((call) => new URL(call.url).pathname), {
        message:
          `spec 7.10: the folder page reaches ${folderTasksPath} before the walk continues`,
      })
      .toContain(folderTasksPath)

    // The search overlay of 9.9, opened by the shortcut 9.1 gives it.
    await page.keyboard.press('Control+k')
    await fillControl(
      page.getByRole('searchbox').or(page.getByRole('textbox')).first(),
      'milk',
      'spec 9.9: the overlay the shortcut opened carries the input its results come from',
    )
    await expect
      .poll(() => wire.viewCalls().map((call) => new URL(call.url).pathname), {
        message:
          'spec 7.10: the debounced search request starts before the overlay is dismissed; ' +
          'a matching row behind the overlay must not let this case outrun the request',
      })
      .toContain('/api/v1/search')
    await expect(
      page
        .getByRole('dialog', { name: 'Search Dana' })
        .getByRole('button', { name: /^Buy milk\b/ }),
      'spec 9.9: the overlay searches every folder the viewer can access',
    ).toBeVisible()
    await page.keyboard.press('Escape')

    const views = wire.viewCalls()
    const expectedViewPaths = [
      ...WALK.map((stop) => stop.viewPath),
      folderTasksPath,
      '/api/v1/search',
    ]
    expect(
      [...new Set(views.map((call) => new URL(call.url).pathname))],
      'spec 7.10: walking seven pages, a folder and the search overlay reaches the view ' +
        'endpoints; checking their paths makes the assertion non-vacuous without depending ' +
        'on timing or on incidental extra requests',
    ).toEqual(expect.arrayContaining(expectedViewPaths))
    const without = views.filter((call) => tzOf(call.url) === null)
    expect(
      without.map((call) => `${call.method} ${call.url}`),
      'spec 7.0: every view endpoint takes tz, and its absent half was ruled onto that ' +
        'section on 2026-08-07 because an absent value never reaches a validator that a wrong ' +
        'one does. AC-130 pins the refusal; this pins that the client sends it, on every view ' +
        'request rather than on the one a criterion happened to read',
    ).toEqual([])
  })

  test('a mutation carries the CSRF header of 11.6 and the page reflects it', async ({
    page,
  }) => {
    const wire = watchWire(page)
    await signIn(page, seedSubs.hassan)

    // This file's own row, so nothing seeded transitions.
    const title = 'session path completes this one'
    await page.goto(routesV2.anytime)
    const quickAdd = await openQuickAdd(
      page,
      'spec 9.1: this case needs a create and a complete, and the inline quick-add is the ' +
        'shortest create path the section offers',
    )
    await fillControl(
      quickAdd,
      title,
      'spec 9.1: the expanded quick-add is a single title input',
    )
    await quickAdd.press('Enter')
    await expect(
      taskRow(page, title),
      'spec 9.1: the inline quick-add saves on enter, and 8.3 refetches the active view ' +
        'after an own mutation, so the row is on the page without a reload',
    ).toBeVisible()

    await checkControl(
      taskRow(page, title).getByRole('checkbox'),
      'spec 9.4: a row carries a complete checkbox',
    )
    await expect(
      page.getByText(title),
      'spec 5.1: a completed task leaves Q2, so the row goes from Anytime. 8.3\'s refetch is ' +
        'what takes it, which is the whole invalidation strategy this client has',
    ).toHaveCount(0)

    const mutations = wire.mutations()
    expect(
      mutations.length,
      'a create and a complete are two mutations; a run recording none wrote nothing and the ' +
        'assertion below would be vacuous',
    ).toBeGreaterThan(1)
    const bare = mutations.filter((call) => call.csrf === null)
    expect(
      bare.map((call) => `${call.method} ${call.url}`),
      'spec 11.6: every mutation echoes the double-submit token in X-CSRF-Token, and 7.0 ' +
        'makes that the condition of a cookie-carried session writing at all. AC-111 pins the ' +
        '403; this pins that the client sends the header on every mutation it makes',
    ).toEqual([])
  })

  test("an inaccessible folder reads as nonexistent, not as a crash", async ({ page }) => {
    await signIn(page, seedSubs.hassan)

    // Imran's Inbox exists and Hassan is not a member of it. 10.2 answers
    // 404 rather than 403 so that existence does not leak, and the client's
    // half is showing the person that rather than a blank page.
    await page.goto(routesV2.folder(seedIds.imranInbox))

    await expect(
      sidebarLink(page, 'Desk'),
      'spec 10.6 and 9.1: the shell survives a 404 under it, so the person can navigate away ' +
        'from a page they cannot see',
    ).toBeVisible()
    await expect(
      page.getByText(/not found|doesn't exist|does not exist/i),
      'spec 10.2: an inaccessible resource answers 404 and never 403, and a client that ' +
        'renders nothing at all leaves the person unable to tell a missing folder from a ' +
        'broken application',
    ).toBeVisible()
    await expect(
      page.getByText('Imran'),
      'spec 10.2: inaccessible always reads as nonexistent, so nothing about the folder, its ' +
        'owner included, reaches the page',
    ).toHaveCount(0)
  })
})

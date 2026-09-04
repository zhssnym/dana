/*
AC-091: given one prior online load, when the installed app opens offline,
then the shell renders with the offline banner and a write attempt shows the
failure toast with nothing queued.

Three obligations in one sentence, and 10.6's ISSUE-19 contract is what
makes them one behavior rather than three: the shell loads, the banner
shows, reads need network, writes fail fast with the 9.1 toast, and there is
no IndexedDB mirror and no background sync. The last clause is the one the
criterion spends a word on and the one an implementation is most likely to
get wrong in the generous direction, because queueing a failed write and
replaying it later is what a PWA library offers to do for you.

**The prior online load is the precondition, so it is asserted rather than
assumed.** Every case here first loads a page online and waits for a service
worker to be controlling it. Without that step, "the shell renders offline"
is a claim about a page that was never cached, and a red would name the
wrong sentence.

**Nothing queued is asserted from the server, not from the page.** A client
that queued the write and a client that dropped it look identical while the
connection is down; they differ only once it returns. So the case goes back
online, gives the page a reload to run whatever a service worker would run
on reconnect, and then asks the API whether the row exists. It asks through
GET /search, which reaches every folder the viewer can access (Q8), so a
queued write that landed anywhere is found.

**The adversarial case is the read side.** 10.6 makes API requests
network-only and never cached, which is the half no clause of AC-091 names
and which a precache configured over "everything the page fetched" would
break silently: the page would come up offline showing yesterday's tasks
with the banner beside them, satisfying every word of this criterion while
telling the user something false. Asserted third, with the online load above
it as the control.

This spec creates no rows on the success path. The write it attempts is the
one it needs to fail.

**The write is attempted through the quick-add's opened state**, corrected on
2026-08-13 after 9.1 made that control a disclosure at the RFC 0002 change
control. This case was written when the row was always on the page and reached
for its text box directly, which AC-166 now forbids: that criterion asserts a
collapsed state and asserts that escape leaves no box on the page at all, so a
client satisfying this case as it stood could not satisfy that one. What the
case owes is one activation. Every assertion below is unchanged, and none of
them was ever about the control's resting state.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), with the twenty
that rework named.** Nothing this criterion asserts moves; the addresses do.
The page whose shell is warmed is Today at /app/today, where Q1's rows are
drawn now that Desk holds /app, and the page the offline write is attempted
on is Anytime at /app/anytime, where Q2's rows are drawn now that /app/tasks
redirects. Both render the same screens under the names DES-152 gives them,
which is why every assertion is the one it always was. The sidebar entry read
as evidence that chrome rendered is Desk, that being the one page 9.7 will
not let a person unpin.

This file was not on the list of twenty Imran ruled on: S9 enumerated the
failures it had diagnosed and the enumeration was short. Reworked here with
them, the cause being the same cause and the alternative being a knowingly
red criterion carried through a merge.

Spec: 10.6 (the PWA and offline contract), 9.1 (the banner, the quick-add
and its two states, the toast), 9.1's v2 route table, 9.7 (Desk locked
pinned), 6 Q2, 11.4 (vite-plugin-pwa).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  copy,
  expectServiceWorkerControl,
  fillControl,
  openQuickAdd,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

// Unique to this file, so "nothing queued" cannot be satisfied by a row
// another spec happened not to create.
const OFFLINE_TITLE = 'ac-091 write attempted while offline'

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.afterEach(async ({ context }) => {
  await context.setOffline(false)
})

test.describe('AC-091: the installed app opens offline', () => {
  test('AC-091: the shell renders offline with the banner of 9.1', async ({
    page,
    context,
  }) => {
    await page.goto(routesV2.today)
    await expectServiceWorkerControl(page)

    await context.setOffline(true)
    await page.reload()

    // The shell is the global chrome of 9.1, and the sidebar is the part of
    // it that cannot come from an API response: its page block is the route
    // table, not data.
    await expect(
      page.getByRole('link', { name: 'Desk', exact: true }),
      'spec 10.6: navigations fall back to the cached shell so the installed app always ' +
        'opens, so the sidebar of 9.1 renders with no network at all',
    ).toBeVisible()

    await expect(
      page.getByText(copy.offlineBanner),
      'spec 9.1: the offline banner is global and persistent while offline, and its copy ' +
        'is normative',
    ).toBeVisible()

    // A page reached by navigation rather than by reload, because 10.6's
    // fallback is about navigations and a reload is the easiest one to
    // satisfy by accident.
    await page.goto(routesV2.anytime)
    await expect(
      page.getByText(copy.offlineBanner),
      'spec 10.6: every /app path falls back to the cached shell (9.1 route table), so ' +
        'Anytime opens offline too and 9.1 makes the banner global rather than per page',
    ).toBeVisible()
  })

  test('AC-091: a write attempted offline shows the failure toast and queues nothing', async ({
    page,
    context,
  }) => {
    await page.goto(routesV2.anytime)
    await expectServiceWorkerControl(page)

    await context.setOffline(true)
    await page.goto(routesV2.anytime)

    // 9.1's quick-add: collapsed to a single control, activated to reveal a
    // title input, enter saves immediately. The shortest write path the
    // specification offers, and the one that needs no dialog to reach. The
    // activation is the disclosure 9.1 gained on 2026-08-13 and AC-166
    // asserts; this case is about what an offline write does, not about the
    // control's resting state, so opening it changes nothing it says.
    const quickAdd = await openQuickAdd(
      page,
      'spec 9.1 puts an inline quick-add at the bottom of Tasks groups, and 10.6 renders the ' +
        'shell offline, so the control a write is attempted through is on the page',
    )
    await expect(
      quickAdd,
      'spec 9.1: activating the collapsed control reveals the title input, which is the write ' +
        'path this case attempts offline. A shell that rendered without it would leave this ' +
        'criterion with nothing to write through',
    ).toBeVisible()
    await fillControl(
      quickAdd,
      OFFLINE_TITLE,
      'spec 9.1: the expanded quick-add is a single title input',
    )
    await quickAdd.press('Enter')

    await expect(
      page.getByText(copy.offlineWriteToast),
      'spec 9.1: writes attempted offline fail with this toast, and its copy is normative. ' +
        'It is not the general error toast of the line above it',
    ).toBeVisible()

    await expect(
      page.getByText(copy.errorToast),
      'spec 9.1 gives offline writes their own toast, so the general failure toast is not ' +
        'what an offline write shows',
    ).toHaveCount(0)

    // Nothing queued. Back online, reloaded so anything a service worker
    // would replay on reconnect has run, and then asked of the server
    // rather than of the page.
    await context.setOffline(false)
    await page.goto(routesV2.anytime)
    await page.waitForLoadState('networkidle')

    const found = await page.request.get(
      `/api/v1/search?q=${encodeURIComponent(OFFLINE_TITLE)}&tz=UTC`,
    )
    expect(
      found.status(),
      `GET /search answered ${found.status()}: ${await found.text()}`,
    ).toBe(200)
    const body = (await found.json()) as { rows: { title: string }[] }
    expect(
      body.rows.map((row) => row.title),
      'spec 10.6: no IndexedDB mirror and no background sync, so a write refused offline is ' +
        'refused and not deferred. This row exists on the server only if the client queued it',
    ).toEqual([])
  })

  test('AC-091: API responses are never served from cache offline', async ({
    page,
    context,
  }) => {
    // The clause AC-091 does not state and 10.6 does: "API requests are
    // network-only, never cached". A precache built over everything the page
    // fetched satisfies every word of this criterion, banner included, while
    // showing the viewer a stale copy of their tasks as though it were
    // current. Q2 puts this seeded undated row on Tasks, so it is the
    // evidence either way.
    await page.goto(routesV2.anytime)
    await expectServiceWorkerControl(page)
    await expect(
      page.getByText('Sort inbox'),
      'spec 6 Q2: the seeded undated task in the viewer\'s Desk is on Tasks online. ' +
        'This is the control that makes the absence below discriminate',
    ).toBeVisible()

    await context.setOffline(true)
    await page.goto(routesV2.anytime)
    await expect(
      page.getByText(copy.offlineBanner),
      'the shell rendered from cache, which is what makes the next assertion about the API ' +
        'rather than about the page failing to load',
    ).toBeVisible()
    await expect(
      page.getByText('Sort inbox'),
      'spec 10.6: API requests are network-only and never cached, and the ISSUE-19 contract ' +
        'says reads need network, so no task rows render offline',
    ).toHaveCount(0)

    // And the folder page of the same viewer, so the assertion is about the
    // API surface rather than about one route's own data hook.
    await page.goto(routesV2.folder(seedIds.groceries))
    await expect(
      page.getByText('Buy milk'),
      'spec 10.6: 7.10\'s folder body is an API response like any other, so it is not cached ' +
        'either',
    ).toHaveCount(0)
  })
})

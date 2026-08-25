/*
AC-171: given a page whose read fails, then it renders 9.1's inline copy with
the "Try again" control beside the thing that failed and the control
refetches; given a read that answers 404, then it renders the not-found copy
instead of the error state.

Numbered by the Integration Steward at P8's second change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged.

The error state is one of the five section 9 gives every page and 9.4 has
named it since the specification was written, as "global toast plus inline
retry". No criterion had ever read it, because until this change control
there was nothing to read: 9.1 spelled the toast and left the inline half
without words. It has them now, and this is the criterion that holds them.

**The two states are asserted against each other, not one at a time.** 10.2
makes an inaccessible resource answer exactly as a missing one, so the page a
person reaches by following a stale link is a 404 rather than a breakage, and
the two states say opposite things: one invites a retry and the other
explains that there is nothing to retry. A client rendering its error state
for both passes any assertion that only looks for the error copy, and tells a
person their account is broken when they have merely lost access to a folder.
So the 404 case asserts the not-found copy present and the failure copy
absent, in the same case.

**The failure is injected at the transport and nowhere else.** The read is
made to fail by answering one view request with a 500, which is a condition
the client must handle and not a defect anyone has to introduce to produce
it; nothing about the page is faked, and the route is released before the
retry so that the refetch has something to succeed at. That is also what
makes the last clause assertable: "the control refetches" is only observable
if the same control can be watched failing and then succeeding.

**The retry is asserted to work, not merely to exist.** A control that
renders and does nothing satisfies the copy half of this criterion exactly,
and is worse than no control, because a person presses it and concludes the
application is broken rather than that their connection was.

The third string this change control wrote, the truncation notice, is
asserted by nothing and section 12 records why: producing it takes a thousand
and one rows through section 7, and section 13 item 6 records that the cap is
unreachable at v1 scale. It is not this file's silence.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Nothing this
criterion asserts moves; which page is made to fail does. The failing read
was Q2's, at /app/tasks, and that path now redirects: Anytime draws Q2's rows
at /app/anytime and reaches the same view endpoint, so the injected 500 is
the same 500. The shell case reads the sidebar's Desk entry rather than My
Day's, Desk being the one page 9.7 will not let a person unpin and so the
surest evidence that chrome rendered at all.

Spec: 9.1 (the inline state copy, the "Try again" control, and the v2 routes
table), 9.4 (the error state as global toast plus inline retry), 10.2 (an
inaccessible resource answers as a missing one), 7.10, 9.7 (Desk locked
pinned).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
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

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-171: the two inline page states', () => {
  test('AC-171: a failed read renders the inline copy and Try again refetches', async ({
    page,
  }) => {
    // One view endpoint answers 500. 7.0's envelope is what a real failure
    // carries, so the client meets the shape it would meet in production.
    let failing = true
    await page.route('**/api/v1/views/tasks**', async (route) => {
      if (!failing) {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'Something broke.' } }),
      })
    })

    await page.goto(routesV2.anytime)

    await expect(
      page.getByText(copy.readFailed),
      'spec 9.1: a read that failed renders this copy beside the thing that failed, and it is ' +
        'normative like the rest of that section. It says what was not changed, which is the ' +
        'question a failure raises',
    ).toBeVisible()
    await expect(
      page.getByText('Sort inbox'),
      'spec 6 Q2: the page has no rows to show, the read having failed, so the state is ' +
        'instead of the list rather than beside it',
    ).toHaveCount(0)

    const retry = page.getByRole('button', { name: 'Try again', exact: true })
    await expect(
      retry,
      'spec 9.1 and 9.4: the error state is a global toast plus an inline retry, and the ' +
        'control is named "Try again" in the control table',
    ).toBeVisible()

    // Released, so the refetch has something to succeed at. A control that
    // renders and does nothing passes every assertion above and is worse than
    // no control, because the person presses it and concludes the
    // application is broken rather than the connection.
    failing = false
    await clickControl(retry, 'spec 9.1: the retry control is on the page to be pressed')

    await expect(
      page.getByText('Sort inbox'),
      'spec 9.4: the inline retry refetches, so the page that failed to load loads. The ' +
        'seeded undated row is what a working read of 6 Q2 puts here',
    ).toBeVisible()
    await expect(
      page.getByText(copy.readFailed),
      'spec 9.1: the failure state belongs to the failure, so a successful refetch clears it',
    ).toHaveCount(0)
  })

  test('AC-171: a 404 renders the not-found copy rather than the error state', async ({
    page,
  }) => {
    // The other seeded user's Inbox exists and this viewer is not a member,
    // so 10.2 answers 404 without anything being broken and without this case
    // faking a response.
    await page.goto(routesV2.folder(seedIds.imranInbox))

    await expect(
      page.getByText(copy.notFound),
      'spec 9.1: a resource that answers 404 renders this copy. It states both of 10.2\'s ' +
        'cases in one sentence without telling the reader which they met, which is what that ' +
        'chokepoint exists for',
    ).toBeVisible()

    await expect(
      page.getByText(copy.readFailed),
      'spec 9.1 gives the two states different words because they are different situations. A ' +
        'client rendering its error state for a 404 tells a person their account is broken ' +
        'when they have merely lost access to a folder, and it passes any criterion that only ' +
        'looks for the error copy',
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Try again', exact: true }),
      'spec 9.1: there is nothing to retry. A retry control here invites the person to press ' +
        'it until they give up, since 10.2 will answer the same way every time',
    ).toHaveCount(0)
  })

  test('AC-171: the shell survives both states', async ({ page }) => {
    // Neither state is a broken page: 9.1's chrome is global, so a person who
    // meets either can still navigate away from it. Asserted for both,
    // because a client that renders a state in place of the whole application
    // satisfies the copy of both cases above.
    await page.route('**/api/v1/views/important**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'Something broke.' } }),
      })
    })
    await page.goto(routesV2.important)
    await expect(
      page.getByText(copy.readFailed),
      'spec 9.1: the failed read renders its copy',
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Desk', exact: true }),
      'spec 9.1: the sidebar is global chrome, so a page whose read failed is still a page a ' +
        'person can leave',
    ).toBeVisible()

    await page.unroute('**/api/v1/views/important**')
    await page.goto(routesV2.folder(seedIds.imranInbox))
    await expect(
      page.getByText(copy.notFound),
      'spec 9.1: the 404 renders its copy',
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Desk', exact: true }),
      'spec 9.1: and the person can leave this one too',
    ).toBeVisible()
  })
})

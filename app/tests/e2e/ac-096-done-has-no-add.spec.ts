/*
AC-096: given the Done page, then no floating add button and no quick-add
row exist on it.

Two sentences of section 9 meet here and the criterion is their conjunction.
9.1 puts the floating add button "on every page except Done" and puts the
inline quick-add row at the bottom of Tasks groups, the Planned list and
folder sections, which are three places Done is not; 9.5 closes it from the
other side, "no add affordance anywhere on this page". The rule is not
cosmetic: Done is Q6, a keyset page over completed rows, and a task created
there would be created pending and land on a page the user is not looking
at.

**Every absence is asserted beside the same matcher finding the thing on a
page that must have it.** This is the discipline the P4 range was written
under and it matters more here than it did there. The whole client is red
until three implementing sessions run, so a spec that only asserts "no add
button on Done" passes against a page with no buttons at all, and would go
on passing against a client that never grew one. Each case below therefore
walks a page that must carry the affordance first and Done second, in one
test, with the same locator.

The adversarial case is the one the criterion does not name. 9.1's exception
is Done alone, so an implementation that reads "hide the add button on pages
without an add path" also hides it on Important and All, where 9.1 puts it
and where Q4's and Q5's empty states name it outright ("Add your first task
with the + button"). Asserted in the third test, which is where this file
fails against an over-generalized rule that satisfies the criterion as
written.

The floating add button has no normative name, only 9.1's description and
Q5's "+ button", so it is matched by description; the silence is escalated
rather than closed here. See `harness.ts`.

Spec: 9.1 (the floating add button and the quick-add row), 9.5 (Done), 6 Q6,
9.1's route table.
*/
import { expect, test } from '@playwright/test'

import {
  floatingAddButton,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  textInputs,
} from './harness.js'

// The seed's dated rows are UTC dates and the client reports the browser's
// zone as tz; Done reads completed_at in that zone (Q6).
test.use({ timezoneId: 'UTC' })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-096: Done carries no add affordance', () => {
  test('AC-096: the floating add button is on Tasks and not on Done', async ({ page }) => {
    await page.goto(routes.tasks)
    await expect(
      floatingAddButton(page),
      'spec 9.1 puts the floating add button on every page except Done, so it is on Tasks; ' +
        'this half is the positive control that makes the absence below discriminate',
    ).toBeVisible()

    await page.goto(routes.done)
    await expect(
      floatingAddButton(page),
      'spec 9.1: the floating add button is absent on Done, and 9.5 says no add affordance ' +
        'anywhere on this page',
    ).toHaveCount(0)
  })

  test('AC-096: the quick-add row is on Tasks and not on Done', async ({ page }) => {
    await page.goto(routes.tasks)
    await expect(
      textInputs(page).first(),
      'spec 9.1 puts an inline quick-add row at the bottom of every Tasks group, so Tasks ' +
        'carries a text input that is not the global search control',
    ).toBeVisible()

    await page.goto(routes.done)
    await expect(
      textInputs(page),
      'spec 9.1 lists the quick-add row on Tasks groups, the Planned list and folder ' +
        'sections, and 9.5 forbids any add affordance on Done, so Done carries no text entry ' +
        'other than the global search control',
    ).toHaveCount(0)
  })

  test('AC-096: the exception is Done alone, not every page without a list to add to', async ({
    page,
  }) => {
    // The over-generalization this criterion cannot see by itself. Important
    // and All are read-only views of rows that live elsewhere, exactly like
    // Done, and 9.1 puts the button on both; Q4's and Q5's empty states name
    // it. An implementation hiding it wherever "adding makes no sense" passes
    // AC-096 as written and fails here.
    for (const [name, path] of [
      ['Important', routes.important],
      ['All', routes.all],
      ['My Day', routes.myDay],
      ['Planned', routes.planned],
    ] as const) {
      await page.goto(path)
      await expect(
        floatingAddButton(page),
        `spec 9.1: the floating add button is on every page except Done, ${name} included`,
      ).toBeVisible()
    }
  })
})

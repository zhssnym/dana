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

Both controls are addressed by the names 9.1's control table gave them at
the P8 change control on 2026-08-11, "Add task" and "Add a task", and both
matches are exact. Before that table this file matched descriptions and
escalated the gap: the button by `/add/i`, which also catches the quick-add
and the steps editor's "Add step", and the quick-add by "any text box that is
not the search box". The second assertion below is the one the naming
improved most, because it now states the criterion, no quick-add on Done,
where it used to state a proxy for it, no text entry of any kind.

**The second case reads the collapsed control and asserts both states
absent**, corrected on 2026-08-13 after 9.1 made the quick-add a disclosure at
the RFC 0002 change control. Its positive half reached for the text box on
Tasks, which is not what that page renders until somebody activates the
control, so the half whose whole job is to prove the absence below
discriminates had stopped finding anything on a page that carries the
affordance; and its negative half asserted the absence of the box alone, which
a Done page carrying the collapsed control would satisfy while carrying the
add affordance 9.5 forbids. So the positive control becomes the control, and
the absence is asserted of both states. The quick-add is one affordance with
two of them, so a page carrying either carries it.

Spec: 9.1 (the floating add button, and the quick-add with its two states),
9.5 (Done), 6 Q6, 9.1's route table.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  floatingAddButton,
  quickAddControl,
  quickAddInput,
  routes,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

// The seed's dated rows are UTC dates and the client reports the browser's
// zone as tz; Done reads completed_at in that zone (Q6).
test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
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

  test('AC-096: the quick-add is on Tasks and not on Done', async ({ page }) => {
    await page.goto(routes.tasks)
    await expect(
      quickAddControl(page).first(),
      'spec 9.1 puts an inline quick-add at the bottom of every Tasks group, collapsed by ' +
        'default to a single control carrying the name that section gives both its states, ' +
        '"Add a task". This half is the positive control that makes the absence below ' +
        'discriminate, so it reads the state the page is actually in rather than the text box ' +
        'no page renders until the control is activated',
    ).toBeVisible()

    await page.goto(routes.done)
    await expect(
      quickAddControl(page),
      'spec 9.1 lists the quick-add on Tasks groups, the Planned list and the folder page\'s ' +
        'open list, and 9.5 forbids any add affordance on Done, so the collapsed control is ' +
        'not on this page',
    ).toHaveCount(0)
    await expect(
      quickAddInput(page),
      'and neither is the text box it opens into. Both states are asserted absent because the ' +
        'quick-add is one affordance with two of them, so a page carrying either carries the ' +
        'affordance 9.5 says is nowhere on this page',
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

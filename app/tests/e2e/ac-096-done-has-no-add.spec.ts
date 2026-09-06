/*
AC-096: given the Done page, then no floating add button and no quick-add
row exist on it.

The criterion's own sentence is untouched by RFC 0005 and every case below
moved, which is the shape worth naming once because six other files in this
rework have it too. What changed is not what Done owes but what the pages
beside it do, and this file's cases are mostly positive controls on those
pages.

**9.1's capture rule inverted at RFC 0005.** v1 put the floating add button
"on every page except Done" and put the quick-add at the bottom of Tasks
groups, the Planned list and the folder page's open list. 9.1 now reads the
other way round: "each page has one always-visible capture point. Quick-add
rows sit where a page has a natural landing place (a section, a group, a list
foot); in board view every column captures and the floating button is absent;
the floating 'Add task' button appears only on the pages with no capture
affordance of their own, Today, Important, and Assignments, and never on Done
or Abandoned." So Done still carries neither affordance, for the reason 9.5
still gives, "no capture anywhere on the page", and the pages this file walks
first to prove its absences discriminate are different pages.

**Every absence is asserted beside the same matcher finding the thing on a
page that must have it.** This is the discipline the P4 range was written
under and the reason each case walks two pages. A spec that only asserts "no
add button on Done" passes against a page with no buttons at all, and would
go on passing against a client that never grew one. The positive control for
the floating button is Today, the first of the three pages 9.1 now leaves it
on; the positive control for the quick-add is Desk, which is a folder page
and so has the list foot 9.1's sentence describes.

**The third case is the one the criterion cannot see by itself, and the
inversion made it sharper.** Under v1 the over-generalization to catch was a
client hiding the button wherever "adding makes no sense", which would have
taken Important and All with Done. Under v2 the button's presence is a
three-item list, so what has to be caught is a client reading that list as a
mood rather than as a list: Important and Assignments are as read-only as All
and Anytime, and 9.1 puts the button on the first two and not the second two,
because what decides it is whether the page has a capture point of its own.
So the case asserts the button present on exactly the three pages that
sentence names and absent on seven others, in one pass, which is what makes
it fail against any rule of thumb that happens to agree with 9.1 on Done.

Both controls are addressed by the names 9.1's control table gives them,
"Add task" and "Add a task", and both matches are exact. That table survives
RFC 0005 unchanged, which is why the harness locators do not move here.

Spec: 9.1 (the v2 capture rule, the floating add button, the quick-add, and
the v2 routes table), 9.5 (Done and Abandoned, "no capture anywhere on the
page"), 9.6 (the folder page's loose block and its quick-add), 9.11 (Trash,
the same sentence), 6 Q6.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  floatingAddButton,
  insertTrigger,
  quickAddControl,
  quickAddInput,
  routesV2,
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
  test('AC-096: the floating add button is on Today and not on Done', async ({ page }) => {
    await page.goto(routesV2.today)
    await expect(
      floatingAddButton(page),
      'spec 9.1: the floating add button appears on the pages with no capture affordance of ' +
        'their own, and Today is the first of the three that sentence names. This half is the ' +
        'positive control that makes the absence below discriminate',
    ).toBeVisible()

    await page.goto(routesV2.done)
    await expect(
      floatingAddButton(page),
      'spec 9.1: the floating add button is "never on Done or Abandoned", and 9.5 says no ' +
        'capture anywhere on this page',
    ).toHaveCount(0)
  })

  test('AC-096: the compose capture is on Desk and no capture is on Done', async ({ page }) => {
    await page.goto(routesV2.desk)
    await expect(
      insertTrigger(page),
      'spec 9.6: Desk is a folder page, so its always-visible capture point is the composed ' +
        'page seam whose menu offers Task, Section, and Image',
    ).toBeVisible()

    await page.goto(routesV2.done)
    await expect(
      quickAddControl(page),
      'spec 9.1: a quick-add sits where a page has a landing place, and 9.5 gives Done none, ' +
        '"no capture anywhere on the page", so the collapsed control is not on it',
    ).toHaveCount(0)
    await expect(
      quickAddInput(page),
      'and neither is the text box it opens into. Both states are asserted absent because the ' +
        'quick-add is one affordance with two of them, so a page carrying either carries the ' +
        'affordance 9.5 says is nowhere on this page',
    ).toHaveCount(0)
  })

  test('AC-096: the button is on the three pages 9.1 names and on no others', async ({
    page,
  }) => {
    // The over-generalization this criterion cannot see by itself, restated
    // for the inverted rule. Important and Assignments are views of rows that
    // live elsewhere, exactly like All and Anytime, and 9.1 puts the button
    // on the first two and not the second two: what decides it is whether the
    // page has a capture point of its own, not whether adding to it "makes
    // sense". An implementation reading the list as a mood passes AC-096 as
    // written and fails here.
    for (const [name, path] of [
      ['Today', routesV2.today],
      ['Important', routesV2.important],
      ['Assignments', routesV2.assignments],
    ] as const) {
      await page.goto(path)
      await expect(
        floatingAddButton(page),
        'spec 9.1: the floating add button appears on Today, Important and Assignments, ' +
          `${name} included, those being the pages with no capture affordance of their own`,
      ).toBeVisible()
    }

    for (const [name, path, why] of [
      ['Desk', routesV2.desk, 'a folder page, which captures at its list foot (9.6)'],
      ['All', routesV2.all, 'a page whose own capture the rule leaves in place'],
      ['Scheduled', routesV2.scheduled, 'a list with a quick-add of its own'],
      ['Anytime', routesV2.anytime, 'undated open work, captured in the groups it is drawn in'],
      ['Done', routesV2.done, '9.5: no capture anywhere on the page'],
      [
        'Abandoned',
        routesV2.abandoned,
        '9.5: no capture, a task made pending being filtered off the page it was made on',
      ],
      ['Trash', routesV2.trash, '9.11: no capture anywhere on the page'],
    ] as const) {
      await page.goto(path)
      await expect(
        floatingAddButton(page),
        `spec 9.1: the floating add button is absent on ${name}, ${why}. The three pages it ` +
          'appears on are a list and not a rule of thumb, so the pages it is absent from are ' +
          'asserted beside the pages it is on',
      ).toHaveCount(0)
    }
  })
})

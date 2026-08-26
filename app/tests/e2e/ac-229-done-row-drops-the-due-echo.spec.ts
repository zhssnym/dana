/*
AC-229: given a completed task carrying a due date, when its row is drawn on
Done, then the row carries no due badge; given the same task's row on a page
that groups by something else, then it carries one.

Authored at S11 by `11-adversarial-test.md`. It is 9.5's v2 Done bullet, whose
row clause nothing asserted: rows there "drop the spent due-date echo under
headings that already group by completion". DES-183 is the rule one level up,
"a row says what its page does not", and the Done page is one of the five
contexts that rule was derived from.

**The number is 229**, the next free one at authoring: 228 is the board's drop,
227 the sidebar drag, 226 S13's starter workflows.

**The criterion is a pair on one task, and the pair is the whole point.** A
client that draws no due badge anywhere passes the first half and fails the
second; a client that draws one everywhere fails the first. Only a client that
decides per page passes both, which is what DES-183 says the decision is: "per
list, never per row, because a row cannot see the heading above it". This is
also the one shape a single screen cannot show, which is DES-184's observation
about why the states sheet gained its five-contexts section: seeing the rule
means seeing one task twice under different headings.

**It is written after the implementation it tests, and that is recorded rather
than hidden.** The AC-131 and AC-164 precedent, both of which the section notes
as criteria written after their code because a constraint outside the branch
forced the order. Here the constraint is that the behaviour arrived in the same
session, at the DoneRow reunion: Done stopped drawing its own row and started
passing `showDue: false` to the shared one, and nothing in the nine files that
reach Done asserts a due badge on any rendered row, verified by reading them
rather than assumed. So the choice was between a rule implemented and measured
by nothing, and a criterion following its code by one commit. What limits the
cost is that the rule was fully written in 9.5's v2 bullet before the
implementation existed, so this tests a specified sentence rather than an
observed behaviour, and it was run as a positive control with `showDue`
restored to its default and went red on the first half.

**The second half is read on Abandoned rather than on Scheduled**, because the
two pages agree about everything this criterion is not about: both draw a
status the row marks, both are place pages of 9.5, and neither groups by
completion. Scheduled would have worked and carries a second variable, its
ladder of date headings, which is itself a reason a row might drop a date.
Abandoned has no date heading anywhere, so a badge there is the page saying
nothing and the row saying everything, which is the control this half wants.

Spec: 9.5 (the v2 Done bullet and the Abandoned bullet), DES-183 (a row says
what its page does not), 6 Q6 (Done's day grouping), 5.1 (the two transitions).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  createTask,
  csrfToken,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Anything on the row that renders 4.11's date, in the forms
 * `parts/presenters.ts` produces: "Due today", "Due 26 Aug", "Overdue - ...".
 * Read off the row rather than off the page, a day heading above it being the
 * thing the bullet says the badge is redundant with.
 */
function dueBadge(row: Locator): Locator {
  return row.getByText(/Due |Overdue/)
}

/** Moves a task through 5.1 by its own endpoint, never through the interface. */
async function transition(page: Page, taskId: string, event: string): Promise<void> {
  const token = await csrfToken(page.context())
  const answered = await page.request.post(`/api/v1/tasks/${taskId}/${event}`, {
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    answered.status(),
    `POST /tasks/:id/${event} answered ${answered.status()}: ${await answered.text()}`,
  ).toBe(200)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-229: a Done row drops the spent due-date echo', () => {
  test('AC-229: a completed row on Done carries no due badge', async ({ page }) => {
    const title = caseTitle('Dated and done')
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
    })
    await transition(page, task.id, 'complete')

    await page.goto(routesV2.done)
    await waitForApiIdle(page, 'the Done view is answered before its rows are read')
    const row = taskRow(page, title)
    await expect(
      row,
      "6 Q6: the task is completed today, so it is in today's group on Done, which is what " +
        'makes the absence below about the badge rather than about the row',
    ).toBeVisible()
    await expect(
      dueBadge(row),
      'spec 9.5: rows on Done "drop the spent due-date echo under headings that already ' +
        'group by completion". The date is still on the task and still on the wire; what ' +
        'the page declines to repeat is a deadline that has stopped meaning anything ' +
        '(DES-183)',
    ).toHaveCount(0)
  })

  test('AC-229: the same task keeps its badge on a page that does not group by completion', async ({
    page,
  }) => {
    const title = caseTitle('Dated and abandoned')
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
    })
    await transition(page, task.id, 'abandon')

    await page.goto(routesV2.abandoned)
    await waitForApiIdle(page, 'the Abandoned view is answered before its rows are read')
    const row = taskRow(page, title)
    await expect(
      row,
      'spec 9.5: Abandoned is "an unpinned view of the one status with no other home", so ' +
        'the row is here',
    ).toBeVisible()
    await expect(
      dueBadge(row).first(),
      'spec 9.5 and DES-183: the drop is Done\'s and not the row\'s. Abandoned groups by ' +
        'nothing and carries no date heading, so the badge is the only thing on the surface ' +
        'saying when the task was due, and a client that stripped it everywhere would have ' +
        'read a page rule as a row rule',
    ).toBeVisible()
  })
})

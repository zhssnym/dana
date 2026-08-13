/*
AC-157: given a mutation the server refuses with 409, then the
page shows the state machine copy of 5.1 verbatim rather than the general
error toast.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

9.1's last line states two rules in one sentence and section 12 asserts
neither: failed requests show "Something went wrong. Nothing was saved. Try
again.", and 409 conflicts show 5.1's copy verbatim instead. The second is
the one that costs something when it is missing. Every 409 in 5.1 is a
refusal a person can act on, and each row of that table spells the action:
un-complete first, restore the task first, this repeating task has already
moved on. Replaced by the general toast, the same page tells them something
went wrong and lets them press the same control again.

**The conflict is produced the way a person meets one.** 8.3 accepts
staleness between refetches and offers no realtime channel, so a 409 arrives
when someone else moved the task while this page was showing it. A second
member does exactly that here, through the API, while the first page keeps
the row it already rendered. Nothing is faked: the request the client sends
is the one it would have sent, and the server answers it as 5.1 says.

**The general toast is asserted absent in the same case.** Otherwise a page
showing both satisfies the criterion while burying the sentence that
matters, and a page showing the general one alone fails only for the
assertion nobody wrote.

**The third case writes through the quick-add's opened state**, corrected on
2026-08-13 after 9.1 made that control a disclosure at the RFC 0002 change
control. It was written when the row was always on the page and reached for
its text box directly, which AC-166 now forbids: that criterion asserts a
collapsed state and asserts that escape leaves no box on the page at all. What
the case owes is one activation, and what it asserts, that an ordinary failed
request shows the general toast, does not move.

Spec: 9.1 (both toasts, the 409 rule, and the quick-add's two states), 5.1
(the copy, verbatim), 8.3 (staleness between refetches), 7.6, 7.0.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  checkControl,
  clickControl,
  conflictCopy,
  copy,
  createTask,
  fillControl,
  openQuickAdd,
  routes,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-157: a 409 shows 5.1\'s copy', () => {
  test('AC-157: completing a task another member abandoned shows 5.1\'s copy', async ({
    page,
    browser,
  }) => {
    await signIn(page, seedSubs.hassan)
    const title = 'ac-157 abandoned under the viewer'
    const task = await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routes.tasks)
    await expect(
      taskRow(page, title),
      'the row is on the page and pending, which is the state this client still believes in ' +
        'when it sends the request below',
    ).toBeVisible()

    // The other member, who is also a member of this folder (5.4: any member
    // may abandon any task in it). The first page is not told, 8.3 offering
    // no realtime channel, which is the whole situation 9.1's rule is for.
    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await signIn(otherPage, seedSubs.imran)
    await transition(otherPage, task.id, 'abandon', 'UTC')
    await otherContext.close()

    await checkControl(
      taskRow(page, title).getByRole('checkbox'),
      'spec 9.4: a row carries a complete checkbox',
    )

    await expect(
      page.getByText(conflictCopy.abandonedComplete),
      'spec 9.1: a 409 shows the state machine copy of 5.1 verbatim, and 5.1 answers complete ' +
        'on an abandoned row with "restore the task first". That sentence names the control ' +
        'the person should reach for next, which is the whole difference between it and a ' +
        'generic failure',
    ).toBeVisible()

    await expect(
      page.getByText(copy.errorToast),
      'spec 9.1 gives 409 conflicts their own copy instead of the general error toast, so a ' +
        'page showing both has buried the sentence that tells the person what to do',
    ).toHaveCount(0)
  })

  test('AC-157: abandoning a task another member completed shows the other row of 5.1', async ({
    page,
    browser,
  }) => {
    await signIn(page, seedSubs.hassan)
    const title = 'ac-157 completed under the viewer'
    const task = await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routes.tasks)
    await expect(
      taskRow(page, title),
      'the row is on the page and pending, which is the state this client still believes in ' +
        'when it sends the request below',
    ).toBeVisible()

    const otherContext = await browser.newContext()
    const otherPage = await otherContext.newPage()
    await signIn(otherPage, seedSubs.imran)
    await transition(otherPage, task.id, 'complete', 'UTC')
    await otherContext.close()

    // 9.4's overflow menu carries abandon, with the confirm of that section.
    await clickControl(
      taskRow(page, title).getByRole('button', { name: 'More actions', exact: true }),
      'spec 9.4: a row carries an overflow menu',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /abandon/i }),

      "spec 9.4: the row's overflow menu carries edit, abandon and delete",
    )
    await clickControl(
      page.getByRole('button', { name: 'Continue', exact: true }),
      'spec 9.4: abandoning confirms first, so the dialog offers a control that proceeds',
    )

    await expect(
      page.getByText(conflictCopy.completedAbandon),
      'spec 5.1: abandon on a completed row is refused with "complete tasks cannot be ' +
        'abandoned; un-complete first", and 9.1 requires it verbatim. Two rows of that table ' +
        'assert separately because a client can carry one string and fall back to the general ' +
        'toast for every other conflict',
    ).toBeVisible()
    await expect(
      page.getByText(copy.errorToast),
      'spec 9.1: still not the general toast',
    ).toHaveCount(0)
  })

  test('AC-157: an ordinary failed request does show the general toast', async ({ page }) => {
    // The other half of 9.1's sentence, and the control that keeps the two
    // cases above honest: a client with no toasts at all passes both of them
    // for the wrong reason, since each asserts an absence.
    await signIn(page, seedSubs.hassan)
    await page.goto(routes.tasks)

    await page.route('**/api/v1/tasks', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'internal', message: 'Something broke.' } }),
      })
    })

    const quickAdd = await openQuickAdd(
      page,
      'spec 9.1: the inline quick-add is the shortest write path this section offers, and this ' +
        'case needs a write the server can be made to fail',
    )
    await fillControl(
      quickAdd,
      'ac-157 a request that fails',
      'spec 9.1: the expanded quick-add is a single title input',
    )
    await quickAdd.press('Enter')

    await expect(
      page.getByText(copy.errorToast),
      'spec 9.1: failed requests show the global error toast, and its copy is normative. ' +
        'This is the case that proves the two above are asserting the absence of something ' +
        'the client actually has',
    ).toBeVisible()
  })
})

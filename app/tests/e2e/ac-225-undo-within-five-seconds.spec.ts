/*
AC-225: given a completion, when Ctrl+Z is pressed within five seconds, then
the task is pending again through an ordinary mutation, and the wire never
held the completion back.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. It is 9.1's undo paragraph as a criterion, and the second clause
is the architectural half (DES-158): undo issues the inverse mutation, no
write is ever held back waiting for the window to close. Red until S9 lands
the undo bar.

**The wire is watched, not inferred.** The harness's watchWire records every
API request the page makes; the assertion is that the completion POST went
out before Ctrl+Z was pressed, and that a second, inverse mutation went out
after it. A client that queues the completion for five seconds and discards
it on undo shows one fewer wire call and fails the count, and that client is
exactly what the clause forbids, because a queued write is a lie on every
other member's screen for five seconds.

**The state is read from the server**, by reload: after the undo, the task
renders as an open row again, which only survives a reload if the inverse
mutation really landed.

**The bar is read first, and the ordering is the point.** The window is
five seconds and the wire assertions spend some of them, so a check made
after them races the very window the criterion is named for. That is a
fault in how the criterion is read rather than in what it asserts: both of
its clauses, the inverse mutation and the write that was never held back,
are untouched.

Spec: 9.1 (the undo paragraph), 5.1 (the uncomplete transition the inverse
rides), DES-158.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  checkControl,
  createTask,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-225: undo takes back a completion', () => {
  test('AC-225: Ctrl+Z within five seconds reopens the task through the wire', async ({
    page,
  }) => {
    const title = caseTitle('Undone errand')
    await signIn(page, seedSubs.hassan)
    const wire = watchWire(page)
    const { id } = await createTask(page, { title, folder_id: seedIds.groceries })
    await page.goto(`/app/folders/${seedIds.groceries}`)

    const row = page.getByRole('main').getByRole('listitem').filter({ hasText: title })
    /* Before the press (2026-09-04, issue #159), and this file is the clearest
       case for it in the suite: the assertion under this barrier is that the
       POST went out at all. API quiet is satisfied in the window before the
       request leaves the browser, so a barrier that returned there would read
       the wire empty and fail saying the client queued the write for five
       seconds — which is the defect this criterion exists to catch, reported
       by the barrier rather than by the product. */
    const completion = watchCommit(page)
    await checkControl(
      row.getByRole('checkbox', { name: 'Complete task', exact: true }),
      'spec 9.1: a completion is an act the undo bar can take back; the checkbox ' +
        'carries its 9.1 name',
    )
    // Read before anything else waits. The bar stands for five seconds and
    // the assertions below spend some of them, so a check made after them is
    // a race against the very window this criterion is named for. The first
    // draft of this file lost that race, which is a fault in the reading and
    // not in the bar.
    await expect(
      page.getByRole('status').filter({ hasText: title }),
      'spec 9.1: the bar names the act it can take back, so its sentence carries ' +
        'the task\'s own title; a bar reading only the verb could not tell two ' +
        'completions apart, which is why the section gives the sentence a subject',
    ).toBeVisible()

    await completion.settled('the completion is on the wire before undo is pressed')

    const completions = wire
      .mutations()
      .filter((call) => call.url.includes(`/tasks/${id}/complete`))
    expect(
      completions.length,
      'AC-225\'s second clause: the wire never held the completion back. The POST ' +
        'went out when the checkbox was pressed, before any undo window closed; a ' +
        'client queueing the write for five seconds shows nothing here and fails, ' +
        'because a queued write lies on every other member\'s screen (DES-158)',
    ).toBeGreaterThanOrEqual(1)

    /* Same again for undo, whose own assertion is that an inverse mutation was
       sent rather than a queued write rolled back in the browser. */
    const inverse = watchCommit(page)
    await page.keyboard.press('Control+z')
    await inverse.settled('the inverse mutation reaches the server before the wire is read')

    const inverses = wire
      .mutations()
      .filter((call) => call.url.includes(`/tasks/${id}/uncomplete`))
    expect(
      inverses.length,
      'spec 9.1: undo issues the inverse mutation, an ordinary write through 5.1\'s ' +
        'uncomplete; a client rolling back a queued completion instead shows nothing ' +
        'here and fails',
    ).toBeGreaterThanOrEqual(1)

    await page.reload()
    await expect(
      page
        .getByRole('main')
        .getByRole('listitem')
        .filter({ hasText: title })
        .getByRole('checkbox', { name: 'Complete task', exact: true }),
      'the task is pending again on the server: after a reload the row offers ' +
        '"Complete task", which only survives if the inverse mutation really landed',
    ).toBeVisible()
  })
})

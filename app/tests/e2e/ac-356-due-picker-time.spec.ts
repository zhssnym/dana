/*
AC-356: the due picker shows its calendar plainly and takes a time under the day.

The adversarial round of 2026-08-30 (taskcard F7): "next Tuesday at 9" took
two chips and four clicks, "Custom date…" carried a tick and folded the
calendar, and on a Sunday "Next week" said the same day as "Tomorrow". The
grid stands below the presets now, a Time field under it writes 4.8's
reminder on that day (a due date stays a day, 4.11), and "Next week" is next
Monday and never tomorrow.

Spec: 4.8, 4.11, 7.9, 9.3 (the pickers), AC-219 as amended.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  storedReminder,
  TEST_TIMEOUT_MS,
  watchCommit,
  watchWire,
 openTaskRow } from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-356: the calendar is open, Custom date is gone, and Time writes the reminder', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const title = caseTitle('AC-356 next Tuesday at 9')
  const task = await createTask(page, {
    title,
    folder_id: seedIds.groceries,
    due_date: seedDate(2),
  })
  await page.goto(routesV2.folder(seedIds.groceries))
  await openTaskRow(page, title, 'the row opens its task')
  await clickControl(
    page.getByRole('button', { name: /due/i }).first(),
    'spec 9.3: the due chip opens its picker in place',
  )
  const picker = page.getByRole('dialog').last()
  await expect(
    picker.getByRole('grid').or(picker.getByRole('gridcell')).first(),
    'the day grid stands below the presets with nothing to unfold',
  ).toBeVisible()
  await expect(picker.getByText('Custom date', { exact: false })).toHaveCount(0)
  await expect(
    picker.getByRole('button', { name: /^Next week/ }),
    'the presets stand above it',
  ).toBeVisible()

  const wire = watchWire(page)
  const time = picker.locator('input[type="time"]')
  await expect(time, 'a dated task takes a time under the day').toHaveCount(1)
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const written = watchCommit(page)
  await time.fill('09:00')
  await written.settled('the time reaches 7.9 before the wire and the stored reminder are read')
  expect(
    wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.includes('/reminder')),
    'spec 7.9: the time is the reminder on that day, written through its PUT',
  ).toEqual([`PUT /api/v1/tasks/${task.id}/reminder`])
  const stored = await storedReminder(page, task.id)
  expect(stored?.time_of_day?.slice(0, 5), 'spec 4.8: time_of_day carries what was typed').toBe('09:00')
})

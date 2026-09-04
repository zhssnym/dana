/*
AC-355: a row's menu adds the task to Today and takes it out again.

The adversarial round of 2026-08-30 (taskrow F11): the only way onto Today
from a list was the selection bar's sun, which nothing named. The row's own
menu carries the pair now, one at a time, over 7.8's pull and its DELETE.

Spec: 7.8, 9.4, `lib/object-acts.ts`.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  watchCommit,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-355: Add to Today is 7.8\'s pull, and the menu then offers Remove from Today', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const title = caseTitle('AC-355 onto Today')
  const task = await createTask(page, { title, folder_id: seedIds.groceries })
  await page.goto(routesV2.folder(seedIds.groceries))
  const row = taskRow(page, title)
  await expect(row).toBeVisible()

  const wire = watchWire(page)
  await row.hover()
  await clickControl(row.getByRole('button', { name: 'More actions', exact: true }), "the row's menu")
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const pulled = watchCommit(page)
  await clickControl(page.getByRole('menuitem', { name: 'Add to Today', exact: true }), 'the act')
  await pulled.settled('the pull reaches the server before the wire is read')
  expect(
    wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.includes('/my-day')),
    'spec 7.8: the pull is POST /tasks/:id/my-day',
  ).toEqual([`POST /api/v1/tasks/${task.id}/my-day`])

  await row.hover()
  await clickControl(row.getByRole('button', { name: 'More actions', exact: true }), "the row's menu again")
  await expect(
    page.getByRole('menuitem', { name: 'Remove from Today', exact: true }),
    'one of the pair at a time, the other now',
  ).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Add to Today', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

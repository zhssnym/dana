/*
AC-357: the open task's menu carries what the row's carries.

The adversarial round of 2026-08-30 (taskcard F5): the card's "More actions"
had Move, Make this a folder, Copy link and Duplicate, and the row's, one
layer back, also had History, Abandon and Delete task, so deleting an open
task meant closing it first. One declared act list (`lib/object-acts.ts`),
and the surface now supplies the handlers the row supplies, with the row's
confirm and the row's undo entry.

Spec: 9.3 (the footer's "More actions" list), 7.6, 7.13.
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
  taskSurface,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-357: History, Abandon and Delete task are in the card\'s menu, and Delete moves it to Trash', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const title = caseTitle('AC-357 from the card')
  const task = await createTask(page, { title, folder_id: seedIds.groceries })
  await page.goto(routesV2.folder(seedIds.groceries))
  await clickControl(page.getByText(title).first(), 'spec 9.4: a click on the row opens the task')
  const surface = taskSurface(page)
  await expect(surface).toBeVisible()

  await clickControl(
    surface.getByRole('button', { name: 'More actions', exact: true }),
    "spec 9.3: the card's footer carries More actions",
  )
  for (const name of ['History', 'Abandon', 'Delete task…']) {
    await expect(
      page.getByRole('menuitem', { name, exact: true }),
      `spec 9.3: the list names ${name}, the same act the row offers`,
    ).toBeVisible()
  }

  const wire = watchWire(page)
  await clickControl(page.getByRole('menuitem', { name: 'Delete task…', exact: true }), 'the act')
  const dialog = page.getByRole('alertdialog')
  await expect(
    dialog.getByText('Move this task to Trash? It stays there for 30 days.', { exact: true }),
    "spec 9.3: the row's confirm, telling the truth 7.13 made",
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Keep it', exact: true })).toBeVisible()
  await clickControl(dialog.getByRole('button', { name: 'Delete', exact: true }), 'confirming')
  await waitForApiIdle(page, 'the deletion has been written')
  expect(
    wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.startsWith('DELETE /api/v1/tasks/')),
    'spec 7.6: one DELETE, which since 7.13 marks rather than purges',
  ).toEqual([`DELETE /api/v1/tasks/${task.id}`])
  await expect(surface, 'the surface closes on the act that ends its subject').toHaveCount(0)
  await expect(taskRow(page, title)).toHaveCount(0)
  await expect(page.getByText(`Deleted "${title}"`, { exact: true }), "spec 9.1: the row's undo entry").toBeVisible()
})

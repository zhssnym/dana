/*
AC-354: "Where a task opens: Tab" opens the task at its address, and that
address is the editor.

The adversarial round of 2026-08-30 (taskcard F3): the setting accepted
"Tab" and opened the dialog regardless, and /app/tasks/:id was a read-only
sheet with an "Open editor" button that popped the same dialog. The page is
the card now, over the same editing hook the dialog uses, and the setting
sends a row's click there.

Spec: 9.3 (a task is its row, its card, and its page; where a task opens),
9.7 (the Appearance control), 7.17.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createSteps,
  createTask,
  patchBundle,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
 taskRow } from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-354: with Tab chosen, a row opens its page, and the page edits', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const title = caseTitle('AC-354 as a tab')
  const task = await createTask(page, { title, folder_id: seedIds.groceries })
  await createSteps(page, task.id, ['Plates'])
  await patchBundle(page, { task_open: 'tab' })
  try {
    await page.goto(routesV2.folder(seedIds.groceries))
    await clickControl(taskRow(page, title).first(), 'spec 9.4: a click on the row opens the task')
    await expect(page, 'spec 9.3: opened as a tab means at its own address').toHaveURL(
      new RegExp(`${routesV2.task(task.id)}$`),
    )
    await expect(page.getByRole('dialog'), 'and not in the dialog the setting said it would not use').toHaveCount(0)

    const main = page.getByRole('main')
    await expect(main.getByLabel(/^\s*title\s*$/i), 'the page is the card: the title is a field').toHaveValue(
      title,
    )
    await expect(main.getByText('Plates', { exact: true })).toBeVisible()
    await expect(
      main.getByRole('button', { name: 'Add a step', exact: true }),
      'the steps block edits here as it does in the dialog',
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open editor' })).toHaveCount(0)
  } finally {
    await patchBundle(page, { task_open: 'dialog' })
  }
})

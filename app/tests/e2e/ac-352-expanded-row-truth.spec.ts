/*
AC-352: the chevron's inline card tells the same truth as the dialog.

Two findings of the adversarial round of 2026-08-30, one fault: the expanded
row read a missing folder as Desk on a task in "Apartment move" (taskrow F2),
and drew its steps as "Step 1 … Step 16" from a count (taskcard F8), while
the title click opened a dialog with the real folder and the real steps.
The row is told its folder and reads 7.6's detail while it is open, so the
two ways of looking at one task agree.

Spec: 9.3 (a task is its row, its card, and its page), 9.6.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createSteps,
  createTask,
  routesV2,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-352: the expanded row names its own folder and its real steps', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folderName = caseTitle('AC-352 Apartment move')
  const folder = await createFolder(page, folderName)
  const title = caseTitle('AC-352 call mum')
  const task = await createTask(page, { title, folder_id: folder.id })
  await createSteps(page, task.id, ['Download the runner', 'Configure as a service'])
  await page.goto(routesV2.folder(folder.id))
  const row = taskRow(page, title)
  await expect(row).toBeVisible()

  await clickControl(
    row.getByRole('button', { name: 'Expand this task', exact: true }),
    'the chevron expands the row in place',
  )
  await expect(
    row.getByText('Download the runner', { exact: true }),
    'spec 9.3: the inline card draws the steps 7.7 holds, not titles invented from a count',
  ).toBeVisible()
  await expect(row.getByText('Configure as a service', { exact: true })).toBeVisible()
  await expect(row.getByText(/^Step \d+$/)).toHaveCount(0)
  await expect(
    row.getByText(folderName, { exact: true }),
    "spec 9.6: the card names the task's folder, not the DES-155 fallback",
  ).toBeVisible()
  await expect(row.getByText('Desk', { exact: true })).toHaveCount(0)
})

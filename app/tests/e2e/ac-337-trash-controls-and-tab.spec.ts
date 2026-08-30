/*
AC-337: given Trash holding a deleted task, then its tab is named "Trash",
the row's Restore is drawn at rest rather than on hover, and pressing it
raises a toast naming the folder the task went back to.

Authored 2026-08-30 at the polish round (places F10; pagehead F5's blank
tab).

Spec: 9.11 (Trash), 9.1 (every tab is the same tab: mark, title, close).
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteTask,
  effectiveOpacity,
  routesV2,
  seedSubs,
  signIn,
  tabNamed,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-337: Trash names its tab, shows Restore at rest, and says where a restore went', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folderName = caseTitle('AC-337 Reading')
  const folder = await createFolder(page, folderName)
  const title = caseTitle('Renew the library card')
  const task = await createTask(page, { title, folder_id: folder.id })
  await deleteTask(page, task.id)

  await page.goto(routesV2.trash)
  await expect(tabNamed(page, 'Trash'), 'places F10: the tab reads "Trash", not a blank with an x').toBeVisible()

  /* The toast region is a list of its own and its text names the task, so
     the row is read inside the page rather than in the document. */
  const row = page.getByRole('main').getByRole('listitem').filter({ hasText: title })
  const restore = row.getByRole('button', { name: 'Restore', exact: true })
  await page.mouse.move(4, 4)
  expect(
    await effectiveOpacity(restore),
    'places F10: Restore is drawn at rest; a row whose only controls appear on hover is a row with nothing to press',
  ).toBeGreaterThan(0.5)

  await clickControl(restore, 'spec 9.11: Restore puts the thing back where it was')
  await expect(
    page.getByText(`Restored "${title}" to ${folderName}`),
    'places F10: the toast says where it went',
  ).toBeVisible()
  await expect(row, 'and the row leaves Trash').toHaveCount(0)
})

/*
AC-224: given Trash holding a deleted folder, when Restore is pressed, then
the folder returns to the sidebar exactly once with its tasks.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. The server half is AC-189/AC-190 and 7.13, green since S3; this
is 9.11's page, red until S9 builds it.

**The deleted folder is this case's own, with one task in it**, deleted
through 7.4 (which since 7.13 marks rather than purges), because the harness
rule forbids transitioning seed rows and "with its tasks" needs a task whose
survival can be read.

**"Exactly once" is a count, not a presence.** The v1 restore fault this
guards against is a folder coming back twice, once from the restore write
and once from a stale cache row; the sidebar link carrying the folder's name
is asserted toHaveCount(1).

Spec: 9.11 (the Trash page and its copy), 7.13 (the trash surface), 9.1
(the footer's "Trash" destination and the routes table), AC-189/AC-190
(the server half).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-224: Trash restores a folder', () => {
  test('AC-224: Restore returns the folder to the sidebar exactly once with its tasks', async ({
    page,
  }) => {
    const folderName = caseTitle('Doomed folder')
    const taskTitle = caseTitle('Held task')
    await signIn(page, seedSubs.hassan)
    const folder = await createFolder(page, folderName)
    await createTask(page, { title: taskTitle, folder_id: folder.id })
    await deleteFolder(page, folder.id)

    await page.goto(routesV2.trash)
    await expect(
      page.getByText('Deleted items are kept for 30 days, then removed.'),
      'spec 9.11: the page states the rule once, in these words, which are the ' +
        'prototype\'s since S27 (RFC 0005 change control item 55). The v1 client has no ' +
        'Trash page, which is the red this showed until S9',
    ).toBeVisible()

    const row = page.getByRole('main').getByText(new RegExp(folderName)).first()
    await expect(
      row,
      'spec 9.11: Trash lists every deleted thing the viewer can still reach, and this ' +
        'folder was deleted seconds ago by the viewer',
    ).toBeVisible()

    /* Before the press (2026-09-04, issue #159). The count below is the
       assertion, and API quiet is also what a page looks like in the window
       between the press and the request it causes: a sidebar read there holds
       zero rows, which reads as a restore that put nothing back rather than as
       a barrier that returned early. */
    const restored = watchCommit(page)
    await clickControl(
      page
        .getByRole('listitem')
        .filter({ hasText: folderName })
        .getByRole('button', { name: 'Restore', exact: true })
        .or(
          page
            .getByRole('row')
            .filter({ hasText: folderName })
            .getByRole('button', { name: 'Restore', exact: true }),
        )
        .first(),
      'spec 9.11: Restore puts the thing back where it was; the control keeps 9.5\'s ' +
        'name, "Restore"',
    )
    await restored.settled('the restore reaches the server before the sidebar is counted')

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(folderName) }),
      'AC-224\'s own words: exactly once. A folder returning twice, once from the ' +
        'write and once from a stale cache row, is the fault the count exists to catch',
    ).toHaveCount(1)

    await page.goto(`/app/folders/${folder.id}`)
    await expect(
      page.getByRole('main').getByText(taskTitle).first(),
      'spec 7.13: a restored folder returns as exactly one row with its contents; ' +
        '"with its tasks" read on the page rather than trusted to the response ' +
        '(AC-190 pins the server half)',
    ).toBeVisible()
  })
})

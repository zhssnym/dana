/*
AC-342: given a folder wearing a cover, when the band is hovered, then
"Remove" stands beside "Change" and pressing it takes the cover off in one
act; and given the folder holds a finished task, when the board is shown,
then its Done column is the one place the task appears: the page's "Done"
section is not drawn beneath the board.

Authored 2026-08-30 at the polish round (pagehead F7, F8; folderpage F7).

Spec: 9.6 (the cover; the board's Done column, item 58 G), 9.1 (the
sections table names the folder page's finished pile "Done").
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  chooseView,
  clickControl,
  createFolder,
  createTask,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  transition,
  watchCommit,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-342: Remove sits beside Change on the cover, and the board draws Done once', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-342 cover'))
  const finished = caseTitle('ac-342 finished')
  const task = await createTask(page, { title: finished, folder_id: folder.id })
  await transition(page, task.id, 'complete')
  await page.goto(routesV2.folder(folder.id))

  await clickControl(page.getByRole('button', { name: 'Add cover', exact: true }), 'spec 9.6: a cover can be given')
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const given = watchCommit(page)
  await clickControl(page.getByRole('option', { name: 'Cobalt', exact: true }), 'one press on a swatch')
  await given.settled('the cover reaches the server before the band it draws is read')
  await page.keyboard.press('Escape')
  const change = page.getByRole('button', { name: 'Change', exact: true })
  await change.hover({ force: true })
  const remove = page.getByRole('button', { name: 'Remove', exact: true })
  await expect(remove, 'pagehead F7: Remove beside Change, on the band').toBeVisible()
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const cleared = watchCommit(page)
  await clickControl(remove, 'and one press takes the cover off')
  await cleared.settled('the removal reaches the server before the way back in is looked for')
  await expect(page.getByRole('button', { name: 'Add cover', exact: true }), 'the way back in is drawn again').toBeVisible()

  await expect(page.getByRole('button', { name: 'Done', exact: true }), 'spec 9.1: the list\'s Done section').toBeVisible()
  await chooseView(page, 'Board', 'spec 9.1: the strip offers the board')
  await expect(page.getByRole('region', { name: 'Done', exact: true }), 'item 58 G: the Done column').toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Done', exact: true }),
    'pagehead F8: the finished task is in one place while the board is up; the section is not drawn under it',
  ).toHaveCount(0)
  await chooseView(page, 'List', 'back to the list')
})

/*
AC-336: given a shelf holding a folder, when its page is opened and opened
again, then no "Someone else changed this block" toast is raised; and when
Section is chosen at the top of the page, then the section lands there, its
field open, empty and focused, with "New section" as its placeholder; and
Escape while renaming the shelf puts the saved name back.

Authored 2026-08-30 at the polish round (shelves F2, a blocker: the screen
mounted before its folder list, wrote an empty arrangement, then wrote the
folders back with stale evidence, so every shelf page opened with a 409
nobody caused; F9; F11).

The control moved with #145 (2026-09-04): the Section chip at the top of the
page became the "Insert into page" menu on the same line when #178 shipped
the writing-first composer, so the insert is reached through `insertBlock` at
that line. Where the section lands, and everything read after it, is
unchanged. Issues #145, #178, #181.

Spec: 9.10 (the shelf page), 4.17 (the page's blocks and their evidence).
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  createFolder,
  createShelf,
  deleteShelf,
  insertBlock,
  labelFolder,
  routesV2,
  seedSubs,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchCommit,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const CONFLICT = 'Someone else changed this block. Reload the page to see it.'

test('AC-336: a shelf page opens without a conflict, a section lands where it was made', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const shelfName = shortName('AC-336 Work')
  const shelf = await createShelf(page, shelfName)
  const folderName = caseTitle('AC-336 Reading')
  const folder = await createFolder(page, folderName)
  await labelFolder(page, folder.id, shelfName)

  await page.goto(routesV2.shelf(shelf.id))
  await expect(page.getByRole('link', { name: folderName, exact: true }).first(), 'spec 9.10: the folder row').toBeVisible()
  // Quiet and not `watchCommit` (issue #159): what precedes this is a
  // navigation and not an act, so there is no commit to count, and the
  // assertion after it is an absence.
  await waitForApiIdle(page, 'the page has settled')
  await expect(page.getByText(CONFLICT), 'shelves F2: nobody else touched this page').toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('link', { name: folderName, exact: true }).first()).toBeVisible()
  // Quiet and not `watchCommit` (issue #159): what precedes this is a
  // navigation and not an act, so there is no commit to count, and the
  // assertion after it is an absence.
  await waitForApiIdle(page, 'the page has settled again')
  await expect(page.getByText(CONFLICT), 'shelves F2: nor after a reload').toHaveCount(0)

  await insertBlock(page, 'Section', {
    at: 'first',
    why: 'shelves F11: a section is made at the top of the page',
  })
  const field = page.getByLabel('Section name')
  await expect(field, 'shelves F11: the section opens as a field').toBeVisible()
  await expect(field, 'shelves F11: focused, so typing goes into it').toBeFocused()
  await expect(field).toHaveValue('')
  await expect(field).toHaveAttribute('placeholder', 'New section')
  const sectionName = caseTitle('Weekdays')
  await field.fill(sectionName)
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const arranged = watchCommit(page)
  await page.keyboard.press('Enter')
  await arranged.settled('the arrangement reaches the server before the two boxes are measured')
  const sectionBox = await page.getByLabel('Section name').filter({ has: page.locator(`[value="${sectionName}"]`) }).or(page.getByLabel('Section name')).first().boundingBox()
  const folderBox = await page.getByRole('main').getByRole('link', { name: folderName, exact: true }).first().boundingBox()
  expect(
    sectionBox !== null && folderBox !== null && sectionBox.y < folderBox.y,
    'shelves F11: inserted at the top, it stands above the folder row, not under Add folder',
  ).toBe(true)

  const title = page.getByLabel('Shelf name')
  await title.click()
  await title.press('End')
  await title.type('ZZZ')
  await title.press('Escape')
  await expect(title, 'shelves F9: Escape restores the saved name').toHaveValue(shelfName)

  await deleteShelf(page, shelf.id)
})

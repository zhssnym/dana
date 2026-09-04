/*
AC-335: given a folder page, then its "Insert into page" control at the foot
of the page is drawn at rest; when Section is chosen from it, then the name
field opens empty with "New section" as its placeholder and what is typed
becomes the name; and when the section's delete is pressed, then a dialog
asks, says where the tasks go, and offers "Keep it" and "Delete section".

Authored 2026-08-30 at the polish round (folderpage F2, a blocker on touch;
F4; F5).

The control moved with #145 (2026-09-04): the row of Section, Paragraph and
Image chips this case used to press became one "Insert into page" menu when
#178 shipped the writing-first composer, so the insert is reached through
`insertBlock` and F2's resting-opacity rule is asserted of the trigger the
chip row became. Nothing after the insert changed. Issues #145, #178, #181.

Spec: 9.6 (the insert affordance between blocks; sections), 4.17.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  effectiveOpacity,
  insertBlock,
  insertTrigger,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  watchCommit,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-335: page tools rest visible, a new section opens empty, deleting one asks', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-335 tools'))
  await page.goto(routesV2.folder(folder.id))
  await page.mouse.move(4, 4)

  const insert = insertTrigger(page)
  await expect(insert, 'spec 9.6: the insert affordance').toBeVisible()
  expect(
    await effectiveOpacity(insert),
    'folderpage F2: the control at the foot is drawn at rest, at reduced opacity, rather than at zero until hovered',
  ).toBeGreaterThan(0.3)

  await insertBlock(page, 'Section', { why: 'spec 9.6: a section is inserted' })
  const field = page.getByLabel('Section name')
  await expect(field, 'folderpage F4: the section opens as a field').toBeVisible()
  await expect(field, 'folderpage F4: empty, with the placeholder').toHaveValue('')
  await expect(field).toHaveAttribute('placeholder', 'New section')
  const name = caseTitle('Before launch')
  await field.fill(name)
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const inserted = watchCommit(page)
  await page.keyboard.press('Enter')
  await inserted.settled('the section reaches the server before the heading it draws is read')
  await expect(
    page.getByRole('heading', { name, exact: true }),
    'folderpage F4: what was typed is the name, not appended to "New section"',
  ).toBeVisible()

  await clickControl(
    page.getByRole('button', { name: `Delete section ${name}`, exact: true }),
    'spec 9.6: a section can be removed',
  )
  const ask = page.getByRole('dialog')
  await expect(ask.getByText(`Delete section “${name}”?`), 'folderpage F5: it asks first').toBeVisible()
  await expect(ask.getByText('The heading goes; nothing else changes.'), 'and says what happens').toBeVisible()
  await clickControl(ask.getByRole('button', { name: 'Keep it', exact: true }), 'the safe answer is named for what it does')
  await expect(page.getByRole('heading', { name, exact: true }), 'kept').toBeVisible()

  await clickControl(page.getByRole('button', { name: `Delete section ${name}`, exact: true }), 'again')
  /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
     soon as nothing is in flight, and that is also true in the window
     between the press and the request the press causes, so a read taken
     there lands before the write and reports the state the page was in
     before it -- which is the shape of the defect being asserted against
     rather than of a barrier. `watchCommit` waits for the page to have
     sent something before it waits for quiet. */
  const deleted = watchCommit(page)
  await clickControl(page.getByRole('dialog').getByRole('button', { name: 'Delete section', exact: true }), 'and this time delete')
  await deleted.settled('the deletion reaches the server before the heading is counted')
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0)
})

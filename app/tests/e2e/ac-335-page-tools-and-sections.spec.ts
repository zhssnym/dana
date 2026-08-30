/*
AC-335: given a folder page, then the Section, Paragraph and Image tools at
the foot of the page are drawn at rest; when Section is pressed, then the
name field opens empty with "New section" as its placeholder and what is
typed becomes the name; and when the section's delete is pressed, then a
dialog asks, says where the tasks go, and offers "Keep it" and "Delete
section".

Authored 2026-08-30 at the polish round (folderpage F2, a blocker on touch;
F4; F5).

Spec: 9.6 (the insert affordance between blocks; sections), 4.17.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  effectiveOpacity,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-335: page tools rest visible, a new section opens empty, deleting one asks', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-335 tools'))
  await page.goto(routesV2.folder(folder.id))
  await page.mouse.move(4, 4)

  const sectionTool = page.getByRole('main').getByRole('button', { name: 'Section', exact: true }).last()
  await expect(sectionTool, 'spec 9.6: the insert affordance').toBeVisible()
  expect(
    await effectiveOpacity(sectionTool),
    'folderpage F2: the tools at the foot are drawn at rest, at reduced opacity, rather than at zero until hovered',
  ).toBeGreaterThan(0.3)

  await clickControl(sectionTool, 'spec 9.6: a section is inserted')
  const field = page.getByLabel('Section name')
  await expect(field, 'folderpage F4: the section opens as a field').toBeVisible()
  await expect(field, 'folderpage F4: empty, with the placeholder').toHaveValue('')
  await expect(field).toHaveAttribute('placeholder', 'New section')
  const name = caseTitle('Before launch')
  await field.fill(name)
  await page.keyboard.press('Enter')
  await waitForApiIdle(page, 'the page is written')
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
  await clickControl(page.getByRole('dialog').getByRole('button', { name: 'Delete section', exact: true }), 'and this time delete')
  await waitForApiIdle(page, 'the page is written')
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0)
})

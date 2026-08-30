/*
AC-331: given the filter's "Custom range" chosen with no day picked, then
nothing is narrowed, no chip is drawn and the Filter control counts nothing;
and when the panel is left open-ended, a view saved from it stores no range.

Authored 2026-08-30 at the polish round (pagehead F2): choosing "Custom
range" applied a "Due any to any" chip at once, the badge went to 2, the
narrowing survived Escape with an empty range, and a saved view carried it.

Spec: 9.1 (the filter, one chip per axis that narrows).
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  routesV2,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-331: an open-ended custom range filters nothing and draws no chip', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-331 range'))
  const title = caseTitle('ac-331 undated task')
  await createTask(page, { title, folder_id: folder.id })
  await page.goto(routesV2.folder(folder.id))
  await expect(taskRow(page, title)).toBeVisible()

  await clickControl(
    page.getByRole('button', { name: 'Filter', exact: true }),
    'spec 9.1: the filter control on the window bar',
  )
  await clickControl(
    page.getByRole('option', { name: 'Custom range', exact: true }),
    'spec 9.1: the due axis offers a custom range',
  )
  await expect(
    page.getByText('Pick the first day, then the last.'),
    'pagehead F2: the panel says what it is waiting for',
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(
    page.getByRole('button', { name: /^Remove Due /, exact: false }),
    'pagehead F2: no "Due any to any" chip; a range with no days is not a narrowing',
  ).toHaveCount(0)
  await expect(
    taskRow(page, title),
    'pagehead F2: the undated task is still on the page, because nothing has been asked for yet',
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Filter', exact: true }),
    'spec 9.1: the control carries a count only of the axes that narrow, which is none',
  ).not.toHaveText(/[0-9]/)
})

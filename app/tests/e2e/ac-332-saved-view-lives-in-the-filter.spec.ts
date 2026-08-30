/*
AC-332: given a view saved from a page's filter panel, then it is listed
under "Saved views" in that page's panel and is not filed in the sidebar's
page block; and when the filter is cleared while the view is open, the
`?view=` address leaves with it.

Authored 2026-08-30 at the polish round (pagehead F3): a saved view landed in
the sidebar between All and the Library pretending to be a page, followed a
person to other pages, and stayed highlighted after "Clear all". 9.7's pin
list is where a person chooses to promote one.

Spec: 9.1 (the filter and its save-view control; the page block holds only
what the pin list has pinned), 9.7.
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteSavedView,
  fillControl,
  routesV2,
  seedSubs,
  sidebar,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-332: a saved view stays in the filter panel and leaves the address on Clear all', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-332 views'))
  await createTask(page, { title: caseTitle('ac-332 starred'), folder_id: folder.id, important: true })
  await page.goto(routesV2.folder(folder.id))
  const viewName = shortName('Big rocks')

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'spec 9.1: the filter')
  await clickControl(
    page.getByRole('switch', { name: /Important only/ }),
    'spec 9.1: narrow to important',
  )
  /* An answer commits and closes the panel (9.1, and FilterControl's own
     seam note), so saving the view is a second visit to it. */
  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await clickControl(page.getByRole('button', { name: 'Save as view', exact: true }), 'spec 9.1: the save-view control')
  await fillControl(page.getByLabel('Name this view'), viewName, 'spec 9.1: a view is a name over a filter')
  await page.keyboard.press('Enter')
  await waitForApiIdle(page, 'the view is written')

  await expect(
    sidebar(page).getByRole('link', { name: viewName, exact: true }),
    'pagehead F3: a saved view is not a page and is not filed among them; 9.7\'s pin list promotes one',
  ).toHaveCount(0)

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await expect(page.getByText('Saved views', { exact: true }), 'the panel lists this page\'s views').toBeVisible()
  await clickControl(
    page.getByRole('button', { name: viewName, exact: true }),
    'spec 9.1: opening a saved view is a navigation carrying its id',
  )
  await expect(page).toHaveURL(/\?view=/)

  await clickControl(page.getByRole('button', { name: 'Filter', exact: true }), 'reopen the panel')
  await clickControl(page.getByRole('button', { name: 'Clear all', exact: true }), 'spec 9.1: clear every axis')
  await expect(
    page,
    'pagehead F3: a hand-cleared filter is no longer the saved view, so its id leaves the address',
  ).not.toHaveURL(/view=/)

  const listed = await page.request.get('/api/v1/views')
  const views = (await listed.json()) as { views?: { id: string; name: string }[] } | { id: string; name: string }[]
  const rows = Array.isArray(views) ? views : (views.views ?? [])
  for (const view of rows.filter((entry) => entry.name === viewName)) await deleteSavedView(page, view.id)
})

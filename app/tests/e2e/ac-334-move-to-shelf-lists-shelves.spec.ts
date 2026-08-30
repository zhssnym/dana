/*
AC-334: given a person with shelves, when a folder page's "..." > "Move to
shelf" is opened, then the submenu lists the shelves by name with "Not on a
shelf" as the way off; choosing one moves the folder and the undo bar offers
the way back; and the sidebar row's "New shelf…" opens a dialog that calls
the thing a shelf: "New shelf", "Shelf name", "Create shelf".

Authored 2026-08-30 at the polish round (folderpage F1, a blocker: the
submenu held one row, "No group"; shelves F1, F6).

Spec: 9.6 (Move to shelf), 9.1 (the sidebar's shelf operations), 4.18.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  caseTitle,
  clickControl,
  createFolder,
  createShelf,
  deleteShelf,
  routesV2,
  seedSubs,
  sidebar,
  shortName,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

function folderMenu(page: Page, folder: string): Locator {
  return sidebar(page)
    .getByRole('listitem')
    .filter({ hasText: folder })
    .getByRole('button', { name: 'More actions', exact: true })
}

test('AC-334: Move to shelf lists the shelves, moves with Undo, and the dialog says shelf', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const shelfName = shortName('AC-334 Home')
  const shelf = await createShelf(page, shelfName)
  const folderName = caseTitle('AC-334 Reading')
  const folder = await createFolder(page, folderName)

  await page.goto(routesV2.folder(folder.id))
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
    'spec 9.1: the window bar\'s overflow',
  )
  await page.getByRole('menuitem', { name: 'Move to shelf', exact: true }).hover()
  const option = page.getByRole('menuitemradio', { name: shelfName, exact: true })
  await expect(option, 'folderpage F1: the person\'s shelves are the submenu').toBeVisible()
  await expect(
    page.getByRole('menuitemradio', { name: 'Not on a shelf', exact: true }),
    'shelves F1: the way off a shelf is said in the shelf\'s own word',
  ).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'No group', exact: true })).toHaveCount(0)
  await clickControl(option, 'spec 9.6: a member\'s personal shelf placement is Move to shelf')
  await waitForApiIdle(page, 'the membership label is written')

  await expect(
    page.getByRole('button', { name: /^Undo/ }).or(page.getByText(`Moved "${folderName}" to ${shelfName}`)).first(),
    'shelves F6: a shelf move has the undo bar like every other move',
  ).toBeVisible()
  await expect(
    sidebar(page).getByRole('region', { name: shelfName }).getByRole('link', { name: folderName, exact: true }),
    'spec 9.1: the folder now sits under its shelf in the Library',
  ).toBeVisible()

  await clickControl(folderMenu(page, folderName).first(), 'the row\'s own menu')
  /* Merged with the shell fixer, whose sidebar F7 left one door to this act:
     "New folder group" stood at the top of the row's menu five rows above
     "Move to shelf", and it now lives inside that submenu as "New shelf…".
     AC-180 walks the same path. */
  await clickControl(
    page.getByRole('menuitem', { name: 'Move to shelf', exact: true }),
    'spec 9.6: a member\'s personal shelf placement is on the row\'s own menu',
  )
  await clickControl(
    page.getByRole('menuitem', { name: 'New shelf…', exact: true }),
    'shelves F1: the act is named for the thing it makes',
  )
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'New shelf' }), 'shelves F1: the dialog').toBeVisible()
  await expect(dialog.getByLabel(/^\s*Shelf name\s*$/i), 'shelves F1: the field').toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Create shelf', exact: true }), 'shelves F1: the act').toBeVisible()
  await page.keyboard.press('Escape')

  await deleteShelf(page, shelf.id)
})

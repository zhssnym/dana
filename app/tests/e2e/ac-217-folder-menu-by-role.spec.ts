/*
AC-217: given a folder shared with the viewer, then its menu offers Leave
folder and neither Rename nor Delete folder, and its page title is not
editable; given an owned folder, then the reverse.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. This is the client half of the DES-225 identity split whose server
half AC-193 already pins: the name is the owner's, so a member's surface must
not offer what the server would 403, and an owner's must. Red until the v2
folder surfaces land (S9's shell carries the menu; S12 finishes the page).

**Both accounts are driven.** The seeded Groceries folder is owned by Hassan
with Imran a member, so the member arm signs in as Imran and the owner arm as
Hassan, against the same folder; asserting one arm alone would pass on a
client that renders one menu for everybody.

**"Not editable" is asserted as the absence of a text field over the title.**
The v2 folder page renders its title as an inline field for the owner and as
plain text for a member; what a criterion can hold is that no textbox
carrying the folder's name is offered to the member, and one is to the owner.

Spec: 9.1 (the window bar's overflow, "More actions"; "Leave folder" in the
names table), 9.6 (the folder page, the identity split), 8.2/DES-225 (the
member matrix), AC-193 (the server half).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Opens the folder page's own overflow menu, 9.1's "More actions". */
async function openFolderMenu(page: import('@playwright/test').Page): Promise<void> {
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
    'spec 9.1: the active tab\'s controls include the object\'s overflow menu, named ' +
      '"More actions". The v1 folder page renders no such menu, which is the red this ' +
      'shows until the v2 folder surface lands',
  )
}

test.describe('AC-217: the folder menu follows the role', () => {
  test('AC-217: a member sees Leave folder and no Rename or Delete', async ({ page }) => {
    await signIn(page, seedSubs.imran)
    await page.goto(routes.folder(seedIds.groceries))
    await openFolderMenu(page)

    await expect(
      page.getByRole('menuitem', { name: 'Leave folder', exact: true }),
      'spec 9.1\'s names table: a folder\'s member exit is "Leave folder", and DES-225 ' +
        'puts it on every member surface',
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /Rename/ }),
      'DES-225: the name is the owner\'s, so a member\'s menu must not offer Rename ' +
        'where the server would answer 403 (AC-193\'s half)',
    ).toHaveCount(0)
    await expect(
      page.getByRole('menuitem', { name: /Delete folder/ }),
      'spec 8.2: only the owner deletes a folder, so the member menu does not offer it',
    ).toHaveCount(0)
  })

  test('AC-217: a member cannot edit the page title', async ({ page }) => {
    await signIn(page, seedSubs.imran)
    await page.goto(routes.folder(seedIds.groceries))
    await expect(
      page.getByRole('main').getByRole('textbox', { name: /Groceries/ }),
      'DES-225: the title is the owner\'s to edit, so no textbox carrying the folder\'s ' +
        'name is offered to a member',
    ).toHaveCount(0)
  })

  test('AC-217: the owner sees Rename and Delete folder and no Leave', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routes.folder(seedIds.groceries))
    await openFolderMenu(page)

    await expect(
      page.getByRole('menuitem', { name: /Rename/ }),
      'spec 9.6: the owner renames, so the owner\'s menu offers it',
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: /Delete folder/ }),
      'spec 8.2: the owner deletes, so the owner\'s menu offers it',
    ).toBeVisible()
    await expect(
      page.getByRole('menuitem', { name: 'Leave folder', exact: true }),
      'spec 5.3: an owner does not leave without transferring first, so the owner\'s ' +
        'menu does not offer the member exit',
    ).toHaveCount(0)
  })
})

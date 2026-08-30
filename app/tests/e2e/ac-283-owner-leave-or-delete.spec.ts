/*
AC-283: given a shared folder the viewer owns, when "Delete folder…" is
pressed, then one dialog asks whether to leave it to the other members or
delete it for everyone; when "Leave it to the members" is chosen, then the
client writes `DELETE /folders/:id/my-membership` and nothing else that
deletes, the folder leaves the viewer's Library and stays live for the member
it passed to; when "Delete for everyone" is chosen, then the client writes
`DELETE /folders/:id`, no membership is touched, and the folder waits in
Trash; and given a folder the owner is alone in, then no question is asked
and the soft delete is written at once.

**This is RFC 0005 change control item 38 made into a surface.** Imran's
rules, in his words: "An owner deleting a shared folder is asked one
question: leave it to the other members, or delete it for them too." Item 38
also measured how little of it is new, "one dialog routing to two acts that
already exist": the leave is 5.3's owner-leave, ownership passing under 8.9
to the longest-standing member without anyone being asked to name one, and
the delete is 7.13's soft one for every member. So the criterion reads the
wire as much as the dialog: the question is only right if each answer names
the act item 38 says it names, and a dialog that asked the question and then
wrote the wrong address would pass a copy-only assertion.

**The alone arm is a refusal.** 9.6 made the owner's delete confirm-free with
the undo bar as the way back, and item 38 asks the question of a *shared*
folder. Asking an owner with nobody to leave the folder to would be a
question with one answer, so the third case asserts it is not asked.

Spec: 5.3 (the member and owner leave rows), 8.9 (ownership transfer), 7.13
(the soft delete), 9.6 (the folder header's acts), 9.1's names table
("Delete folder…"), and RFC 0005 change control items 38 and 53.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  csrfToken,
  routesV2,
  seedIds,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** A folder the signed-in person owns, with the seeded second person in it. */
async function sharedFolder(page: Page, base: string): Promise<{ id: string; name: string }> {
  const name = caseTitle(base)
  const folder = await createFolder(page, name)
  const csrf = await csrfToken(page.context())
  const response = await page.request.post(`/api/v1/folders/${folder.id}/members`, {
    data: { user_id: seedIds.imran },
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(
    response.status(),
    `POST /folders/:id/members for the fixture answered ${response.status()}: ${await response.text()}`,
  ).toBe(201)
  return { id: folder.id, name }
}

async function pressDeleteFolder(page: Page): Promise<void> {
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
    "spec 9.1: the active tab's controls include the object's overflow menu",
  )
  await clickControl(
    page.getByRole('menuitem', { name: 'Delete folder…', exact: true }),
    "spec 9.1's names table: the owner's destructive act is \"Delete folder…\"",
  )
}

test.describe('AC-283: the owner is asked one question', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
  })

  test("AC-283: leaving it to the members is 5.3's owner-leave and nothing else", async ({
    page,
    browser,
  }) => {
    const folder = await sharedFolder(page, 'ac-283 leave')
    await page.goto(routesV2.folder(folder.id))
    const wire = watchWire(page)
    await pressDeleteFolder(page)

    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: `Delete ${folder.name}?` }),
      'RFC 0005 change control item 38: "An owner deleting a shared folder is asked one ' +
        'question: leave it to the other members, or delete it for them too"',
    ).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Delete for everyone', exact: true }),
      "item 38: the second answer, 7.13's soft delete for every member",
    ).toBeVisible()
    await clickControl(
      dialog.getByRole('button', { name: 'Leave it to the members', exact: true }),
      'item 38: the first answer, "the folder is deleted at the owner\'s end alone ... and ' +
        'stays in the other members\' sidebars"',
    )

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(folder.name) }),
      "the folder leaves the owner's Library, which is what \"deleted at the owner's end\" " +
        'means on this surface',
    ).toHaveCount(0)

    const deletes = wire.mutations().filter((call) => call.method === 'DELETE')
    expect(
      deletes.map((call) => new URL(call.url).pathname),
      'item 38 measured the act: "the owner leaving it to the members is 5.3\'s owner-leave ' +
        'row", already at DELETE /folders/:id/my-membership; the soft delete is not written',
    ).toEqual([`/api/v1/folders/${folder.id}/my-membership`])
    expect(deletes[0]?.csrf, 'spec 11.6: every mutation carries the CSRF header').not.toBeNull()

    /* 8.9: the folder passed to the remaining member and is live for them. */
    const other = await browser.newContext()
    const otherPage = await other.newPage()
    await signIn(otherPage, seedSubs.imran)
    const read = await otherPage.request.get(`/api/v1/folders/${folder.id}`)
    expect(
      read.status(),
      'spec 8.9: ownership transfers to the remaining member with the earliest membership, ' +
        "and the folder is still theirs to read, not in anybody's Trash",
    ).toBe(200)
    const body = (await read.json()) as { is_owner: boolean }
    expect(body.is_owner, 'spec 8.9: the remaining member now owns it').toBe(true)
    await other.close()
  })

  test("AC-283: deleting for everyone is 7.13's soft delete", async ({ page }) => {
    const folder = await sharedFolder(page, 'ac-283 delete')
    await page.goto(routesV2.folder(folder.id))
    const wire = watchWire(page)
    await pressDeleteFolder(page)
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: 'Delete for everyone', exact: true }),
      'item 38: "if the owner does not leave it to the members, the folder is deleted for ' +
        'everyone"',
    )

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(folder.name) }),
      "spec 7.13: a deleted folder leaves every member's sidebar",
    ).toHaveCount(0)
    const deletes = wire.mutations().filter((call) => call.method === 'DELETE')
    expect(
      deletes.map((call) => new URL(call.url).pathname),
      "item 38: the owner's delete is 8.8's folder deletion, 7.13's soft delete at " +
        'DELETE /folders/:id; no membership is touched',
    ).toEqual([`/api/v1/folders/${folder.id}`])

    await page.goto(routesV2.trash)
    await expect(
      page.getByRole('listitem').filter({ hasText: folder.name }).first(),
      'spec 7.13 and 9.11: the folder waits in Trash for thirty days, restorable by any member',
    ).toBeVisible()
  })

  test('AC-283: an owner alone is asked nothing', async ({ page }) => {
    const name = caseTitle('ac-283 alone')
    const folder = await createFolder(page, name)
    await page.goto(routesV2.folder(folder.id))
    const wire = watchWire(page)
    await pressDeleteFolder(page)

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(name) }),
      "spec 9.6: the owner's delete goes to Trash with no confirmation, the undo bar being " +
        "the way back; item 38's question is asked of a shared folder, and there is nobody " +
        'here to leave it to',
    ).toHaveCount(0)
    await expect(page.getByRole('dialog'), 'no question was asked').toHaveCount(0)
    expect(
      wire.mutations().map((call) => `${call.method} ${new URL(call.url).pathname}`),
    ).toContain(`DELETE /api/v1/folders/${folder.id}`)
  })
})

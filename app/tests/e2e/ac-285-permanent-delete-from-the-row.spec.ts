/*
AC-285: given a trashed task in a folder the viewer owns, when the row's
permanent delete is pressed, then a confirmation names the task and says the
act cannot be undone, and its "Delete for ever" writes
`DELETE /api/v1/trash/tasks/:id` with the CSRF header, after which the row is
gone from Trash and the task answers 404; and given the same for a trashed
folder, then the address is `DELETE /api/v1/trash/folders/:id`; and given
"Empty trash", then its confirmation counts the rows it would remove and
"Keep it" removes none.

**AC-262's last arm asserts that the control exists; this one asserts what
it does.** RFC 0005 change control item 36 ruled "the control exists" and
"permanent delete destroys the objects", S28a built the two addresses (item
53), and the client's whole obligation is to reach the right one for the
row's kind through the confirm the prototype drew, "the only act in Dana
that cannot" be undone. Reading the wire is what tells a permanent delete
from a second soft delete: both would empty the row from the page, and only
one of them answers 404 on the task afterwards.

**The Empty trash arm stops at "Keep it".** The leg's files share one Trash
per person, and emptying it under a case in another file that has just
deleted its fixture would fail that case for a reason it could not name. The
confirm's count and its refusal are what this arm can assert without
touching another file's rows; the address it would reach is the one the
row arm reads.

Spec: 7.13 as amended (RFC 0005 change control items 36, 38 and 53), 9.11,
11.6 (the CSRF header on every mutation), 10.2.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  deleteTask,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const DELETE_CONTROL = /Delete (for ever|forever|permanently)/i

function trashRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title }).first()
}

test.describe('AC-285: the permanent delete, from the row', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
  })

  test('AC-285: a task leaves through DELETE /trash/tasks/:id', async ({ page }) => {
    const home = await createFolder(page, caseTitle('ac-285 home'))
    const title = caseTitle('ac-285 task')
    const task = await createTask(page, { title, folder_id: home.id })
    await deleteTask(page, task.id)

    await page.goto(routesV2.trash)
    const wire = watchWire(page)
    const row = trashRow(page, title)
    await expect(row).toBeVisible()
    await row.hover()
    await clickControl(
      row.getByRole('button', { name: DELETE_CONTROL }),
      'spec 7.13 as amended (RFC 0005 change control item 36): Trash offers the folder ' +
        'owner a permanent delete on the row, beside Restore',
    )

    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: new RegExp(`Delete .${title}. for ever`) }),
      "the prototype's confirm names the thing, because this is the one act with no way back",
    ).toBeVisible()
    await expect(
      dialog.getByText(/cannot be undone/),
      'the confirm says so in words: "This cannot be undone, and it is the only act in ' +
        'Dana that cannot"',
    ).toBeVisible()
    await clickControl(
      dialog.getByRole('button', { name: 'Delete for ever', exact: true }),
      "the prototype's own control name, item 36's ruling for the prototype",
    )

    await expect(
      row,
      'spec 7.13: the row is destroyed now, "exactly as the 11.7 purge would at thirty days"',
    ).toHaveCount(0)
    const purge = wire
      .mutations()
      .filter((call) => call.method === 'DELETE' && call.url.includes('/api/v1/trash/'))
    expect(
      purge.map((call) => new URL(call.url).pathname),
      'spec 7.13 as amended: a task goes to DELETE /api/v1/trash/tasks/:id, not to 7.6\'s ' +
        'soft delete a second time',
    ).toEqual([`/api/v1/trash/tasks/${task.id}`])
    expect(purge[0]?.csrf, 'spec 11.6: every mutation carries the CSRF header').not.toBeNull()

    const gone = await page.request.get(`/api/v1/tasks/${task.id}`)
    expect(
      gone.status(),
      'spec 7.13 and 10.2: a destroyed task is nobody\'s to read, and "no restore can bring ' +
        'it back" (AC-274)',
    ).toBe(404)

    await deleteFolder(page, home.id)
  })

  test('AC-285: a folder leaves through DELETE /trash/folders/:id', async ({ page }) => {
    const name = caseTitle('ac-285 folder')
    const folder = await createFolder(page, name)
    await deleteFolder(page, folder.id)

    await page.goto(routesV2.trash)
    const wire = watchWire(page)
    const row = trashRow(page, name)
    await expect(row).toBeVisible()
    await row.hover()
    await clickControl(row.getByRole('button', { name: DELETE_CONTROL }), 'as for a task')
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: 'Delete for ever', exact: true }),
      'the same confirm for a folder',
    )

    await expect(row, 'spec 7.13: the folder and everything under it is gone').toHaveCount(0)
    expect(
      wire
        .mutations()
        .filter((call) => call.method === 'DELETE')
        .map((call) => new URL(call.url).pathname),
      'spec 7.13 as amended: a folder goes to DELETE /api/v1/trash/folders/:id',
    ).toEqual([`/api/v1/trash/folders/${folder.id}`])
    expect(
      (await page.request.get(`/api/v1/folders/${folder.id}`)).status(),
      'spec 7.13 and 10.2: a destroyed folder answers 404 (AC-275)',
    ).toBe(404)
  })

  test('AC-285: "Empty trash" counts what it would remove and "Keep it" keeps it', async ({
    page,
  }) => {
    const name = caseTitle('ac-285 kept')
    const folder = await createFolder(page, name)
    await deleteFolder(page, folder.id)

    await page.goto(routesV2.trash)
    const wire = watchWire(page)
    await expect(trashRow(page, name)).toBeVisible()
    await clickControl(
      page.getByRole('button', { name: 'Empty trash', exact: true }),
      "the prototype's page-level act, drawn while the viewer owns anything here",
    )
    const dialog = page.getByRole('dialog')
    await expect(
      dialog.getByRole('heading', { name: 'Empty the trash?' }),
      "the prototype's own question",
    ).toBeVisible()
    await expect(
      dialog.getByText(/^[1-9]\d* items? will be removed\. This cannot be undone\.$/),
      'the confirm counts the rows the viewer may destroy, and says the act is final',
    ).toBeVisible()
    await clickControl(
      dialog.getByRole('button', { name: 'Keep it', exact: true }),
      "the prototype's refusal, which is the way most presses of a destructive control end",
    )

    await expect(trashRow(page, name), 'nothing left').toBeVisible()
    expect(
      wire.mutations().filter((call) => call.method === 'DELETE'),
      'nothing was written',
    ).toEqual([])
  })
})

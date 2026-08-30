/*
AC-284: given a shared folder the viewer is a member of and does not own,
then the folder's menu offers "Leave folder…" and no "Delete folder…", and
pressing it tells them they lose access rather than that the folder is
destroyed; and given a task of that folder in Trash, then the viewer's Trash
row offers Restore and no permanent delete, the act being the owner's.

**The first half is item 38's fourth rule with item 38's own recommendation
kept.** "A non-owner deleting a folder is told what it means: that they will
no longer be a member and will lose access." The recommendation raised
against relabelling it "Delete" stands, ruled by delegation at RFC 0005
change control item 56: the label stays "Leave folder…" (AC-183 and AC-246
assert it), and the confirm carries his sentence about losing access, which
9.6's own copy already did. So this half asserts that the surface a
non-owner reaches is the leave and that the sentence says access, and that
no control on it says the folder is destroyed.

**The second half is item 53(b) on the client.** The server answers a
non-owner member 403 because "they can see the row in Trash and hiding the
refusal would tell them something untrue"; the client's half is not to draw a
control it knows will be refused. 7.13's read carries `is_owner` for that,
and the criterion reads the absence beside a present Restore, so a client
that hid the whole row would fail the Restore assertion rather than pass by
hiding too much.

Spec: 5.3 and 5.4 (a member's leave), 9.6 (the confirm's sentence), 9.1's
names table ("Leave folder…"), 7.13 as amended (the owner's permanent
delete), 9.11, and RFC 0005 change control items 38, 53 and 56.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  copy,
  createFolder,
  createTask,
  csrfToken,
  deleteTask,
  expectOneTextRun,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  folderId: string
  folderName: string
  taskId: string
  taskTitle: string
}

/** The owner builds a shared folder with the seeded second person in it and
 * one task already in Trash; the case then signs in as that second person. */
async function buildAsOwner(page: Page): Promise<Fixture> {
  const folderName = caseTitle('ac-284 shared')
  const folder = await createFolder(page, folderName)
  const csrf = await csrfToken(page.context())
  const membership = await page.request.post(`/api/v1/folders/${folder.id}/members`, {
    data: { user_id: seedIds.imran },
    headers: { 'X-CSRF-Token': csrf },
  })
  expect(
    membership.status(),
    `POST /folders/:id/members answered ${membership.status()}: ${await membership.text()}`,
  ).toBe(201)
  const taskTitle = caseTitle('ac-284 trashed')
  const task = await createTask(page, { title: taskTitle, folder_id: folder.id })
  await deleteTask(page, task.id)
  return { folderId: folder.id, folderName, taskId: task.id, taskTitle }
}

test.describe('AC-284: a member who is not the owner', () => {
  let fixture: Fixture

  test.beforeEach(async ({ browser, page }) => {
    const owner = await browser.newContext()
    const ownerPage = await owner.newPage()
    await signIn(ownerPage, seedSubs.hassan)
    await ownerPage.goto(routesV2.desk)
    fixture = await buildAsOwner(ownerPage)
    await owner.close()

    await signIn(page, seedSubs.imran)
  })

  test('AC-284: the exit is a leave, and it says access', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.folderId))
    await clickControl(
      page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
      "spec 9.1: the active tab's controls include the object's overflow menu",
    )
    await expect(
      page.getByRole('menuitem', { name: /^Delete folder/ }),
      'RFC 0005 change control item 38: "a non-owner never deletes the folder at all"; 5.4 ' +
        'gives the delete to the owner and the surface offers nobody else a control that ' +
        'would be refused',
    ).toHaveCount(0)
    await clickControl(
      page.getByRole('menuitem', { name: 'Leave folder…', exact: true }),
      'item 38\'s recommendation, taken by delegation at item 56: the label stays "Leave ' +
        'folder…", so nobody believes they destroyed a folder holding other people\'s work',
    )

    await expectOneTextRun(
      page,
      copy.leaveFolder(fixture.folderName),
      'item 38: "a non-owner deleting a folder is told what it means: that they will no ' +
        'longer be a member and will lose access", which is 9.6\'s own sentence',
    )
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Cancel, and this case keeps the membership so the ' +
        'Trash case below can read it',
    )
  })

  test('AC-284: their Trash row restores and does not destroy', async ({ page }) => {
    await page.goto(routesV2.trash)
    const row = page.getByRole('listitem').filter({ hasText: fixture.taskTitle }).first()
    await expect(
      row,
      'spec 7.13: Trash is scoped by access, so a member sees the row the owner deleted',
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: 'Restore', exact: true }),
      'spec 9.11: "anyone with access to the object may restore it"',
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: /Delete (for ever|forever|permanently)/i }),
      'spec 7.13 as amended (RFC 0005 change control items 38 and 53(b)): the permanent ' +
        'delete "is the folder owner\'s alone, for a task as for a folder", and the client ' +
        'does not draw a control the server would answer 403',
    ).toHaveCount(0)
  })
})

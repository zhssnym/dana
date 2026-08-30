/*
AC-294: given a task row, when its More actions menu's "Duplicate" is
pressed, then the task is copied with `POST /tasks/:id/duplicate`, a toast
says so, and the copy is on the page; and when "Make this a folder…" is
pressed, then one folder named after the task is created with
`POST /folders`, the task is moved into it with `PATCH /tasks/:id`, a toast
says so with an undo, and the row leaves the page it was on.

Authored at the loose-ends row under `11-adversarial-test.md`, beside RFC
0005 change control item 58 (A and B). Ledger L-007 recorded the make-folder
act as "declared and undrawn"; item 53(e) left the Duplicate handler to the
close. Both are `lib/task-acts.ts`'s now, performed from the row's own id the
way Copy link is, so this case reaches them through the menu 9.1 names and
reads the wire for the endpoints 9.3's sentence promises.

Spec: 9.3 (More actions: Duplicate, "Make this a folder…"), 7.16 (the task
duplicate), 7.4 and 7.6 (the folder and the move), 9.1 (the toast and undo).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  regionOf,
  routesV2,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** A row reveals its controls on hover; 9.1 names the overflow "More actions". */
async function openRowMenu(page: Page, row: Locator): Promise<void> {
  await row.hover()
  await clickControl(
    row.getByRole('button', { name: 'More actions', exact: true }),
    'spec 9.1: a task row carries the object\'s overflow menu',
  )
  await expect(page.getByRole('menuitem').first()).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-294: a row\'s Duplicate and "Make this a folder…" act over 7.16, 7.4 and 7.6', () => {
  test('AC-294: Duplicate copies the task through POST /tasks/:id/duplicate and says so', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-294 copies'))
    const title = caseTitle('AC-294 the original')
    const task = await createTask(page, { title, folder_id: folder.id })
    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, title)).toBeVisible()

    await openRowMenu(page, taskRow(page, title))
    const wire = watchWire(page)
    await clickControl(
      page.getByRole('menuitem', { name: 'Duplicate', exact: true }),
      'spec 9.3: Duplicate is in the task\'s More actions',
    )
    await waitForApiIdle(page, 'the copy has been written and read back')

    const copies = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.endsWith('/duplicate'))
    expect(copies, 'spec 7.16: one copy, at the task duplicate').toEqual([
      `POST /api/v1/tasks/${task.id}/duplicate`,
    ])
    await expect(
      page.getByRole('status').filter({ hasText: `Duplicated "${title}"` }),
      'spec 9.1: the undo bar says it happened and offers the inverse, a copy you cannot see ' +
        'being one you assume did not',
    ).toBeVisible()
    await expect(taskRow(page, `${title} (copy)`), 'the copy is on the page').toBeVisible()
  })

  test('AC-294: "Make this a folder…" makes one folder named after the task and moves it in', async ({
    page,
  }) => {
    const origin = await createFolder(page, caseTitle('AC-294 origin'))
    const title = caseTitle('AC-294 becomes a folder')
    const task = await createTask(page, { title, folder_id: origin.id })
    await page.goto(routesV2.folder(origin.id))
    await expect(taskRow(page, title)).toBeVisible()

    await openRowMenu(page, taskRow(page, title))
    const wire = watchWire(page)
    await clickControl(
      page.getByRole('menuitem', { name: 'Make this a folder…', exact: true }),
      'spec 9.3: "Make this a folder…" is in the task\'s More actions (ledger L-007)',
    )
    await waitForApiIdle(page, 'the folder and the move have been written')

    const mutations = wire.mutations().map((call) => `${call.method} ${new URL(call.url).pathname}`)
    expect(
      mutations.filter((call) => call === 'POST /api/v1/folders'),
      'spec 7.4: one folder, the way S23a\'s hold makes one',
    ).toHaveLength(1)
    expect(
      mutations.filter((call) => call === `PATCH /api/v1/tasks/${task.id}`),
      'spec 7.6: and the task moved into it',
    ).toHaveLength(1)

    const detail = await page.request.get(`/api/v1/tasks/${task.id}`)
    expect(detail.status()).toBe(200)
    const stored = ((await detail.json()) as { folder: { id: string; name: string } }).folder
    expect(stored.name, 'the folder is named after the task').toBe(title)
    expect(stored.id, 'and is a new one').not.toBe(origin.id)

    await expect(
      page.getByText(`Moved "${title}" to "${title}"`),
      'the toast says where the task went',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Undo', exact: true }),
      'spec 9.1: the act registers its inverse',
    ).toBeVisible()
    /* Scoped to the list: the sidebar now carries a folder of the same name,
       and the undo bar a line with the same title, neither of which is a row. */
    await expect(
      regionOf(page, 'All open tasks').getByRole('listitem').filter({ hasText: title }),
      'the row has left the origin',
    ).toHaveCount(0)
  })
})

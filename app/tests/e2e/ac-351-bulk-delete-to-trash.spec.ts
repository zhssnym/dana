/*
AC-351: the selection bar's Delete tells one truth and Undo puts all of it back.

The adversarial round of 2026-08-30 (taskrow F1) deleted three tasks from the
bar: the confirm said "This can't be undone", the toast then offered Undo,
Undo restored one of the three, and Trash held the other two. This criterion
reads the confirm's sentence and its two controls, then the undo bar naming
the batch, then the batch restored.

Spec: 7.6, 7.13 (Trash), 9.1 (the undo bar), 9.3 (the delete confirmation as
amended in the polish round).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  routesV2,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

async function pressAndHold(page: Page, row: Locator): Promise<void> {
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  expect(box, 'the row has a box to press').not.toBeNull()
  if (box === null) return
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.up()
}

async function tapRow(page: Page, row: Locator): Promise<void> {
  const box = await row.boundingBox()
  expect(box, 'the row has a box to tap').not.toBeNull()
  if (box === null) return
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

async function statusOf(page: Page, taskId: string): Promise<string> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(detail.status(), `GET /tasks/:id answered ${detail.status()}`).toBe(200)
  return ((await detail.json()) as { status: string }).status
}

test('AC-351: the confirm says Trash, its controls are Delete and Keep them, and Undo restores the batch', async ({
  page,
}) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-351 batch'))
  const first = caseTitle('AC-351 first')
  const second = caseTitle('AC-351 second')
  const a = await createTask(page, { title: first, folder_id: folder.id })
  const b = await createTask(page, { title: second, folder_id: folder.id })
  await page.goto(routesV2.folder(folder.id))
  await expect(taskRow(page, second)).toBeVisible()

  await pressAndHold(page, taskRow(page, first))
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible()
  await tapRow(page, taskRow(page, second))
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible()

  await clickControl(
    page.getByRole('button', { name: 'Delete', exact: true }).last(),
    "the bar's last control, after its divider, is the one that loses work",
  )
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(
    dialog.getByText('Move 2 tasks to Trash? They stay there for 30 days.', { exact: true }),
    'spec 9.3: the confirm names where the tasks go and for how long, which is the truth 7.13 made',
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Keep them', exact: true }),
    'declining is named by what it does',
  ).toBeVisible()
  await clickControl(
    dialog.getByRole('button', { name: 'Delete', exact: true }),
    'confirming is named by what it does',
  )
  await waitForApiIdle(page, 'both deletions have been written')
  await expect(taskRow(page, first)).toHaveCount(0)
  await expect(taskRow(page, second)).toHaveCount(0)

  await expect(
    page.getByText('Deleted 2 tasks', { exact: true }),
    'spec 9.1: one undo entry for the batch, naming its size',
  ).toBeVisible()
  await clickControl(page.getByRole('button', { name: 'Undo', exact: true }), 'one press puts all of it back')
  await waitForApiIdle(page, 'both restores have been written')
  expect(await statusOf(page, a.id), 'the first is back').toBe('pending')
  expect(await statusOf(page, b.id), 'and so is the second, which one Undo used to leave in Trash').toBe(
    'pending',
  )
  await expect(taskRow(page, first)).toBeVisible()
  await expect(taskRow(page, second)).toBeVisible()
})

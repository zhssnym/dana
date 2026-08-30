/*
AC-340: given Scheduled in calendar view, when an open task is dragged from
its day to another, then 7.6 hears a PATCH of its due date and the task now
reads that day; and the month opens with today's cell in view.

Authored 2026-08-30 at the polish round (places F6, F7): a calendar that
showed rows and would not let you move them read as broken rather than
read-only.

Spec: 9.5 (the calendar), 7.6 (PATCH due_date).
*/
import { expect, test } from '@playwright/test'

import {
  caseTitle,
  chooseView,
  createFolder,
  createTask,
  routesV2,
  seedDate,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-340: a row dragged to another day takes that date', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  const folder = await createFolder(page, caseTitle('AC-340 plants'))
  const title = caseTitle('Water the plants')
  const from = seedDate(1)
  const to = seedDate(2)
  const task = await createTask(page, { title, folder_id: folder.id, due_date: from })

  await page.goto(routesV2.scheduled)
  await chooseView(page, 'Calendar', 'spec 9.5: Scheduled offers the calendar')
  const grid = page.getByRole('grid', { name: 'Planned calendar' })
  await expect(grid).toBeVisible()
  await expect(
    grid.locator('[role="gridcell"][data-today="true"]'),
    'places F7: today is on the grid and in view on arrival',
  ).toBeInViewport()

  const row = grid.getByRole('button', { name: title, exact: true })
  await expect(row, 'the task sits on its day').toBeVisible()
  const target = grid.locator(`[role="gridcell"][data-date="${to}"]`)
  await expect(target, 'the day after is on the same grid').toBeVisible()
  await row.dragTo(target)
  await waitForApiIdle(page, 'PATCH /tasks/:id has answered')

  const read = await page.request.get(`/api/v1/tasks/${task.id}`)
  expect(
    ((await read.json()) as { due_date: string | null }).due_date,
    'places F6: the drop is 7.6\'s PATCH of the due date',
  ).toBe(to)
  await expect(target.getByRole('button', { name: title, exact: true }), 'and the row now stands on that day').toBeVisible()
})

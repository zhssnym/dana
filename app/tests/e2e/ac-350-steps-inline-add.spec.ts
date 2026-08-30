/*
AC-350: "Add a step" opens an empty field and writes only what is typed.

The adversarial round of 2026-08-30 (taskcard F1) pressed "Add a step",
typed, and pressed Enter: a step called "New step" had already been written
on the press, the typing went nowhere because focus stayed on the button,
and every Enter pressed the button again, thirteen blank steps in one try.
The criterion reads the surface and the wire together: the press opens a
focused, empty field and writes nothing; Enter on a filled field writes that
title and opens the next; a rename is 7.7's PATCH on the step's own id and
never a delete and a create.

Spec: 7.7, 9.3 (the steps block), AC-296 (the tick and the removal).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

async function stepsOf(page: import('@playwright/test').Page, taskId: string) {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(detail.status(), `GET /tasks/:id answered ${detail.status()}`).toBe(200)
  return ((await detail.json()) as { steps: { id: string; title: string }[] }).steps
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test('AC-350: the press opens an empty field, Enter writes and chains, a rename is a PATCH', async ({
  page,
}) => {
  const title = caseTitle('AC-350 steps')
  const task = await createTask(page, { title, folder_id: seedIds.groceries })
  await page.goto(routesV2.folder(seedIds.groceries))
  await clickControl(page.getByText(title).first(), 'spec 9.4: a click on the row opens the task')
  const surface = taskSurface(page)
  await expect(surface).toBeVisible()

  const wire = watchWire(page)
  await clickControl(
    surface.getByRole('button', { name: 'Add a step', exact: true }),
    'spec 9.3: the empty block is the control that fills it',
  )
  const field = surface.getByRole('textbox', { name: 'New step', exact: true })
  await expect(field, 'the press opens a field rather than writing a step').toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('')
  await waitForApiIdle(page, 'nothing is written by the press alone')
  expect(
    wire.mutations().filter((call) => call.url.endsWith('/steps')),
    'spec 7.7: no step is posted until a title exists',
  ).toHaveLength(0)

  await field.fill('Buy boxes')
  await field.press('Enter')
  await expect(field, 'Enter on a filled field opens the next').toBeVisible()
  await expect(field).toHaveValue('')
  await field.fill('Tape')
  await field.press('Enter')
  await field.press('Escape')
  await expect(field).toHaveCount(0)
  await waitForApiIdle(page, 'both steps have been written')

  const posts = wire.mutations().filter((call) => call.method === 'POST' && call.url.endsWith('/steps'))
  expect(posts, 'spec 7.7: one POST per typed step').toHaveLength(2)
  const written = await stepsOf(page, task.id)
  expect(written.map((step) => step.title)).toEqual(['Buy boxes', 'Tape'])
  await expect(surface.getByText('New step', { exact: true })).toHaveCount(0)

  await expect(surface.getByRole('button', { name: 'Buy boxes', exact: true })).toBeVisible()
  await clickControl(
    surface.getByRole('button', { name: 'Buy boxes', exact: true }),
    'the step title is the rename control (DES-095)',
  )
  const name = surface.getByRole('textbox', { name: 'Step name', exact: true })
  await name.fill('Buy big boxes')
  await name.press('Enter')
  await waitForApiIdle(page, 'the rename has been written')
  const after = wire
    .mutations()
    .filter((call) => call.url.includes('/api/v1/steps/'))
    .map((call) => call.method)
  expect(after, 'spec 7.7: a rename is the step\'s own PATCH, never a delete and a create').toEqual([
    'PATCH',
  ])
  const renamed = await stepsOf(page, task.id)
  expect(renamed.map((step) => step.title)).toEqual(['Buy big boxes', 'Tape'])
  expect(renamed[0]?.id, 'the same step, renamed').toBe(written[0]?.id)
})

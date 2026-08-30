/*
AC-296: given a task with steps open in its surface, when a step's box is
ticked, then `PATCH /steps/:id` carries `done: true` and a fresh read of the
task reports the step done; and when a step is removed, then `DELETE
/steps/:id` is written and the read no longer carries it.

Authored at the loose-ends row under `11-adversarial-test.md`, beside RFC
0005 change control item 58 (I). `lib/task-writer.tsx` had said since S22
that steps "need a diff against the task's current list rather than a field
copy, which is the card's own act and lands with the card"; the card landed
at S23 and nothing wrote them, so a step ticked in an open card held until
the next refetch and never after. `lib/task-acts.ts`'s `writeSteps` is that
diff, and this case reads the wire for it, the way AC-179 reads the card's
completion control.

Spec: 7.7 (the step routes), 9.3 (the card's Steps block), 4.6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  csrfToken,
  routesV2,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface StoredStep {
  id: string
  title: string
  done: boolean
}

async function addStep(page: Page, taskId: string, title: string): Promise<StoredStep> {
  const token = await csrfToken(page.context())
  const response = await page.request.post(`/api/v1/tasks/${taskId}/steps`, {
    headers: { 'X-CSRF-Token': token },
    data: { title },
  })
  expect(response.status(), `POST /tasks/${taskId}/steps answered ${response.status()}`).toBe(201)
  const detail = (await response.json()) as { steps: StoredStep[] }
  const made = detail.steps.find((step) => step.title === title)
  expect(made, 'the created step rides in the steps array (spec 7.7)').toBeDefined()
  return made as StoredStep
}

async function storedSteps(page: Page, taskId: string): Promise<StoredStep[]> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(detail.status()).toBe(200)
  return ((await detail.json()) as { steps: StoredStep[] }).steps
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-296: a step ticked or removed in the card is written through 7.7', () => {
  test('AC-296: the tick is PATCH /steps/:id and the removal is DELETE /steps/:id', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-296 steps'))
    const title = caseTitle('AC-296 a task with steps')
    const task = await createTask(page, { title, folder_id: folder.id })
    const ticked = await addStep(page, task.id, caseTitle('AC-296 tick me'))
    const removed = await addStep(page, task.id, caseTitle('AC-296 remove me'))

    await page.goto(routesV2.folder(folder.id))
    await clickControl(page.getByText(title), 'spec 9.4: a click on the row opens the task')
    await expect(taskSurface(page)).toBeVisible()
    await expect(
      taskSurface(page).getByRole('button', { name: ticked.title, exact: true }),
      'spec 9.3: the Steps block draws the stored steps',
    ).toBeVisible()

    const wire = watchWire(page)
    /* The steps draw in 7.7's position order and the ticked one was added
       first, so its box is the block's first; a step row carries no list
       role of its own, only its three controls. */
    await clickControl(
      taskSurface(page).getByRole('checkbox', { name: 'Mark step done', exact: true }).first(),
      'the step\'s own box',
    )
    await waitForApiIdle(page, 'the tick has been written and read back')
    const patches = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.startsWith('PATCH /api/v1/steps/'))
    expect(patches, 'spec 7.7: the tick is the step\'s own PATCH').toEqual([
      `PATCH /api/v1/steps/${ticked.id}`,
    ])
    const afterTick = await storedSteps(page, task.id)
    expect(
      afterTick.find((step) => step.id === ticked.id)?.done,
      'read through 7.6 rather than off the card: the box was written',
    ).toBe(true)

    await taskSurface(page).getByRole('button', { name: removed.title, exact: true }).hover()
    await clickControl(
      taskSurface(page).getByRole('button', { name: `Remove ${removed.title}`, exact: true }),
      'the step\'s own remove control',
    )
    await waitForApiIdle(page, 'the removal has been written and read back')
    const deletes = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.startsWith('DELETE /api/v1/steps/'))
    expect(deletes, 'spec 7.7: the removal is the step\'s own DELETE').toEqual([
      `DELETE /api/v1/steps/${removed.id}`,
    ])
    const afterRemove = await storedSteps(page, task.id)
    expect(afterRemove.map((step) => step.id), 'one step stays, ticked').toEqual([ticked.id])
    expect(afterRemove[0]?.done).toBe(true)
  })
})

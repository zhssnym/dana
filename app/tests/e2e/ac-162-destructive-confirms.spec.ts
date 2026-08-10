/*
AC-162 (proposed): given each destructive action section 9 puts a confirm on,
then the confirm carries that section's copy and declining it performs
nothing.

**The number is provisional**, authored on this branch with its test for the
mid-package change control, from AC-154 onward because P7 is concurrently
proposing AC-144 to AC-153 and merges first. See `ac-154-quick-add-row.spec.ts`.

Section 9 writes four confirmations word for word and section 12 asserts
none of them. They are not decoration. Three of the four describe an effect
the person cannot see from where they are standing: abandoning removes a
task from My Day and leaves it everywhere else, deleting a folder deletes
tasks for every member and not only for the owner, and un-completing a
repeat takes the next occurrence with any edits already made to it. The
fourth, deleting a task, says the one thing about it that matters.

**Declining is asserted beside every copy.** A confirm that acts anyway is
the failure worth catching, and it is invisible to a test that only reads the
dialog: the string was correct, the person said no, and the row is gone. The
folder case asserts the folder afterwards through 7.4 rather than off the
page, because a client that deleted it and re-rendered from a stale cache
looks identical to one that did not.

**The folder confirm is asserted with counts this file made.** 9.6's copy
carries three numbers, and its example (28 open, 12 completed, 3 abandoned)
is a shape rather than a value, so the fixture is built to three counts that
are all different from each other and none of them one: a client rendering
the same number three times, or rendering the 8.11 pending count where the
copy asks for open and abandoned separately, passes any assertion that only
looks for digits.

Spec: 9.3 (the delete confirm), 9.4 (the abandon confirm), 9.5 (the
G-SERIES un-complete confirm), 9.6 (the folder delete confirm and its
counts), 5.1, 8.5, 8.8, 7.4.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  copy,
  createTask,
  csrfToken,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC' })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const DOOMED = 'ac-162 folder with counted tasks'
/** Three different numbers, none of them one. */
const OPEN = 3
const COMPLETED = 2
const ABANDONED = 4

async function statusOf(page: Page, id: string): Promise<string> {
  const response = await page.request.get(`/api/v1/tasks/${id}`)
  expect(
    response.status(),
    `GET /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return ((await response.json()) as { status: string }).status
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-162 (proposed): the four confirms of section 9', () => {
  test('AC-162: abandoning from My Day carries 9.4\'s copy and declining does nothing', async ({
    page,
  }) => {
    const title = 'ac-162 abandon me from my day'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })

    await page.goto(routes.myDay)
    await taskRow(page, title).getByRole('button', { name: /more|overflow|options/i }).click()
    await page.getByRole('menuitem', { name: /abandon/i }).click()

    await expect(
      page.getByText(copy.abandonConfirm),
      'spec 9.4: abandon from here uses this copy, which is the only thing that tells the ' +
        'person the task stays everywhere else. Copy in section 9 is normative',
    ).toBeVisible()

    await page.getByRole('button', { name: /^(cancel|keep|no)$/i }).click()
    expect(
      await statusOf(page, task.id),
      'spec 5.1: a declined confirm runs no transition. A dialog that acts anyway shows the ' +
        'right words and takes the task, which is invisible to a test that only reads the ' +
        'dialog',
    ).toBe('pending')
  })

  test('AC-162: deleting a task carries 9.3\'s copy and declining leaves it', async ({
    page,
  }) => {
    const title = 'ac-162 delete me from the form'
    const task = await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routes.tasks)
    await page.getByText(title).click()
    // 9.3: delete lives in the form's overflow menu.
    await page.getByRole('button', { name: /more|overflow|options/i }).last().click()
    await page.getByRole('menuitem', { name: /delete/i }).click()

    await expect(
      page.getByText(copy.deleteTaskConfirm),
      'spec 9.3: the delete confirm is "Delete this task? This can\'t be undone.", and 5.1 ' +
        'makes that literally true, the row and its steps, entries and reminder going together',
    ).toBeVisible()

    await page.getByRole('button', { name: /^(cancel|keep|no)$/i }).click()
    expect(
      await statusOf(page, task.id),
      'spec 5.1: the task is still there after a declined delete',
    ).toBe('pending')
  })

  test('AC-162: the folder confirm names the folder and its three counts', async ({ page }) => {
    const token = await csrfToken(page.context())
    const created = await page.request.post('/api/v1/folders', {
      data: { name: DOOMED },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      created.status(),
      `POST /folders answered ${created.status()}: ${await created.text()}`,
    ).toBe(201)
    const folder = (await created.json()) as { id: string }

    for (let i = 0; i < OPEN; i += 1) {
      await createTask(page, { title: `ac-162 open ${i}`, folder_id: folder.id })
    }
    for (let i = 0; i < COMPLETED; i += 1) {
      const task = await createTask(page, {
        title: `ac-162 completed ${i}`,
        folder_id: folder.id,
      })
      await transition(page, task.id, 'complete', 'UTC')
    }
    for (let i = 0; i < ABANDONED; i += 1) {
      const task = await createTask(page, {
        title: `ac-162 abandoned ${i}`,
        folder_id: folder.id,
      })
      await transition(page, task.id, 'abandon', 'UTC')
    }

    await page.goto(routes.folder(folder.id))
    await page.getByRole('button', { name: /more|overflow|options/i }).first().click()
    await page.getByRole('menuitem', { name: /delete/i }).click()

    await expect(
      page.getByText(
        `Delete ${DOOMED}? This permanently deletes ${OPEN} open, ${COMPLETED} completed, ` +
          `and ${ABANDONED} abandoned tasks for every member.`,
      ),
      'spec 9.6: the folder delete confirm lists counts, and it is the only place a person is ' +
        'told the deletion reaches every member rather than only their own view. The three ' +
        'counts differ here and none is one, so a client rendering the same number three ' +
        'times, or rendering 8.11\'s pending count where the copy asks for open and abandoned ' +
        'separately, cannot pass by looking numeric',
    ).toBeVisible()

    await page.getByRole('button', { name: /^(cancel|keep|no)$/i }).click()
    const after = await page.request.get(`/api/v1/folders/${folder.id}`)
    expect(
      after.status(),
      'spec 8.8: a declined confirm runs no cascade, and the folder is asked for through 7.4 ' +
        'rather than looked for on a page that may be rendering a stale cache',
    ).toBe(200)
  })

  test('AC-162: un-completing a repeat warns about the next occurrence', async ({ page }) => {
    const title = 'ac-162 repeating and completed'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      recurrence_rule: 'FREQ=DAILY',
    })
    // 5.1: completing a rule-carrying row generates the successor in the same
    // transaction, which is the occurrence the confirm is about.
    await transition(page, task.id, 'complete', 'UTC')

    await page.goto(routes.done)
    await taskRow(page, title).getByRole('button', { name: 'Mark as not done' }).click()

    await expect(
      page.getByText(copy.uncompleteSeriesConfirm),
      'spec 9.5: on the G-SERIES successor branch, "Mark as not done" first confirms this. ' +
        '5.1 deletes the successor in the same transaction and the parenthesis is the part ' +
        'the person cannot see: any edits already made to the next occurrence go with it',
    ).toBeVisible()

    await page.getByRole('button', { name: /^(cancel|keep|no)$/i }).click()
    expect(
      await statusOf(page, task.id),
      'spec 5.1: the declined un-complete left the completed row completed, so the successor ' +
        'it would have deleted is still pending',
    ).toBe('completed')
  })
})

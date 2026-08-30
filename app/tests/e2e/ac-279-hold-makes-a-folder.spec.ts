/*
AC-279: given a list of tasks, when one row is carried onto another and held
still there for the dwell, then the list proposes a folder of the two and,
on release, opens its naming panel; and when the panel is confirmed with a
name, then exactly one `POST /folders` is written with that name, both tasks
are moved into it with `PATCH /tasks/:id`, and no other endpoint is called.

Authored at S23a by `11-adversarial-test.md`. It is RFC 0005 change control
item 44's second part of B4, "two or more tasks held together become a
folder", priced there at "no backend at all: `POST /folders { name }` exists
and `PATCH /tasks/:id { folder_id }` already specifies the move including the
INV-5 assignee rules, so the gesture is a client composition of two existing
endpoints". RFC 0004's S23a acceptance line is the sentence this case reads:
"the hold creates one folder and moves both tasks in one act".

**The number is 275**, after AC-278, S23a's drag.

**The composition is asserted on the wire, by count and by body.** One folder
and two moves is the whole of the act, so the case reads every mutation the
page makes between the confirm and the API going quiet and expects those
three and nothing else: a client that made the folder twice, or moved one
task and forgot the other, or reached for an endpoint section 7 does not
have, fails here rather than looking right on the page.

**The dwell is a real stillness.** `use-sortable-list.ts` arms the proposal
only once the pointer has rested on a row for `DWELL_MS` and re-reads that
on the next move, so the case travels onto the row, waits past the dwell,
nudges within the stillness band, and only then releases. The words the
carried row wears while armed are read before the release, being the
proposal and not the outcome (AC-228's reason).

Spec: 7.4 (POST /folders), 7.6 (PATCH /tasks/:id, folder_id), 9.1 (the
region table), RFC 0005 change control item 44 (B4), DES-103.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  fillControl,
  routesV2,
  signIn,
  seedSubs,
  taskRow,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The dwell the engine arms at, restated rather than imported. */
const DWELL_MS = 1500

/**
 * Carry a row onto another and rest there past the dwell, leaving the pointer
 * down so the caller can read the proposal before releasing.
 */
async function carryOntoAndHold(page: Page, from: Locator, onto: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded()
  const start = await from.boundingBox()
  const target = await onto.boundingBox()
  expect(start, 'the row being carried has a box to grab').not.toBeNull()
  expect(target, 'the row it is carried onto has a box').not.toBeNull()
  if (start === null || target === null) return
  const x = start.x + start.width / 2
  const fromY = start.y + start.height / 2
  const toY = target.y + target.height / 2
  await page.mouse.move(x, fromY)
  await page.mouse.down()
  const steps = 10
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x, fromY + ((toY - fromY) * step) / steps)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(DWELL_MS + 300)
  /* Within the stillness band, so the engine re-reads the rest and arms. */
  await page.mouse.move(x + 1, toY)
  await page.mouse.move(x, toY)
}

async function storedFolderOf(page: Page, taskId: string): Promise<{ id: string; name: string }> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(detail.status(), `GET /tasks/:id answered ${detail.status()}`).toBe(200)
  return ((await detail.json()) as { folder: { id: string; name: string } }).folder
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-279: holding two tasks together makes a folder of them', () => {
  test('AC-279: the hold proposes, the panel names, and one folder plus two moves is the act', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-279 origin'))
    const venue = caseTitle('AC-279 book the venue')
    const deposit = caseTitle('AC-279 pay the venue deposit')
    const a = await createTask(page, { title: venue, folder_id: folder.id })
    const b = await createTask(page, { title: deposit, folder_id: folder.id })
    const name = caseTitle('AC-279 wedding')

    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, deposit)).toBeVisible()

    await carryOntoAndHold(page, taskRow(page, deposit), taskRow(page, venue))
    await expect(
      page.getByText('Release to make a folder'),
      'DES-103: once the dwell has run the carried row says what a release would do, ' +
        'read while the pointer is still down',
    ).toBeVisible()
    await page.mouse.up()

    const field = page.getByRole('textbox', { name: 'Folder name', exact: true })
    await expect(
      field,
      'DES-103: nothing is destroyed on release; the panel opens with a name to accept or replace',
    ).toBeVisible()

    const wire = watchWire(page)
    await fillControl(field, name, 'the panel takes the folder\'s name')
    await clickControl(
      page.getByRole('button', { name: 'Create folder', exact: true }),
      'the panel\'s primary action makes the folder and moves the tasks into it',
    )
    await waitForApiIdle(page, 'the folder and both moves have been written')

    const mutations = wire.mutations().map((call) => `${call.method} ${new URL(call.url).pathname}`)
    expect(
      mutations.filter((call) => call.startsWith('POST /api/v1/folders')),
      'RFC 0004 S23a: the hold creates one folder',
    ).toHaveLength(1)
    expect(
      mutations.filter((call) => call.startsWith('PATCH /api/v1/tasks/')).sort(),
      'RFC 0004 S23a: and moves both tasks, each through 7.6',
    ).toEqual([`PATCH /api/v1/tasks/${a.id}`, `PATCH /api/v1/tasks/${b.id}`].sort())
    expect(
      mutations.filter(
        (call) => !call.startsWith('POST /api/v1/folders') && !call.startsWith('PATCH /api/v1/tasks/'),
      ),
      'RFC 0005 item 44: the gesture is a composition of two existing endpoints and adds none',
    ).toEqual([])

    const first = await storedFolderOf(page, a.id)
    const second = await storedFolderOf(page, b.id)
    expect(first.name, 'the folder carries the name the panel was given').toBe(name)
    expect(second.id, 'both tasks are in the one folder').toBe(first.id)
    await expect(
      taskRow(page, deposit),
      'the moved rows have left the folder they were held together in',
    ).toHaveCount(0)
  })
})

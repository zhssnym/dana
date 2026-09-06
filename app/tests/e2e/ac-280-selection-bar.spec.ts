/*
AC-280: given a list of tasks, when a row is pressed and held without moving,
then the list enters selection with that row selected and its bar says how
many are selected, and a tap on another row adds it; when the bar's "Mark
complete" is pressed, then every selected task is completed through 7.6's
transition and the bar leaves; when "Move to a folder" names a folder, then
every selected task is moved with `PATCH /tasks/:id`; and when "Delete" is
pressed, then 9.3's confirmation is asked once, in the plural, and each task
is deleted through 7.6 on Continue; and when "Duplicate" is pressed, then
every selected task is copied with `POST /tasks/:id/duplicate` and the bar
leaves.

Authored at S23a by `11-adversarial-test.md`. It is RFC 0005 change control
item 44's "selection and the bulk bar are client state over endpoints that
exist", and RFC 0004's S23a acceptance line: "the bulk bar operates over
existing endpoints and adds none".

**The number is 276**, after AC-279, S23a's hold.

**Every act is asserted on the wire, by endpoint and by count.** A bar that
completed one of two, or moved through a route section 7 does not have,
looks right on the page and is wrong; the case reads the mutations the page
made and expects one call per selected task at the endpoint the row's own
act uses. That is what "over endpoints that exist" means when measured.

**The press is a real stillness.** Selection arms 400 ms into a press that
has not travelled, and a press that has is a drag, so the case presses,
waits, and releases without moving. The release is also the moment the
engine would open the row it took for a tap; the case asserts no dialog
opened, because a hold that selected and opened at once would be two answers
to one gesture.

**Duplicate is asserted present since the loose-ends row.** This case used
to assert it absent, `tasks/task-acts.ts` recording that frozen section 7 had
no task duplicate (section 13 item 46); S28a gave it `POST /tasks/:id/duplicate`
and RFC 0005 change control item 58 (A) wired the bar, which the prototype's
bar has always offered.

Spec: 7.6 (transition, PATCH, DELETE), 9.3 (the delete confirmation), 9.1
(the region table), RFC 0005 change control item 44.
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
  signIn,
  seedSubs,
  taskRow,
  TEST_TIMEOUT_MS,
  watchCommit,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Press a row and hold still past the 400 ms that arms selection. */
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

async function folderOf(page: Page, taskId: string): Promise<string> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(detail.status(), `GET /tasks/:id answered ${detail.status()}`).toBe(200)
  return ((await detail.json()) as { folder: { id: string } }).folder.id
}

function selectionBar(page: Page): Locator {
  return page.getByRole('button', { name: 'Leave selection', exact: true })
}

async function selectTwo(page: Page, first: string, second: string): Promise<void> {
  await pressAndHold(page, taskRow(page, first))
  await expect(
    page.getByText('1 selected', { exact: true }),
    'DES-112: a still press of 400 ms selects the row it was on and the bar counts it',
  ).toBeVisible()
  await expect(
    page.getByRole('dialog'),
    'the hold that selected did not also open the task: one gesture, one answer',
  ).toHaveCount(0)
  await tapRow(page, taskRow(page, second))
  await expect(
    page.getByText('2 selected', { exact: true }),
    'DES-112: a tap while selecting adds the row rather than opening it',
  ).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-280: selection and the bar act on every selected task over existing endpoints', () => {
  test('AC-280: press-and-hold selects, a tap adds, and Mark complete completes each', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-280 complete'))
    const first = caseTitle('AC-280 first to finish')
    const second = caseTitle('AC-280 second to finish')
    const a = await createTask(page, { title: first, folder_id: folder.id })
    const b = await createTask(page, { title: second, folder_id: folder.id })
    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, second)).toBeVisible()

    await selectTwo(page, first, second)
    await expect(
      page.getByRole('button', { name: 'Duplicate', exact: true }),
      'item 58 (A): the bar offers the prototype\'s Duplicate now that 7.16 has a task duplicate',
    ).toBeVisible()

    const wire = watchWire(page)
    /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
       soon as nothing is in flight, and that is also true in the window
       between the press and the request the press causes, so the wire read
       below could find it empty and fail saying the client sent nothing --
       which is the defect the assertion is for. `watchCommit` waits for the
       page to have sent something before it waits for quiet. */
    const completed = watchCommit(page)
    await clickControl(
      page.getByRole('button', { name: 'Mark complete', exact: true }),
      'the bar\'s first control completes everything selected',
    )
    await completed.settled('both completions reach the server before the wire and the rows are read')
    await expect(selectionBar(page), 'the bar leaves once its act is done').toHaveCount(0)

    const completes = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.endsWith('/complete'))
      .sort()
    expect(
      completes,
      'spec 7.6: one transition per selected task, at the endpoint the row\'s own act uses',
    ).toEqual([`POST /api/v1/tasks/${a.id}/complete`, `POST /api/v1/tasks/${b.id}/complete`].sort())
    expect(await statusOf(page, a.id)).toBe('completed')
    expect(await statusOf(page, b.id)).toBe('completed')
  })

  test('AC-280: Move to a folder moves each selected task through PATCH /tasks/:id', async ({
    page,
  }) => {
    const origin = await createFolder(page, caseTitle('AC-280 origin'))
    const destinationName = caseTitle('AC-280 destination')
    const destination = await createFolder(page, destinationName)
    const first = caseTitle('AC-280 first to move')
    const second = caseTitle('AC-280 second to move')
    const a = await createTask(page, { title: first, folder_id: origin.id })
    const b = await createTask(page, { title: second, folder_id: origin.id })
    await page.goto(routesV2.folder(origin.id))
    await expect(taskRow(page, second)).toBeVisible()

    await selectTwo(page, first, second)
    const wire = watchWire(page)
    await clickControl(
      page.getByRole('button', { name: 'Move to a folder', exact: true }),
      'the bar\'s move control opens the folder library',
    )
    /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
       soon as nothing is in flight, and that is also true in the window
       between the press and the request the press causes, so the wire read
       below could find it empty and fail saying the client sent nothing --
       which is the defect the assertion is for. `watchCommit` waits for the
       page to have sent something before it waits for quiet. */
    const moved = watchCommit(page)
    await clickControl(
      page.getByRole('menuitem', { name: destinationName }),
      'spec 9.3: the list is the real folder library, and the destination this case made is in it',
    )
    await moved.settled('both moves reach the server before the wire and 7.6 are read')

    const moves = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.startsWith('PATCH /api/v1/tasks/'))
      .sort()
    expect(
      moves,
      'spec 7.6: one PATCH per selected task, and no endpoint the contract does not have',
    ).toEqual([`PATCH /api/v1/tasks/${a.id}`, `PATCH /api/v1/tasks/${b.id}`].sort())
    expect(await folderOf(page, a.id)).toBe(destination.id)
    expect(await folderOf(page, b.id)).toBe(destination.id)
    await expect(taskRow(page, first), 'the moved rows have left this folder').toHaveCount(0)
  })

  test('AC-280: Delete asks once, in the plural, and trashes each selected task on Delete', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-280 delete'))
    const first = caseTitle('AC-280 first to delete')
    const second = caseTitle('AC-280 second to delete')
    const a = await createTask(page, { title: first, folder_id: folder.id })
    const b = await createTask(page, { title: second, folder_id: folder.id })
    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, second)).toBeVisible()

    await selectTwo(page, first, second)
    const wire = watchWire(page)
    await clickControl(
      page.getByRole('button', { name: 'Delete', exact: true }).last(),
      'the bar\'s last control, after its divider, is the one that loses work',
    )
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'))
    await expect(
      dialog.getByText('Move 2 tasks to Trash? They stay there for 30 days.', { exact: true }),
      'spec 9.3\'s delete confirmation, in the plural the bar needs, telling the truth 7.13 made ' +
        '(RFC 0005 change control item 54; reworded in the polish round of 2026-08-30, AC-351)',
    ).toBeVisible()
    /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
       soon as nothing is in flight, and that is also true in the window
       between the press and the request the press causes, so the wire read
       below could find it empty and fail saying the client sent nothing --
       which is the defect the assertion is for. `watchCommit` waits for the
       page to have sent something before it waits for quiet. */
    const deleted = watchCommit(page)
    await clickControl(
      dialog.getByRole('button', { name: 'Delete', exact: true }),
      'spec 9.1: the task\'s delete confirm names what the press does',
    )
    await deleted.settled('both deletions reach the server before the wire and the rows are read')

    const deletes = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.startsWith('DELETE /api/v1/tasks/'))
      .sort()
    expect(
      deletes,
      'spec 7.6: one DELETE per selected task, which since 7.13 marks rather than purges',
    ).toEqual([`DELETE /api/v1/tasks/${a.id}`, `DELETE /api/v1/tasks/${b.id}`].sort())
    await expect(taskRow(page, first)).toHaveCount(0)
    await expect(taskRow(page, second)).toHaveCount(0)
  })

  test('AC-280: Duplicate copies each selected task through POST /tasks/:id/duplicate', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-280 copies'))
    const first = caseTitle('AC-280 first to copy')
    const second = caseTitle('AC-280 second to copy')
    const a = await createTask(page, { title: first, folder_id: folder.id })
    const b = await createTask(page, { title: second, folder_id: folder.id })
    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, second)).toBeVisible()

    await selectTwo(page, first, second)
    const wire = watchWire(page)
    /* Before the act (2026-09-04, issue #159). `waitForApiIdle` returns as
       soon as nothing is in flight, and that is also true in the window
       between the press and the request the press causes, so the wire read
       below could find it empty and fail saying the client sent nothing --
       which is the defect the assertion is for. `watchCommit` waits for the
       page to have sent something before it waits for quiet. */
    const copied = watchCommit(page)
    await clickControl(
      page.getByRole('button', { name: 'Duplicate', exact: true }),
      'the bar\'s Duplicate copies everything selected (item 58 A)',
    )
    await copied.settled('both copies reach the server before the wire and the rows are read')
    await expect(selectionBar(page), 'the bar leaves once its act is done').toHaveCount(0)
    const copies = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.endsWith('/duplicate'))
      .sort()
    expect(
      copies,
      'spec 7.16: one duplicate per selected task, at the endpoint the row\'s own act uses',
    ).toEqual(
      [`POST /api/v1/tasks/${a.id}/duplicate`, `POST /api/v1/tasks/${b.id}/duplicate`].sort(),
    )
    await expect(taskRow(page, `${first} (copy)`), 'the copy is on the page').toBeVisible()
    await expect(taskRow(page, `${second} (copy)`)).toBeVisible()
  })
})

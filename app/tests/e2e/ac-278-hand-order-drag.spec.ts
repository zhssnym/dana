/*
AC-278: given a folder with no filter or sort applied, when a task row is
dragged to another place in the list and released, then the client writes
`POST /tasks/:id/order` naming the two rows it now sits between and the list
reads back in that order after a reload; and given a view, or the same folder
with a filter applied, when the same gesture is made, then nothing is written
and the row returns to where section 6 puts it.

Authored at S23a by `11-adversarial-test.md`, which RFC 0004's S23a row assigns
criteria first. It is the client half of RFC 0005 change control item 44's B4,
whose server half AC-266 to AC-269 pinned at S22a: "in a folder, native or
user's, with no filter or sort applied, a task may be arranged by hand", and
"in a view, or in a folder with a filter or sort applied, the drag does not
persist. The gesture may show its feedback and the row returns to where the
sort puts it."

**The number is 274**, the next free one at authoring; AC-273 is S22a's last.

**The write is asserted on the wire and across a reload, never off the list.**
AC-228's standing reason: a list that moves a row without writing anything
looks correct until the next load. So the body of the order call is read, the
page is loaded again, and the drag is believed only when the rows come back in
the dragged order, which is Q2 answering from the column S22a landed.

**The refusal is asserted on the same wire, and it is the half a permissive
client passes by accident.** A client that persisted every drag would pass the
first case and fail the second on the wire, where the second case counts order
calls and expects none; a client that persisted none would fail the first. The
spring-back is read after the API has gone quiet, because the row is allowed
its feedback first.

**The drag is driven as a real pointer gesture in steps, never as one jump**,
for AC-227's and AC-228's reason: the engine commits a press to a drag only
after `LIFT_PX` of travel and recomputes its proposal on every move.

Spec: 9.1 (the region table, the filter), 6 (Q2 and Q7), 7.6 (the order
endpoint), RFC 0005 change control item 44 (B4).
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
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The titles in the order the page's one list draws them. */
async function listedTitles(page: Page, titles: readonly string[]): Promise<string[]> {
  const rows = page.getByRole('listitem').filter({ hasText: /./ })
  const texts = await rows.allTextContents()
  const seen: string[] = []
  for (const text of texts) {
    const hit = titles.find((title) => text.includes(title))
    if (hit !== undefined && !seen.includes(hit)) seen.push(hit)
  }
  return seen
}

/**
 * Carry a row to just below another row and let go. Steps of a few pixels,
 * the pointer kept moving so the engine never reads the stillness as the
 * hold that AC-279 measures.
 */
async function carryBelow(page: Page, from: Locator, below: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded()
  const start = await from.boundingBox()
  const target = await below.boundingBox()
  expect(start, 'the row being carried has a box to grab').not.toBeNull()
  expect(target, 'the row it is carried past has a box').not.toBeNull()
  if (start === null || target === null) return
  const x = start.x + start.width / 2
  let y = start.y + start.height / 2
  const endY = target.y + target.height * 0.9
  await page.mouse.move(x, y)
  await page.mouse.down()
  const steps = 12
  for (let step = 1; step <= steps; step += 1) {
    y = start.y + start.height / 2 + ((endY - start.y - start.height / 2) * step) / steps
    await page.mouse.move(x, y)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-278: a hand order persists in a folder and springs back elsewhere', () => {
  test('AC-278: dragging a row in an unfiltered folder writes the order endpoint and reads back', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-278 arranged'))
    const first = caseTitle('AC-278 first')
    const second = caseTitle('AC-278 second')
    const third = caseTitle('AC-278 third')
    const a = await createTask(page, { title: first, folder_id: folder.id })
    const b = await createTask(page, { title: second, folder_id: folder.id })
    const c = await createTask(page, { title: third, folder_id: folder.id })

    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, third)).toBeVisible()
    expect(
      await listedTitles(page, [first, second, third]),
      'spec 6 Q2: a folder nobody has arranged lists its unscheduled tasks oldest first, since the polish round of 2026-08-30',
    ).toEqual([first, second, third])

    const written = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(`/api/v1/tasks/${a.id}/order`),
    )
    await carryBelow(page, taskRow(page, first), taskRow(page, second))
    const response = await written
    expect(
      response.status(),
      'spec 7.6: the order endpoint answers 200 with the placed task',
    ).toBe(200)
    expect(
      response.request().postDataJSON(),
      'spec 7.6: the body names the two rows the task was dropped between, by id',
    ).toEqual({ after_id: b.id, before_id: c.id })

    await waitForApiIdle(page, 'the placement has been read back before the list is believed')
    expect(
      await listedTitles(page, [first, second, third]),
      'RFC 0005 item 44 B4: the row stays where it was put once the server has answered',
    ).toEqual([second, first, third])

    await page.reload()
    await expect(taskRow(page, third)).toBeVisible()
    expect(
      await listedTitles(page, [first, second, third]),
      'AC-266: the arrangement reads back in Q2\'s order after a reload',
    ).toEqual([second, first, third])
  })

  test('AC-278: the same drag in a view and in a filtered folder writes nothing and springs back', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-278 sorted'))
    const first = caseTitle('AC-278 view first')
    const second = caseTitle('AC-278 view second')
    await createTask(page, { title: first, folder_id: folder.id, important: true })
    await createTask(page, { title: second, folder_id: folder.id, important: true })

    const orderCalls: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/order')) {
        orderCalls.push(request.url())
      }
    })

    /* A view: Anytime lists every undated open task, sorted by section 6. */
    await page.goto(routesV2.anytime)
    await expect(taskRow(page, second)).toBeVisible()
    expect(await listedTitles(page, [first, second])).toEqual([first, second])
    await carryBelow(page, taskRow(page, first), taskRow(page, second))
    await waitForApiIdle(page, 'the gesture has settled and the page has said all it will')
    expect(
      await listedTitles(page, [first, second]),
      'RFC 0005 item 44 B4: in a view the row returns to where the sort puts it',
    ).toEqual([first, second])

    /* The folder with a filter applied: Important only, which both rows
       pass, having been made important, so the list is the same two rows
       narrowed and the only thing that changed is that a filter is on. */
    await page.goto(routesV2.folder(folder.id))
    await expect(taskRow(page, second)).toBeVisible()
    await clickControl(
      page.getByRole('button', { name: 'Filter', exact: true }),
      'spec 9.1: the filter control is named "Filter"',
    )
    await clickControl(
      page.getByRole('switch', { name: /Important only/ }),
      "spec 9.1: important-only is one of the filter's axes",
    )
    await page.keyboard.press('Escape')
    await expect(taskRow(page, second)).toBeVisible()
    await expect(taskRow(page, first)).toBeVisible()
    await carryBelow(page, taskRow(page, first), taskRow(page, second))
    await waitForApiIdle(page, 'the gesture has settled')
    expect(
      await listedTitles(page, [first, second]),
      'RFC 0005 item 44 B4: in a folder with a filter applied the drag does not persist',
    ).toEqual([first, second])

    expect(
      orderCalls,
      'RFC 0005 item 44 B4: no order call leaves the client from a view or a filtered folder',
    ).toEqual([])
  })
})

/*
AC-295: given a folder page in board view on its sections axis, then a
"Done" column stands after the sections holding the folder's completed
tasks, and carrying an open card into it completes the task through 7.6's
transition; and given the Done page, then its view strip offers Board, and
the board draws one column per completion day with every card finished.

Authored at the loose-ends row under `11-adversarial-test.md`, beside RFC
0005 change control item 58 (F and G). Ledger L-045 is the prototype's
"Done column that is not a section: dropping a card there completes it";
L-049 is Done offering list and board like every other page, which
`views/place-pages.ts` had dated to the two-row era S23 ended.

**The drop is asserted on the wire and on the row**, the way AC-228 reads a
board drop: a column that repaints a card as finished without writing the
transition is the false green this discriminates, and the transition is the
one act a Done column can mean (9.5's completion, undo bar and all).

The carry is the harness's `carryInto`, which is AC-228's gesture and was a
copy of it here until 2026-09-01; see that helper for why one copy is worth
more than two.

Spec: 9.1 (the board sentence and the region table), 9.5 (Done, completion),
9.6 (the folder board), 7.6 (the transition), RFC 0005 items 44 B2 and 58.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  carryInto,
  caseTitle,
  chooseView,
  createFolder,
  createTask,
  regionOf,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  transition,
  viewStrip,
  waitForApiIdle,
  watchWire,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

function card(page: Page, column: string, title: string): Locator {
  return regionOf(page, column).getByRole('listitem').filter({ hasText: title }).first()
}

async function statusOf(page: Page, id: string): Promise<string> {
  const detail = await page.request.get(`/api/v1/tasks/${id}`)
  expect(detail.status()).toBe(200)
  return ((await detail.json()) as { status: string }).status
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-295: the folder board\'s Done column, and Done\'s own board', () => {
  test('AC-295: the Done column holds the finished and a drop into it completes through 7.6', async ({
    page,
  }) => {
    const folder = await createFolder(page, caseTitle('AC-295 board'))
    const finished = caseTitle('AC-295 already finished')
    const open = caseTitle('AC-295 still open')
    const done = await createTask(page, { title: finished, folder_id: folder.id })
    await transition(page, done.id, 'complete', 'UTC')
    const task = await createTask(page, { title: open, folder_id: folder.id })

    await page.goto(routesV2.folder(folder.id))
    await chooseView(page, 'Board', 'spec 9.6: the folder page offers the board')
    await expect(
      card(page, 'Done', finished),
      'ledger L-045: the board carries a Done column that is not a section, holding the completed',
    ).toBeVisible()
    /* polish: folderpage F7. A folder with no sections names its one column
       "Tasks"; "No section" on a page that has none read as something
       missing. The column is the same column. */
    await expect(card(page, 'Tasks', open), 'the open task sits loose').toBeVisible()

    const wire = watchWire(page)
    await carryInto(page, card(page, 'Tasks', open), regionOf(page, 'Done'))
    await expect(
      page.getByText('Into Done'),
      'DES-171: the carried card names the column a release would land it in',
    ).toBeVisible()
    await page.mouse.up()
    await waitForApiIdle(page, 'the completion lands before the row is read back')

    const completes = wire
      .mutations()
      .map((call) => `${call.method} ${new URL(call.url).pathname}`)
      .filter((call) => call.endsWith('/complete'))
    expect(completes, 'spec 7.6: a drop on Done is the completion transition').toEqual([
      `POST /api/v1/tasks/${task.id}/complete`,
    ])
    expect(await statusOf(page, task.id), 'read through 7.6 rather than off the board').toBe(
      'completed',
    )
    await expect(card(page, 'Done', open), 'and the card now stands in Done').toBeVisible()
  })

  test('AC-295: Done offers Board and draws a column per completion day', async ({ page }) => {
    const folder = await createFolder(page, caseTitle('AC-295 done page'))
    const title = caseTitle('AC-295 finished today')
    const task = await createTask(page, { title, folder_id: folder.id })
    await transition(page, task.id, 'complete', 'UTC')

    await page.goto(routesV2.done)
    await expect(
      viewStrip(page).first().getByRole('radio', { name: 'Board', exact: true }),
      'ledger L-049: Done offers list and board like every other place page',
    ).toBeAttached()
    await chooseView(page, 'Board', 'the strip\'s Board is a real choice on Done')
    await expect(
      card(page, 'Today', title),
      'spec 6 Q6: the board\'s columns are the day groups the list draws, today first',
    ).toBeVisible()
    await expect(
      regionOf(page, 'Today').getByRole('checkbox', { name: `Reopen ${title}`, exact: true }),
      'every card in a day column is finished, and its control says so',
    ).toBeVisible()
  })
})

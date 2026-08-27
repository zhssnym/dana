/*
AC-228: given a board grouped by folder, when a card is dragged from one
column and released in another, then the carried card names the column it
would land in as "Into {column}", the task's folder is that column's folder
on the wire, and the card is in that column after a reload; and given a
column that is a relation rather than a value, then a release there writes
nothing.

Authored at S11 by `11-adversarial-test.md`, which RFC 0004's S11 row assigns
it to, and appended to section 12 with the paragraphs below. It is the half of
9.1's view strip sentence nothing asserted: "a board column captures with its
own value, and dropping a card in a column writes that value". AC-221 reads
the capture half and stops there, which is what left the drop buildable and
unmeasured; the S10 session recorded the omission in `TaskBoard.tsx`'s own
header rather than leaving it to be discovered.

**The number is 228**, the next free one at authoring: AC-227 is S11's sidebar
drag and AC-226 is S13's starter workflows, the collision RFC 0005's change
control item 13 settled.

**The write is asserted on the wire and across a reload, never off the board.**
That is AC-180's and AC-227's standing reason on the same subject: a board that
moves a card between its own columns without writing anything looks correct
until the next load. So the folder is read back through frozen 7.2 and the page
is loaded again, and the drop is believed only when both agree.

**"Into {column}" is read while the pointer is still down.** It is the proposal
rather than the outcome, and DES-171's reason for the `onOver` seam is that the
two can disagree: a column that holds a card while the release writes something
else is lying about what it will do. So this case reads the sentence first, then
releases, then reads the write. A client that moves the card correctly while
proposing something else fails the half that was the design decision.

**The refusal is asserted too, and it is the half a permissive client passes by
accident.** DES-182 gives a column with no value to write no capture at all,
"those boards do not offer it at all rather than offering it and refusing", and
a drop is that value written by another route. Overdue on a board grouped by
date is such a column: it is a relation to today rather than a day, so there is
no `due_date` a release could write, and a client that wrote *something* there
would have to invent it. The case therefore drops a card on Overdue and asserts
the task is unchanged.

**The second case is a refusal and passes vacuously against a client with no
drop at all**, which is what a refusal case always does and is worth saying
rather than leaving for somebody to notice. What discriminates is the first,
and it was run as a positive control on 2026-08-25 with the board's `onDropAt`
returning false: it went red on the folder and green again when the seam was
put back. The AC-173 precedent, where the same vacuity was found by comparing
rather than assumed away.

**The drag is driven as a real pointer gesture in steps, never as one jump**,
for AC-227's reason: the engine commits a press to a drag only after it has
travelled `LIFT_PX`, and it recomputes its proposal on every move, so a single
`mouse.move` to the destination measures a code path no person reaches.

Spec: 9.1 (the view strip's board sentence, the region table's board column,
the undo bar), DES-182 (a column is a value), DES-171 (the proposal seam),
AC-221 (the capture half), 6 (the order inside a column is the server's).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  chooseView,
  clickControl,
  createTask,
  csrfToken,
  regionOf,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

/**
 * The destination column, which is a folder this case makes rather than one
 * the seed carries. The seed holds Desk and Groceries and no third folder, and
 * a criterion about moving between two columns needs two; per the harness rule
 * a spec never edits a seed row, so it brings its own.
 *
 * **A column exists where its rows do**, `grouping.ts` deriving the columns
 * from the tasks on the page rather than from the folder list, so the
 * destination is given an occupant. That is the product's own shape and not a
 * concession: a board grouped by folder draws the folders its work is in.
 */
const DESTINATION = 'ac-228 destination'
const OCCUPANT = 'ac-228 destination occupant'

async function ensureFolder(page: Page, name: string): Promise<string> {
  const listed = await page.request.get('/api/v1/folders')
  expect(
    listed.status(),
    `GET /folders answered ${listed.status()}: ${await listed.text()}`,
  ).toBe(200)
  const existing = ((await listed.json()) as { id: string; name: string }[]).find(
    (entry) => entry.name === name,
  )
  if (existing !== undefined) return existing.id
  const token = await csrfToken(page.context())
  const created = await page.request.post('/api/v1/folders', {
    data: { name },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    created.status(),
    `POST /folders answered ${created.status()}: ${await created.text()}`,
  ).toBe(201)
  return ((await created.json()) as { id: string }).id
}

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** What frozen 7.2 holds for the task, which is what the drop had to write. */
async function storedTask(
  page: Page,
  taskId: string,
): Promise<{ folder: { id: string; name: string }; due_date: string | null }> {
  const detail = await page.request.get(`/api/v1/tasks/${taskId}`)
  expect(
    detail.status(),
    `GET /tasks/:id answered ${detail.status()}: ${await detail.text()}`,
  ).toBe(200)
  return (await detail.json()) as {
    folder: { id: string; name: string }
    due_date: string | null
  }
}

/** Puts a place page into board view on the named axis, through its own controls. */
async function board(page: Page, axis: RegExp): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'Filter', exact: true }),
    'spec 9.1: the filter control is named "Filter" and carries group-by',
  )
  await clickControl(
    page.getByRole('menuitem', { name: /Group by/ }).or(page.getByText('Group by').first()),
    'spec 9.1: grouping lives in the filter',
  )
  await clickControl(
    page.getByRole('menuitem', { name: axis }).or(page.getByRole('option', { name: axis })).first(),
    'the axis this case needs, which is what gives the board its columns',
  )
  // 9.1's strip is a radiogroup of zero-width options since S24; `chooseView`
  // widens it before pressing, which is the gesture the section describes.
  await chooseView(
    page,
    'Board',
    'spec 9.1: the view strip offers board wherever the page has a grouping',
  )
}

/** A card in a column, addressed by the task that generates it. */
function card(page: Page, column: string, title: string): Locator {
  return regionOf(page, column).getByRole('listitem').filter({ hasText: title }).first()
}

/**
 * Carry a card into another column as a person would: press, travel in steps,
 * and stop with the pointer inside the destination, still held down.
 *
 * Left held down on purpose, both cases reading what the board promises before
 * they release. The destination's live position is re-read each pass, because
 * the columns scroll horizontally and a board wider than the window moves
 * under the pointer exactly as the sidebar does under AC-227's.
 */
async function carryInto(page: Page, from: Locator, into: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded()
  const start = await from.boundingBox()
  expect(start, 'the card being carried is on the page and has a box to grab').not.toBeNull()
  if (start === null) return
  const viewport = page.viewportSize()
  expect(viewport, 'the page has a viewport to clamp waypoints into').not.toBeNull()
  if (viewport === null) return

  /* Right of the row's first 44 pixels, which the row reserves for its
     completion control and which its own click handler ignores. */
  let atX = start.x + start.width / 2
  let atY = start.y + start.height / 2
  await page.mouse.move(atX, atY)
  await page.mouse.down()

  let previousX = Number.POSITIVE_INFINITY
  for (let pass = 0; pass < 40; pass += 1) {
    const now = await into.boundingBox()
    expect(now, 'the destination column exists somewhere on the board').not.toBeNull()
    if (now === null) return
    const trueX = now.x + now.width / 2
    const trueY = now.y + Math.min(now.height / 2, 120)
    const clampedX = Math.min(Math.max(trueX, 40), viewport.width - 40)
    for (let step = 1; step <= 4; step += 1) {
      await page.mouse.move(
        atX + ((clampedX - atX) * step) / 4,
        atY + ((trueY - atY) * step) / 4,
      )
    }
    atX = clampedX
    atY = trueY
    if (Math.abs(trueX - clampedX) < 1 && Math.abs(trueX - previousX) < 2) break
    previousX = trueX
    await page.waitForTimeout(150)
  }
  for (const nudge of [1, -1, 0]) {
    await page.mouse.move(atX + nudge, atY + nudge)
  }
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-228: a board column takes the drop and writes its value', () => {
  test('AC-228: a card released in another column lands in that column\'s folder', async ({
    page,
  }) => {
    const title = caseTitle('Carried across the board')
    const destination = await ensureFolder(page, DESTINATION)
    await createTask(page, { title: caseTitle(OCCUPANT), folder_id: destination })
    const task = await createTask(page, { title, folder_id: seedIds.groceries })
    await page.goto(routesV2.anytime)
    await board(page, /^Folder$/)

    const carried = card(page, 'Groceries', title)
    await expect(
      carried,
      'spec 9.1: a board column is a named region named by its value, and the card is ' +
        'in the column its folder names before anything is dragged',
    ).toBeVisible()

    await carryInto(page, carried, regionOf(page, DESTINATION))
    await expect(
      page.getByText(`Into ${DESTINATION}`),
      'spec 9.1 and DES-171: the carried card names the container a release would land ' +
        'it in, so the promise and the outcome are the same thing. Read while the ' +
        'pointer is still down, which is the only moment it exists',
    ).toBeVisible()
    await page.mouse.up()
    await waitForApiIdle(page, 'the drop\'s write lands before the row is read back')

    const stored = await storedTask(page, task.id)
    expect(
      stored.folder.name,
      'spec 9.1: "dropping a card in a column writes that value", and a folder column\'s ' +
        'value is that folder. Read through frozen 7.2 rather than off the board, a ' +
        'client that repaints without writing being the failure this discriminates',
    ).toBe(DESTINATION)

    await page.reload()
    await expect(
      card(page, DESTINATION, title),
      'the card is in its new column after a reload, which is what separates a write ' +
        'from a repaint (AC-180 and AC-227\'s standing reason)',
    ).toBeVisible()
  })

  test('AC-228: a column with no value to write refuses the drop', async ({ page }) => {
    const title = caseTitle('Carried onto a relation')
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(3),
    })
    // The Overdue column, like every other, exists where its rows do.
    await createTask(page, {
      title: caseTitle('ac-228 overdue occupant'),
      folder_id: seedIds.groceries,
      due_date: seedDate(-3),
    })
    await page.goto(routesV2.scheduled)
    await board(page, /^Date$/)

    const overdue = regionOf(page, 'Overdue')
    await expect(
      overdue,
      'the board grouped by date carries an Overdue column, which is the relation ' +
        'DES-182 names: the fixture for the refusal asserted below',
    ).toBeVisible()

    const before = await storedTask(page, task.id)
    const carried = page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: title })
      .first()
    await carryInto(page, carried, overdue)
    await expect(
      page.getByText(/^Into Overdue$/),
      'DES-182: Overdue is a relation to today and not a value, so there is nothing a ' +
        'release could write and the column never promises one. A board that offers it ' +
        'and refuses is the arrangement that sentence rejects',
    ).toHaveCount(0)
    await page.mouse.up()
    await waitForApiIdle(page, 'anything the release did would have been sent by now')

    const after = await storedTask(page, task.id)
    expect(
      after.due_date,
      'the task is untouched: a column with no value writes none, rather than inventing ' +
        'a date so that the gesture appears to have worked',
    ).toBe(before.due_date)
  })
})

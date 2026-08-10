/*
AC-154 (proposed): given the inline quick-add row of 9.1, when a title is
typed and enter pressed, then the task is created immediately with that
entry point's defaults; when escape is pressed, then the input clears and
nothing is created.

**The number is provisional.** This criterion is authored on the P8 branch
with its test, the way AC-125 to AC-131, AC-133 to AC-140 and AC-142 were
authored on theirs, and the mid-package change control assigns whatever it
accepts. It is numbered from AC-154 rather than AC-144 because package P7 is
concurrently proposing AC-144 to AC-153 on its own branch and merges first;
P7's numbering is not final either, so both sides are provisional and the
Steward reconciles them.

The standard it is offered under is the one those three batches were
admitted under: a rule the specification states that no numbered criterion
asserts. 9.1 gives the quick-add row three behaviors in one sentence, enter
saving immediately, the other fields taking that entry point's defaults, and
escape clearing, and section 12 covers none of them. AC-093 asserts the
entry-point table against the form, which is the other consumer of those
defaults and a different control: the form shows a person the defaults
before they commit, where the quick-add row commits without showing them
anything, so it is the one place a wrong default is invisible until the task
is somewhere unexpected.

Escape is the half worth the most. A row that saves on escape, or that keeps
its text after one, costs a person a task they decided not to create, and
nothing about the page afterwards says where it went.

Spec: 9.1 (the quick-add row), 9.3 (the entry-point defaults it commits),
9.5 (per-group adds are undated on Tasks), 6 Q2, Q3.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  fillControl,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  textInputs,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Card {
  title: string
  due_date: string | null
  important: boolean
  folder: { name: string }
}

/** What the server stored, read back through Q8 rather than off the page. */
async function stored(page: Page, title: string): Promise<Card[]> {
  const response = await page.request.get(
    `/api/v1/search?q=${encodeURIComponent(title)}&tz=UTC`,
  )
  expect(
    response.status(),
    `GET /search answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  const body = (await response.json()) as { rows: Card[] }
  return body.rows.filter((row) => row.title === title)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-154 (proposed): the inline quick-add row', () => {
  test('AC-154: enter on Tasks saves immediately, undated, in that group\'s folder', async ({
    page,
  }) => {
    const title = 'ac-154 tasks quick add'
    await page.goto(routes.tasks)

    const quickAdd = textInputs(page).first()
    await fillControl(
      quickAdd,
      title,
      'spec 9.1: the inline quick-add row is a single title input',
    )
    await quickAdd.press('Enter')

    await expect(
      taskRow(page, title),
      'spec 9.1: enter saves immediately, and 8.3 refetches the active view after an own ' +
        'mutation, so the row is on the page with nothing else pressed',
    ).toBeVisible()
    await expect(
      quickAdd,
      'the row is ready for the next task, which is what "immediately" is for',
    ).toHaveValue('')

    const rows = await stored(page, title)
    expect(rows.length, 'exactly one task was created').toBe(1)
    const card = rows[0]
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.due_date,
      'spec 9.5: the inline quick-add per group adds into that folder, undated, and 9.3 ' +
        'gives the Tasks entry point an empty due date',
    ).toBeNull()
    expect(
      card.important,
      'spec 9.3: important is off at this entry point',
    ).toBe(false)
    expect(
      card.folder.name,
      'spec 9.3: the Tasks entry point defaults to Inbox, and the row was typed into the ' +
        'ungrouped Inbox block at the top of the page (6 Q2)',
    ).toBe('Inbox')
  })

  test('AC-154: enter on the Planned list saves the task dated today', async ({ page }) => {
    const title = 'ac-154 planned quick add'
    await page.goto(routes.planned)

    const quickAdd = textInputs(page).first()
    await fillControl(
      quickAdd,
      title,
      'spec 9.1: the inline quick-add row is a single title input',
    )
    await quickAdd.press('Enter')
    await expect(
      taskRow(page, title),
      'spec 9.1: enter saves immediately, and 6 Q3 keeps the row on Planned only if it was ' +
        'dated, which is what the assertion below reads from the server',
    ).toBeVisible()

    const rows = await stored(page, title)
    const card = rows[0]
    expect(rows.length, 'exactly one task was created').toBe(1)
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.due_date,
      'spec 9.3: the Planned list entry point defaults the due date to today, which is also ' +
        'the only thing that puts the new row on the page it was typed on (6 Q3 admits dated ' +
        'rows only). A quick-add saving it undated leaves the person watching it vanish',
    ).toBe(seedDate(0))
    expect(card.important, 'spec 9.3: important is off at this entry point').toBe(false)
  })

  test('AC-154: escape clears the input and creates nothing', async ({ page }) => {
    const title = 'ac-154 escaped and never created'
    await page.goto(routes.tasks)

    const quickAdd = textInputs(page).first()
    await fillControl(
      quickAdd,
      title,
      'spec 9.1: the inline quick-add row is a single title input',
    )
    await quickAdd.press('Escape')

    await expect(
      quickAdd,
      'spec 9.1: escape clears the quick-add row',
    ).toHaveValue('')
    expect(
      await stored(page, title),
      'spec 9.1 gives escape one meaning, clearing, so it is not a second way to save. A row ' +
        'that commits on escape costs a person a task they decided against, and nothing on ' +
        'the page afterwards says where it went',
    ).toEqual([])
  })

  test('AC-154: a folder page adds into that folder', async ({ page }) => {
    const title = 'ac-154 folder quick add'
    await page.goto(routes.folder(seedIds.groceries))

    // Both open sections of 9.6 carry a quick-add row and both add into this
    // folder, so the folder column of 9.3's table holds for whichever row
    // this is. The due date differs between them and is the cell escalated
    // at AC-093, so it is not asserted here.
    const quickAdd = textInputs(page).first()
    await fillControl(
      quickAdd,
      title,
      'spec 9.1: the inline quick-add row is a single title input',
    )
    await quickAdd.press('Enter')

    const rows = await stored(page, title)
    const card = rows[0]
    expect(rows.length, 'exactly one task was created').toBe(1)
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.folder.name,
      'spec 9.3: the folder page entry point defaults the folder to that folder, not to Inbox',
    ).toBe('Groceries')
  })
})

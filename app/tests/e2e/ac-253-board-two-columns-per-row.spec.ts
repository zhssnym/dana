/*
AC-253: given the board on a place page and the board on a folder page, then
the columns are laid two to a row, so with three columns the third stands
below the first rather than to the right of the second; and given a folder
page, then it carries the view strip of 9.1 and choosing Board there draws
that folder's tasks as the same board.

**This measures geometry, and geometry is the one thing a screenshot cannot
argue with.** `views/TaskBoard.tsx:103` is `flex items-start gap-4
overflow-x-auto`, one horizontally scrolling row, against
`prototype-v2/src/components/task-board.tsx`'s two columns per row. The owner
ruled for the prototype's shape, the one-row board being too short. A count
of columns cannot tell those two apart: both draw three. What tells them
apart is where the third one is, and that is a pair of numbers the browser
will hand over.

**It is asserted as two counts rather than as three positions**, and
`expectTwoPerRow` carries the reason: a place page's board draws a column per
folder its work is in, so this file's fixtures are not the board's first three
and any claim about which column is beside which is a claim about the runner's
seed. Two distinct left edges and more than one distinct top say "two columns
per row" without naming a column, and they refuse both the board this replaces
and the three-per-row a wider viewport might otherwise produce.

**One shared component, so the criterion reads it twice.** `TaskBoard` is what
every place page draws and what the folder page is about to draw, and a fix
made for the folder page alone would leave Anytime as it is. Reading the same
geometry on a place page and on a folder page is what makes this a criterion
about the component rather than about either page, which is why the port's own
log row has to say a shared board was changed deliberately.

**The folder page's board is the audit's fifth headline gap and half of it is
the strip.** `views/ViewStrip.tsx` and `views/TaskBoard.tsx` are S10's and the
place pages reach them through `views/usePlace.tsx`; `pages/FolderPage.tsx`
uses none of the three. So the folder page has no board, no view strip and no
window-bar filter, one click from pages that have all three. The strip is
asserted by 9.1's own name for the control it offers, "Board", which AC-093
already addresses "Calendar" by.

**The two pages need two fixtures, because their boards group differently.**
`grouping.ts` derives a column where its rows are, so a board grouped by
folder draws the folders its work is in: three folders with one undated task
apiece give Anytime three columns of its own, Q2 being the undated open rows.
A folder page cannot group by the folder it has pinned (DES-177: "arranging by
an axis the page has pinned gives one group, which is a list wearing a
different control"), so its board is the date axis and its fixture is three
tasks in one folder on three dates no bucket can merge.

Spec: 9.1 (the view strip, "one control per place-page offering the views the
page can honestly draw", and the filter that carries group-by), 9.6 (the
folder page and the filter that "narrows the page without touching its
arrangement"), DES-132 (the board), DES-182 (choosing Board on an ungrouped
page sets a grouping), and the parity audit's task-board and folder-page rows.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  regionOf,
  routesV2,
  seedDate,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  folders: readonly { id: string; name: string }[]
  /** The folder whose own page carries the third case's board. */
  hostId: string
  hostName: string
  sections: readonly string[]
}

async function build(page: Page): Promise<Fixture> {
  const folders: { id: string; name: string }[] = []
  for (const label of ['alpha', 'beta', 'gamma']) {
    const name = caseTitle(`ac-253 ${label}`)
    const folder = await createFolder(page, name)
    await createTask(page, { title: caseTitle(`ac-253 ${label} task`), folder_id: folder.id })
    folders.push({ id: folder.id, name })
  }
  const host = folders[0]
  if (host === undefined) throw new Error('unreachable: three folders built above')
  /*
  Three tasks in the host folder on three different dates, because the folder
  page's board groups by the date rather than by the folder: DES-177 says a
  page that has pinned an axis cannot arrange by it, "which is a list wearing
  a different control", and a folder page has pinned the folder. Overdue,
  today and a month out are three buckets `grouping.ts` cannot merge, which is
  what gives the board its third column.
  */
  for (const days of [-3, 0, 40]) {
    await createTask(page, {
      title: caseTitle(`ac-253 host ${days}`),
      folder_id: host.id,
      due_date: seedDate(days),
    })
  }
  return {
    folders,
    hostId: host.id,
    hostName: host.name,
    sections: folders.map((folder) => folder.name),
  }
}

/** Puts the page in front into board view on the named axis, through its controls. */
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
    page
      .getByRole('menuitem', { name: axis })
      .or(page.getByRole('option', { name: axis }))
      .first(),
    'the axis this case needs, which is what gives the board its columns',
  )
  await clickControl(
    page.getByRole('button', { name: /^Board$/i }).first(),
    'spec 9.1: the view strip offers board wherever the page has a grouping',
  )
}

/**
 * The three columns' boxes, in the order the board draws them.
 *
 * A column is a named region (9.1's sections rule, which `PageSection` and the
 * board's own columns both honour), so the region named for each fixture
 * folder is that folder's column and nothing else on the page answers to it.
 */
async function columnBoxes(
  page: Page,
  names: readonly string[],
): Promise<readonly { name: string; x: number; y: number }[]> {
  const boxes: { name: string; x: number; y: number }[] = []
  for (const name of names) {
    const region: Locator = regionOf(page, name)
    await expect(
      region,
      `spec 9.1: every section a page's structure names is a named region, so the board's ` +
        `column for ${name} is addressable as one`,
    ).toBeVisible()
    const box = await region.boundingBox()
    expect(box, `the column for ${name} is on the page and has a box`).not.toBeNull()
    if (box === null) continue
    boxes.push({ name, x: Math.round(box.x), y: Math.round(box.y) })
  }
  return boxes
}

/**
 * The two-per-row assertion, made the same way on both pages.
 *
 * **Stated over every column rather than over three named ones, and the first
 * run of this file is why.** A place page's board draws a column per folder
 * its work is in, the runner's seeded folders included, so this file's three
 * fixtures are not the board's first three and "the second is right of the
 * first" is a claim about which columns happened to be adjacent. Two counts
 * are the honest form of "two columns per row" and neither depends on knowing
 * which column is which: with three or more columns a two-per-row grid has
 * **exactly two** distinct left edges and **more than one** distinct top,
 * where one scrolling row has as many left edges as columns and exactly one
 * top. Together they refuse the built board and every wrap that is not this
 * one, including the three-per-row a wider viewport might otherwise produce.
 *
 * Positions are rounded and bucketed to the nearest 4 pixels, because a
 * subpixel layout answers 386 and 386.5 for one edge and this is a question
 * about columns rather than about floating point.
 */
function expectTwoPerRow(
  boxes: readonly { name: string; x: number; y: number }[],
  where: string,
): void {
  expect(
    boxes.length,
    `${where}: three columns are needed to tell a wrapping board from a scrolling one, ` +
      'because the first two sit side by side in both',
  ).toBeGreaterThanOrEqual(3)

  const bucket = (value: number): number => Math.round(value / 4)
  const lefts = new Set(boxes.map((box) => bucket(box.x)))
  const tops = new Set(boxes.map((box) => bucket(box.y)))

  expect(
    [...lefts].length,
    `${where}: DES-132 and the owner's ruling that the one-row board is too short. The ` +
      'built board is "flex items-start gap-4 overflow-x-auto", one horizontally scrolling ' +
      `row, so its ${String(boxes.length)} columns stand at ${String(boxes.length)} distinct ` +
      'left edges and this reads that count rather than 2',
  ).toBe(2)

  expect(
    [...tops].length,
    `${where}: and the rows are rows. A single row has one top for every column, so this is ` +
      'the half that says the board wrapped at all rather than merely repeating a left edge',
  ).toBeGreaterThan(1)
}

test.describe('AC-253: the board is two columns per row', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    for (const folder of fixture.folders) await deleteFolder(page, folder.id)
  })

  test('AC-253: a place page\'s board wraps at two', async ({ page }) => {
    await page.goto(routesV2.anytime)
    await board(page, /Folder/i)

    expectTwoPerRow(
      await columnBoxes(page, fixture.sections),
      'the board on Anytime, which is the shared views/TaskBoard.tsx every place page draws',
    )
  })

  test('AC-253: the folder page carries the view strip', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.hostId))

    await expect(
      page.getByRole('button', { name: /^List$/i }).first(),
      'spec 9.1: "one control per place-page offering the views the page can honestly draw". ' +
        'views/ViewStrip.tsx is S10\'s and pages/FolderPage.tsx reaches it through nothing, ' +
        'so the folder page is one click from six pages that have a strip and has none',
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: /^Board$/i }).first(),
      'DES-132: the folder page is where the board was designed, and the audit calls its ' +
        'absence "the board view entirely: no view strip, no window-bar filter"',
    ).toBeVisible()

    await expect(
      page.getByRole('button', { name: 'Filter', exact: true }),
      'spec 9.6: "the filter of 9.1 narrows the page without touching its arrangement", so ' +
        'the folder page carries the window bar\'s filter as every place page does',
    ).toBeVisible()
  })

  test('AC-253: the folder page\'s board is the same board', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.hostId))
    await board(page, /^Date$/)

    /*
    Scoped inside the page's own open-tasks region, which is what the columns
    are drawn in. Read off the document instead, the first "region carrying
    list items" is that region rather than a column, and the geometry read is
    a page section against a board column, which is a comparison of two
    different things that happens to produce numbers.
    */
    const columns = regionOf(page, 'All open tasks')
      .getByRole('region')
      .filter({ has: page.getByRole('listitem') })
    await expect(
      columns.first(),
      'spec 9.6 and DES-132: choosing Board on the folder page draws that folder\'s tasks as ' +
        'a board, which is the surface the audit records as missing entirely',
    ).toBeVisible()

    const boxes: { name: string; x: number; y: number }[] = []
    const count = await columns.count()
    for (let at = 0; at < count; at += 1) {
      const box = await columns.nth(at).boundingBox()
      if (box === null) continue
      boxes.push({ name: `column ${at}`, x: Math.round(box.x), y: Math.round(box.y) })
    }

    expectTwoPerRow(
      boxes,
      'the board on the folder page, which is the same views/TaskBoard.tsx: a geometry fixed ' +
        'for one page and not the other would mean two boards again',
    )
  })
})

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

**The third column is asserted below the first and not merely below
something.** A board that wrapped at some width the viewport happened to
force would put the third column below the second as easily as below the
first, and a two-per-row board cannot: with two to a row, columns one and two
share a row and column three opens the next one directly under column one. So
both halves are asserted, the vertical drop and the shared left edge, and
together they refuse every wrap that is not this one.

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

**Three folders and one task apiece, because the columns are the folders.**
`grouping.ts` derives a column where its rows are, so a board grouped by
folder draws the folders its work is in and an empty folder is no column.
Anytime is Q2's undated open rows, so an undated task is on it and the
fixtures need no dates.

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
  /* The folder page's own board groups by the axis its filter offers; three
     tasks in the host folder give it rows to draw whichever axis it lands on,
     and the assertion below reads columns rather than names. */
  for (const label of ['one', 'two', 'three']) {
    await createTask(page, {
      title: caseTitle(`ac-253 host ${label}`),
      folder_id: host.id,
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

/** The two-per-row assertion, made the same way on both pages. */
function expectTwoPerRow(
  boxes: readonly { name: string; x: number; y: number }[],
  where: string,
): void {
  expect(
    boxes.length,
    `${where}: three columns are needed to tell a wrapping board from a scrolling one, ` +
      'because the first two sit side by side in both',
  ).toBeGreaterThanOrEqual(3)
  const [first, second, third] = boxes
  if (first === undefined || second === undefined || third === undefined) return

  expect(
    second.x,
    `${where}: the first two columns share a row, which both the built board and the ` +
      'prototype\'s do. This is the half that must not change',
  ).toBeGreaterThan(first.x)
  expect(
    Math.abs(second.y - first.y),
    `${where}: and they share it, their tops being level`,
  ).toBeLessThanOrEqual(4)

  expect(
    third.y,
    `${where}: DES-132 and the owner's ruling that the one-row board is too short. ` +
      'views/TaskBoard.tsx:103 is "flex items-start gap-4 overflow-x-auto", one ' +
      'horizontally scrolling row, so the third column stands to the right of the second ' +
      'and this reads equal rather than greater',
  ).toBeGreaterThan(first.y)
  expect(
    Math.abs(third.x - first.x),
    `${where}: two to a row means the third opens the next row directly under the first. ` +
      'A board that merely wrapped at whatever width the viewport forced could put it ' +
      'under the second instead, which this refuses',
  ).toBeLessThanOrEqual(4)
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
    await board(page, /Status|Folder|Section/i)

    const columns = page.getByRole('region').filter({ has: page.getByRole('listitem') })
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

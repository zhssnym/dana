/*
AC-221: given a board on Today grouped by folder, when a task is captured in
a column, then it lands in that column's folder and appears on Today; given
board view, then no floating add button renders.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. It is DES-182 as a criterion, written because building the boards
exposed the fault underneath: a task made on Today never appeared on Today,
the capture setting a due date while Today's spine is membership, and nobody
saw it because the surface opened over the page it had just failed to add
to. Red until S10 lands the place pages' views.

**The landing is asserted on both axes.** "Lands in that column's folder"
is the column's value written (DES-182: every column captures with its own
value), and "appears on Today" is the page's spine holding its own capture
(9.1: every capture creates the task with the entry defaults of 9.3 for
where it stands). A client that writes the folder and forgets the Today
membership passes the first and fails the second, which is the original
fault exactly.

**The floating button's absence is asserted in board view by its 9.1 name**,
"Add task": in board view every column captures and the button is absent.

Spec: 9.1 (the view strip, the capture paragraph, the names table), 9.3
(the entry defaults table), DES-182, AC-093 (the defaults' own criterion).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  chooseView,
  clickControl,
  floatingAddButton,
  regionOf,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.today)
})

/** Puts Today into board view grouped by folder, through its own controls. */
async function boardGroupedByFolder(page: import('@playwright/test').Page): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'Filter', exact: true }),
    'spec 9.1: the filter control is named "Filter" and carries group-by. The v1 ' +
      'client has no such control, which is the red this shows until S10',
  )
  await clickControl(
    page.getByRole('menuitem', { name: /Group by/ }).or(page.getByText('Group by').first()),
    'spec 9.1: grouping lives in the filter',
  )
  await clickControl(
    page.getByRole('menuitem', { name: /Folder/ }).or(page.getByRole('option', { name: /Folder/ })).first(),
    'group Today by folder, which is what gives the board its columns',
  )
  // The strip is 9.1's collapsing radiogroup since S24: board is a radio with
  // no width until the strip is widened, and its name is the control's own
  // rather than text beside it.
  await chooseView(
    page,
    'Board',
    'spec 9.1: the view strip offers board wherever the page has a grouping',
  )
}

test.describe('AC-221: board capture on Today', () => {
  test('AC-221: a column captures with its value and the task appears on Today', async ({
    page,
  }) => {
    const title = caseTitle('Captured on the board')
    await boardGroupedByFolder(page)

    const column = regionOf(page, 'Groceries')
    await clickControl(
      column.getByRole('button', { name: 'Add a task', exact: true }),
      'spec 9.1: in board view every column captures, and the inline quick-add is ' +
        'named "Add a task" collapsed and expanded alike',
    )
    await column.getByRole('textbox', { name: 'Add a task', exact: true }).fill(title)
    await page.keyboard.press('Enter')
    await waitForApiIdle(page, 'the capture lands before the board is read back')

    await expect(
      column.getByText(title).first(),
      'DES-182: the column captures with its own value, so the task is in the ' +
        'Groceries column, meaning the Groceries folder',
    ).toBeVisible()

    // The page's own spine held its capture: the task is on Today in list
    // view too, not only in the board's optimistic paint.
    await page.reload()
    await expect(
      page.getByRole('main').getByText(title).first(),
      'spec 9.1: every capture creates the task with the entry defaults of 9.3 for ' +
        'where it stands, and Today\'s default is a Today membership; the original ' +
        'fault was a task made on Today never appearing on Today (DES-182)',
    ).toBeVisible()
  })

  test('AC-221: board view renders no floating add button', async ({ page }) => {
    await expect(
      floatingAddButton(page),
      'spec 9.1: Today is one of the three pages carrying the floating "Add task" ' +
        'button in list view, the fixture for the absence asserted next',
    ).toBeVisible()
    await boardGroupedByFolder(page)
    await expect(
      floatingAddButton(page),
      'spec 9.1: in board view every column captures and the floating button is ' +
        'absent; a board with per-column capture does not need it (DES-182, Imran\'s ' +
        'own observation)',
    ).toHaveCount(0)
  })
})

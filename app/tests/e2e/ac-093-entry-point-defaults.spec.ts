/*
AC-093: given the form opened from each of the six entry points of 9.3, then
the defaults match the table in all six cases.

The table has six rows and eight distinct openings, because its first row
names three ("Tasks, All, or bare button") and its calendar row names a
click on a cell rather than a button. Each opening is asserted here against
all three columns the table fills, due date, important and folder, not
against the one column that differs from its neighbours: a form that
defaulted every page to today would satisfy My Day and Planned and fail
Tasks, and a form that read important from the page would satisfy Important
alone. The three columns together are what make the six rows six.

**One cell of the table cannot be asserted and is escalated rather than
guessed.** The folder page's due date is "per that folder's section
context", and the floating add button of 9.1 sits on the page rather than in
a section, so the table states no value for the opening this criterion
names. The two columns that row does determine, important off and the
folder being that folder, are asserted below; the third is left to the
Steward with a recommendation, and no test here invents a value for it.

**The calendar cell's date is chosen so it cannot collide.** The cell clicked
is the fifteenth of next month, reached with the "next" control 9.5 gives
the calendar. Every seeded row is dated today, tomorrow or a week out, and
the fifteenth of next month is at least fifteen days away, so the cell is
empty whatever day this suite runs on; 9.5 opens the form only from an
empty cell, a click on a row opening that row instead.

**Inbox is asserted by name, which is what the table says.** The table's
folder column reads "Inbox" for five of its six rows, and Inbox is 4.3's
default folder rather than a folder called Inbox: the seeded viewer's
default is named Inbox, so the two agree here and the assertion is on the
name the table writes.

Spec: 9.3 (the entry-point table, the More options expander), 9.1 (the
floating add button, the route table), 9.5 (the calendar's mode toggle, its
next control, the click on an empty cell), 4.3.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  fieldDisplay,
  fieldValue,
  firstOfMonth,
  floatingAddButton,
  formField,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The fifteenth of next month, the empty cell the calendar case clicks. */
const CELL_DATE = `${firstOfMonth(1).slice(0, 8)}15`

interface Expected {
  readonly dueDate: string
  readonly important: boolean
  readonly folder: string
}

async function expectDefaults(
  page: Page,
  where: string,
  expected: Expected,
): Promise<void> {
  // Folder and assignee live behind the expander (9.3), so it is opened
  // before the folder column is read. The other two columns are always
  // visible fields and are read either way.
  await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

  expect(
    await fieldValue(formField(page, 'due date')),
    `spec 9.3 entry-point defaults, opened from ${where}: due date`,
  ).toBe(expected.dueDate)

  const important = formField(page, 'important')
  if (expected.important) {
    await expect(
      important,
      `spec 9.3 entry-point defaults, opened from ${where}: important is on`,
    ).toBeChecked()
  } else {
    await expect(
      important,
      `spec 9.3 entry-point defaults, opened from ${where}: important is off`,
    ).not.toBeChecked()
  }

  expect(
    await fieldDisplay(formField(page, 'folder')),
    `spec 9.3 entry-point defaults, opened from ${where}: folder`,
  ).toContain(expected.folder)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-093: the six entry points of 9.3', () => {
  test('AC-093: Tasks, All and the bare button open with no date, important off, Inbox', async ({
    page,
  }) => {
    // Row one of the table names three openings and gives them one set of
    // defaults, so both addressable ones are asserted: an implementation
    // keying the defaults off the page rather than off the row would pass
    // one of them.
    //
    // The third, "bare button", is asserted through these two rather than on
    // a page of its own. 9.1 puts the floating add button on every page
    // except Done, and every page that carries it either has its own row in
    // this table or is one of these two, so there is no opening the phrase
    // names that is distinct from what is asserted here. Guessing at one,
    // Settings say, would assert a control 9.1 does not clearly put there.
    for (const [where, path] of [
      ['Tasks', routes.tasks],
      ['All', routes.all],
    ] as const) {
      await page.goto(path)
      await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
      await expectDefaults(page, where, { dueDate: '', important: false, folder: 'Inbox' })
    }
  })

  test('AC-093: My Day opens with today', async ({ page }) => {
    await page.goto(routes.myDay)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    await expectDefaults(page, 'My Day', {
      dueDate: seedDate(0),
      important: false,
      folder: 'Inbox',
    })
  })

  test('AC-093: the Planned list opens with today', async ({ page }) => {
    await page.goto(routes.planned)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    await expectDefaults(page, 'the Planned list', {
      dueDate: seedDate(0),
      important: false,
      folder: 'Inbox',
    })
  })

  test('AC-093: a Planned calendar cell opens with that cell\'s date', async ({ page }) => {
    await page.goto(routes.planned)
    // 9.5's mode toggle. The mode is persisted per user client-side, so this
    // click may be a no-op on a later run and the assertion below is what
    // makes the state definite either way.
    await clickControl(
      page.getByRole('button', { name: /^calendar$/i }),
      'spec 9.5: Planned carries a mode toggle between list and calendar',
    )
    await clickControl(
      page.getByRole('button', { name: /^next$/i }),
      'spec 9.5: the calendar carries previous, next and today controls',
    )

    const cell = page.getByRole('gridcell').filter({ hasText: /\b15\b/ }).first()
    await expect(
      cell,
      'spec 9.5: the calendar draws day cells, and the fifteenth of next month is one of ' +
        'them at every zoom this test uses',
    ).toBeVisible()
    await clickControl(
      cell,
      'spec 9.5: the calendar draws day cells, and a click on an empty one opens the form with that date',
    )

    await expectDefaults(page, 'a Planned calendar cell', {
      dueDate: CELL_DATE,
      important: false,
      folder: 'Inbox',
    })
  })

  test('AC-093: Important opens with important on and no date', async ({ page }) => {
    await page.goto(routes.important)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    // The one row of the table whose important column is on, and the one
    // that discriminates an implementation reading the flag from anywhere
    // but the entry point.
    await expectDefaults(page, 'Important', {
      dueDate: '',
      important: true,
      folder: 'Inbox',
    })
  })

  test('AC-093: a folder page opens with that folder', async ({ page }) => {
    await page.goto(routes.folder(seedIds.groceries))
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

    expect(
      await fieldDisplay(formField(page, 'folder')),
      'spec 9.3 entry-point defaults, opened from a folder page: the folder column reads ' +
        '"that folder", which is the seeded shared folder this page is',
    ).toContain('Groceries')
    await expect(
      formField(page, 'important'),
      'spec 9.3 entry-point defaults, opened from a folder page: important is off',
    ).not.toBeChecked()

    // The due date of this row is "per that folder's section context" and
    // the floating add button belongs to no section, so the table states no
    // value for this opening. Escalated to the Integration Steward rather
    // than asserted; nothing is asserted here that the specification does
    // not say.
  })
})

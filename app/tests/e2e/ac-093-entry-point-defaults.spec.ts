/*
AC-093: given the capture points of 9.3's entry table, when a task is created
from each, then it carries exactly that row's defaults: Desk and undated from
Desk, All, or the bare control; a Today membership and today's date from
Today; today's date from the Scheduled list; the cell's date from a calendar
cell; important from Important; assigned to the viewer from Assignments; the
folder from a folder page's loose block; the folder and section from a
section's capture; and the column's value from any board column.

Replaced by RFC 0005, Accepted 2026-08-24. The sentence above is that RFC's
Replace unit transcribed unchanged, and it becomes section 12's own text when
the delta folds; until then a reader comparing the two reads the RFC as the
authority, which is what change control means. The v1 text this replaces
named six openings; the v2 table names nine, because DES-152 gave every page
a spine and 9.3 derives each row's defaults from the spine of the page the
task was made on, "so a made task appears where it was made".

**Reworked onto the v2 surfaces on 2026-08-24, with the twenty Imran ruled
on.** This file was not on that list: S9 enumerated the failures it had
diagnosed and the enumeration was short. Four of its cases were red for two
of the same causes, /app/tasks and /app/planned redirecting and the floating
add button leaving every page with a capture affordance of its own, and it is
reworked here because leaving it would carry a knowingly red criterion
through a merge.

**Six of the nine rows are asserted and three are not, and the three are
named rather than skipped.** A capture point can only be measured where it
exists, and the pages that hold these three arrive with later packages:

- **All's undated capture.** 9.5 makes All "Q5's union rendered whole", and
  9.1's regions table gives it "its two halves' regions as their home pages
  define them", so the region the undated capture sits in is one S10 renames
  when it redraws that page. Addressing it by the name the v1 page happens to
  use today would be asserting the implementation, which 9.1's addressing
  paragraph exists to forbid.
- **Assignments, and any board column.** Neither surface exists: S10 lands
  the place pages and their views. AC-221 already reads the board column's
  capture, and reads it against the sharper case, a task made on Today from a
  column that must then appear on Today.
- **A section's capture, and Today's membership.** A folder page's sections
  are 4.17 page blocks, which S12 lands; and Today's row asks for a Today
  entry as well as today's date, which is the membership half AC-221 states
  and which the shell deliberately does not write, the page's spine being
  S10's. So the Today case below asserts the date and says what it is not
  asserting.

That leaves this criterion owing four assertions to two packages. It is
recorded in RFC 0005's change control item 8 as well as here, because a
coverage gap that lives only in a comment is a gap the next session does not
know it inherited.

**"The bare control" has no opening in v2 and that is not an omission.** v1's
phrase meant the floating add button on a page with no row of its own, and
9.1 now leaves that button on exactly three pages, each of which has a row in
this table. The strip's own "+" is not a capture: 9.1 gives it "opens any
shelf or folder as a tab, or begins New folder, New shelf, or Import". So the
phrase is satisfied by Desk's row rather than by a control this file would
have to guess at.

**All three columns are asserted for every row, which is what makes the rows
distinct.** A form that defaulted every page to today satisfies Today and
Scheduled and fails Desk; a form reading important from anywhere but the
entry point satisfies five rows and fails Important. Neither is visible to a
case that checks only the column its row differs on.

**The calendar cell's date is chosen so it cannot collide.** The cell clicked
is the fifteenth of next month, reached with the "next" control 9.5 gives the
calendar. Every seeded row is dated today, tomorrow or a week out, so that
cell is empty whatever day this suite runs on; 9.5 opens the form only from an
empty cell, a click on a row opening that row instead.

**Desk is asserted by the name the seed gives it.** 4.3's default folder is
named Desk for accounts created since RFC 0005 and the migration renamed the
defaults that still read Inbox; this seed's row was written as Inbox and kept
it, so the string asserted is the fixture's rather than the section's, and
what the row fixes is that the folder is the viewer's default one.

Spec: 9.3 (the v2 entry table, the field rules, the More options expander),
9.1 (the v2 capture rule, the floating add button, the quick-add and its two
states, its escalation control, the v2 route table), 9.5 (Scheduled's
calendar, its mode toggle, its next control, the click on an empty cell),
9.6 (the folder page's loose block and its quick-add), 4.3, AC-221 (the
board column and Today's membership).
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
  quickAddControl,
  routesV2,
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
    "spec 9.3: seven of the form's ten fields sit behind one expander, and the section " +
      'names it "More options"',
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

/**
 * Opens the full form from a page's own quick-add, which since 9.1's v2
 * capture rule is how every page but Today, Important and Assignments is
 * captured into.
 *
 * The escalation control is reached inside the opened quick-add rather than
 * beside it, the quick-add being a disclosure: the collapsed control is
 * activated first, and the escalation control exists only in the state that
 * activation produces.
 */
async function openFromQuickAdd(page: Page): Promise<void> {
  await clickControl(
    quickAddControl(page).first(),
    'spec 9.1: a page with a capture point of its own carries the inline quick-add, ' +
      'collapsed to a single control named "Add a task"',
  )
  await clickControl(
    page.getByRole('button', { name: 'Open full form', exact: true }),
    'spec 9.1: the expanded quick-add carries "an escalation control opening the full task ' +
      'form at the same entry point". A fixed string rather than one interpolating the ' +
      'folder, because the region rule is what tells two instances apart',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-093: the entry table of 9.3', () => {
  test('AC-093: Desk opens with no date, important off, and Desk', async ({ page }) => {
    // Row one. Desk is the account's default folder drawn as a folder page,
    // so its capture is that page's loose block, and the row's two values
    // are the two a folder holding dated and undated work at once can
    // honestly offer: its own folder, and no date.
    await page.goto(routesV2.desk)
    await openFromQuickAdd(page)
    await expectDefaults(page, 'Desk', { dueDate: '', important: false, folder: 'Inbox' })
  })

  test('AC-093: Today opens with today', async ({ page }) => {
    await page.goto(routesV2.today)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and Today is the first of the three pages that section leaves it on',
    )
    // The date half of this row. The membership half, "a Today membership",
    // is the page's spine and arrives with S10; AC-221 is the criterion that
    // reads it, against the sharper case of a task made on Today that must
    // then appear on Today.
    await expectDefaults(page, 'Today', {
      dueDate: seedDate(0),
      important: false,
      folder: 'Inbox',
    })
  })

  test('AC-093: the Scheduled list opens with today', async ({ page }) => {
    await page.goto(routesV2.scheduled)
    await openFromQuickAdd(page)
    await expectDefaults(page, 'the Scheduled list', {
      dueDate: seedDate(0),
      important: false,
      folder: 'Inbox',
    })
  })

  test("AC-093: a calendar cell opens with that cell's date", async ({ page }) => {
    await page.goto(routesV2.scheduled)
    // 9.5's mode toggle. The mode is persisted per user client-side, so this
    // click may be a no-op on a later run and the assertion below is what
    // makes the state definite either way.
    await clickControl(
      page.getByRole('button', { name: /^calendar$/i }),
      'spec 9.5: Scheduled is the one page that offers the calendar, because having a date ' +
        'is what puts a task on it',
    )
    await clickControl(
      page.getByRole('button', { name: /^next$/i }),
      'spec 9.5: the calendar carries previous, next and today controls',
    )

    const cell = page.getByRole('gridcell').filter({ hasText: /\b15\b/ }).first()
    await expect(
      cell,
      "spec 9.1's roles table: a calendar day is a grid cell within a grid, and the fifteenth " +
        'of next month is one of them at the month zoom this case uses',
    ).toBeVisible()
    await clickControl(
      cell,
      'spec 9.5: a click on an empty day cell opens the form with that date',
    )

    await expectDefaults(page, 'a calendar cell', {
      dueDate: CELL_DATE,
      important: false,
      folder: 'Inbox',
    })
  })

  test('AC-093: Important opens with important on and no date', async ({ page }) => {
    await page.goto(routesV2.important)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and Important is one of the three pages that section leaves it on',
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

  test("AC-093: a folder page's loose block opens with that folder and no date", async ({
    page,
  }) => {
    await page.goto(routesV2.folder(seedIds.groceries))
    await openFromQuickAdd(page)

    // All three columns, the same as every other row above. The due date is
    // empty because a folder holds dated and undated tasks at once, and
    // clearing a date that was added for you costs more than adding one that
    // was not. Asserted on a folder that is not Desk, so that the row is
    // about the page's own folder rather than about the default one every
    // other row here also lands in.
    await expectDefaults(page, "a folder page's loose block", {
      dueDate: '',
      important: false,
      folder: 'Groceries',
    })
  })
})

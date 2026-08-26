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

**Reworked again onto 9.3's v2 card at S15 (items 15, 19 and 20), and this
one changes what is read rather than only where.** The v1 file opened the
form, expanded it, and read three of its fields, because on that surface the
defaults were a draft's and no row existed yet. 9.3's v2 opening removes the
draft, and 9.1's capture rule says what happens instead in as many words:
"every capture creates the task with the entry defaults of 9.3 for where it
stands". 9.5's calendar bullet says it again for its own cell, "empty cell
creates with that date".

**So the row is what carries the defaults, and the row is what this file now
reads.** That is the criterion's own sentence followed rather than departed
from: it says "when a task is created from each, then **it** carries exactly
that row's defaults", and "it" is the task. Reading frozen 7.2 instead of the
surface is also strictly more discriminating, because a client that painted
the right defaults on the card and posted different ones satisfied every
assertion the v1 file made and none of these. The formatting question that
made the v1 read exact and a chip read approximate does not arise at all: a
stored `due_date` is 4.11's civil date, character for character.

**Seven of the nine rows are asserted and two are not, and the two are named
rather than skipped.** A capture point can only be measured where it exists:

- **All's undated capture is asserted since S10**, which is what the row was
  waiting for. 9.5 makes All "Q5's union rendered whole", and 9.1's regions
  table gives it "its two halves' regions as their home pages define them";
  the home page of the undated half is Anytime since RFC 0005 renamed it, so
  S10's redraw named the region and the case below addresses it by that name.
- **Assignments, and any board column.** AC-221 reads the board column's
  capture, and reads it against the sharper case, a task made on Today from a
  column that must then appear on Today; Assignments' own capture is the
  floating button, and 9.5 gives that page's row its own sentence, "Capture
  assigns the viewer", which is AC-221's neighbour rather than this file's
  third column.
- **A section's capture, and Today's membership.** A folder page's sections
  are 4.17 page blocks, whose `section_block_id` on the folder read is
  approved under change control item 19 and not yet written, so the arm stays
  owed; and Today's row asks for a Today entry as well as today's date, which
  is the membership half AC-221 states and asserts. So the Today case below
  asserts the date and says what it is not asserting.

That leaves this criterion owing the section's capture. It is recorded in RFC
0005's change control as well as here, because a coverage gap that lives only
in a comment is a gap the next session does not know it inherited.

**The S10 boundary flag stands.** All's arm was written by S10 rather than by
the criteria package, on Imran's instruction of 2026-08-25, and the same flag
row 10 of the session log carries for the browser half of S1 applies: protocol
section 8 gives the acceptance tests to persona 11, the instruction was to
close All's arm with the surface that makes it assertable, and this file
records who wrote it. S15 reworked it onto the v2 capture with the other six.

**"The bare control" has no opening in v2 and that is not an omission.** v1's
phrase meant the floating add button on a page with no row of its own, and
9.1 now leaves that button on exactly three pages, each of which has a row in
this table. The strip's own "+" is not a capture: 9.1 gives it "opens any
shelf or folder as a tab, or begins New folder, New shelf, or Import". So the
phrase is satisfied by Desk's row rather than by a control this file would
have to guess at.

**All three columns are asserted for every row, which is what makes the rows
distinct.** A client that defaulted every page to today satisfies Today and
Scheduled and fails Desk; one reading important from anywhere but the entry
point satisfies five rows and fails Important. Neither is visible to a case
that checks only the column its row differs on.

**The calendar cell's date is chosen so it cannot collide.** The cell clicked
is the fifteenth of next month, reached with the "next" control 9.5 gives the
calendar. Every seeded row is dated today, tomorrow or a week out, so that
cell is empty whatever day this suite runs on; 9.5 creates from an empty cell,
a click on a row opening that row instead.

**Desk is asserted as the account's default folder rather than by a name.**
4.3's default folder is named Desk for accounts created since RFC 0005 and
the migration renamed the defaults that still read Inbox; this seed's row was
written as Inbox and kept it. Reading the stored `folder_id` rather than a
rendered name takes the question away entirely: what the row fixes is that
the folder is the viewer's default one, and the seed says which id that is.

Spec: 9.3 (the v2 entry table and the v2 field rules), 9.1 (the v2 capture
rule, the floating add button, the quick-add and its two states, the v2 route
table), 9.5 (Scheduled's calendar, its mode toggle, its next control, the
empty cell that creates, and Assignments' capture), 9.6 (the folder page's
loose block and its quick-add), frozen 7.2 and 7.0 (the stored row this file
reads), 4.3, AC-221 (the board column and Today's membership).
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  findTaskId,
  firstOfMonth,
  floatingAddButton,
  formField,
  quickAddControl,
  quickAddInput,
  regionOf,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskSurface,
  watchCommit,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The fifteenth of next month, the empty cell the calendar case clicks. */
const CELL_DATE = `${firstOfMonth(1).slice(0, 8)}15`

/** The three columns of 9.3's entry table this file reads, as 7.2 stores them. */
interface Expected {
  readonly dueDate: string | null
  readonly important: boolean
  readonly folderId: string
}

/** The fields of frozen 7.2 the entry table decides. */
interface StoredDefaults {
  due_date: string | null
  important: boolean
  folder_id: string
}

async function expectDefaults(
  page: Page,
  where: string,
  title: string,
  expected: Expected,
): Promise<void> {
  const id = await findTaskId(page, title)
  const response = await page.request.get(`/api/v1/tasks/${id}`)
  expect(
    response.status(),
    `GET /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  const stored = (await response.json()) as StoredDefaults

  expect(
    stored.due_date,
    `spec 9.3 entry-point defaults, captured from ${where}: due date. Read off the stored row ` +
      'rather than off the surface, because 9.1 makes the capture the creation and the ' +
      "criterion's own sentence is about what the task carries",
  ).toBe(expected.dueDate)
  expect(
    stored.important,
    `spec 9.3 entry-point defaults, captured from ${where}: important`,
  ).toBe(expected.important)
  expect(
    stored.folder_id,
    `spec 9.3 entry-point defaults, captured from ${where}: folder`,
  ).toBe(expected.folderId)
}

/**
 * Captures a task through a page's own quick-add row, which since 9.1's v2
 * capture rule is how every page but Today, Important and Assignments is
 * captured into.
 *
 * The row is a disclosure: the collapsed control is activated first, and the
 * text box exists only in the state that activation produces. Enter is what
 * commits it, which is the same gesture AC-221 drives on a board column.
 */
async function captureFromQuickAdd(
  page: Page,
  title: string,
  within?: Locator,
): Promise<void> {
  const scope = within ?? page
  await clickControl(
    quickAddControl(scope).first(),
    'spec 9.1: a page with a capture point of its own carries the inline quick-add, ' +
      'collapsed to a single control named "Add a task"',
  )
  const box = within === undefined ? quickAddInput(page).first() : within.getByRole('textbox', { name: 'Add a task', exact: true })
  const commit = watchCommit(page)
  await box.fill(title)
  await page.keyboard.press('Enter')
  await commit.settled(
    'spec 9.1: "every capture creates the task with the entry defaults of 9.3 for where it ' +
      'stands", so the capture is a write and this case waits for it before reading the row',
  )
}

/**
 * Names a task the surface has just been opened on, and waits for the name to
 * reach the server.
 *
 * The two capture points with no quick-add row of their own, the floating
 * button and the calendar's empty cell, create and then open (9.1's capture
 * rule and 9.5's "empty cell creates with that date"), so the title is
 * answered on the card the way every other field is. Leaving the field is
 * what finishes an edit made in place, which AC-161 states and asserts.
 */
async function nameTheCaptured(page: Page, title: string): Promise<void> {
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the captured task opens on its surface, a dialog when opened " +
      'as one',
  ).toBeVisible()
  const commit = watchCommit(page)
  await formField(page, 'title').fill(title)
  await formField(page, 'title').blur()
  await commit.settled(
    'spec 9.3: the title is editable in place and commits as it is made, so it is on the ' +
      'server before the row is looked for by it',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-093: the entry table of 9.3', () => {
  test('AC-093: Desk captures undated, important off, and into Desk', async ({ page }) => {
    // Row one. Desk is the account's default folder drawn as a folder page,
    // so its capture is that page's loose block, and the row's two values
    // are the two a folder holding dated and undated work at once can
    // honestly offer: its own folder, and no date.
    const title = caseTitle('ac-093 from Desk')
    await page.goto(routesV2.desk)
    await captureFromQuickAdd(page, title)
    await expectDefaults(page, 'Desk', title, {
      dueDate: null,
      important: false,
      folderId: seedIds.hassanInbox,
    })
  })

  test('AC-093: Today captures with today', async ({ page }) => {
    const title = caseTitle('ac-093 from Today')
    await page.goto(routesV2.today)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button is a capture point, and Today is the first of the ' +
        'three pages that section leaves it on',
    )
    await nameTheCaptured(page, title)
    // The date half of this row. The membership half, "a Today membership",
    // is the page's spine; AC-221 is the criterion that reads it, against the
    // sharper case of a task made on Today that must then appear on Today.
    await expectDefaults(page, 'Today', title, {
      dueDate: seedDate(0),
      important: false,
      folderId: seedIds.hassanInbox,
    })
  })

  test('AC-093: the Scheduled list captures with today', async ({ page }) => {
    const title = caseTitle('ac-093 from Scheduled')
    await page.goto(routesV2.scheduled)
    await captureFromQuickAdd(page, title)
    await expectDefaults(page, 'the Scheduled list', title, {
      dueDate: seedDate(0),
      important: false,
      folderId: seedIds.hassanInbox,
    })
  })

  test("AC-093: a calendar cell captures with that cell's date", async ({ page }) => {
    const title = caseTitle('ac-093 from a calendar cell')
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
      'spec 9.5: "empty cell creates with that date"',
    )

    await nameTheCaptured(page, title)
    await expectDefaults(page, 'a calendar cell', title, {
      dueDate: CELL_DATE,
      important: false,
      folderId: seedIds.hassanInbox,
    })
  })

  test('AC-093: Important captures with important on and no date', async ({ page }) => {
    const title = caseTitle('ac-093 from Important')
    await page.goto(routesV2.important)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button is a capture point, and Important is one of the ' +
        'three pages that section leaves it on',
    )
    await nameTheCaptured(page, title)
    // The one row of the table whose important column is on, and the one
    // that discriminates a client reading the flag from anywhere but the
    // entry point.
    await expectDefaults(page, 'Important', title, {
      dueDate: null,
      important: true,
      folderId: seedIds.hassanInbox,
    })
  })

  test("AC-093: All's undated capture is undated and into Desk", async ({ page }) => {
    // The row this criterion has owed since the twenty-criteria rework, and it
    // was owed to S10 rather than skipped: 9.1 gives All "its two halves' regions
    // as their home pages define them", and the home page of the undated half is
    // Anytime since RFC 0005 renamed it. Addressing the capture by the name the
    // v1 page happened to use would have been asserting the implementation, which
    // 9.1's addressing paragraph forbids; addressing it by the section's own name
    // is what the rename made possible.
    const title = caseTitle('ac-093 from All')
    await page.goto(routesV2.all)
    await captureFromQuickAdd(page, title, regionOf(page, 'Anytime'))
    await expectDefaults(page, "All's undated capture", title, {
      dueDate: null,
      important: false,
      folderId: seedIds.hassanInbox,
    })
  })

  test("AC-093: a folder page's loose block captures into that folder, undated", async ({
    page,
  }) => {
    const title = caseTitle('ac-093 from a folder page')
    await page.goto(routesV2.folder(seedIds.groceries))
    await captureFromQuickAdd(page, title)

    // All three columns, the same as every other row above. The due date is
    // empty because a folder holds dated and undated tasks at once, and
    // clearing a date that was added for you costs more than adding one that
    // was not. Asserted on a folder that is not Desk, so that the row is
    // about the page's own folder rather than about the default one every
    // other row here also lands in.
    await expectDefaults(page, "a folder page's loose block", title, {
      dueDate: null,
      important: false,
      folderId: seedIds.groceries,
    })
  })
})

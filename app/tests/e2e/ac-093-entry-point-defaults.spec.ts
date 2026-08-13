/*
AC-093: given the task form opened from each of My Day, the Planned list, a
Planned calendar cell, Important, a folder page and the bare add button, then
its due date, important and folder fields hold exactly the values 9.3's
entry-point table gives that row, the calendar cell contributing its own date
and the folder page contributing that folder with an empty due date whether
the form was opened from its quick-add or from the floating button.

Rewritten by RFC 0002, Accepted 2026-08-13, which replaces this criterion's
text rather than deleting it. The sentence above is that RFC's Replace unit
transcribed unchanged, and it becomes section 12's own text when the delta
merges. What moved is the sixth row of 9.3's table: it read "per that
folder's section context", and 9.6 now carries one open list instead of the
Scheduled and Unscheduled sections that were the context, so the cell states
its value outright. The value is the one the earlier ruling had already given
that page's floating button, empty, for a reason the restructuring leaves
intact: a folder holds dated and undated tasks at once, so defaulting to
today would file a task under a date nobody aimed at.

**All three columns are asserted for every row, which is what makes the six
rows six.** A form that defaulted every page to today satisfies My Day and
Planned and fails Tasks; a form reading important from anywhere but the entry
point satisfies five rows and fails Important. Neither is visible to a case
that checks only the column its row differs on.

**The calendar cell's date is chosen so it cannot collide.** The cell clicked
is the fifteenth of next month, reached with the "next" control 9.5 gives the
calendar. Every seeded row is dated today, tomorrow or a week out, so that
cell is empty whatever day this suite runs on; 9.5 opens the form only from an
empty cell, a click on a row opening that row instead.

**Inbox is asserted by name, which is what the table says.** Five of the six
rows read "Inbox", and Inbox is 4.3's default folder rather than a folder
called Inbox: the seeded viewer's default is named Inbox, so the two agree
here and the assertion is on the name the table writes.

**The quick-add arm of the sixth row is asserted, and the escalation that
held it back is answered.** This criterion requires the form opened from the
folder page's quick-add as well as from its floating button, and the case was
missing because 9.1's amended quick-add bullet gave the expanded row "an
escalation control opening the full task form at the same entry point"
without naming it: the only ways to reach an unnamed control are by its
position or by a string the specification does not carry, and 9.1's addressing
paragraph forbids both. The P8R mid-package change control of 2026-08-13
answered it, on this role's own escalation, with the row `The quick-add's
escalation control (9.1) | "Open full form"`, and the owner re-accepted the
same day. So the sixth case below opens the form the way that row now says,
and this criterion asserts every opening its sentence names rather than five
of six.

The control is reached inside the opened quick-add rather than beside it,
because the quick-add is a disclosure since the same change control: the
collapsed control is activated first, and the escalation control exists only
in the state that activation produces. 9.1's paragraph explains why the name
is its own rather than "More options": the two are alternatives at the same
instant, the form's expander sitting on the page behind the dialog's scrim
while the form is open, so a page can hold both.

Spec: 9.3 (the entry-point table as RFC 0002 amends it, the More options
expander), 9.1 (the floating add button, the quick-add and its two states,
its escalation control, the route table), 9.5 (the calendar's mode toggle,
its next control, the click on an empty cell), 9.6 (the single open list this
row now reads against), 4.3.
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
        'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
          'of 9.3, and it is on every page except Done',
      )
      await expectDefaults(page, where, { dueDate: '', important: false, folder: 'Inbox' })
    }
  })

  test('AC-093: My Day opens with today', async ({ page }) => {
    await page.goto(routes.myDay)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and it is on every page except Done',
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
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and it is on every page except Done',
    )
    await expectDefaults(page, 'the Planned list', {
      dueDate: seedDate(0),
      important: false,
      folder: 'Inbox',
    })
  })

  test("AC-093: a Planned calendar cell opens with that cell's date", async ({ page }) => {
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
      "spec 9.1's roles table: a calendar day is a grid cell within a grid, and the fifteenth " +
        'of next month is one of them at the month zoom this case uses',
    ).toBeVisible()
    await clickControl(
      cell,
      'spec 9.5: a click on an empty day cell opens the form with that date',
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
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and it is on every page except Done',
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

  test("AC-093: a folder page's floating button opens with that folder and no date", async ({
    page,
  }) => {
    await page.goto(routes.folder(seedIds.groceries))
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3, and it is on every page except Done',
    )

    // All three columns, the same as every other row above. The due date is
    // empty because 9.3 says so as RFC 0002 restates it: 9.6 now carries one
    // open list, so there is no section context left to read and the cell
    // states its value. Empty rather than today because a folder holds dated
    // and undated tasks at once, and clearing a date that was added for you
    // costs more than adding one that was not.
    await expectDefaults(page, "a folder page's floating button", {
      dueDate: '',
      important: false,
      folder: 'Groceries',
    })
  })

  test("AC-093: a folder page's quick-add opens with that folder and no date", async ({
    page,
  }) => {
    await page.goto(routes.folder(seedIds.groceries))

    // The other opening of the sixth row, which this criterion's own sentence
    // requires: "whether the form was opened from its quick-add or from the
    // floating button". The two arms are asserted separately because they are
    // two code paths to one set of defaults, and an implementation that reads
    // the entry point off the page for one and off the control for the other
    // passes whichever of them a single case happened to choose.
    await clickControl(
      quickAddControl(page).first(),
      'spec 9.1: the inline quick-add is collapsed to a single control named "Add a task", and ' +
        '9.6 gives this page one open list and therefore one quick-add rather than two',
    )
    await clickControl(
      page.getByRole('button', { name: 'Open full form', exact: true }),
      'spec 9.1: the expanded quick-add carries "an escalation control opening the full task ' +
        'form at the same entry point", named "Open full form" by that section\'s names table ' +
        'at the P8R change control on 2026-08-13. A fixed string rather than one interpolating ' +
        'the folder, that section says, because the region rule is what tells two instances ' +
        'apart',
    )

    // The same three columns and the same values as the arm above, which is
    // what "at the same entry point" means: the opening changes and the row
    // does not.
    await expectDefaults(page, "a folder page's quick-add", {
      dueDate: '',
      important: false,
      folder: 'Groceries',
    })
  })
})

/*
AC-177: given the Planned calendar's month zoom, then its days are grid cells
within a grid, the grid holds six weeks beginning on Monday, and a day
holding more rows than its cell renders shows a "+N more" control that
reveals the remainder.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

This is the criterion that pays for removing FullCalendar. 11.4 now says the
grid is Dana's own, built from the designer's prototype, and the RFC's own
alternatives section names what that gives up: the library's accessibility
and keyboard handling in the grid, which is now ours to hold. 9.1's roles
table fixes the grid cell for exactly that reason, and this is what makes the
fixing observable. Measured on 2026-08-13 against the running prototype: no
role="grid", no gridcell, no row, no columnheader and no table anywhere in
its month grid, which is composed of plain elements.

**Three criteria already address grid cells and none of them assert the
grid.** AC-093's calendar row, AC-098 and AC-158 each reach for a gridcell
and would each fail if the roles went, but every one of them would fail
saying it could not find a cell rather than saying the grid is gone; and none
of them reads the grid's shape at all. So the roles are asserted here as the
thing itself.

**Six weeks is asserted as forty-two cells.** 9.5 fixes the month zoom at six
weeks and 11.4 repeats it, and the count is not a convenience: AC-082's third
clause, that ghosts appear only after the current occurrence, is positively
observable only on a grid reaching past the month end. A grid that renders
the four or five weeks a month strictly needs hides the next occurrence of
every series whose successor lands in the first days of the following month,
which is the case the ghost exists to show.

**Monday is asserted on the first column header.** 9.5 says weeks begin on
Monday, the week start having been left to the designer and answered by him.
Among the seven English day names only Monday begins with M, so the assertion
holds whether the design writes "Monday", "Mon" or "M", and the browser's
locale is pinned so that "begins with M" is a statement about this design
rather than about the machine the suite runs on.

**The overflow control is asserted to reveal, not merely to appear.** 9.5
gives the reason the control exists at all: the grid's constant height is
what makes it necessary, a cell that grew to fit its contents being the thing
that height forbids. A control that renders "+9 more" and does nothing leaves
those nine tasks unreachable from the page whose job is to show them, and it
satisfies every assertion that only looks for the string.

**Twelve rows on one day, which no cell renders whole.** The number is chosen
to exceed any cell a six-week grid can give a day at a normal window size,
because how many rows fit is the implementer's and the criterion turns on
there being more than fit.

Spec: 9.5 (the month zoom's six weeks, Monday, the "+N more" control and why
it exists), 9.1 (the roles table's grid cell, the routes table), 11.4 (the
calendar is Dana's own), 6 Q3C, AC-082.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  firstOfMonth,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

// The locale is pinned beside the timezone so that "the first column header
// begins with M" is a statement about this design and not about the machine,
// whose own locale is French.
test.use({ timezoneId: 'UTC', locale: 'en-US', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Six weeks of days. 9.5 fixes the count and 11.4 repeats it. */
const CELLS = 42
/** More rows than a day cell of a fixed six-week grid can render. */
const CROWD = 12
/** The tenth of next month: far from every seeded row, and never week one. */
const CROWDED_DAY = `${firstOfMonth(1).slice(0, 8)}10`

/** Opens Planned in its calendar mode at the month zoom. */
async function openMonth(page: Page): Promise<void> {
  await page.goto(routes.planned)
  // The mode is persisted per user client-side (9.5), so this may be a no-op
  // on a later run; the assertions below are what make the state definite.
  await clickControl(
    page.getByRole('button', { name: /^calendar$/i }),
    'spec 9.5: Planned carries a mode toggle between list and calendar',
  )
  await clickControl(
    page.getByRole('button', { name: /^month$/i }),
    'spec 9.5: the calendar carries day, week and month zooms',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-177: the calendar month zoom', () => {
  test('AC-177: its days are grid cells within a grid', async ({ page }) => {
    await openMonth(page)

    const grid = page.getByRole('grid')
    await expect(
      grid,
      "spec 9.1's roles table: a calendar day is a grid cell within a grid, on the ground that " +
        "9.5's month zoom is a fixed six-week grid of days, which is a grid. The markup this " +
        'package adopts composes its month from plain elements with no grid role anywhere, ' +
        'which is why the table was written and why this is asserted by number. 11.4 makes the ' +
        "grid Dana's own now, so the library's accessibility is not there to fall back on",
    ).toHaveCount(1)
    await expect(
      grid.getByRole('gridcell'),
      'spec 9.1: the day cells are inside the grid rather than beside it. A page carrying a ' +
        'grid somewhere and cells somewhere else announces neither',
    ).toHaveCount(CELLS)
  })

  test('AC-177: the grid holds six weeks beginning on Monday', async ({ page }) => {
    await openMonth(page)

    await expect(
      page.getByRole('gridcell'),
      'spec 9.5 and 11.4: the month zoom is a fixed six-week grid, which is forty-two days. ' +
        'The count is fixed rather than the four or five a month strictly needs because ' +
        "AC-082's ghost clause is positively observable only on a grid reaching past the month " +
        'end, and because a constant height is what 9.5 asks the layout for',
    ).toHaveCount(CELLS)

    const headers = page.getByRole('columnheader')
    await expect(
      headers,
      'spec 9.5: a week of day columns, which a grid names with column headers',
    ).toHaveCount(7)
    await expect(
      headers.first(),
      'spec 9.5: weeks begin on Monday, the week start having been left to the designer there ' +
        'and answered by him. Among the seven English day names only Monday begins with M, so ' +
        'this holds whether the design writes "Monday", "Mon" or "M", and the locale is pinned ' +
        'so that the sentence is about the design rather than about this machine',
    ).toHaveText(/^\s*M/i)
  })

  test('AC-177: a crowded day carries "+N more" and it reveals the remainder', async ({
    page,
  }) => {
    const titles: string[] = []
    for (let i = 0; i < CROWD; i += 1) {
      const title = `ac-177 crowded ${i}`
      titles.push(title)
      await createTask(page, {
        title,
        folder_id: seedIds.groceries,
        due_date: CROWDED_DAY,
      })
    }

    await openMonth(page)
    await clickControl(
      page.getByRole('button', { name: /^next$/i }),
      'spec 9.5: the calendar carries previous, next and today controls, and the crowded day ' +
        'is in next month so it cannot collide with a seeded row',
    )

    const more = page.getByRole('button', { name: /^\+\d+ more$/ })
    await expect(
      more,
      'spec 9.5: "A day cell showing fewer rows than the day holds carries a control reading ' +
        '\\"+N more\\" for the remainder". Twelve rows on one day of a six-week grid is more ' +
        'than any cell renders, so the control is owed. Its absence means those rows are ' +
        'unreachable from the page whose job is to show them',
    ).toHaveCount(1)

    const before = await page.getByText(/^ac-177 crowded \d+$/).count()
    expect(
      before,
      `spec 9.5: the cell shows what fits, so fewer than the ${CROWD} rows the day holds are ` +
        'on the page before the control is pressed. Without this the assertion below passes ' +
        'against a cell that grew to fit its contents, which is the thing the constant height ' +
        'forbids and the reason the control exists',
    ).toBeLessThan(CROWD)

    await clickControl(more, 'spec 9.5: the "+N more" control reveals the remainder')
    await expect(
      page.getByText(/^ac-177 crowded \d+$/),
      'spec 9.5: pressing it reveals the remainder, so every row the day holds is readable. A ' +
        'control that renders the count and does nothing satisfies every assertion above',
    ).toHaveCount(CROWD)
  })
})

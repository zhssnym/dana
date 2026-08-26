/*
AC-098: given a calendar ghost clicked, then the current occurrence opens
with the upcoming-occurrence banner.

The criterion is one click with two claims behind it, and they fail
independently. Which task opens is the first: a ghost is a projection, not a
row, so there is nothing to open but the series' current occurrence, and an
implementation that treats the ghost as a task of its own opens something
with the ghost's date on it that no endpoint can save. The banner is the
second, and it exists because that opened task shows a date the person did
not click.

**The fixture is a daily rule anchored on the first of next month.** Q3C
projects the rule instances strictly after the task's own due_date,
intersected with the requested range, so a daily rule gives every later day
of that month a ghost and one of them can be named in advance. Next month
rather than this one because every seeded row is dated today, tomorrow or a
week out, so nothing collides with it whatever day this suite runs on.

**Clicking the real row is the control.** 9.5 says a click on any row opens
the task and puts the banner on the ghost path alone, so the same task
opened from its own date must open without it. Without that case, a client
that shows the banner on every recurring task passes the criterion as
written and tells the person something false every time they open a repeat
from its own day.

**Ghost styling is asserted as a comparison, the way AC-097 asserts fading.**
9.5 requires virtual instances to be drawn as ghosts, and a projection
rendered identically to a real row is a calendar that says a task is due on
a day it is not.

**Reworked onto 9.3's v2 card at S15 (items 15 and 19).** Nothing this
criterion asserts moves and its sentence does not move either; what moved is
how the opened task's date is read. v1 opened the "More options" expander and
read the due-date field; 9.3's v2 card puts the date on its header strip as a
chip, so the chip is what answers.

**The chip renders a date rather than holding one, and that changes what this
file may assert.** The v1 field was an `input[type=date]` whose value was the
4.11 civil date character for character, so the assertion could be an
equality against the anchor. A chip shows what a person reads, and section 9
spells no date format anywhere, which AC-178 already records for the history
block: "the format is the design's and this section spells none". So what is
held to here is **which day is named**, the anchor's and not the clicked
ghost's, and that is exactly the discrimination the criterion is for. A
client that made the projection into a task shows the ghost's day, and no
format hides that.

Spec: 9.5 (the calendar's zooms and controls, ghost styling, the click
behaviors and the banner copy), 9.3 (the v2 header strip of chips), 6 Q3C
(real rows, virtual instances, cell order), 8.5 (projection), 4.11.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  computedStyle,
  chipValue,
  createTask,
  firstOfMonth,
  routes,
  seedIds,
  seedSubs,
  signIn,
  taskChip,
  taskSurface,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The base of each case's row title. Every case here creates its own series
 * through beforeEach, and the runner never resets the database between them,
 * so a shared title left three rows on the anchor date and the second and
 * third cases failed on strict mode against a calendar drawing all three
 * correctly. caseTitle tags it per case; the same case's hook and body get
 * the same string, so nothing has to be threaded between them.
 */
const BASE = 'ac-098 daily series'
/** The current occurrence's own date, which draws the one real row. */
const ANCHOR = firstOfMonth(1)
/** A day the rule reaches and the current occurrence does not: a ghost. */
const GHOST_DAY = 5
/** The day of the month the current occurrence is due, which is the 1st. */
const ANCHOR_DAY = Number(ANCHOR.slice(8))

/**
 * What the opened surface says the due date is, as the day it names.
 *
 * A chip renders the date for a reader rather than holding the 4.11 string,
 * and section 9 fixes no format, so the day is the part of it this file can
 * hold an implementation to. That is enough: the two candidates differ by
 * four days, and a client that opened the ghost as a task of its own names
 * the day that was clicked.
 */
async function dueDayShown(page: Page): Promise<string> {
  return chipValue(taskChip(page, 'due date'), 'due date')
}

async function openNextMonthCalendar(page: Page): Promise<void> {
  await page.goto(routes.planned)
  // 9.5's mode toggle. The mode persists per user client-side, so this is
  // asserted into a known state rather than assumed to start in one.
  await clickControl(
    page.getByRole('button', { name: /^calendar$/i }),
    'spec 9.5: Planned carries a mode toggle between list and calendar',
  )
  await expect(
    page.getByRole('button', { name: /^next$/i }),
    'spec 9.5: the calendar carries previous, next and today controls',
  ).toBeVisible()
  await clickControl(
    page.getByRole('button', { name: /^next$/i }),
    'spec 9.5: the calendar carries previous, next and today controls',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await createTask(page, {
    title: caseTitle(BASE),
    folder_id: seedIds.groceries,
    due_date: ANCHOR,
    recurrence_rule: 'FREQ=DAILY',
  })
})

test.describe('AC-098: clicking a calendar ghost', () => {
  test('AC-098: a ghost opens the current occurrence with the banner', async ({ page }) => {
    const TITLE = caseTitle(BASE)
    await openNextMonthCalendar(page)

    const ghostCell = page
      .getByRole('gridcell')
      .filter({ hasText: new RegExp(`\\b${GHOST_DAY}\\b`) })
      .first()
    await expect(
      ghostCell.getByText(TITLE),
      'spec 6 Q3C: a daily rule projects an instance on every day strictly after the current ' +
        "occurrence's due date, so this cell carries a ghost of the series",
    ).toBeVisible()
    await ghostCell.getByText(TITLE).click()

    await expect(
      page.getByText('Upcoming occurrence of a repeating task'),
      'spec 9.5: a click on a ghost opens the current occurrence with this banner, and its ' +
        'copy is normative like all copy in section 9',
    ).toBeVisible()

    await expect(
      taskSurface(page),
      "spec 9.1's v2 roles table: the task surface is a dialog when opened as one, and 9.3 " +
        'puts the due date on its header strip with nothing to expand',
    ).toBeVisible()
    const shown = await dueDayShown(page)
    expect(
      shown,
      "spec 6 Q3C: a ghost is a projection and not a row, so what opens is the series' " +
        "current occurrence, carrying its own date. A surface naming the clicked cell's day " +
        'is an implementation that made the projection into a task',
    ).toMatch(new RegExp(`\\b${String(ANCHOR_DAY)}\\b`))
    expect(
      shown,
      `spec 6 Q3C: and it is not the ghost's day. The cell clicked was the ${String(GHOST_DAY)}th ` +
        'and the occurrence is due on the ' +
        `${String(ANCHOR_DAY)}st, so a strip naming the former has opened the projection`,
    ).not.toMatch(new RegExp(`\\b${String(GHOST_DAY)}\\b`))
  })

  test('AC-098: the real row opens the same task without the banner', async ({ page }) => {
    const TITLE = caseTitle(BASE)
    await openNextMonthCalendar(page)

    const anchorDay = Number(ANCHOR.slice(8))
    const realCell = page
      .getByRole('gridcell')
      .filter({ hasText: new RegExp(`\\b${anchorDay}\\b`) })
      .first()
    await clickControl(
      realCell.getByText(TITLE),
      "spec 6 Q3C: the current occurrence draws a real row on its own date, which is the row " +
        'this case opens instead of a ghost',
    )

    await expect(
      page.getByText('Upcoming occurrence of a repeating task'),
      'spec 9.5 puts the banner on the ghost path: a click on any row opens the task, and ' +
        'this row is the current occurrence opened from its own date, with nothing upcoming ' +
        'about it. A client showing the banner for every repeat passes AC-098 as written',
    ).toHaveCount(0)

    await expect(
      taskSurface(page),
      "spec 9.1's v2 roles table: the task surface is a dialog when opened as one",
    ).toBeVisible()
    expect(
      await dueDayShown(page),
      'the same task opens either way, which is what makes the banner the only difference',
    ).toMatch(new RegExp(`\\b${String(ANCHOR_DAY)}\\b`))
  })

  test('AC-098: a ghost is drawn as a ghost and a real row is not', async ({ page }) => {
    const TITLE = caseTitle(BASE)
    await openNextMonthCalendar(page)

    const anchorDay = Number(ANCHOR.slice(8))
    const real = page
      .getByRole('gridcell')
      .filter({ hasText: new RegExp(`\\b${anchorDay}\\b`) })
      .first()
      .getByText(TITLE)
    const ghost = page
      .getByRole('gridcell')
      .filter({ hasText: new RegExp(`\\b${GHOST_DAY}\\b`) })
      .first()
      .getByText(TITLE)

    const realStyle = await computedStyle(real, ['opacity', 'color', 'fontStyle'])
    const ghostStyle = await computedStyle(ghost, ['opacity', 'color', 'fontStyle'])
    expect(
      JSON.stringify(ghostStyle),
      'spec 9.5: virtual instances carry ghost styling. Drawn identically to the real row, ' +
        'the calendar states that a task is due on a day it is not, and the only thing ' +
        'separating the two is that one of them can be completed',
    ).not.toBe(JSON.stringify(realStyle))
  })
})

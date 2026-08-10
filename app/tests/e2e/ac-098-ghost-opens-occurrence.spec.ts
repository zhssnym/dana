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

Spec: 9.5 (the calendar's zooms and controls, ghost styling, the click
behaviors and the banner copy), 6 Q3C (real rows, virtual instances, cell
order), 8.5 (projection), 4.11.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  computedStyle,
  createTask,
  fieldValue,
  firstOfMonth,
  formField,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC' })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const TITLE = 'ac-098 daily series'
/** The current occurrence's own date, which draws the one real row. */
const ANCHOR = firstOfMonth(1)
/** A day the rule reaches and the current occurrence does not: a ghost. */
const GHOST_DAY = 5

async function openNextMonthCalendar(page: Page): Promise<void> {
  await page.goto(routes.planned)
  // 9.5's mode toggle. The mode persists per user client-side, so this is
  // asserted into a known state rather than assumed to start in one.
  await page.getByRole('button', { name: /^calendar$/i }).click()
  await expect(
    page.getByRole('button', { name: /^next$/i }),
    'spec 9.5: the calendar carries previous, next and today controls',
  ).toBeVisible()
  await page.getByRole('button', { name: /^next$/i }).click()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await createTask(page, {
    title: TITLE,
    folder_id: seedIds.groceries,
    due_date: ANCHOR,
    recurrence_rule: 'FREQ=DAILY',
  })
})

test.describe('AC-098: clicking a calendar ghost', () => {
  test('AC-098: a ghost opens the current occurrence with the banner', async ({ page }) => {
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

    await page.getByRole('button', { name: 'More options' }).click()
    expect(
      await fieldValue(formField(page, 'due date')),
      'spec 6 Q3C: a ghost is a projection and not a row, so what opens is the series\' ' +
        'current occurrence, carrying its own date. A form holding the clicked cell\'s date ' +
        'is an implementation that made the projection into a task',
    ).toBe(ANCHOR)
  })

  test('AC-098: the real row opens the same task without the banner', async ({ page }) => {
    await openNextMonthCalendar(page)

    const anchorDay = Number(ANCHOR.slice(8))
    const realCell = page
      .getByRole('gridcell')
      .filter({ hasText: new RegExp(`\\b${anchorDay}\\b`) })
      .first()
    await realCell.getByText(TITLE).click()

    await expect(
      page.getByText('Upcoming occurrence of a repeating task'),
      'spec 9.5 puts the banner on the ghost path: a click on any row opens the task, and ' +
        'this row is the current occurrence opened from its own date, with nothing upcoming ' +
        'about it. A client showing the banner for every repeat passes AC-098 as written',
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'More options' }).click()
    expect(
      await fieldValue(formField(page, 'due date')),
      'the same task opens either way, which is what makes the banner the only difference',
    ).toBe(ANCHOR)
  })

  test('AC-098: a ghost is drawn as a ghost and a real row is not', async ({ page }) => {
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

/*
AC-405: given the Scheduled calendar at 9.5's default zoom, when the week zoom
is chosen and the page is reloaded, then the calendar is at the week zoom
rather than back at month; and when a second browser context signs in to the
same account and opens the same calendar, then it is at the week zoom too, the
preference following the person rather than the browser; and given the
crowded-day reveal pressed instead, then the calendar draws that day and the
stored zoom is untouched, so a reload lands on the chosen zoom and not on day.

Taken from the tail on 2026-09-04 for issue #140, the number assigned rather
than chosen; section 12's README carries the bullet.

**The reload is what makes this a criterion about 4.10 rather than about a
control.** A zoom held in component state satisfies every assertion made on the
page it was chosen on, and that is not a hypothetical failure: it is what
shipped. 9.5 said "mode and zoom persist client-side" from the beginning,
`PlannedCalendar.tsx` held `useState('month')` and persisted nothing, and the
sentence and the code disagreed in silence for as long as both existed, because
nothing asserted either half. #140 is the issue that found it, while fixing
something else.

**The second context is what separates this from a localStorage answer, and
that separation is the whole of Imran's ruling on #140.** A browser mirror
passes the reload above and fails here, which is exactly the split record he
ruled against by name: a preference that does not follow a person between
devices is the lesson #30 already paid for with `task_open`. So the second
context is not thoroughness, it is the clause. It signs in through 11.10's
development login on its own cookie jar, which is a different browser as far as
anything on this machine can tell, and it reads the same account.

**AC-378 and AC-379 already hold the account half and this does not repeat
them.** Those two are over the wire: the default a fresh account reads, and the
value written through PATCH being read back by a second session. What neither
can see is whether the calendar draws it, which is the half #140 was open for
after the contract landed on #142. So this case chooses the zoom the way a
person does, through the strip 9.5 names, and reads the grid rather than the
bundle.

**The grid is read by its cell count rather than by the pressed state of the
strip.** Seven cells is the week zoom and forty-two is the month, which AC-177
fixes and which is a fact about what a person is looking at; `aria-pressed` on
the strip is a second cue, and a build that restored the pressed state and drew
the wrong grid would pass an assertion made on the control. The count is
asserted at both ends so the case cannot pass by finding week where week was
already the state.

**The reveal is the third case and it is the one that says what this
preference is not.** Imran ruled on the review of #140 that pressing "+N more"
is a look rather than a choice: it draws the crowded day whole and writes
nothing, so a person who peeked at a day and came back tomorrow opens on the
zoom they chose. The obvious build is the other one, and it was the first one
here, so the arm is asserted rather than assumed. It is asserted **through a
reload** rather than by reading the bundle, because what is at stake is what
the person meets next time; AC-177 reads the bundle directly, which is the
same rule measured at the control instead of at the consequence.

**The account is put back in `afterEach`, as AC-261 does for the four
Appearance fields.** This leg shares one seeded database in one worker and the
bundle is account state that outlives a case, so a zoom left at week is a
change every later spec inherits. **`ac-340` had the same leak and did not
restore**, which was harmless while the zoom was component state and stopped
being so with this change: measured on 2026-09-04 with a throwaway spec sorting
after it, a later case opening the Scheduled calendar read **7 cells**, the
week zoom, rather than 42. It was fixed on this branch under the owner's
authorisation and declared, and `ac-340` now hands the zoom back the same way
this file does. Its own header carries the measurement and the reasoning.

Spec: 9.5 as amended 2026-09-04 (the zoom persisting on the account), 4.10
(`calendar_zoom` and migration 0013's CHECK), 7.2 as annotated (the v2 bundle's
PATCH), 9.1 (addressing a control by role and name), AC-177 (the grid's shape
at each zoom), AC-378, AC-379; issues #140 and #142.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  chooseView,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  patchBundle,
  routesV2,
  seedDate,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', locale: 'en-US', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.5's month zoom is a fixed six-week grid, which AC-177 fixes at 42 days. */
const MONTH_CELLS = 42
/** And its week zoom is the seven days of one week. */
const WEEK_CELLS = 7

/** Opens Scheduled in its calendar mode, whatever mode the account was left in. */
async function openCalendar(page: Page): Promise<void> {
  await page.goto(routesV2.scheduled)
  await chooseView(page, 'Calendar', 'spec 9.5: Scheduled carries a mode toggle')
}

/** 9.5's zoom strip, which 9.1's addressing rule reaches by role and name. */
function zoomControl(page: Page, label: string) {
  return page
    .getByRole('group', { name: 'Calendar zoom' })
    .getByRole('button', { name: label, exact: true })
}

test.describe('AC-405: the calendar zoom follows the account', () => {
  test.afterEach(async ({ page }) => {
    /* The bundle is the account's and outlives the case, so the zoom goes back
       to what a fresh account carries rather than to whatever this left. */
    await patchBundle(page, { calendar_zoom: 'month' })
  })

  test('AC-405: a chosen zoom survives a reload and reaches a second browser', async ({
    page,
    browser,
  }) => {
    await signIn(page, seedSubs.hassan)
    /* Written through 9.7's own surface rather than assumed, so the case
       starts from the default whatever ran before it. */
    await patchBundle(page, { calendar_zoom: 'month' })

    await openCalendar(page)
    const grid = page.getByRole('grid', { name: 'Scheduled calendar' })
    await expect(
      grid.getByRole('gridcell'),
      'spec 9.5 and AC-177: the calendar opens at the month zoom, which is the fixed ' +
        'six-week grid. Asserted before the choice so that finding the week zoom afterwards ' +
        'is a change rather than a state the case walked into',
    ).toHaveCount(MONTH_CELLS)

    await clickControl(
      zoomControl(page, 'Week'),
      'spec 9.5: the calendar carries day, week and month zooms, and this is a person ' +
        'choosing one the way the strip offers it',
    )
    await expect(
      grid.getByRole('gridcell'),
      'spec 9.5: the week zoom lays out the seven days of one week',
    ).toHaveCount(WEEK_CELLS)

    /* Polled rather than read once, and the distinction is the mechanism
       rather than flakiness: a fresh document draws the mirror while the
       bundle read is in flight and takes the stored value when it answers, so
       the honest question is "does it end up at week". A zoom held in
       component state never reaches it. */
    await page.reload()
    await chooseView(page, 'Calendar', 'spec 9.5: back to the calendar after the reload')
    await expect
      .poll(() => page.getByRole('grid', { name: 'Scheduled calendar' }).getByRole('gridcell').count(), {
        message:
          'spec 9.5 as amended and 4.10: the zoom is written to `calendar_zoom` on the ' +
          'account, so a fresh document reads it back. A zoom in component state passes ' +
          'every assertion above and fails this one, which is what shipped until issue #140',
      })
      .toBe(WEEK_CELLS)

    /*
    The second browser, which is where a localStorage-only answer dies.

    Its own context means its own cookie jar and its own storage, so nothing
    of the first browser reaches it except the account. Imran ruled on #140
    that the preference should follow the person across devices and ruled out
    the browser-only answer by name, and this is that ruling as something a
    test can fail.
    */
    const second = await browser.newContext()
    try {
      const elsewhere = await second.newPage()
      await signIn(elsewhere, seedSubs.hassan)
      await openCalendar(elsewhere)
      await expect
        .poll(
          () =>
            elsewhere
              .getByRole('grid', { name: 'Scheduled calendar' })
              .getByRole('gridcell')
              .count(),
          {
            message:
              'spec 9.5 as amended: the zoom follows the person rather than the browser. A ' +
              'localStorage mirror alone passes the reload above and fails here, which is ' +
              'the split record Imran ruled against on issue #140 and the lesson #30 paid ' +
              'for with task_open',
          },
        )
        .toBe(WEEK_CELLS)
    } finally {
      await second.close()
    }
  })

  test('AC-405: the crowded-day reveal is a look and writes nothing', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await patchBundle(page, { calendar_zoom: 'week' })

    /*
    A day with more rows than a month cell draws, so the reveal has something
    to reveal. It is dated inside the week the zoom already shows, so the case
    can press the control at the week zoom rather than navigating a month.
    */
    const folder = await createFolder(page, caseTitle('AC-405 crowded'))
    const crowded = seedDate(0)
    for (let i = 0; i < 12; i += 1) {
      await createTask(page, {
        title: caseTitle(`AC-405 crowded ${String(i)}`),
        folder_id: folder.id,
        due_date: crowded,
      })
    }

    try {
      await openCalendar(page)
      await clickControl(
        zoomControl(page, 'Month'),
        'spec 9.5: the month grid is where the constant height puts rows behind a reveal',
      )
      const grid = page.getByRole('grid', { name: 'Scheduled calendar' })
      const cell = grid.locator(`[role="gridcell"][data-date="${crowded}"]`)
      await clickControl(
        cell.getByRole('button', { name: /^\+\d+ more$/ }),
        'spec 9.5: "+N more" is a control opening the day',
      )
      await expect(
        grid.getByRole('gridcell'),
        'spec 9.5: the reveal draws that day at the day zoom, which is one cell',
      ).toHaveCount(1)

      const stored = await page.request.get('/api/v1/settings')
      expect(
        ((await stored.json()) as { calendar_zoom: string }).calendar_zoom,
        'spec 9.5 as amended and Imran on the review of issue #140: a look is not a choice, ' +
          'so the reveal leaves 4.10 alone. Month was pressed last and Month is what the ' +
          'account holds',
      ).toBe('month')

      /* And what the person meets next time is the zoom they chose, which is
         the half a bundle read cannot see: a build that kept the reveal in the
         page and wrote the account would fail above, and one that wrote
         neither but never dropped the reveal would fail here. */
      await page.reload()
      await chooseView(page, 'Calendar', 'spec 9.5: back to the calendar after the reload')
      await expect
        .poll(
          () =>
            page
              .getByRole('grid', { name: 'Scheduled calendar' })
              .getByRole('gridcell')
              .count(),
          {
            message:
              'spec 9.5 as amended: the reveal is dropped when the calendar leaves the ' +
              'screen, so a reload opens on the chosen zoom rather than on the day somebody ' +
              'looked at',
          },
        )
        .toBe(MONTH_CELLS)
    } finally {
      await deleteFolder(page, folder.id)
    }
  })
})

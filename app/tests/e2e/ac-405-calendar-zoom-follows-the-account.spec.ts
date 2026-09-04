/*
AC-405: given the Scheduled calendar at 9.5's default zoom, when the week zoom
is chosen and the page is reloaded, then the calendar is at the week zoom
rather than back at month; and when a second browser context signs in to the
same account and opens the same calendar, then it is at the week zoom too, the
preference following the person rather than the browser.

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

**The account is put back in `afterEach`, as AC-261 does for the four
Appearance fields.** This leg shares one seeded database in one worker and the
bundle is account state that outlives a case, so a zoom left at week is a
change every later spec inherits. Two things follow, and the second is a
finding rather than a rule: **`ac-340` chooses the week zoom and puts nothing
back**, which was harmless while the zoom was component state and is not any
more. Measured on 2026-09-04 with a throwaway spec sorting after it: a later
case opening the Scheduled calendar reads **7 cells**, the week zoom, rather
than 42. Nothing between `ac-340` and this file reads that calendar today, and
`ac-093`, which does and needs the month zoom, sorts before it, so the leg is
green in its file order. That is the ordering being lucky rather than the spec
being safe, and it is left as a finding for the suite's owner rather than
edited from here: a criterion is not a frontend agent's to change.

Spec: 9.5 as amended 2026-09-04 (the zoom persisting on the account), 4.10
(`calendar_zoom` and migration 0013's CHECK), 7.2 as annotated (the v2 bundle's
PATCH), 9.1 (addressing a control by role and name), AC-177 (the grid's shape
at each zoom), AC-378, AC-379; issues #140 and #142.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  chooseView,
  clickControl,
  patchBundle,
  routesV2,
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
})

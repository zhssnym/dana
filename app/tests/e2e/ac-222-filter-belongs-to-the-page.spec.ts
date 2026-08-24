/*
AC-222: given a filter set on Scheduled, when the viewer navigates away and
returns, then it holds; when they visit Today, then Today's filter is
independent.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. It is DES-179 as a criterion: a filter belongs to the page and to
the session, kept on the way back because the chips keep it visible, never
carried to another page because the other page's list would silently lie.
Red until S10 lands the shared filter.

**The filter set is "important", chosen because it is one press and its
effect is legible**: the chip renders in the window bar, which 9.1 fixes
("active state renders as removable chips in the window bar, never as a
count alone"), so both halves are asserted on the chip rather than on list
contents, whose rows depend on seed dates this criterion does not own.

Spec: 9.1 (the filter paragraph, the window bar, "Filter" in the names
table), DES-179.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The important-only chip in the window bar, however the page spells it. */
function importantChip(page: Page) {
  return page.getByRole('button', { name: /Important/ }).filter({ hasNotText: 'Mark' })
}

test.describe('AC-222: a filter belongs to the page and the session', () => {
  test('AC-222: set on Scheduled, it survives leaving and returning; Today is untouched', async ({
    page,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.scheduled)

    await clickControl(
      page.getByRole('button', { name: 'Filter', exact: true }),
      'spec 9.1: the filter control is named "Filter" and has the same meaning on ' +
        'every place-page. The v1 client has no such control, which is the red this ' +
        'shows until S10',
    )
    await clickControl(
      page.getByRole('menuitemcheckbox', { name: /Important/ }).or(
        page.getByRole('checkbox', { name: /Important/ }).or(
          page.getByRole('switch', { name: /Important/ }),
        ),
      ).first(),
      'spec 9.1: important is one of the filter\'s axes',
    )
    await page.keyboard.press('Escape')
    await expect(
      importantChip(page).first(),
      'spec 9.1: an active filter renders as removable chips in the window bar, never ' +
        'as a count alone',
    ).toBeVisible()

    await page.goto(routesV2.today)
    await expect(
      importantChip(page),
      'DES-179: a filter is never carried to another page; Today\'s window bar shows ' +
        'no chip it did not set. A chip here means the filter travelled, which makes ' +
        'every page\'s list a function of where the person has been',
    ).toHaveCount(0)

    await page.goto(routesV2.scheduled)
    await expect(
      importantChip(page).first(),
      'DES-179: kept on the way back, because the chips make the state visible; a ' +
        'filter that silently evaporated would be kinder than one that silently held ' +
        'only if it were invisible, and it is not',
    ).toBeVisible()
  })
})

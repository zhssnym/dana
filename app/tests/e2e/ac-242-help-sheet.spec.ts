/*
AC-242: given the account menu, then it carries Help between Settings and
Sign out, which is 9.1's "Account": Settings, Help, Sign out; and when Help
is chosen, then a sheet of keyboard shortcuts opens naming the shortcut for
search, and pressing that shortcut opens the search overlay, so the sheet is
measured against the handler rather than against itself.

**The last clause is the criterion.** "Help" is the easiest control in any
product to fill with a plausible lie, which is what `help-sheet.tsx`'s own
header says it was designed against: a Getting started that starts nothing, a
Documentation link to a page nobody wrote, a shortcut list read off a
designer's fixture rather than off the handlers. A criterion that only read
the sheet would pass against a sheet listing shortcuts that do not exist, and
would therefore certify the exact failure the design was shaped to avoid. So
one listed shortcut is pressed, and the thing it claims to do has to happen.

**Ctrl+K is the one pressed, and it is chosen rather than convenient.** It is
the only shortcut on the sheet that 9.1 also names in its own words ("the
global search control (Ctrl+K or /)"), so a red here is a red against the
specification and not only against a handler. The other five were verified
against their handlers by reading at the port and are recorded in the session
log; they are not pressed here because Enter, Escape and the arrows are each
true of a different surface, and a case that pressed all six would be six
criteria wearing one number.

**The order is asserted, not just the membership.** 9.1 spells the menu's
contents as a sequence and the account menu is three items long, so the
sequence is cheap to state exactly and a client that appends Help under Sign
out would otherwise pass. AC-174 already asserts Settings and Sign out are
there and stays untouched by this: it names two items and never counts them,
so a third arriving between them leaves it green, which is what a criterion
about the menu's contents rather than its shape should do.

Spec: 9.1 (the avatar menu named "Account", carrying Settings, Help and Sign
out; the search shortcut), 9.9 (the overlay the shortcut opens), DES-144,
`components/help-sheet.tsx`.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.1's names table calls the avatar menu this, and AC-174 pins the name. */
const ACCOUNT_MENU = 'Account'

/** 9.1: "the avatar menu ("Account": Settings, Help, Sign out)". */
const MENU_ITEMS = ['Settings', 'Help', 'Sign out']

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-242: Help is in the account menu, and the sheet behind it is true', () => {
  test('AC-242: the menu carries Settings, Help and Sign out, in that order', async ({
    page,
  }) => {
    await page.goto(routesV2.desk)
    await clickControl(
      sidebar(page).getByRole('button', { name: ACCOUNT_MENU, exact: true }),
      'spec 9.1: the sidebar footer carries the avatar menu, named "Account" by that ' +
        "section's names table, and it opens",
    )

    await expect
      .poll(() => page.getByRole('menuitem').allInnerTexts(), {
        message:
          'spec 9.1: the avatar menu is ("Account": Settings, Help, Sign out). The menu ' +
          'built today carries Settings and Sign out and nothing between them, so Help is ' +
          'the third item this section has always named and no package ever built',
      })
      .toEqual(MENU_ITEMS)
  })

  test('AC-242: Help opens a sheet naming the search shortcut', async ({ page }) => {
    await page.goto(routesV2.desk)
    await clickControl(
      sidebar(page).getByRole('button', { name: ACCOUNT_MENU, exact: true }),
      'spec 9.1: the account menu opens',
    )
    await clickControl(
      page.getByRole('menuitem', { name: 'Help', exact: true }),
      'spec 9.1: Help is a menu item in the account menu, which is where the brief of ' +
        '2026-08-23 settled it: with the other things that are about the application ' +
        'rather than about your work',
    )

    const sheet = page.getByRole('dialog').filter({ hasText: 'Keyboard' })
    await expect(
      sheet,
      'DES-144 and `help-sheet.tsx`: Help opens a sheet of the shortcuts that exist. A ' +
        'menu item that opens nothing satisfies the case above this one',
    ).toBeVisible()

    await expect(
      sheet.getByText('Search everything', { exact: true }),
      'DES-144: the sheet says what each shortcut does, in the words the designer approved',
    ).toBeVisible()

    /*
    The keys are read off the row that names search, not off the sheet.

    Scoped deliberately rather than for convenience: the sheet carries two
    Ctrl chords, search and undo, so an assertion that merely found "Ctrl"
    somewhere in the sheet would pass against a sheet that printed the undo
    modifier beside the search sentence, which is the exact failure this
    criterion exists to catch. The row is the parent of the sentence, the
    two spans of a shortcut line being siblings under it.
    */
    const searchRow = sheet.getByText('Search everything', { exact: true }).locator('..')
    await expect(
      searchRow.getByText('Ctrl', { exact: true }),
      'spec 9.1 names the search shortcut "Ctrl+K or /", and the sheet spells the modifier ' +
        'for the platform it is read on. A sheet naming the wrong key teaches something ' +
        'false, which is worse than a sheet nobody wrote',
    ).toBeVisible()
    await expect(
      searchRow.getByText('K', { exact: true }),
      'and the key beside it, on the same row',
    ).toBeVisible()
  })

  test('AC-242: the shortcut the sheet names is the shortcut the client binds', async ({
    page,
  }) => {
    await page.goto(routesV2.desk)
    await clickControl(
      sidebar(page).getByRole('button', { name: ACCOUNT_MENU, exact: true }),
      'spec 9.1: the account menu opens',
    )
    await clickControl(
      page.getByRole('menuitem', { name: 'Help', exact: true }),
      'and Help opens the sheet',
    )
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Keyboard' }),
      'the sheet this case is about is open before it is closed',
    ).toBeVisible()

    // Closed first: the shortcut is the window's, and a sheet standing over
    // the page would let a false pass through a handler that only ran because
    // a dialog happened to have focus.
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Keyboard' }),
      'spec 9.1: Escape closes what is open, which the sheet itself lists',
    ).toHaveCount(0)

    await page.keyboard.press('Control+k')
    await expect(
      page.getByLabel('Search tasks'),
      'spec 9.1 and 9.9: the sheet says Ctrl+K searches everything, so Ctrl+K opens the ' +
        'search overlay. This is the assertion that stops the sheet being a list of ' +
        'plausible sentences: every line on it can be pressed, and this is the one a ' +
        'browser can press',
    ).toBeFocused()
  })
})

/*
AC-242: given the account menu, then it carries, in order, Settings, People,
Trash, Import, Help and Sign out, which is 9.1's "Account" after the polish
round of 2026-08-30; and when Help is chosen, then a sheet of keyboard
shortcuts opens naming the shortcut for search, and pressing that shortcut
opens the search overlay, so the sheet is measured against the handler rather
than against itself.

**The list grew from three to six at that round, on the owner's own ruling,
and this criterion is amended rather than joined by a second one.** His words:
"move Import and People and Settings and Trash to when you click on the
profile ... my goal is that there is more space for the Library so people can
see a big picture of what's going on in their app." The sidebar footer carried
those four as rows and now carries the account row alone; what the four became
is four items here, and a criterion asserting the old three with `toEqual`
would be red against the arrangement the owner asked for. The order is the
menu's own argument, recorded at `AccountMenu`: the places this account owns
(Settings, People, Trash), then the act and the sheet that are about the
application rather than about your work (Import, Help), then the door.

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
contents as a sequence and the menu is six items long, so the sequence is
cheap to state exactly and a client that appends Help under Sign out would
otherwise pass. AC-174 already asserts Settings and Sign out are there and
stays untouched by this: it names two items and never counts them, so the
four arriving between them leave it green, which is what a criterion about
the menu's contents rather than its shape should do.

Spec: 9.1 (the avatar menu named "Account", carrying Settings, People, Trash,
Import, Help and Sign out; the search shortcut), 9.9 (the overlay the shortcut
opens), DES-144, `components/help-sheet.tsx`.
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

/**
 * 9.1: the avatar menu ("Account": Settings, People, Trash, Import, Help,
 * Sign out), as the polish round of 2026-08-30 left it.
 */
const MENU_ITEMS = ['Settings', 'People', 'Trash', 'Import', 'Help', 'Sign out']

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-242: the account menu holds the account\'s doors, and the sheet behind Help is true', () => {
  test('AC-242: the menu carries Settings, People, Trash, Import, Help and Sign out, in that order', async ({
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
          'spec 9.1: the avatar menu is ("Account": Settings, People, Trash, Import, Help, ' +
          'Sign out). The four in the middle were sidebar-footer rows until the polish round ' +
          'of 2026-08-30, when the owner moved them here so the Library could have their ' +
          'room; a menu that kept the old three would leave that footer with nothing to lose',
      })
      .toEqual(MENU_ITEMS)
  })

  /*
  The three relocated places are asserted to arrive, not merely to be listed.

  A menu item is a label until something happens when it is pressed, and
  these three replace links that carried an `href` a browser could check
  without pressing anything. So each is pressed and the address is read back:
  what the footer's rows gave for free is exactly what a menu item has to be
  measured for.
  */
  for (const [item, path] of [
    ['Settings', '/app/settings'],
    ['People', '/app/people'],
    ['Trash', '/app/trash'],
  ] as const) {
    test(`AC-242: ${item} in the account menu reaches its page`, async ({ page }) => {
      await page.goto(routesV2.desk)
      await clickControl(
        sidebar(page).getByRole('button', { name: ACCOUNT_MENU, exact: true }),
        'spec 9.1: the account menu opens',
      )
      await clickControl(
        page.getByRole('menuitem', { name: item, exact: true }),
        `spec 9.1: "${item}" is in the account menu since the polish round of 2026-08-30`,
      )
      await expect(
        page,
        `spec 9.1's routes table: ${item} is a place, and a menu item that names a place ` +
          'and goes nowhere is the plausible lie one level up from a Help sheet nobody wrote',
      ).toHaveURL(new RegExp(`${path}$`))
    })
  }

  /*
  Import keeps the assertion AC-264 made of it while it was a footer button:
  it reaches the file chooser rather than merely being a label. The control
  moved; the thing behind it did not, and the one file input the application
  has is still the sidebar's.
  */
  test('AC-242: Import in the account menu reaches a workflow file', async ({ page }) => {
    await page.goto(routesV2.desk)
    await clickControl(
      sidebar(page).getByRole('button', { name: ACCOUNT_MENU, exact: true }),
      'spec 9.1: the account menu opens',
    )
    const chooser = page.waitForEvent('filechooser')
    await clickControl(
      page.getByRole('menuitem', { name: 'Import', exact: true }),
      'spec 9.1: "Import (a workflow file)", which is 7.16\'s POST /workflows/import',
    )
    await expect(
      (await chooser).page(),
      'the item opens a file chooser rather than merely being a label',
    ).toBe(page)
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
      page.getByPlaceholder('Search Dana'),
      'spec 9.1 and 9.9: the sheet says Ctrl+K searches everything, so Ctrl+K opens the ' +
        'search overlay. This is the assertion that stops the sheet being a list of ' +
        'plausible sentences: every line on it can be pressed, and this is the one a ' +
        'browser can press',
    ).toBeFocused()
  })
})

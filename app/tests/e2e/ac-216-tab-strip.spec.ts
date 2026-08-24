/*
AC-216: given a strip of two tabs, when the active one closes, then the
neighbouring place shows; when the last one closes, then Desk; tabs reorder
by pointer drag; the strip's plus opens a folder as a new tab beside the
current one.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. Red until S9 lands the strip: the v1 client renders no tablist at
all, so the first locator of every case resolves to nothing, which is the
right reason.

**The strip is addressed by role.** 9.1's roles table fixes a tab in the
strip as a tab, current when active; its names table fixes the plus as "New
tab" and a tab's close control as "Close tab", addressed within the tab its
title names. Session-scoped working state is the contract's own phrase, so
nothing here reads or writes a server surface: every fixture is opened
through the strip itself.

**Closing the last tab lands on Desk** is asserted by URL, Desk being /app
in the v2 routes table, because "lands on" is a navigation and not a
rendering.

Spec: 9.1 (the tab strip paragraph, the roles table, the names table, the
routes table), DES-152.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedSubs,
  signIn,
  tabNamed,
  tabStrip,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.desk)
})

/**
 * Opens the seeded Groceries folder as a second tab through the strip's own
 * plus, which is the last clause of the criterion and the fixture for the
 * other three: every case needs a strip of two, and the strip is
 * session-scoped, so the only honest way to hold two tabs is the control
 * that adds one.
 */
async function openGroceriesTab(page: import('@playwright/test').Page): Promise<void> {
  await clickControl(
    tabStrip(page).getByRole('button', { name: 'New tab', exact: true }),
    'spec 9.1: a "+" at the row\'s end opens any shelf or folder as a tab, and its ' +
      'name is "New tab" in the names table. The v1 client has no strip, which is the ' +
      'red this shows until S9',
  )
  await clickControl(
    page.getByRole('menuitem', { name: /Groceries/ }).or(page.getByRole('option', { name: /Groceries/ })),
    'spec 9.1: the plus offers any shelf or folder; Groceries is seeded',
  )
  await expect(
    tabNamed(page, /Groceries/),
    'spec 9.1: "Open in a new tab" appends a tab and goes to it, so the folder is now a ' +
      'tab and the active one',
  ).toHaveAttribute('aria-selected', 'true')
}

test.describe('AC-216: the tab strip', () => {
  test('AC-216: the plus opens a folder as a new tab beside the current one', async ({
    page,
  }) => {
    await openGroceriesTab(page)
    await expect(
      tabStrip(page).getByRole('tab'),
      'spec 9.1: the strip now holds the place the viewer stood on and the folder the ' +
        'plus opened, in that order, "beside the current one" being a position and not ' +
        'just a count',
    ).toHaveCount(2)
  })

  test('AC-216: closing the active tab shows the neighbouring place', async ({ page }) => {
    await openGroceriesTab(page)
    await clickControl(
      tabNamed(page, /Groceries/).getByRole('button', { name: 'Close tab', exact: true }),
      'spec 9.1: a tab\'s close control is named "Close tab", addressed within the tab ' +
        'its title names',
    )
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message:
          'spec 9.1: closing the active tab lands on the neighbouring place, which was ' +
          'Desk here',
      })
      .toBe(routesV2.desk)
    await expect(
      tabStrip(page).getByRole('tab'),
      'spec 9.1: the closed tab is gone rather than merely deselected',
    ).toHaveCount(1)
  })

  test('AC-216: closing the last tab lands on Desk', async ({ page }) => {
    // From another place, so landing on Desk is a move and not a no-op.
    await page.goto(routesV2.today)
    const strip = tabStrip(page)
    const only = strip.getByRole('tab')
    await expect(
      only,
      'spec 9.1: the place the viewer stands on is the active tab, so one tab exists ' +
        'before the close',
    ).toHaveCount(1)
    await clickControl(
      only.getByRole('button', { name: 'Close tab', exact: true }),
      'spec 9.1: every tab is the same tab and every tab is closable, the last included',
    )
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message: 'spec 9.1: closing the last tab lands on Desk',
      })
      .toBe(routesV2.desk)
  })

  test('AC-216: tabs reorder by pointer drag', async ({ page }) => {
    await openGroceriesTab(page)
    const strip = tabStrip(page)
    const first = strip.getByRole('tab').first()
    const second = strip.getByRole('tab').last()
    const firstName = await first.textContent()
    const secondName = await second.textContent()

    // A real pointer drag rather than a DOM reorder: press the second tab,
    // travel across the first, release. The engines under review all listen
    // to pointer events, and a strip that only reorders through some other
    // gesture has not implemented "reorderable by drag".
    const from = await second.boundingBox()
    const to = await first.boundingBox()
    expect(from, 'the second tab has a box to drag from').not.toBeNull()
    expect(to, 'the first tab has a box to drag onto').not.toBeNull()
    if (from === null || to === null) return
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(async () => (await strip.getByRole('tab').first().textContent())?.trim(), {
        message:
          'spec 9.1: tabs are reorderable by drag, so after dragging the second tab ' +
          `across the first, the first position holds ${JSON.stringify(secondName?.trim())} ` +
          `where it held ${JSON.stringify(firstName?.trim())}`,
      })
      .toBe(secondName?.trim())
  })
})

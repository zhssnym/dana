/*
AC-312: given a page already open in a tab, when it is chosen from the sidebar
or from the strip's "New tab" menu, then that tab becomes active and no second
tab is made; and given the strip holds only Desk, then that tab draws no close
control.

**Two ways to open a page behaved differently before the polish round of
2026-08-30 (tabstrip F2, F4, F11).** A sidebar click quietly retargeted
whichever tab was active, so with four tabs open it replaced the page a person
had there; the plus opened a second, indistinguishable tab for a page that
already had one; and the sole tab's "x" closed it into a fresh Desk tab, a
control that looked live and was "go to Desk". One rule now: a page has at
most one tab, a choice from anywhere goes to it, and only a page open nowhere
retargets the active tab as an address bar does (9.1).

Spec: 9.1 (the tab strip paragraph as amended at the polish round).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedSubs,
  sidebarLink,
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

async function openGroceriesFromThePlus(page: import('@playwright/test').Page): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'New tab', exact: true }),
    'spec 9.1: the strip\'s plus is "New tab"',
  )
  await clickControl(
    page.getByRole('menuitem', { name: /Groceries/ }),
    'spec 9.1: the plus offers any shelf or folder; Groceries is seeded',
  )
  await expect(tabNamed(page, /Groceries/), 'the tab exists').toBeVisible()
  /* The menu has to be gone before the next click, or the click lands on its
     dismissal rather than on the sidebar. */
  await expect(page.getByRole('menu'), 'the New tab menu closed').toBeHidden()
  await expect
    .poll(() => new URL(page.url()).pathname, { message: 'the folder opened' })
    .toMatch(/^\/app\/folders\//)
}

test.describe('AC-312: one rule for opening a page', () => {
  test('AC-312: the sidebar switches to the tab a page already has', async ({ page }) => {
    await openGroceriesFromThePlus(page)
    await expect(tabStrip(page).getByRole('tab')).toHaveCount(2)
    await expect(tabNamed(page, /Groceries/)).toHaveAttribute('aria-selected', 'true')

    await clickControl(
      sidebarLink(page, 'Desk'),
      'spec 9.1: Desk is open in the first tab, so choosing it from the sidebar goes there',
    )
    await expect(
      tabStrip(page).getByRole('tab'),
      'spec 9.1: no tab was retargeted and none was added; the Groceries tab survives',
    ).toHaveCount(2)
    await expect(tabNamed(page, /Groceries/), 'the Groceries tab is still there').toBeVisible()
    await expect(
      tabNamed(page, /Desk/),
      'spec 9.1: the tab that held Desk is the active one',
    ).toHaveAttribute('aria-selected', 'true')
  })

  test('AC-312: the plus never opens a duplicate', async ({ page }) => {
    await openGroceriesFromThePlus(page)
    await clickControl(sidebarLink(page, 'Desk'), 'back to the Desk tab')
    await openGroceriesFromThePlus(page)
    await expect(
      tabStrip(page).getByRole('tab'),
      'spec 9.1: a page has at most one tab, so the second choice went to the first tab',
    ).toHaveCount(2)
    await expect(tabNamed(page, /Groceries/)).toHaveAttribute('aria-selected', 'true')
  })

  test('AC-312: the sole Desk tab draws no close control', async ({ page }) => {
    const only = tabStrip(page).getByRole('tab')
    await expect(only).toHaveCount(1)
    await expect(
      only.getByRole('button', { name: 'Close tab', exact: true }),
      'spec 9.1: closing the only tab could only land on Desk, which it already shows, so ' +
        'the control that would say otherwise is not drawn',
    ).toHaveCount(0)
  })
})

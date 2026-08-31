/*
AC-310: given the application at a phone width (390 by 844), then a bar above
the tab strip offers "Menu", "Search" and the bell; when Menu is pressed, then
the sidebar opens as a drawer holding the page links; when a page link in it
is pressed, then the page opens and the drawer closes; when Escape is pressed
on an open drawer, then it closes; and when a task is opened, then its surface
fits the phone's width and its "Close task" control is on screen.

**The blocker in six of the ten adversarial reports of 2026-08-30.** Below
768px the vendored sidebar is a drawer, and the only control that opened it
lived inside the drawer. Search opened on Ctrl+K, which no phone has; the bell
was unreachable full stop; and the task dialog kept its laptop width. This
criterion pins the bar, the drawer's three ways of closing that a person will
try (navigation, Escape, and the backdrop through the same primitive), and the
task surface's width.

**The bar is inside `main` and is not a banner.** AC-174 asserts the absence of
a banner landmark on every page; the phone bar is a `div` inside the inset,
which is chrome belonging to the window rather than to the application, and it
renders nothing at all on a laptop, so every desktop criterion that counts one
"Search" control still counts one.

Spec: 9.1 (the phone bar sentence, added at the polish round), 9.3 (the task
surface), AC-174.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  routesV2,
  seedSubs,
  signIn,
  openTaskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({
  timezoneId: 'UTC',
  actionTimeout: ACTION_TIMEOUT_MS,
  viewport: { width: 390, height: 844 },
})
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.desk)
})

test.describe('AC-310: the shell is navigable on a phone', () => {
  test('AC-310: the bar carries Menu, Search and the bell', async ({ page }) => {
    for (const name of ['Menu', 'Search']) {
      await expect(
        page.getByRole('button', { name, exact: true }),
        `spec 9.1: below 768px a bar above the tab strip carries "${name}"`,
      ).toBeVisible()
    }
    await expect(
      page.getByRole('button', { name: /^Notifications/ }),
      'spec 9.1 and 9.12: the bell is reachable on a phone, from the bar',
    ).toBeVisible()
    await expect(
      page.getByRole('banner'),
      'AC-174: the phone bar is chrome inside main, never the application banner',
    ).toHaveCount(0)
  })

  test('AC-310: Menu opens the drawer, a page link closes it, Escape closes it', async ({
    page,
  }) => {
    const drawer = page.getByRole('navigation', { name: 'Pages and folders' })
    await expect(drawer, 'the sidebar is not on a phone until asked for').toBeHidden()

    await clickControl(
      page.getByRole('button', { name: 'Menu', exact: true }),
      'spec 9.1: "Menu" opens the sidebar as a drawer',
    )
    await expect(drawer, 'the drawer holds the sidebar').toBeVisible()
    await clickControl(
      drawer.getByRole('link', { name: 'Today', exact: true }),
      'spec 9.1: the drawer holds the page set, so Today is one tap away',
    )
    await expect
      .poll(() => new URL(page.url()).pathname, {
        message: 'the page link navigates',
      })
      .toBe(routesV2.today)
    await expect(
      drawer,
      'spec 9.1: the drawer closes on the navigation it was opened to make',
    ).toBeHidden()

    await clickControl(
      page.getByRole('button', { name: 'Menu', exact: true }),
      'the drawer opens again',
    )
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer, 'spec 9.1: the drawer closes on Escape').toBeHidden()
  })

  test('AC-310: Search opens from the bar', async ({ page }) => {
    await clickControl(
      page.getByRole('button', { name: 'Search', exact: true }),
      'spec 9.1: the search control is on the phone bar, where Ctrl+K cannot be pressed',
    )
    await expect(
      page.getByRole('dialog', { name: 'Search Dana' }),
      'spec 9.9: the overlay opens',
    ).toBeVisible()
  })

  test('AC-310: a task surface fits the phone', async ({ page }) => {
    /* Opened from its row rather than by URL: by URL a task is a page (9.1's
       roles table), and it is the dialog that had a laptop width on a phone. */
    const title = 'ac-310 a task on a phone'
    await createTask(page, { title })
    await page.goto(routesV2.desk)
    await openTaskRow(page, title, 'the row opens the task in the preferred surface, the dialog')
    const close = page.getByRole('button', { name: 'Close task', exact: true }).first()
    await expect(
      close,
      'spec 9.3: the surface carries its close control, and on a phone it is on screen',
    ).toBeVisible()
    const surface = page
      .getByRole('dialog', { name: /ac-310/ })
      .or(page.getByRole('complementary', { name: /ac-310/ }))
      .first()
    const box = await surface.boundingBox()
    expect(box, 'the surface has a box').not.toBeNull()
    if (box !== null) {
      expect(
        Math.round(box.x + box.width),
        'spec 9.1: below 768px the task surface takes the whole width and no more',
      ).toBeLessThanOrEqual(390)
      expect(Math.round(box.width), 'and no less').toBeGreaterThanOrEqual(380)
    }
  })
})

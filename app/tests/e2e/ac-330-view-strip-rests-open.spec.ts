/*
AC-330: given a place-page offering more than one view, then every option of
the view strip is visible without hovering it, a segmented control; and given
Assignments, then its scope strip shows "Everyone" and the viewer's own scope
the same way.

Authored 2026-08-30 at the polish round (pagehead F1, folderpage F8, places
F5). The strip rested collapsed to the current view from S24 and widened on
hover, which hid the board and the calendar from anyone who did not hover one
small icon and from every phone, where there is no hover. 9.1 is amended in
the same words: the strip rests open.

The measurement is opacity rather than `toBeVisible`, because a zero-width,
zero-opacity radio still satisfies Playwright's visibility, which is how the
collapsed strip passed AC-259 while hiding two of its three choices.

Spec: 9.1 (the view strip, as amended at the polish round), 9.5 (Assignments'
scope).
*/
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

import {
  caseTitle,
  createFolder,
  effectiveOpacity,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  viewStrip,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** Drawn, in the plain sense: on screen, with width and ink. */
async function drawn(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox()
  return (await effectiveOpacity(locator)) > 0.5 && box !== null && box.width > 8
}

test.describe('AC-330: the view strip rests open', () => {
  test('AC-330: a folder page shows List and Board without a hover', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const folder = await createFolder(page, caseTitle('AC-330 strip'))
    await page.goto(routesV2.folder(folder.id))

    const strip = viewStrip(page).first()
    await expect(strip, 'spec 9.1: one strip per place-page').toBeVisible()
    /* The pointer is parked away from the strip on purpose: the finding was
       that the second option only existed under the pointer. */
    await page.mouse.move(4, 4)
    for (const name of ['List', 'Board']) {
      expect(
        await drawn(strip.getByRole('radio', { name, exact: true })),
        `spec 9.1 as amended at the polish round: the strip rests open, so "${name}" is drawn ` +
          'at rest rather than at zero width until hovered',
      ).toBe(true)
    }
  })

  test('AC-330: Scheduled shows Calendar at rest, and Assignments shows its scopes', async ({
    page,
  }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.scheduled)
    await page.mouse.move(4, 4)
    expect(
      await drawn(viewStrip(page).first().getByRole('radio', { name: 'Calendar', exact: true })),
      'spec 9.1: the calendar is the view a person could not find, so it is the one that most ' +
        'needs to be drawn at rest',
    ).toBe(true)

    await page.goto(routesV2.assignments)
    await page.mouse.move(4, 4)
    const scope = page.getByRole('radiogroup', { name: 'Whose assignments', exact: true })
    await expect(scope, 'spec 9.5: Assignments carries a scope strip').toBeVisible()
    expect(
      await drawn(scope.getByRole('radio', { name: 'Everyone', exact: true })),
      'places F5: "Everyone" is drawn at rest',
    ).toBe(true)
    expect(
      await drawn(scope.getByRole('radio', { name: 'You', exact: true })),
      'places F5: the viewer\'s own scope is drawn at rest, not revealed by a hover',
    ).toBe(true)
  })
})

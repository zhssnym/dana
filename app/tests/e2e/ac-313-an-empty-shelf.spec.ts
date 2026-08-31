/*
AC-313: given the sidebar's "New shelf" control, when it is pressed, a name
typed into "Shelf name" and "Create shelf" pressed with no folder ticked, then
the shelf exists as a region of the Library named by it, holding no folders;
and the dialog says "shelf" and never "group".

**The polish round of 2026-08-30, sidebar F5 and F9.** The dialog refused an
empty shelf with "Dana cannot save an empty group" while two empty shelves sat
in the Library beside it, and called the thing a group, a label and a shelf
within two clicks. 4.18 gives a shelf a row of its own, so it can be made
empty and filled later by drag or from its page.

**Where the control lives moved again later the same day**, when the owner
emptied the sidebar footer to give the Library its room: the three acts of
making are one "New" control on the Library's heading, and "New shelf" is the
second item of its menu. Only the first press of this case changes; what a
shelf is and what the dialog says are untouched, and AC-264 is the criterion
that owns the control's place.

Spec: 9.1 (the Library and the footer, as amended at the polish round), 7.16.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  fillControl,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await page.goto(routesV2.desk)
})

test.describe('AC-313: a shelf may be made empty, and is called a shelf', () => {
  test('AC-313: New shelf with nothing ticked makes an empty shelf', async ({ page }) => {
    const name = caseTitle('ac-313 shelf').slice(0, 40)
    await clickControl(
      sidebar(page).getByRole('button', { name: 'New', exact: true }),
      'spec 9.1: the Library heading carries the "New" control, the one door to the three ' +
        'acts of making since the owner emptied the footer on 2026-08-30',
    )
    await clickControl(
      page.getByRole('menuitem', { name: 'New shelf', exact: true }),
      'spec 9.1: it offers "New shelf"',
    )
    const dialog = page.getByRole('dialog', { name: 'New shelf' })
    await expect(dialog, 'spec 9.1: the dialog is named for the thing it makes').toBeVisible()
    /* The folder list inside the dialog carries fixture names, some of which
       say "group", so the dialog's own words are read one by one. */
    await expect(
      dialog.getByRole('heading', { name: 'New shelf', exact: true }),
      'one word for the thing: the title says shelf',
    ).toBeVisible()
    await expect(
      dialog.getByText('A shelf holds folders, and is yours alone. Put folders on it now or drag them on later.'),
      'one word for the thing: the description says shelf and never group',
    ).toBeVisible()
    await fillControl(
      dialog.getByLabel(/^\s*Shelf name\s*$/i),
      name,
      'spec 9.1: the field is "Shelf name"',
    )
    await clickControl(
      dialog.getByRole('button', { name: 'Create shelf', exact: true }),
      'spec 9.1: the commit says what it does, and refuses nothing for an empty shelf',
    )
    await expect(dialog, 'the dialog closes on the commit').toBeHidden()
    const region = sidebar(page).getByRole('region', { name, exact: true })
    await expect(
      region,
      'spec 9.1: "one region per shelf named by it"; an empty shelf is a shelf',
    ).toBeVisible()
    await expect(
      region.getByRole('link'),
      'the shelf holds no folder rows beyond its own name',
    ).toHaveCount(1)
  })
})

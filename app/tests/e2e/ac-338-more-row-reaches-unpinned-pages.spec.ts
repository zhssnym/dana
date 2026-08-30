/*
AC-338: given the sidebar at its shipped pins, then a "More" row under the
page block opens onto the native pages the pin list has not pinned (Done,
Abandoned, Anytime), each a link that opens its page; and the row's open
state survives a reload.

Authored 2026-08-30 at the polish round (places F3): three of the nine
places had no door but Search.

Spec: 9.1 (the page block; amended at the polish round with the More row),
9.7 (the pin list still promotes a page into the block itself).
*/
import { expect, test } from '@playwright/test'

import {
  clickControl,
  DEFAULT_PINS,
  patchBundle,
  routesV2,
  seedSubs,
  sidebar,
  sidebarLink,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test('AC-338: More opens onto Done, Abandoned and Anytime, and remembers itself', async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  await patchBundle(page, { pinned_views: [...DEFAULT_PINS] })
  await page.goto(routesV2.today)

  const more = sidebar(page).getByRole('button', { name: 'More', exact: true })
  await expect(more, 'places F3: the door to the unpinned places').toBeVisible()
  await expect(sidebarLink(page, 'Done'), 'closed at first: the block is 9.1\'s six').toHaveCount(0)
  await clickControl(more, 'open it')
  for (const name of ['Done', 'Abandoned', 'Anytime']) {
    await expect(sidebarLink(page, name), `places F3: "${name}" is one click away`).toBeVisible()
  }
  await clickControl(sidebarLink(page, 'Done'), 'and it is a link to its page')
  await expect(page).toHaveURL(new RegExp(`${routesV2.done}$`))

  await page.reload()
  await expect(sidebarLink(page, 'Anytime'), 'places F3: the row stays open across a reload').toBeVisible()
  await clickControl(sidebar(page).getByRole('button', { name: 'More', exact: true }), 'close it again')
  await expect(sidebarLink(page, 'Anytime')).toHaveCount(0)
})

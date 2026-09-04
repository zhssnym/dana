/*
AC-223: given a shelf page, when a folder row is pressed, then the folder
opens as its own tab beside the shelf's; when Add folder places an existing
folder, then it joins the page without a reload.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. The server half is AC-203 and the 7.16 surface, green since S5;
this is 9.10's page, red until S12 builds it.

**The shelf and the folder are this case's own**, made through 7.16 and 7.4
in the case body, because the seed carries no shelf and the harness rule is
that a spec creates what it needs.

**"Without a reload" is asserted as no navigation**, read off the page's own
identity: a marker set on window before the act is still there after the
folder joined, so the document never reloaded; a client that re-navigates to
refresh the shelf page loses the marker and fails.

Spec: 9.10 (the shelf page), 9.1 (the tab strip, the roles table), 7.16
(shelves), AC-203 (the server half).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createShelf,
  routesV2,
  seedSubs,
  signIn,
  tabNamed,
  TEST_TIMEOUT_MS,
  watchCommit,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-223: the shelf page', () => {
  test('AC-223: a folder row opens as its own tab beside the shelf\'s', async ({ page }) => {
    // Names inside 4.18's 40-character cap: the shelf's is trimmed to fit.
    const shelfName = caseTitle('Shelf A').slice(0, 40)
    const folderName = caseTitle('Shelved folder')
    await signIn(page, seedSubs.hassan)
    const shelf = await createShelf(page, shelfName)
    await createFolder(page, folderName)
    await page.goto(routesV2.shelf(shelf.id))

    // Put the folder on the shelf through the page's own control first, so
    // the row being pressed exists; this also serves the second case's act.
    await clickControl(
      // Inside `main`, for the reason the second case records: the sidebar's
      // shelf heading carries "Add folder to {shelf}" since S24 and this name
      // is a substring.
      page.getByRole('main').getByRole('button', { name: /Add folder/ }).first(),
      'spec 9.10: the shelf page places existing folders. The v1 client has no shelf ' +
        'page at all, which is the red this shows until S12',
    )
    /* Before the press (2026-09-04, issue #159): the row this case then
       presses is drawn from the placement, so a barrier that can return
       before the placement was sent leaves nothing to press. */
    const placed = watchCommit(page)
    await clickControl(
      page
        .getByRole('menuitem', { name: new RegExp(folderName) })
        .or(page.getByRole('option', { name: new RegExp(folderName) }))
        .first(),
      'the placed folder is this case\'s own',
    )
    await placed.settled('the placement reaches the server before the row it draws is pressed')

    await clickControl(
      page.getByRole('main').getByRole('link', { name: new RegExp(folderName) }).first(),
      'spec 9.10: the shelf page lists its folders as rows, each a link (9.1\'s roles ' +
        'table names each folder and shelf row a link)',
    )
    await expect(
      tabNamed(page, new RegExp(folderName)),
      'spec 9.1: pressing a folder row on a shelf page opens the folder as its own ' +
        'tab beside the shelf\'s, and the new tab is the active one',
    ).toHaveAttribute('aria-selected', 'true')
    await expect(
      tabNamed(page, new RegExp(shelfName.slice(0, 12))),
      'the shelf\'s own tab is still in the strip beside the folder\'s: opened ' +
        'beside, not retargeted',
    ).toHaveCount(1)
  })

  test('AC-223: Add folder joins the page without a reload', async ({ page }) => {
    const shelfName = caseTitle('Shelf B').slice(0, 40)
    const folderName = caseTitle('Placed folder')
    await signIn(page, seedSubs.hassan)
    const shelf = await createShelf(page, shelfName)
    await createFolder(page, folderName)
    await page.goto(routesV2.shelf(shelf.id))

    // The reload witness: survives any client-side act, dies with the document.
    await page.evaluate(() => {
      ;(globalThis as unknown as Record<string, unknown>)['__ac223NoReload'] = true
    })

    await clickControl(
      /*
      Inside `main`, which is where 9.10 puts this control, and the scope is
      the correction rather than the name.

      `/Add folder/` is a substring and the sidebar's shelf heading carries
      "Add folder to {shelf}" since S24, which the prototype has always drawn
      and this client had dropped. Two controls answered, `.first()` took the
      sidebar's because the sidebar precedes `main`, and the case then looked
      for its folder in the wrong menu. This is RFC 0005 change control item
      47(e)'s ambiguity read across two surfaces instead of two rows, and it is
      the same correction item 14 made to AC-183's leave case. Nothing about
      what the criterion asserts moves.
      */
      page.getByRole('main').getByRole('button', { name: /Add folder/ }).first(),
      'spec 9.10: Add folder places an existing folder',
    )
    await clickControl(
      page
        .getByRole('menuitem', { name: new RegExp(folderName) })
        .or(page.getByRole('option', { name: new RegExp(folderName) }))
        .first(),
      'choose this case\'s folder',
    )
    await expect(
      page.getByRole('main').getByRole('link', { name: new RegExp(folderName) }).first(),
      'spec 9.10: the folder joined the page: its row is here without any further act',
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => (globalThis as unknown as Record<string, unknown>)['__ac223NoReload'],
      ),
      'AC-223\'s own words: "without a reload". The marker set before the act ' +
        'survives it, so the document never reloaded; a client refreshing the page ' +
        'to show the join loses the marker and fails here',
    ).toBe(true)
  })
})

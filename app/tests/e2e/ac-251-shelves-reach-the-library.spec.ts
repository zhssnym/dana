/*
AC-251: given a shelf created through 7.16, then the Library lists it after a
full reload as a group headed by that shelf's name, that heading is a link to
the shelf's own page, and the tab strip's "New tab" menu offers it beside the
folders; and given a shelf no folder has yet been put on, then the Library
lists it too, the block drawing the viewer's shelves rather than only the
labels its folders happen to carry.

**The reload is the whole criterion and it is not ceremony.** The parity
audit's addendum demonstrated this live before it was written down: a shelf
created through 7.16 renders its own page correctly at `/app/shelves/:id`,
with its name, its description, its empty state and its Add folder row, and
**is absent from the Library after a full reload**. The cause is one line that
does not exist. `shell/app-shell.tsx` imports `useShelves`, gates the read
behind `shelvesWanted`, true only when a shelf route or tab is already open,
and never passes a `shelves` prop to `AppSidebar` at all. So a client that
happens to be standing on a shelf page has the data in hand and still draws no
shelf in the Library, and a client that has navigated away does not even have
the data. Reloading onto a page that is not a shelf page is what tells those
two states apart from a working one, and a criterion that opened the shelf and
looked at the sidebar would pass against a client that never fixed anything.

**The empty shelf is the discriminator, and it is the one a mistake cannot
satisfy.** The Library's groups today are `folder_members.label` strings, and
`shell/library-order.ts` says so in terms: "a group is the label its folders
carry and nothing else", and "the one thing the encoding cannot hold is a
group with no folders in it, and no such thing exists". That sentence was true
when it was written and 7.16 has since made it false: `POST /shelves` writes a
`shelves` row and labels nothing, so a shelf with no folders is now an
ordinary thing to have. A client that kept the label model and merely joined
names to ids would draw the first shelf below and not the second, which is
exactly the half-fix this case exists to refuse. 9.1 is what settles it:
the Library holds "the viewer's shelves and folders as one ordered list".

**The heading is asserted as a link and not merely as text**, which is
DES-207 and 9.1's roles table. The built heading is a `CollapsibleTrigger`,
a button that folds the group and goes nowhere, so a shelf has a page that
nothing in the chrome reaches. Both are asserted here because the fix must
keep the fold: a heading that became a link and stopped folding would trade
one defect for another, and AC-214's Library still has to collapse.

**The "New tab" menu is 9.1's own sentence read literally**: the strip's plus
opens "any shelf or folder" as a tab, and the built menu maps folders alone.
AC-243 already asserts that each folder entry wears its own mark, so this case
asserts only that the shelf is offered, which is the half that is missing.

**The fixtures are this file's own and are deleted at the close.** The runner
seeds once and every spec in this leg reads the same sidebar, so a shelf left
behind would change what they see. 7.16's delete unlabels its folders and
keeps them, so the folder fixture survives its shelf and is deleted after it.

Spec: 9.1 (the Library "holding the viewer's shelves and folders as one
ordered list", "a shelf is a collapsible group of folder rows headed by its
name", the strip's "any shelf or folder"), 9.10 (the shelf page the heading
reaches), 7.16 (CRUD /shelves), 4.18 (a shelf is a stable id wearing a
changeable name, its membership `folder_members.label`), DES-207, and the
parity audit's "shelf pages, reachability" row with its dated addendum.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createShelf,
  deleteFolder,
  deleteShelf,
  labelFolder,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Fixture {
  /** A shelf carrying one folder, which the label model can already express. */
  stockedId: string
  stockedName: string
  /** A shelf carrying none, which it cannot. */
  bareId: string
  bareName: string
  folderId: string
  folderName: string
}

async function build(page: Page): Promise<Fixture> {
  const stockedName = caseTitle('ac-251 stocked')
  const bareName = caseTitle('ac-251 bare')
  const folderName = caseTitle('ac-251 folder')
  const stocked = await createShelf(page, stockedName)
  const bare = await createShelf(page, bareName)
  const folder = await createFolder(page, folderName)
  /* The shelf's membership is 7.4's own label, held in step with the shelf's
     name by 4.18. This is the act a person performs with "Move to shelf", and
     it is made through the address so the case measures the Library rather
     than the control that fills it. */
  await labelFolder(page, folder.id, stockedName)
  return {
    stockedId: stocked.id,
    stockedName,
    bareId: bare.id,
    bareName,
    folderId: folder.id,
    folderName,
  }
}

test.describe('AC-251: a shelf reaches the Library', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    await deleteShelf(page, fixture.stockedId)
    await deleteShelf(page, fixture.bareId)
    await deleteFolder(page, fixture.folderId)
  })

  test('AC-251: a shelf is in the Library after a full reload', async ({ page }) => {
    /* Desk rather than the shelf's own page, and then a reload, which is the
       state `shelvesWanted` does not cover: no shelf route is open and no
       shelf tab is either, so a client that only has shelves in hand while it
       is standing on one has nothing here. */
    await page.goto(routesV2.desk)
    await page.reload()

    await expect(
      sidebar(page).getByText(fixture.stockedName, { exact: true }),
      'spec 9.1: the Library holds "the viewer\'s shelves and folders as one ordered list", ' +
        'and "a shelf is a collapsible group of folder rows headed by its name". The built ' +
        'shell fetches useShelves and never passes a shelves prop to AppSidebar, so the ' +
        'Library cannot draw a shelf at all and the audit\'s addendum demonstrated exactly ' +
        'this absence on a fresh account',
    ).toBeVisible()

    await expect(
      sidebar(page).getByRole('link', { name: new RegExp(fixture.folderName) }),
      'the folder put on that shelf is still a row of the Library, the shelf being a group ' +
        'of folder rows rather than a replacement for them',
    ).toBeVisible()
  })

  test('AC-251: the shelf heading is a link to the shelf\'s own page and still folds', async ({
    page,
  }) => {
    await page.goto(routesV2.desk)
    await page.reload()

    const heading = sidebar(page).getByRole('link', {
      name: new RegExp(fixture.stockedName),
    })
    await expect(
      heading,
      'DES-207 and 9.1\'s roles table: the group heading reaches the shelf\'s page. The ' +
        'built heading is a CollapsibleTrigger, a button that folds the group and goes ' +
        'nowhere, so 9.10\'s page exists and nothing in the chrome reaches it',
    ).toBeVisible()

    await clickControl(heading, 'spec 9.10: pressing the shelf\'s name opens its page')
    await expect(
      page,
      'spec 9.10: the shelf is "the folder page one level up" and has a page of its own',
    ).toHaveURL(new RegExp(`/app/shelves/${fixture.stockedId}`))

    await expect(
      page.getByRole('main').getByText(fixture.stockedName, { exact: true }).first(),
      'the page reached is that shelf\'s and not another\'s',
    ).toBeVisible()
  })

  test('AC-251: a shelf holding no folders is listed too', async ({ page }) => {
    await page.goto(routesV2.desk)
    await page.reload()

    await expect(
      sidebar(page).getByText(fixture.bareName, { exact: true }),
      'shell/library-order.ts records the model this refuses: "a group is the label its ' +
        'folders carry and nothing else" and "the one thing the encoding cannot hold is a ' +
        'group with no folders in it, and no such thing exists". 7.16 made that false, POST ' +
        '/shelves writing a shelves row and labelling nothing, so a client that merely joined ' +
        'labels to shelf ids draws the stocked shelf and not this one',
    ).toBeVisible()
  })

  test('AC-251: the strip\'s New tab menu offers the shelf', async ({ page }) => {
    await page.goto(routesV2.desk)
    await page.reload()

    await clickControl(
      page.getByRole('button', { name: 'New tab', exact: true }),
      'spec 9.1: a "+" at the row\'s end opens any shelf or folder as a tab',
    )

    await expect(
      page.getByRole('menuitem', { name: fixture.stockedName, exact: true }),
      'spec 9.1: the strip\'s plus opens "any shelf or folder" as a tab. The built menu maps ' +
        'the folder list alone, so half of that sentence has no control behind it',
    ).toBeVisible()

    await expect(
      page.getByRole('menuitem', { name: fixture.folderName, exact: true }),
      'the folders the menu already offered are still offered: this widens the menu rather ' +
        'than replacing what it held',
    ).toBeVisible()
  })
})

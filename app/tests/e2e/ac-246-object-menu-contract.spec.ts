/*
AC-246: given one folder the viewer owns, then the acts its menu offers in the
sidebar's Library and the acts its own page's menu offers come from one
declared contract: both menus offer History, Rename, Move to shelf, Copy link,
Duplicate, Save as workflow and Delete folder, those acts stand in the same
relative order in both, and every other item either menu carries is one of the
four that belong to a surface rather than to the folder, the sidebar's "Add
task", "New folder group" and "Open in a new tab" and the page's "Transfer
ownership"; and given a folder the viewer is only a member of, then both menus
offer "Leave folder" in Delete folder's place and neither offers Rename or
Delete folder.

**The proof of the fault is two menus for one folder, and it is measurable
today.** The sidebar row's menu offers "New folder group" and "Move to shelf";
the folder page's offers History, Copy link, Duplicate, Save as workflow,
Rename folder, Transfer ownership and Delete folder. Where a person stands
decides what they can do to the same object, which is DES-201's sentence at the
largest scale the product has: "a behaviour settled for an object belongs to
that object's contract, not to each menu's diligence."

**Order is asserted because order is data.** The contract runs reach it,
change it, copy it, stop it, destroy it, with the destructive act last behind
a separator everywhere, "because a menu whose dangerous item moves is a menu
you cannot use without reading". Two menus holding one set in two orders would
satisfy a set comparison and would still be two menus.

**The exceptions are named rather than allowed for.** `object-menu`'s escape
hatch takes a rendered node rather than a spec, precisely so that an act
belonging to the object cannot be smuggled through it and diverge again. So
this criterion enumerates the four surface items that may appear and fails any
fifth: an act that shows up on one menu and not the other, and is not on that
list, is the divergence starting over.

**The member arm is AC-217 read on the surface that criterion never looked
at.** That criterion drives both accounts against the seeded Groceries folder
and asserts the page's menu alone. The whole point of a contract is that the
role filter is the object's rather than the page's, so the same assertion has
to hold in the Library, where the built sidebar menu offers neither exit and
therefore cannot be wrong in the interesting way yet.

Spec: 9.1 (every overflow menu is "More actions"; the window bar's right end
holds the object's overflow menu), 9.6 (the role matrix and the acts it gives
each role), AC-180 ("New folder group", "Move to shelf"), AC-217 (the role
split on the page), DES-201, DES-207, and the prototype's `lib/object-acts.ts`.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedIds,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The acts the contract declares for a folder, in the contract's own order,
 * restated here rather than imported: a suite that reads the list it asserts
 * out of the code under test asserts that the code equals itself.
 *
 * The exit is the last entry and is the one that differs by role, "Leave
 * folder" where "Delete folder" would be, which 9.6 makes a rule about the
 * object rather than about either surface.
 */
const CONTRACT = [
  'History',
  'Rename',
  'Move to shelf',
  'Copy link',
  'Duplicate',
  'Save as workflow',
] as const

/** What a surface may add of its own, and nothing else may appear. */
const SURFACE_ONLY = [
  'Add task',
  'New folder group',
  'Open in a new tab',
  'Transfer ownership',
]

/** Every menu item currently open, in the order the menu draws them. */
async function itemNames(page: Page): Promise<string[]> {
  const items = page.getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  const names = await items.allInnerTexts()
  return names.map((name) => name.trim()).filter((name) => name !== '')
}

/** The Library row for a folder, which 9.1's roles table makes a link. */
function libraryRow(page: Page, name: string): Locator {
  return sidebar(page).getByRole('link', { name: new RegExp(name) })
}

/*
The row is found by its text and not by `filter({ has })`, and the first run of
this file is why: an inner locator rooted at the navigation landmark is not
queried against the outer listitem, so the filter matched nothing and the
failure read as a missing control on a row that was drawing one. AC-173's
helper had the working shape all along.
*/
async function openLibraryMenu(page: Page, name: string): Promise<void> {
  const row = libraryRow(page, name)
  await row.hover()
  const item = sidebar(page).getByRole('listitem').filter({ hasText: name }).last()
  await clickControl(
    item.getByRole('button', { name: 'More actions', exact: true }),
    'spec 9.1: a sidebar folder row\'s menu is "More actions", the same control the folder ' +
      'page\'s window bar carries, pointed at the same object',
  )
}

async function openPageMenu(page: Page): Promise<void> {
  await clickControl(
    page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
    'spec 9.1: the active tab\'s controls include the object\'s overflow menu',
  )
}

/** Escape closes a menu, so one case may read both without a reload. */
async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem').first()).toBeHidden()
}

test.describe('AC-246: one folder, one menu', () => {
  test('AC-246: the owner\'s two menus draw one contract in one order', async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.folder(seedIds.groceries))

    await openPageMenu(page)
    const onPage = await itemNames(page)
    await closeMenu(page)

    await openLibraryMenu(page, 'Groceries')
    const inLibrary = await itemNames(page)

    const contract = [...CONTRACT, 'Delete folder']
    for (const act of contract) {
      expect(
        onPage,
        `DES-201: "${act}" belongs to the folder, so its own page offers it`,
      ).toContain(act)
      expect(
        inLibrary,
        `DES-201: "${act}" belongs to the folder and not to the page, so the Library row ` +
          'offers it too. The built sidebar menu offers two items in all, which is the ' +
          'divergence the parity audit measured',
      ).toContain(act)
    }

    const orderOnPage = onPage.filter((name) => contract.includes(name))
    const orderInLibrary = inLibrary.filter((name) => contract.includes(name))
    expect(
      orderInLibrary,
      'the contract\'s own rule: "Order is data ... destructive last and behind a separator, ' +
        'everywhere, because a menu whose dangerous item moves is a menu you cannot use ' +
        'without reading"',
    ).toEqual(orderOnPage)

    const allowed = new Set([...contract, ...SURFACE_ONLY])
    for (const name of [...onPage, ...inLibrary]) {
      expect(
        allowed.has(name),
        `"${name}" is on neither the folder's contract nor the list of four items a surface ` +
          'may add of its own, so it is an act that exists in one place and not the other, ' +
          'which is exactly what the contract exists to stop happening again',
      ).toBe(true)
    }
  })

  test('AC-246: a member gets the same exit on both surfaces', async ({ page }) => {
    await signIn(page, seedSubs.imran)
    await page.goto(routesV2.folder(seedIds.groceries))

    await openPageMenu(page)
    const onPage = await itemNames(page)
    await closeMenu(page)

    await openLibraryMenu(page, 'Groceries')
    const inLibrary = await itemNames(page)

    for (const [where, names] of [
      ['the folder page', onPage],
      ['the Library row', inLibrary],
    ] as const) {
      expect(
        names,
        `spec 9.1's names table puts "Leave folder" on a folder's member surface, and 9.6 ` +
          `makes that a fact about the folder rather than about ${where}`,
      ).toContain('Leave folder')
      expect(
        names.some((name) => name.startsWith('Rename')),
        `DES-225: the name is the owner's, so ${where} must not offer Rename where the ` +
          'server would answer 403',
      ).toBe(false)
      expect(
        names.some((name) => name.startsWith('Delete folder')),
        `spec 8.2: only the owner deletes a folder, so ${where} does not offer it`,
      ).toBe(false)
    }
  })
})

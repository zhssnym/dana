/*
AC-243: given a folder whose icon and colour are set once from its own page's
mark, then the same glyph and the same colour are drawn on that folder's
sidebar row, on the folder chip of a task in it wherever that task's row is
listed, and on that folder's entry in the tab strip's "New tab" menu; and
given a second folder wearing a different glyph, then no two of those surfaces
draw the first folder's glyph for the second.

**This criterion measures travel, and that is the whole of why it exists.**
Presence is what the built client already passes: every one of these surfaces
draws *a* mark today. What none of them draws is *this folder's* mark. DES-130
put a folder's identity in 4.3's shared columns and only the two surfaces
written after that ruling, the folder page and the shelf row, ever read it, so
identity stops at the sidebar's edge. The owner's own recorded complaint of
2026-08-22 is the sentence this asserts: "This thing needs consistency not only
in Assignments page, in all task rows wherever they might be."

**One act of picking, three readers.** The fixture writes the identity once,
through PATCH /folders/:id, which is exactly what the folder page's mark
commits, and every assertion below reads a different surface. A client that
resolved identity per surface could pass any one of these and cannot pass all
three, which is the property the audit's "one resolver" row is about.

**A glyph has no name, so the drawing is what is asserted.** Every mark in
this client is `aria-hidden`, deliberately, because a glyph swap must never be
a rename: `task-row.tsx` records that rule against the star. So there is no
accessible name to read and `glyphGeometry` reads the SVG path data instead,
which is the same for two elements showing one Lucide icon whatever wrapper,
size class or animation surrounds them. Each comparison also asserts the
reference set is non-empty, because two surfaces that both draw nothing are
equal and prove nothing.

**The second folder is the discriminator and it is not decoration.** A client
that drew one hardcoded glyph for every folder would satisfy every "the same
drawing appears here too" assertion in this file. The pair is what cannot be
satisfied by a mistake, which is AC-173's own construction applied to the
glyph rather than to the colour.

**The colour is 4.3's, not 4.4's.** 9.6 retires the per-member column from
every v2 surface, so the paint asserted here is the shared identity every
member reads, and two colours are chosen that no seed row and no other spec
uses, so a surface carrying one carries it because this folder was painted
with it.

**The task rows are read on Anytime and not on All, and the first run of this
file is why.** All arranges its open work into a section per folder, so Q2's
rule applies there and a row inside a folder group draws no folder chip at all:
the heading above it is the folder. Read on All, the two cases below found a
row carrying its star and its overflow and nothing else, which is that rule
working rather than the port failing. Anytime is Q2's rows ungrouped, so a row
there carries the chip this criterion is about.

**The folders are this file's own and are deleted at the close.** The runner
seeds once and every spec in this leg reads the same sidebar, so a folder left
behind would change what they see.

Spec: 9.1 (the Library's folder rows carry "the folder's mark (its icon in its
colour, 4.3)", the strip's "New tab" offering any shelf or folder), 9.6 (the
mark is the identity control and 4.4's colour is no longer written), 4.3 (the
icon and colour columns), frozen 7.4 (PATCH /folders/:id), DES-130, and the
parity audit's folder-mark row.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createFolder,
  createTask,
  deleteFolder,
  glyphGeometry,
  hexToRgb,
  paintedColors,
  routesV2,
  seedSubs,
  setFolderIdentity,
  sidebar,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * Two of 4.3's icon keys that no seed row and no other spec sets, and two
 * colours the same is true of. A car and a house are the owner's own example
 * ("a house for Home, a car for Travel"), and their drawings share no path.
 */
const TRAVEL = { icon: 'car', color: '#FF3366' }
const HOME = { icon: 'house', color: '#0055AA' }

interface Fixture {
  travelId: string
  homeId: string
  travelName: string
  homeName: string
  travelTask: string
  homeTask: string
}

async function build(page: Page): Promise<Fixture> {
  const travelName = caseTitle('ac-243 travel')
  const homeName = caseTitle('ac-243 home')
  const travel = await createFolder(page, travelName)
  const home = await createFolder(page, homeName)
  await setFolderIdentity(page, travel.id, TRAVEL)
  await setFolderIdentity(page, home.id, HOME)
  const travelTask = caseTitle('ac-243 packing')
  const homeTask = caseTitle('ac-243 hoovering')
  await createTask(page, { title: travelTask, folder_id: travel.id })
  await createTask(page, { title: homeTask, folder_id: home.id })
  return { travelId: travel.id, homeId: home.id, travelName, homeName, travelTask, homeTask }
}

/** The Library row for a folder, which 9.1's roles table makes a link. */
function libraryRow(page: Page, name: string): Locator {
  return sidebar(page).getByRole('link', { name: new RegExp(name) })
}

test.describe('AC-243: a folder\'s mark travels', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    await deleteFolder(page, fixture.travelId)
    await deleteFolder(page, fixture.homeId)
  })

  test('AC-243: the sidebar row draws the folder page\'s own mark', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.travelId))

    const mark = page
      .getByRole('main')
      .getByRole('button', { name: `Icon and colour for ${fixture.travelName}`, exact: true })
    const reference = await glyphGeometry(mark)
    expect(
      reference.length,
      'spec 9.6: the folder page\'s mark is the identity control and draws the glyph 4.3 ' +
        'stores. A mark drawing nothing would make every comparison in this file vacuous',
    ).toBeGreaterThan(0)

    const row = libraryRow(page, fixture.travelName)
    await expect(
      row,
      'spec 9.1: the Library holds the viewer\'s folders as rows, one per folder',
    ).toBeVisible()

    expect(
      await glyphGeometry(row),
      'spec 9.1: "each folder row carries the folder\'s mark (its icon in its colour, 4.3)". ' +
        'The built row draws a literal folder glyph, so identity stops at the sidebar\'s edge, ' +
        'which is the defect DES-130\'s one resolver exists to close',
    ).toEqual(expect.arrayContaining(reference))

    expect(
      await paintedColors(row),
      'spec 9.6: 4.3\'s colour is the folder\'s own, shared by every member, and 4.4\'s ' +
        'per-member column is no longer written by any v2 surface',
    ).toContain(hexToRgb(TRAVEL.color))
  })

  test('AC-243: a task row\'s folder chip draws that folder\'s mark', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.travelId))
    const reference = await glyphGeometry(
      page
        .getByRole('main')
        .getByRole('button', { name: `Icon and colour for ${fixture.travelName}`, exact: true }),
    )
    expect(reference.length).toBeGreaterThan(0)

    await page.goto(routesV2.anytime)
    const row = taskRow(page, fixture.travelTask)
    await expect(row).toBeVisible()

    expect(
      await glyphGeometry(row),
      'the owner, 2026-08-22: "This thing needs consistency not only in Assignments page, in ' +
        'all task rows wherever they might be". The built row draws a generic folder glyph ' +
        'beside the folder\'s name, so a person who chose a car for Travel meets a filing ' +
        'cabinet on every row of it',
    ).toEqual(expect.arrayContaining(reference))
  })

  test('AC-243: the strip\'s New tab menu draws each folder\'s own mark', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.travelId))
    const reference = await glyphGeometry(
      page
        .getByRole('main')
        .getByRole('button', { name: `Icon and colour for ${fixture.travelName}`, exact: true }),
    )
    expect(reference.length).toBeGreaterThan(0)

    await clickControl(
      page.getByRole('button', { name: 'New tab', exact: true }),
      'spec 9.1: a "+" at the row\'s end opens any shelf or folder as a tab',
    )
    const entry = page.getByRole('menuitem', { name: fixture.travelName, exact: true })
    await expect(entry).toBeVisible()

    expect(
      await glyphGeometry(entry),
      'spec 9.1: every tab is the same tab, one anatomy of mark, title and close control, and ' +
        'the mark of a folder is 4.3\'s. The built menu draws one folder glyph for every entry',
    ).toEqual(expect.arrayContaining(reference))
  })

  test('AC-243: a second folder is not drawn with the first\'s glyph', async ({ page }) => {
    await page.goto(routesV2.folder(fixture.travelId))
    const travelMark = await glyphGeometry(
      page
        .getByRole('main')
        .getByRole('button', { name: `Icon and colour for ${fixture.travelName}`, exact: true }),
    )
    await page.goto(routesV2.folder(fixture.homeId))
    const homeMark = await glyphGeometry(
      page
        .getByRole('main')
        .getByRole('button', { name: `Icon and colour for ${fixture.homeName}`, exact: true }),
    )

    expect(
      homeMark,
      'the two fixtures wear a house and a car, whose drawings share no path. If these were ' +
        'equal the discriminator below would be satisfied by a client drawing one glyph for ' +
        'every folder, which is the client this criterion exists to fail',
    ).not.toEqual(travelMark)

    const homeRow = libraryRow(page, fixture.homeName)
    const homeRowGlyph = await glyphGeometry(homeRow)
    expect(
      homeRowGlyph,
      'DES-130: identity is the folder\'s, so the second folder\'s row draws the second ' +
        'folder\'s glyph and not the first\'s',
    ).toEqual(expect.arrayContaining(homeMark))
    expect(
      travelMark.every((path) => homeRowGlyph.includes(path)),
      'a client painting every row from one swatch, or drawing every row with one glyph, ' +
        'passes each "the mark appears here too" assertion above and fails this one',
    ).toBe(false)

    await page.goto(routesV2.anytime)
    const homeTaskRow = taskRow(page, fixture.homeTask)
    const homeTaskGlyph = await glyphGeometry(homeTaskRow)
    expect(homeTaskGlyph).toEqual(expect.arrayContaining(homeMark))
    expect(
      travelMark.every((path) => homeTaskGlyph.includes(path)),
      'the same discriminator on the row: the chip of a task in Home must not draw Travel\'s car',
    ).toBe(false)
  })
})

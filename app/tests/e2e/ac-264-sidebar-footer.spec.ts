/*
AC-264: given the sidebar at its full width, then its footer offers "New
folder" and then "New shelf", "Import" and "Trash" as one row of three, which
is 9.1's composition; and when the sidebar is narrowed, then "New shelf" keeps
its label while the other two show their glyphs alone, and all three are named
by tooltip in both states.

**The composition is 9.1's sentence and its ordering carries a reason the
criterion has to keep.** "One primary 'New folder' action; then a row of three
placed by role: 'New shelf', 'Import' (a workflow file), and 'Trash', the
first two acts of making and the third a destination." The built footer offers
New folder and then Trash, People and Settings as three navigation rows, and
its own comment names the gap: "the other two acts that row owes, 'New shelf'
and 'Import', arrive with the surfaces they make." This is that row.

**Trash stays where the built file already put it, and that is not an
accident.** It is a destination rather than an act, so the row of three is not
three buttons: two make something and the third goes somewhere. A criterion
that asserted three buttons would push a client into making Trash an action,
which 9.1 explicitly does not, so what is asserted is the composition and the
tooltip rather than a role for all three.

**The narrow state is DES-216 and it is asserted as an asymmetry.** 9.1: "when
the sidebar narrows, 'New shelf' keeps its label and the other two drop to
icons, all three named by tooltip in every state." An implementation that
dropped all three labels together, or kept all three, is the easy version of
this and is what the asymmetry refuses. The tooltip clause is asserted in both
states because it is what keeps the narrow footer usable at all, and 9.1 makes
it unconditional.

**Import is asserted to reach the file, not merely to exist.** 9.1 calls it
"Import (a workflow file)", and `useImportWorkflow` has existed since S13 with
exactly one caller, the starter offer. A label with no picker behind it is the
same defect as a control with no endpoint, one level down, so the control is
asserted to open a file chooser.

**People and Settings are asserted to survive.** 9.1 puts them after the row
of three, "then People and Settings as links; then the avatar menu". The
built footer has them and a port that replaced three nav rows with a row of
three could lose them, which would be trading one clause of the section for
another.

Spec: 9.1 (the footer's composition, the narrowing rule, People and Settings,
and the account menu after them), 7.16 (POST /workflows/import), DES-209,
DES-216, and the parity audit's sidebar-footer row.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  routesV2,
  seedSubs,
  sidebar,
  signIn,
  TEST_TIMEOUT_MS,
  tooltipText,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The row of two, since the polish round of 2026-08-30 (sidebar F10).
 *
 * 9.1's row was three, "New shelf", "Import" and "Trash", and the third was
 * a destination among acts: an unlabelled glyph at the default width that a
 * newcomer could not tell from Import beside it. Trash is a place, so it
 * joined the places, a navigation row above People and Settings, and the row
 * keeps the two acts of making with their words at every width.
 */
const ROW_OF_TWO = ['New shelf', 'Import'] as const

function control(page: Page, name: string) {
  return sidebar(page)
    .getByRole('button', { name, exact: true })
    .or(sidebar(page).getByRole('link', { name, exact: true }))
    .first()
}

/**
 * Drags the rail to one end of its range through the handle 9.1 gives it,
 * which is the gesture DES-216's label dropping responds to.
 *
 * The travel is far past either end on purpose: the clamp of `preferences.ts`
 * holds the sidebar between 224 and 360, so an overshoot lands exactly at the
 * end rather than wherever the drag happened to stop, and the case is reading
 * the two ends rather than a width it guessed.
 */
async function drag(page: Page, to: 'wide' | 'narrow'): Promise<void> {
  const handle = page.getByRole('separator', { name: /sidebar/i }).first()
  await expect(
    handle,
    'spec 9.1: the sidebar carries a resize handle, which AC-182 drives',
  ).toBeVisible()
  const box = await handle.boundingBox()
  expect(box, 'the handle is on the page and has a box to drag').not.toBeNull()
  if (box === null) return
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + (to === 'wide' ? 400 : -400), y, { steps: 12 })
  await page.mouse.up()
}

test.describe('AC-264: the sidebar footer is 9.1\'s composition', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
  })

  test('AC-264: New folder, then the row of two, then Trash among the places', async ({ page }) => {
    await expect(
      control(page, 'New folder'),
      'spec 9.1: "one primary New folder action"',
    ).toBeVisible()

    for (const name of ROW_OF_TWO) {
      await expect(
        control(page, name),
        `spec 9.1: "then a row of two acts of making: New shelf and Import (a workflow ` +
          `file)". ${name} is one of the two`,
      ).toBeVisible()
    }

    /* The order is the section's. Reading the boxes rather than the DOM keeps
       the assertion about what a person sees. */
    const positions: number[] = []
    for (const name of ROW_OF_TWO) {
      const box = await control(page, name).boundingBox()
      expect(box, `${name} has a box`).not.toBeNull()
      if (box !== null) positions.push(Math.round(box.x))
    }
    expect(
      positions,
      'spec 9.1 orders the two as it names them, New shelf then Import across the row',
    ).toEqual([...positions].sort((a, b) => a - b))

    const trash = sidebar(page).getByRole('link', { name: 'Trash', exact: true })
    await expect(
      trash,
      'spec 9.1: "then Trash, People and Settings as links". Trash is a destination and ' +
        'stands with the other places rather than in a row of acts (polish round, sidebar F10)',
    ).toBeVisible()
    await expect(trash, 'the link reaches 9.11\'s page').toHaveAttribute('href', /\/app\/trash$/)

    const newFolder = await control(page, 'New folder').boundingBox()
    const newShelf = await control(page, 'New shelf').boundingBox()
    expect(newFolder, 'New folder has a box').not.toBeNull()
    expect(newShelf, 'New shelf has a box').not.toBeNull()
    if (newFolder !== null && newShelf !== null) {
      expect(
        newShelf.y,
        'spec 9.1: the primary action stands above the row of three rather than in it',
      ).toBeGreaterThan(newFolder.y)
    }

    for (const name of ['People', 'Settings']) {
      await expect(
        control(page, name),
        'spec 9.1: "then People and Settings as links". The built footer has them and a port ' +
          'that replaced three nav rows with a row of three could lose them',
      ).toBeVisible()
    }
  })

  test('AC-264: both labels survive the narrow end, and both are named by tooltip', async ({ page }) => {
    /*
    Both ends of the range are read, wide first, for the reason the older
    case gave: a case that only read one end could pass against a footer
    whose labels were never there. DES-216's asymmetry, New shelf keeping its
    word while the others dropped to glyphs, was the arithmetic of three words
    in 240px; with two words there is room at every width, and the polish
    round's rule is that a control with no word at rest is a control a
    newcomer has to guess, so both keep theirs at both ends.

    `useInnerText`, because `textContent` includes a node CSS has hidden and
    a label that had wrongly dropped would still read as present.
    */
    for (const end of ['wide', 'narrow'] as const) {
      await drag(page, end)
      for (const name of ROW_OF_TWO) {
        await expect(
          control(page, name),
          `spec 9.1: the footer's two acts of making carry their words at every width, and ` +
            `${name} is one of them (read at the ${end} end)`,
        ).toContainText(name, { useInnerText: true })
      }
    }

    for (const name of ROW_OF_TWO) {
      expect(
        await tooltipText(
          control(page, name),
          `spec 9.1: "both named by tooltip in every state". A footer whose glyphs are ` +
            `unnamed is unusable, which is why that clause is unconditional`,
        ),
      ).toContain(name)
    }
  })

  test('AC-264: Import reaches a workflow file', async ({ page }) => {
    const chooser = page.waitForEvent('filechooser')
    await clickControl(
      control(page, 'Import'),
      'spec 9.1: "Import (a workflow file)", which is 7.16\'s POST /workflows/import. ' +
        'useImportWorkflow has existed since S13 with one caller, the starter offer, so a ' +
        'label with no picker behind it is a control with nothing behind it one level down',
    )
    await expect(
      (await chooser).page(),
      'the control opens a file chooser rather than merely being a label',
    ).toBe(page)
  })
})

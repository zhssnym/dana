/*
AC-244: given one person carrying tasks on Assignments and named in a folder's
member list, then the disc drawn for that person is painted the same colour on
both surfaces, the tint being a function of the person and not of the surface;
and given a second person, then the two discs are painted differently.

**Seven files draw a person and no two of them agree.** `task-row.tsx`,
`FolderPage.tsx`, `FolderSharingPanel.tsx`, `InviteGate.tsx`, `PeoplePage.tsx`,
`SettingsPage.tsx` and `app-sidebar.tsx` each build their own avatar out of the
same primitive, every one of them neutral, which is the state the prototype's
`person-face.tsx` describes at its own head: "There were two ... if a third
file ever needs it, it moves somewhere neutral." The
deterministic tint is what makes one person recognisable across them, and a
neutral disc is recognisable nowhere.

**The assertion is paint, not markup**, on AC-173's precedent exactly: a disc
is not a control and not a region, no section names it, and an accessible
implementation may give it no role at all. What can be held to is that this
person's colour was painted somewhere inside a row that names this person, and
that two people's rows were painted differently.

**The two task rows differ only in who is assigned.** Both are made in one
folder with no date, no star and no steps, so every other thing a row paints
is common to them and the difference this file measures is the person. A
client with neutral discs paints the two rows identically and fails at the
first assertion; a client that tinted by row position rather than by person
would pass that one and fail the People page.

**The third surface is a different file, and that is the point.** The People
page's roster row is `PeoplePage.tsx`'s own avatar, written independently of
the row's, so a tint that travels between them is a tint that came from one
resolver rather than from two that happen to agree today.

**Both people are the seed's**, Hassan and Imran, who are connected and share
Groceries, so no fixture has to invent a person. The tasks are this file's own
and are deleted at the close.

Spec: 9.1 (a row's assignee chip), 9.8 (the People screen's roster), and the
prototype's `person-face.tsx`, whose rule is two sizes, one disc, and a tint
from the model so "one person is the same colour on every surface".
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  createTask,
  deleteTask,
  paintedColors,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The People page's row for one person, which 9.8 makes a roster list.
 *
 * Addressed by the row's own sentence rather than by a role the section never
 * fixes for it, which is how 9.1's addressing paragraph reaches a list item
 * whose controls are named and whose container is not.
 */
function rosterRow(page: Page, name: string): Locator {
  return page.getByRole('main').getByRole('listitem').filter({ hasText: name })
}

/** Colours in `mine` that `theirs` does not carry: this person's own paint. */
function only(mine: readonly string[], theirs: readonly string[]): string[] {
  return mine.filter((colour) => !theirs.includes(colour))
}

interface Fixture {
  hassanTask: string
  imranTask: string
  ids: readonly string[]
}

test.describe('AC-244: one person is one colour', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    const hassanTask = caseTitle('ac-244 carried by Hassan')
    const imranTask = caseTitle('ac-244 carried by Imran')
    const mine = await createTask(page, {
      title: hassanTask,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    const theirs = await createTask(page, {
      title: imranTask,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.imran,
    })
    fixture = { hassanTask, imranTask, ids: [mine.id, theirs.id] }
  })

  test.afterEach(async ({ page }) => {
    for (const id of fixture.ids) await deleteTask(page, id)
  })

  test('AC-244: two people on one page are painted differently', async ({ page }) => {
    await page.goto(routesV2.assignments)

    const hassanRow = taskRow(page, fixture.hassanTask)
    const imranRow = taskRow(page, fixture.imranTask)
    await expect(hassanRow).toBeVisible()
    await expect(imranRow).toBeVisible()

    const hassanPaint = await paintedColors(hassanRow)
    const imranPaint = await paintedColors(imranRow)

    expect(
      only(imranPaint, hassanPaint).length,
      'the prototype\'s person-face: "the tint is deterministic and comes from task-model, so ' +
        'one person is the same colour on every surface". Two rows identical in every other ' +
        'respect must differ where the person differs, and the built client paints both discs ' +
        'from one neutral swatch, so nothing tells one carrier from another at a glance',
    ).toBeGreaterThan(0)
  })

  test('AC-244: the same person is painted the same on the People screen', async ({ page }) => {
    await page.goto(routesV2.assignments)
    const hassanPaint = await paintedColors(taskRow(page, fixture.hassanTask))
    const imranPaint = await paintedColors(taskRow(page, fixture.imranTask))
    const imranTint = only(imranPaint, hassanPaint)
    expect(imranTint.length).toBeGreaterThan(0)

    await page.goto(routesV2.people)
    const roster = rosterRow(page, 'Imran')
    await expect(
      roster,
      'spec 9.8: the People screen is a roster list, one row per connection',
    ).toBeVisible()

    expect(
      await paintedColors(roster),
      'one disc for the whole product: the tint is a function of the person, so the colour a ' +
        'task row gives Imran is the colour his roster row gives him. Seven files draw a ' +
        'person today and each decides its own paint, which is the drift this closes',
    ).toEqual(expect.arrayContaining(imranTint))
  })
})

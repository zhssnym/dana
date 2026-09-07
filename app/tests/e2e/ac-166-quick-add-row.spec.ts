/*
AC-166: given a page carrying 9.1's inline quick-add, then it renders
collapsed as a single control named "Add a task"; activating it reveals a
focused text box of that same name; a title entered and committed there saves
immediately with every other field at that page's entry-point defaults per
9.3; and escape clears the box and returns the control to collapsed.

Rewritten by RFC 0002, Accepted 2026-08-13, which replaces this criterion's
text rather than deleting it. The sentence above is that RFC's Replace unit
transcribed unchanged, and it becomes section 12's own text when the delta
merges. What moved is the quick-add itself: it was a row always on the page
and it is now a disclosure, so this criterion asserts both of its states and
the transitions between them where the text it replaces asserted one.

The standing reason this criterion exists is unchanged. 9.1 gives the
quick-add its behaviours in one sentence and section 12 covered none of them
until this number was assigned: enter saving immediately, the other fields
taking that entry point's defaults, and escape clearing. AC-093 asserts the
same defaults against the form, which is the other consumer of them and a
different control, because the form shows a person the defaults before they
commit where this control commits without showing them anything. That is why
a wrong default here is invisible until the task turns up somewhere
unexpected.

**The two states carry one name and that is the point of asserting both.**
9.1 ruled on 2026-08-13 that the collapsed control and the expanded text box
answer to "Add a task" alike, being one affordance never on the page twice.
So a client rendering only the text box passes any assertion that asks for
the name and fails the one that asks for the collapsed control's role, and a
client whose escape leaves the box open passes every assertion about clearing.
Both are asserted below by role.

**Focus is asserted because 9.1 writes it.** "activating it reveals a title
input, focused" is the whole of what makes a disclosure worth having over a
row: the person presses one thing and types. A box that appears unfocused
costs a keystroke on every capture, which is the operation this control
exists for.

**Escape is still the half worth the most.** A control that saves on escape,
or that keeps its text after one, costs a person a task they decided not to
create, and nothing about the page afterwards says where it went. It now owes
the collapsed state as well, escape being what closes the disclosure.

Spec: 9.1 (the quick-add and its two states, the name it carries in both),
9.3 (the entry-point defaults it commits), 9.5 (per-group adds are undated on
Tasks), 9.6 (the folder page's one open list carries one quick-add), 6 Q2, Q3.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  captureTaskFromCanvas,
  clickControl,
  fillControl,
  quickAddControl,
  quickAddInput,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  waitForApiIdle,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

interface Card {
  title: string
  due_date: string | null
  important: boolean
  folder: { name: string }
}

/** What the server stored, read back through Q8 rather than off the page. */
async function stored(page: Page, title: string): Promise<Card[]> {
  const response = await page.request.get(
    `/api/v1/search?q=${encodeURIComponent(title)}&tz=UTC`,
  )
  expect(
    response.status(),
    `GET /search answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  const body = (await response.json()) as { rows: Card[] }
  return body.rows.filter((row) => row.title === title)
}

/**
 * Opens the first quick-add on the page and hands back its text box.
 *
 * The collapsed control is asserted before it is pressed and the box is
 * asserted focused after, because those two are half of what this criterion
 * says and every case below needs the box open before it can say anything
 * else.
 */
async function expandQuickAdd(page: Page, where: string): Promise<ReturnType<typeof quickAddInput>> {
  const collapsed = quickAddControl(page).first()
  await expect(
    collapsed,
    `spec 9.1 on ${where}: the inline quick-add renders collapsed as a single control named ` +
      '"Add a task". A client that renders the text box outright has no collapsed state, which ' +
      'is the state this criterion was rewritten to hold',
  ).toBeVisible()
  await clickControl(collapsed, `spec 9.1 on ${where}: the collapsed quick-add is activated`)

  const box = quickAddInput(page).first()
  await expect(
    box,
    `spec 9.1 on ${where}: activating the control reveals a title input carrying the same ` +
      'name, "Add a task", which 9.1 fixed on 2026-08-13 as one name across two states',
  ).toBeVisible()
  await expect(
    box,
    `spec 9.1 on ${where}: the revealed input is focused. A box that appears unfocused costs a ` +
      'keystroke on every capture, which is the operation this control exists for',
  ).toBeFocused()
  return box
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-166: the inline quick-add', () => {
  test("AC-166: enter on Tasks saves immediately, undated, in that group's folder", async ({
    page,
  }) => {
    const title = 'ac-166 tasks quick add'
    await page.goto(routesV2.anytime)

    const quickAdd = await expandQuickAdd(page, 'Tasks')
    await fillControl(quickAdd, title, 'spec 9.1: the expanded quick-add is a title input')
    await quickAdd.press('Enter')

    await expect(
      taskRow(page, title),
      'spec 9.1: enter saves immediately, and 8.3 refetches the active view after an own ' +
        'mutation, so the row is on the page with nothing else pressed',
    ).toBeVisible()
    await expect(
      quickAddInput(page).first(),
      'the box is ready for the next task, which is what "immediately" is for. 9.1 closes the ' +
        'disclosure on escape and on nothing else, so a save leaves it open and empty',
    ).toHaveValue('')

    const rows = await stored(page, title)
    expect(rows.length, 'exactly one task was created').toBe(1)
    const card = rows[0]
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.due_date,
      'spec 9.5: the inline quick-add per group adds into that folder, undated, and 9.3 ' +
        'gives the Tasks entry point an empty due date',
    ).toBeNull()
    expect(card.important, 'spec 9.3: important is off at this entry point').toBe(false)
    expect(
      card.folder.name,
      'spec 9.3: the Tasks entry point defaults to the viewer default folder, and the box ' +
        'was typed into the ungrouped block that folder heads at the top of the page (6 Q2)',
    ).toBe('Desk')
  })

  test('AC-166: enter on the Planned list saves the task dated today', async ({ page }) => {
    const title = 'ac-166 planned quick add'
    await page.goto(routesV2.scheduled)

    const quickAdd = await expandQuickAdd(page, 'the Planned list')
    await fillControl(quickAdd, title, 'spec 9.1: the expanded quick-add is a title input')
    await quickAdd.press('Enter')
    await expect(
      taskRow(page, title),
      'spec 9.1: enter saves immediately, and 6 Q3 keeps the row on Planned only if it was ' +
        'dated, which is what the assertion below reads from the server',
    ).toBeVisible()

    const rows = await stored(page, title)
    const card = rows[0]
    expect(rows.length, 'exactly one task was created').toBe(1)
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.due_date,
      'spec 9.3: the Planned list entry point defaults the due date to today, which is also ' +
        'the only thing that puts the new row on the page it was typed on (6 Q3 admits dated ' +
        'rows only). A quick-add saving it undated leaves the person watching it vanish',
    ).toBe(seedDate(0))
    expect(card.important, 'spec 9.3: important is off at this entry point').toBe(false)
  })

  test('AC-166: escape keeps a filled box, collapses an empty one, and creates nothing', async ({
    page,
  }) => {
    const title = 'ac-166 escaped and never created'
    await page.goto(routesV2.anytime)

    const quickAdd = await expandQuickAdd(page, 'Tasks')
    await fillControl(quickAdd, title, 'spec 9.1: the expanded quick-add is a title input')
    await quickAdd.press('Escape')

    /* Reworked in the polish round of 2026-08-30 (taskrow F7, AC-353): escape
       and clicking away follow one rule, a box with words keeps them and an
       empty box collapses. Escape used to throw the words away while a click
       kept them, two answers to one gesture. */
    await expect(
      quickAddInput(page),
      'spec 9.1: escape on a filled box keeps the words, exactly as clicking away does',
    ).toHaveValue(title)
    await quickAdd.fill('')
    await quickAdd.press('Escape')
    await expect(
      quickAddInput(page),
      'spec 9.1: escape on an empty box returns the control to collapsed, so the box is no ' +
        'longer on the page at all',
    ).toHaveCount(0)
    await expect(
      quickAddControl(page).first(),
      'spec 9.1: and the collapsed control is what is there instead, under the same name',
    ).toBeVisible()

    // The same barrier the reminder criteria needed, for the same reason
    // pointed the other way. This case asserts an absence, and an absence is
    // what a read reports when it arrives before the write it was looking
    // for: a row that committed on escape would have its POST in flight while
    // this read travels on Playwright's own HTTP client, and the case would
    // pass against the implementation it exists to catch.
    await waitForApiIdle(
      page,
      'escape is asserted to have created nothing, so everything the page might have sent has ' +
        'to have been sent and answered before the server is asked',
    )
    expect(
      await stored(page, title),
      'spec 9.1 gives escape one meaning, clearing and collapsing, so it is not a second way ' +
        'to save. A row that commits on escape costs a person a task they decided against, and ' +
        'nothing on the page afterwards says where it went',
    ).toEqual([])
  })

  test('AC-166: a folder page compose seam adds into that folder', async ({ page }) => {
    const title = 'ac-166 folder compose capture'
    await page.goto(routesV2.folder(seedIds.groceries))
    await captureTaskFromCanvas(page, title)

    const rows = await stored(page, title)
    const card = rows[0]
    expect(rows.length, 'exactly one task was created').toBe(1)
    if (card === undefined) throw new Error('unreachable: length asserted above')
    expect(
      card.folder.name,
      'spec 9.3: the folder page entry point defaults the folder to that folder, not to Desk',
    ).toBe('Groceries')
    expect(
      card.due_date,
      "spec 9.3 as RFC 0002 restates it: the folder page's row gives an empty due date, there " +
        'being no section context left to read once 9.6 carries one open list',
    ).toBeNull()
  })
})

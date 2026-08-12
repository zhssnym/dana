/*
AC-176: given a folder page, then its open tasks render in one region named
"All open tasks" holding the folder's dated and undated open tasks together
in Q7's order, a filter offers all open tasks, only those with a due date and
only those without, and the Completed region stays collapsed with its control
reporting that state.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

9.6 fixed a Scheduled section and an Unscheduled section from the day it was
written, and the owner ruled for one list on 2026-08-13 on the merits: a
folder is the one page in Dana that holds both kinds of task, Q7 already
returns them as one ordered result, and splitting that result into two headed
lists asks a person to know which half a task is in before they can find it.
The filter is what the two sections were doing that the single list would
otherwise lose.

**The order is asserted because merging two arrays is where a merge goes
wrong.** Q7 numbers its sections, Scheduled first with Q3's order and
Unscheduled second with Q2's, and a client concatenating them the other way,
or interleaving them by updated_at, renders every row this criterion names
and none of them where Q7 puts it. AC-058 asserts the two arrays on the wire
and is untouched by this change, so nothing but this reads what the page did
with them.

**The filter is asserted by what it removes, not by what it shows.** A
control that renders three options and filters nothing satisfies any
assertion that only looks at the rows it left behind, so each of the two
narrow options is asserted to drop the rows it excludes as well as to keep
the rows it includes, and the "all" option is asserted to restore both.

**"Stays collapsed" is asserted through the control's expanded state**, which
is 9.1's own definition: a collapsible section is a named region together
with a control carrying that same name, and the control's expanded state is
what open and collapsed mean. That is what makes collapsed something a reader
and a test observe rather than infer from a visual impression.

**The fixture is this file's own folder.** The seeded shared folder carries no
undated pending row and is written to by other specs, and this criterion turns
on the relative order of four rows, which is the one thing a shared fixture
cannot promise.

**The filter control has no name in any numbered section and is matched by
9.6's own description.** That is the P8 precedent for a control described but
not named: match the description, and escalate the gap rather than invent a
string. Routed to the Integration Steward with the rest of this package's
naming gaps.

Spec: 9.6 (the single open list, the filter, the collapsed Completed
section), 9.1 (the sections table, which now reads "Folder header", "All open
tasks", "Completed" and "Sharing panel" for this page; the collapsible rule),
6 Q7 (the order the merged list keeps), 8.11.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  createTask,
  csrfToken,
  regionOf,
  routes,
  seedDate,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const FOLDER = 'ac-176 one open list'
/** Two dated rows and two undated ones, so both halves of the merge have order. */
const SOON = 'ac-176 dated soon'
const LATER = 'ac-176 dated later'
const UNDATED_A = 'ac-176 undated alpha'
const UNDATED_B = 'ac-176 undated beta'
const DONE = 'ac-176 completed already'

/**
 * The filter 9.6 puts above the open list, matched by that section's own
 * description because no numbered section names it. Escalated with the rest.
 */
function filterControl(page: Page): Locator {
  return page
    .getByRole('combobox', { name: /filter/i })
    .or(page.getByRole('button', { name: /filter/i }))
}

/**
 * Picks the filter option whose name matches, dispatching on what the control
 * turned out to be for the reason `chooseOption` dispatches: 9.1's addressing
 * sentence fixes how a control is identified and says nothing about how it is
 * built.
 */
async function chooseFilter(page: Page, option: RegExp, why: string): Promise<void> {
  const control = filterControl(page)
  await expect(control, why).toHaveCount(1)
  const tag = await control.evaluate((element) =>
    String((element as unknown as { tagName?: string }).tagName ?? '').toLowerCase(),
  )
  if (tag === 'select') {
    const label = await control.evaluate((element, pattern: string) => {
      const select = element as unknown as {
        options: Iterable<{ textContent: string | null; value: string }>
      }
      const test = new RegExp(pattern, 'i')
      for (const candidate of select.options) {
        if (test.test(candidate.textContent ?? '')) return candidate.value
      }
      return ''
    }, option.source)
    expect(label, `${why}: the control offers an option matching ${String(option)}`).not.toBe('')
    await control.selectOption(label)
    return
  }
  await control.click()
  await clickControl(
    page.getByRole('option', { name: option }).or(page.getByRole('menuitem', { name: option })),
    `${why}: the control offers an option matching ${String(option)}`,
  )
}

/** The titles the open-tasks region is rendering, top to bottom. */
async function openTitles(page: Page): Promise<string[]> {
  const region = regionOf(page, 'All open tasks')
  await expect(
    region,
    "spec 9.1's sections table as RFC 0002 amends it: this page's body rows are \"All open " +
      'tasks" and "Completed", the two names that go being section names. A region is what a ' +
      'control inside it is addressed within, so its absence is not cosmetic',
  ).toHaveCount(1)
  const rows = await region
    .getByRole('listitem')
    .or(region.getByRole('row'))
    .allTextContents()
  return rows.map((text) => text.replace(/\s+/g, ' ').trim())
}

/** Which of this file's four rows the region is showing, in order. */
function mine(titles: string[]): string[] {
  const wanted = [SOON, LATER, UNDATED_A, UNDATED_B]
  const out: string[] = []
  for (const row of titles) {
    const hit = wanted.find((title) => row.includes(title))
    if (hit !== undefined) out.push(hit)
  }
  return out
}

let folderId = ''

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
  if (folderId !== '') return

  const token = await csrfToken(page.context())
  const list = await page.request.get('/api/v1/folders')
  const existing = ((await list.json()) as { id: string; name: string }[]).find(
    (folder) => folder.name === FOLDER,
  )
  if (existing !== undefined) {
    folderId = existing.id
    return
  }
  const created = await page.request.post('/api/v1/folders', {
    data: { name: FOLDER },
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    created.status(),
    `POST /folders answered ${created.status()}: ${await created.text()}`,
  ).toBe(201)
  folderId = ((await created.json()) as { id: string }).id

  // Created out of Q7's order so that a page rendering them in creation
  // order, or in the order 7.4 happens to answer with, fails the order case.
  await createTask(page, { title: UNDATED_B, folder_id: folderId })
  await createTask(page, { title: LATER, folder_id: folderId, due_date: seedDate(9) })
  await createTask(page, { title: UNDATED_A, folder_id: folderId })
  await createTask(page, { title: SOON, folder_id: folderId, due_date: seedDate(2) })
  const done = await createTask(page, { title: DONE, folder_id: folderId })
  await transition(page, done.id, 'complete', 'UTC')
})

test.describe('AC-176: the folder page carries one open list', () => {
  test('AC-176: dated and undated open tasks render together in Q7\'s order', async ({
    page,
  }) => {
    await page.goto(routes.folder(folderId))

    expect(
      mine(await openTitles(page)),
      'spec 9.6: one open list holding every open task in the folder, dated and undated ' +
        "together, ordered per Q7. Q7 numbers its sections, Scheduled first with Q3's order " +
        "and Unscheduled second with Q2's, so the two dated rows come first by due date and " +
        'the undated ones follow. A client that concatenates the two arrays the other way, or ' +
        'interleaves them, renders every row here and none of them where Q7 puts it',
    ).toEqual([SOON, LATER, UNDATED_A, UNDATED_B])

    await expect(
      regionOf(page, 'Scheduled'),
      'spec 9.6 as RFC 0002 amends it: there is no Scheduled section any more. A client that ' +
        'adds an "All open tasks" region around the two it already had satisfies every ' +
        'assertion above and has not made the change',
    ).toHaveCount(0)
    await expect(
      regionOf(page, 'Unscheduled'),
      'spec 9.6 as RFC 0002 amends it: and no Unscheduled section',
    ).toHaveCount(0)
  })

  test('AC-176: the filter offers all, only dated, and only undated', async ({ page }) => {
    await page.goto(routes.folder(folderId))

    await chooseFilter(
      page,
      /due date/i,
      'spec 9.6: a filter above the list offers all open tasks, those with a due date, and ' +
        'those without',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: the option for tasks with a due date keeps the dated rows and drops the ' +
        'undated ones. Asserted as what it removes as well as what it keeps, because a control ' +
        'that renders three options and filters nothing passes any assertion that only reads ' +
        'the rows it left behind',
    ).toEqual([SOON, LATER])

    await chooseFilter(
      page,
      /without|no due date/i,
      'spec 9.6: the filter offers the tasks without a due date',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: and the option for tasks without a due date is the complement of it, which is ' +
        'the whole of what the two sections it replaced were doing',
    ).toEqual([UNDATED_A, UNDATED_B])

    await chooseFilter(
      page,
      /all open/i,
      'spec 9.6: the filter offers all open tasks, which is the state the list opens in',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: choosing all open tasks restores the whole list in Q7\'s order, the filter ' +
        'being a question the person asks rather than a shape the page imposes',
    ).toEqual([SOON, LATER, UNDATED_A, UNDATED_B])
  })

  test('AC-176: the Completed region stays collapsed and says so', async ({ page }) => {
    await page.goto(routes.folder(folderId))

    const control = page.getByRole('button', { name: 'Completed', exact: true })
    await expect(
      control,
      "spec 9.1: a collapsible section is a named region together with a control carrying that " +
        'same name, and this page\'s region is named "Completed" in the sections table. Exact, ' +
        'because a control named "Completed (2)" is a different string and the table spells the ' +
        'count only where it means one, on My Day\'s "Done today (N)"',
    ).toHaveCount(1)
    await expect(
      control,
      "spec 9.1: the control's expanded state is what open and collapsed mean, and Q7 renders " +
        'this section collapsed. That is what makes collapsed something a reader and a test ' +
        'observe rather than infer from a visual impression',
    ).toHaveAttribute('aria-expanded', 'false')
    await expect(
      page.getByText(DONE),
      'spec 6 Q7: the completed row is behind the collapsed section rather than in the open ' +
        'list, which is the other half of what collapsed means',
    ).toHaveCount(0)

    await clickControl(control, 'spec 9.1: the section control opens the section')
    await expect(
      control,
      'spec 9.1: and the same state reports the section open, so the attribute tracks the ' +
        'section rather than being written once',
    ).toHaveAttribute('aria-expanded', 'true')
    await expect(
      page.getByText(DONE),
      'spec 6 Q7: opening the section reveals its rows, which is what makes it collapsed ' +
        'rather than absent',
    ).toBeVisible()
  })
})

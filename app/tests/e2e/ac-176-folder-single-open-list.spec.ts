/*
AC-176: given a folder page, then its open tasks render in one region named
"All open tasks" holding the folder's dated and undated open tasks together
in the folder's durable composed order, a filter offers all open tasks, only
those with a due date and only those without while preserving that order, and
the Completed region stays collapsed with its control reporting that state.

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

**The order changed with #184's owner-approved compose-first page.** Q7 still
orders its two response arrays and AC-058 still pins that wire contract, but
the folder page now projects those task payloads through `GET /page.items`,
the canonical mixed order shared with prose, images, and Sections. The rows
below are deliberately created out of Q7 order so a client that falls back to
the response arrays instead of the composed item references fails here.

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

Spec: 9.6 (the composed open list, the filter, the collapsed Completed
section), 9.1 (the sections table, which now reads "Folder header", "All open
tasks", "Completed" and "Sharing panel" for this page; the collapsible rule),
4.17 (the durable mixed order), 8.11.
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
/** Two dated rows and two undated ones, interleaved in composed order. */
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

/**
 * The titles the open-tasks region is rendering, top to bottom.
 *
 * **Waits on the rows and not on the region, and the difference is the whole
 * of what this reader got wrong.** It awaited `expect(region).toHaveCount(1)`
 * and then sampled the DOM at that instant. The region is a static wrapper
 * that this page paints before it has anything to put in it, so that await
 * returned immediately and the sample could be taken while the rows were
 * still arriving — the composed order case then read `[]` and reported an
 * empty list on a page whose own failure snapshot showed all four rows in
 * exactly the asserted order. Before #204 the list rendered with the region
 * and there was nothing to wait for, which is why the reader was correct as
 * written and stopped being so without being touched.
 *
 * It is a race and not a defect, proven on an unchanged tree: two whole
 * browser legs minutes apart read four failures and then three, this case
 * being the one that moved (#234, cause 1). **Isolation lies about it in the
 * opposite direction from the memory-pressure flake `CLAUDE.md` records**: a
 * quiet machine hydrates sooner, so running this case alone makes it pass more
 * often, and a single green run alone is no evidence at all.
 *
 * The wait is sound rather than merely longer because every state this file
 * reads holds at least one row: the fixture's four open tasks, and two under
 * either of the narrow filters.
 */
async function openTitles(page: Page): Promise<string[]> {
  const region = regionOf(page, 'All open tasks')
  await expect(
    region,
    "spec 9.1's sections table as RFC 0002 amends it: this page's body rows are \"All open " +
      'tasks" and "Completed", the two names that go being section names. A region is what a ' +
      'control inside it is addressed within, so its absence is not cosmetic',
  ).toHaveCount(1)
  const rows = region.getByRole('listitem').or(region.getByRole('row'))
  await expect(
    rows.first(),
    'spec 9.6: the region holds the folder\'s open tasks, and this criterion turns on which ' +
      'rows are in it and in what order. The region alone is painted before the page read ' +
      'answers, so it is the rows that say the list has been rendered',
  ).toBeVisible()
  return (await rows.allTextContents()).map((text) => text.replace(/\s+/g, ' ').trim())
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

  // Created out of Q7's date grouping so that a page rendering the Q7 arrays
  // instead of the persisted composed sequence fails the order case.
  await createTask(page, { title: UNDATED_B, folder_id: folderId })
  await createTask(page, { title: LATER, folder_id: folderId, due_date: seedDate(9) })
  await createTask(page, { title: UNDATED_A, folder_id: folderId })
  await createTask(page, { title: SOON, folder_id: folderId, due_date: seedDate(2) })
  const done = await createTask(page, { title: DONE, folder_id: folderId })
  await transition(page, done.id, 'complete', 'UTC')
})

test.describe('AC-176: the folder page carries one open list', () => {
  test('AC-176: dated and undated open tasks render together in composed order', async ({
    page,
  }) => {
    await page.goto(routes.folder(folderId))

    expect(
      mine(await openTitles(page)),
      'spec 9.6 and 4.17: one open list holds every open task in the persisted composed ' +
        'sequence, so due dates do not pull rows away from the prose and Sections around them',
    ).toEqual([UNDATED_B, LATER, UNDATED_A, SOON])

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
      /^With a due date$/,
      'spec 9.6: a filter above the list offers all open tasks, those with a due date, and ' +
        'those without',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: the option for tasks with a due date keeps the dated rows and drops the ' +
        'undated ones. Asserted as what it removes as well as what it keeps, because a control ' +
        'that renders three options and filters nothing passes any assertion that only reads ' +
        'the rows it left behind',
    ).toEqual([LATER, SOON])

    await chooseFilter(
      page,
      /^No due date$/,
      'spec 9.6: the filter offers the tasks without a due date',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: and the option for tasks without a due date is the complement of it, which is ' +
        'the whole of what the two sections it replaced were doing',
    ).toEqual([UNDATED_B, UNDATED_A])

    await chooseFilter(
      page,
      /^Any due date$/,
      'spec 9.6: the filter offers all open tasks, which is the state the list opens in',
    )
    expect(
      mine(await openTitles(page)),
      'spec 9.6: choosing all open tasks restores the whole durable page order, the filter ' +
        'being a question the person asks rather than a shape the page imposes',
    ).toEqual([UNDATED_B, LATER, UNDATED_A, SOON])
  })

  test('AC-176: the Done region stays collapsed and says so', async ({ page }) => {
    await page.goto(routes.folder(folderId))

    /* polish: places F11. The region is "Done" since the polish round, one word for
       the finished pile everywhere; 9.1's sections table is amended with it. */
    const control = page.getByRole('button', { name: 'Done', exact: true })
    await expect(
      control,
      "spec 9.1: a collapsible section is a named region together with a control carrying that " +
        'same name, and this page\'s region is named "Done" in the sections table since the ' +
        'polish round (places F11: one word for the finished pile). Exact, ' +
        'because a control named "Done (2)" is a different string and the table spells the ' +
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

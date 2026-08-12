/*
AC-158: given an account with no tasks, then each page renders the
empty-state copy section 6 gives it, the My Day recap is hidden rather than
empty, and the calendar shows the bare grid with no message.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

Section 9's preamble gives every page five states and names the empty one;
section 6 writes the copy for eight of them, sentence by sentence, each
saying what the page is for and how to put something on it. No numbered
criterion asserts any of them, and an empty page is the first thing a new
account sees, which makes this the one state the whole product is judged on
before anything else is.

**The copies are asserted as eight different strings, on one account, in one
case.** A client with a single "Nothing here yet" component passes any
criterion that checks one page and fails this one, which is the point: the
strings differ because the pages differ, and Q5's is the only one of the
eight that names a control.

**Two of the eight pages are specified not to carry a message, and those are
the sharper half.** Q1R hides the recap section entirely while it is empty
rather than showing a count of zero, and Q3C's empty state is the bare grid,
because a calendar with no events is a calendar rather than an error. Both
are what an implementation that renders one empty component everywhere gets
wrong in the other direction.

The account is made by the development login rather than by emptying a
seeded one: 11.10 makes that endpoint this leg's session source, a bare
sign-in provisions a fresh user through the same 7.1 transaction, and the
seeded rows every other spec reads are left alone.

Spec: 9 preamble (the five states), 6 Q1, Q1R, Q2, Q3, Q3C, Q4, Q5, Q6, Q7,
Q8, 9.1's route table, 11.10.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  emptyState,
  routes,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const EMPTY_SUB = 'ac-158-account-with-nothing-in-it'

test.describe('AC-158: the empty state of every page', () => {
  test('AC-158: each page carries its own empty copy from section 6', async ({ page }) => {
    await signIn(page, EMPTY_SUB, 'Ac158 Empty')

    for (const [where, path, expected] of [
      ['My Day', routes.myDay, emptyState.myDay],
      ['Tasks', routes.tasks, emptyState.tasks],
      ['Planned', routes.planned, emptyState.planned],
      ['Important', routes.important, emptyState.important],
      ['All', routes.all, emptyState.all],
      ['Done', routes.done, emptyState.done],
    ] as const) {
      await page.goto(path)
      await expect(
        page.getByText(expected),
        `spec 6: ${where} carries its own empty state, and copy in these sections is ` +
          'normative. The eight strings differ because the pages differ, so a client with one ' +
          'empty component passes a criterion that checks one page and fails this one',
      ).toBeVisible()
    }
  })

  test('AC-158: the folder page and the search overlay carry theirs', async ({ page }) => {
    await signIn(page, EMPTY_SUB, 'Ac158 Empty')

    const response = await page.request.get('/api/v1/folders')
    expect(response.status(), 'GET /folders answered non-200').toBe(200)
    const all = (await response.json()) as { id: string; is_default: boolean }[]
    const inbox = all.find((folder) => folder.is_default)
    expect(inbox, 'spec 7.1: provisioning creates one Inbox with owner membership').toBeDefined()
    if (inbox === undefined) throw new Error('unreachable: asserted above')

    await page.goto(routes.folder(inbox.id))
    await expect(
      page.getByText(emptyState.folder),
      'spec 6 Q7: sections 1 and 2 are absent when empty, with this single line when both ' +
        'are. It is the only empty state of the eight that replaces two sections rather than ' +
        'filling one',
    ).toBeVisible()

    await page.keyboard.press('Control+k')
    await page
      .getByRole('searchbox')
      .or(page.getByRole('textbox'))
      .first()
      .fill('nothing matches this')
    await expect(
      page.getByText(emptyState.search),
      'spec 6 Q8: a search with no matches says so. This is a different state from a page ' +
        'with no tasks, and the copy says which one the person is looking at',
    ).toBeVisible()
  })

  test('AC-158: the recap is hidden and the calendar is a bare grid', async ({ page }) => {
    await signIn(page, EMPTY_SUB, 'Ac158 Empty')

    await page.goto(routes.myDay)
    await expect(
      page.getByRole('heading', { name: /Done today/ }),
      'spec 6 Q1R: the recap section is hidden entirely while empty. 9.4 heads it "Done ' +
        'today (N)", so an implementation rendering it unconditionally offers a new account a ' +
        'heading reading "Done today (0)" on their first screen',
    ).toHaveCount(0)

    await page.goto(routes.planned)
    await clickControl(
      page.getByRole('button', { name: /^calendar$/i }),
      'spec 9.5: Planned carries a mode toggle between list and calendar',
    )
    await expect(
      page.getByRole('gridcell').first(),
      'spec 6 Q3C: the empty state is the bare grid, so the grid is drawn',
    ).toBeVisible()
    await expect(
      page.getByText(emptyState.planned),
      'spec 6 Q3C: no message. The list mode\'s copy belongs to the list, and a calendar with ' +
        'nothing on it is a calendar rather than a page that failed to load',
    ).toHaveCount(0)
  })
})

/*
AC-245: given Today's computed "Today" section and Assignments' per-person
section, neither of which any package made collapsible, then each is a named
region and a control carrying that name whose expanded state says whether the
section is open, and when that control is pressed then the rows under it are
no longer on the page while the region and its control remain.

**Two grammars for one idea, which is the fault this closes.** The folder
page's user-made sections have been collapsible since S12; every computed
section elsewhere, Today's two groups, Scheduled's rungs, Assignments' people,
All's two halves and Done's days, is a bare heading that cannot be folded at
all. Imran ruled on 2026-08-22 that native and user-made sections are the same
thing and only the capabilities differ: "Right now native sections are not
collapsable which is not good." A heading you cannot fold is a heading that
cannot get out of your way.

**The shape asserted is 9.1's own sentence and not a mechanism.** "A
collapsible section remains a named region plus a control carrying that name,
whose expanded state is what open and collapsed mean." So this reads the
region by its name, reads a control carrying that same name, and reads
`aria-expanded` on the control, which is what AC-058 already reads on the two
sections that have one. Nothing here says `button`, `Collapsible` or chevron.

**The collapse is asserted as absence from the page, not as hidden.** 6 Q7's
precedent, which `states/PageSection.tsx` already records against the folder
page's Completed section: a hidden element is still on the page to everything
but a screen reader, so a criterion satisfied by `display: none` is satisfied
by a section that never collapsed at all.

**The region survives the collapse**, which is the half a naive implementation
drops. 9.1 makes the section a named region whether or not it is open, so a
client that unmounted the `section` along with its rows would take the
landmark with it and break every criterion that addresses a control "within
that region".

**The two sections are chosen because they are computed in different ways.**
Today's group is a membership, Assignments' is generated from a person, and
9.1's regions paragraph names both. A client that made one collapsible by
hand rather than at the shared component would pass one case and fail the
other, which is the shape of the defect that produced this package.

Spec: 9.1 (the regions paragraph and the collapsible-section sentence), 9.4
(Today's groups), 9.5 (Assignments grouped by person), the owner's ruling of
2026-08-22, and the prototype's `task-section.tsx`, whose header carries it.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  csrfToken,
  deleteTask,
  regionOf,
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
 * The control 9.1 requires a collapsible section to carry: one whose name is
 * the section's own and whose expanded state says whether it is open.
 *
 * Scoped inside the region rather than found on the page, because that is the
 * relation the section states: "a named region plus a control carrying that
 * name". Two sections could otherwise answer to one locator.
 */
function collapseControl(page: Page, section: string): Locator {
  return regionOf(page, section).getByRole('button', { name: section, exact: true })
}

/** 7.8's pull, which is what puts a task in Today's own group. */
async function pullIntoToday(page: Page, id: string): Promise<void> {
  const token = await csrfToken(page.context())
  const response = await page.request.post(`/api/v1/tasks/${id}/my-day?tz=UTC`, {
    headers: { 'X-CSRF-Token': token },
  })
  expect(
    response.status(),
    `POST /tasks/${id}/my-day answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
}

/**
 * The whole assertion, over one section, so the two cases below cannot drift
 * into asserting different things about one rule.
 */
async function assertCollapses(
  page: Page,
  section: string,
  rowTitle: string,
): Promise<void> {
  const region = regionOf(page, section)
  await expect(
    region,
    `spec 9.1: every section a page's structure names is a named region, and "${section}" is one`,
  ).toBeVisible()
  await expect(taskRow(page, rowTitle)).toBeVisible()

  const control = collapseControl(page, section)
  await expect(
    control,
    'spec 9.1: "A collapsible section remains a named region plus a control carrying that ' +
      'name". The built computed section renders a heading and no control at all, which is ' +
      'the ruling of 2026-08-22 unimplemented rather than a styling difference',
  ).toBeVisible()
  await expect(
    control,
    'spec 9.1: "whose expanded state is what open and collapsed mean". A section drawn open ' +
      'must say so, or nothing can read the state but a person looking at it',
  ).toHaveAttribute('aria-expanded', 'true')

  await clickControl(control, 'the owner, 2026-08-22: every section collapses')

  await expect(
    taskRow(page, rowTitle),
    '6 Q7\'s rule, which states/PageSection.tsx already records: absent rather than hidden, ' +
      'because a hidden element is still on the page to everything but a screen reader',
  ).toHaveCount(0)
  await expect(
    region,
    'the region survives its own collapse: 9.1 makes the section a named region whether or ' +
      'not it is open, and a client that unmounted it would take the landmark with the rows',
  ).toBeVisible()
  await expect(collapseControl(page, section)).toHaveAttribute('aria-expanded', 'false')
}

test.describe('AC-245: every section collapses', () => {
  let taskId: string
  let title: string

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    title = caseTitle('ac-245 a task in a computed section')
    const made = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    taskId = made.id
    await pullIntoToday(page, taskId)
  })

  test.afterEach(async ({ page }) => {
    await deleteTask(page, taskId)
  })

  test('AC-245: Today\'s computed group collapses', async ({ page }) => {
    await page.goto(routesV2.today)
    await assertCollapses(page, 'Today', title)
  })

  test('AC-245: Assignments\' per-person group collapses', async ({ page }) => {
    await page.goto(routesV2.assignments)
    await assertCollapses(page, 'You', title)
  })
})

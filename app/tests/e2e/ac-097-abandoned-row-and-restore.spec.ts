/*
AC-097: given an abandoned row, then it renders faded and struck with a
Restore control, and restoring an overdue assigned task returns it to My Day
immediately.

This is the P8 half of a clause three earlier files recorded and could not
assert. AC-039 says an abandoned task "appears faded in its home" and its
file states outright that the rendering arrives here; AC-053 asserts the row
is present in Tasks and All and leaves the fading to this number. What those
files own is that the row is on the page to be faded. What this one owns is
that it is faded.

**Faded and struck are asserted differently, on purpose.** Struck is
literal: a strike-through is a computed property of the rendered row
whatever CSS produced it, so it is read from the browser and compared to the
one value that is not a strike-through. Faded is a comparison, because that
is what the word means: the abandoned row is compared against a pending row
in the same list on the same page, and an implementation that renders them
identically fails whatever its palette. Neither reads a class name, which is
the implementer's business and not this suite's.

**The chip and the control are the non-color cues.** 9.5 puts an "Abandoned"
chip and a "Restore" control on the row, and they carry the state for a
reader who cannot see the fade at all. They are addressed by role and name
per 9.1's addressing sentence.

**"Immediately" is asserted as a client-side navigation, not a reload.**
8.3's policy is refetch after each own mutation, so a restore performed on
Scheduled and then confirmed by loading Today fresh from the server would
pass against a client that never refetches anything. The case below walks
the sidebar link instead, which is a route change inside the running
application, and it is the refetch that has to put the row there.

The overdue assigned fixture is created here rather than taken from the seed.
Restoring is a transition, and the rule this leg runs under is that a spec
never transitions a seeded row: the seed is shared by every spec and is
written once.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Nothing this
criterion asserts moves; where it is asserted does. 9.1's route table retires
/app/planned into a redirect and puts Desk at /app, so the three pages this
file walked are Scheduled (/app/scheduled), Today (/app/today) and Anytime
(/app/anytime). They are Q3, Q1 and Q2 under the names DES-152 gives them,
which is why section 6 keeps the v1 name in each heading's parentheses and
why every assertion below is the one it always was.

The criterion's own sentence still says "returns it to My Day", and that is
the naming bridge rather than a falsehood: Q1's heading reads "Today, open
list (v1: My Day)" precisely because criteria cite it by the older name. What
the case walks is the sidebar entry the page has now.

Spec: 9.5 (the abandoned row's fading, chip and Restore control), 9.4 (the
Today groups), 5.1 (abandon and restore), 6 Q1 and Q3, 8.3, 7.6, 9.1 (the v2
routes table).
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  computedStyle,
  createTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  sidebarLink,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

// Deliberately carries neither "abandoned" nor "restore". getByText matches
// a substring case-insensitively, so a title holding the word its own
// assertion looks for resolves to the title and the chip together, and the
// case fails on strict mode against a page that is drawing both correctly.
const OVERDUE = 'ac-097 overdue and assigned to the viewer'
const PENDING_NEIGHBOUR = 'ac-097 pending neighbour'

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-097: the abandoned row and its restore', () => {
  test('AC-097: an abandoned row renders faded and struck with a Restore control', async ({
    page,
  }) => {
    // Two rows on one date so the comparison the word "faded" needs is
    // between two rows of the same list, drawn by the same code, differing
    // only in status.
    const abandoned = await createTask(page, {
      title: OVERDUE,
      folder_id: seedIds.groceries,
      due_date: seedDate(-1),
      assignee_id: seedIds.hassan,
    })
    await createTask(page, {
      title: PENDING_NEIGHBOUR,
      folder_id: seedIds.groceries,
      due_date: seedDate(-1),
      assignee_id: seedIds.hassan,
    })
    await transition(page, abandoned.id, 'abandon', 'UTC')

    await page.goto(routesV2.scheduled)

    const row = taskRow(page, OVERDUE)
    await expect(
      row,
      'spec 6 Q3 admits status IN (pending, abandoned), so a dated abandoned task has its ' +
        'home on Scheduled. AC-053 owns its presence; this file owns how it is drawn',
    ).toBeVisible()

    await expect(
      row.getByText('Abandoned'),
      'spec 9.5: an abandoned row carries an "Abandoned" chip, which is the cue that survives ' +
        'for a reader who cannot see a fade',
    ).toBeVisible()
    await expect(
      row.getByRole('button', { name: 'Restore', exact: true }),
      'spec 9.5: an abandoned row carries a Restore control, addressed by its role and its ' +
        'normative name per 9.1',
    ).toBeVisible()

    const struck = await computedStyle(row.getByText(OVERDUE), ['textDecorationLine'])
    expect(
      struck['textDecorationLine'],
      'spec 9.5: abandoned rows render struck. Read from the browser rather than from a class ' +
        'name, so any CSS that produces a strike-through satisfies it',
    ).toContain('line-through')

    const faded = await computedStyle(row.getByText(OVERDUE), ['opacity', 'color'])
    const normal = await computedStyle(taskRow(page, PENDING_NEIGHBOUR).getByText(PENDING_NEIGHBOUR), [
      'opacity',
      'color',
    ])
    expect(
      `${faded['opacity']}/${faded['color']}`,
      'spec 9.5: abandoned rows render faded, which is a comparison: this row and the pending ' +
        'row beside it on the same date are drawn identically, so nothing about the page says ' +
        'this task was abandoned except the words on it',
    ).not.toBe(`${normal['opacity']}/${normal['color']}`)
  })

  test('AC-097: restoring an overdue assigned task returns it to My Day immediately', async ({
    page,
  }) => {
    const restored = await createTask(page, {
      title: 'ac-097 restore returns to my day',
      folder_id: seedIds.groceries,
      due_date: seedDate(-2),
      assignee_id: seedIds.hassan,
    })
    await transition(page, restored.id, 'abandon', 'UTC')

    await page.goto(routesV2.today)
    await expect(
      taskRow(page, 'ac-097 restore returns to my day'),
      'spec 6 Q1 filters on status = pending, so an abandoned task is not on Today. This is ' +
        'the control that makes the arrival below mean the restore put it there',
    ).toHaveCount(0)

    await page.goto(routesV2.scheduled)
    await clickControl(
      taskRow(page, 'ac-097 restore returns to my day').getByRole('button', { name: 'Restore', exact: true }),
      'spec 9.5: an abandoned row carries a Restore control, which is what the second half of ' +
        'this criterion is performed with',
    )

    // A route change inside the running application, not a fresh load: 8.3
    // makes refetch after an own mutation the whole invalidation strategy,
    // and "immediately" is that policy observed.
    await clickControl(
      sidebarLink(page, 'Today'),
      'spec 9.1: the sidebar page block lists Today, and reaching it through the link is what makes this a route change inside the running application rather than a fresh load',
    )
    await expect(
      page.getByRole('heading', { name: 'Carried over' }),
      'spec 9.4: Today carries a group headed "Carried over", and 6 Q1 puts a pending task ' +
        'whose due date is before today in it',
    ).toBeVisible()
    await expect(
      taskRow(page, 'ac-097 restore returns to my day'),
      'spec 5.1: restore returns the row to pending with its dates untouched, so 6 Q1 admits ' +
        'it at once: assigned to the viewer, pending, due before today. "Immediately" is ' +
        '8.3\'s refetch, not a page load',
    ).toBeVisible()
  })

  test('AC-097: an undated abandoned row is drawn the same way in Anytime and in All', async ({
    page,
  }) => {
    // AC-053's two pages, whose fading its own file routed here. The seeded
    // abandoned task is undated and is read rather than transitioned, so
    // nothing in this case changes what a later spec sees.
    for (const [where, path] of [
      ['Anytime', routesV2.anytime],
      ['All', routesV2.all],
    ] as const) {
      await page.goto(path)
      const row = taskRow(page, 'Old idea')
      await expect(
        row,
        `spec 6 Q2 and Q5 admit abandoned rows, so the seeded abandoned task is on ${where}`,
      ).toBeVisible()
      await expect(
        row.getByText('Abandoned'),
        `spec 9.5: the "Abandoned" chip is on abandoned rows in ${where} too, that section ` +
          'writing one set of row rules over Scheduled, Assignments, Important, All, Anytime ' +
          'and the folder page together',
      ).toBeVisible()
      await expect(
        row.getByRole('button', { name: 'Restore', exact: true }),
        `spec 9.5: the Restore control is on the row in ${where}`,
      ).toBeVisible()
      const struck = await computedStyle(row.getByText('Old idea'), ['textDecorationLine'])
      expect(
        struck['textDecorationLine'],
        `spec 9.5: the row renders struck in ${where}. AC-053 asserts the row is there; this ` +
          'is the half its file recorded as arriving with this package',
      ).toContain('line-through')
    }
  })
})

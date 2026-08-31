/*
AC-179: given an open task opened for edit, then the surface's completion control
completes it and a completed task's control un-completes it, each producing
the same stored state as the equivalent control on a task row; and given the
un-complete would take a G-SERIES successor, then it first confirms with
9.5's copy and does nothing if declined.

Appended to section 12 by RFC 0002, Accepted 2026-08-13. The sentence above
is that RFC's Append unit transcribed unchanged, and it becomes section 12's
own text when the delta merges.

The control arrives from the designer's prototype and 9.3 adopts it: "the
completion control completes and un-completes the open task, is the same
transition 9.4's row checkbox and 9.5's 'Mark as not done' make, and takes
9.5's confirmation unchanged on the G-SERIES successor branch". Every clause
of that sentence is a way the port can go wrong quietly.

**"The same stored state" is asserted against the row control, not against a
constant.** A surface that patched status directly would be refused by AC-034
and would fail loudly; what would not fail loudly is a surface that ran the
transition and then, say, cleared the task from Today or skipped the
successor generation of 5.1, which is a different code path reaching the same
`status` value. So each arm is run twice, once through the card and once
through the row control 9.4 gives, and the two resulting TaskDetail rows are
compared field for field.

**The confirmation is the clause most likely to be dropped.** 9.5 puts it on
"Mark as not done" and the prototype's card has no such branch at all, its
fixtures carrying no series. An un-complete that takes the successor without
warning destroys any edit already made to the next occurrence, which is the
part of the sentence the person cannot see and the reason 9.5 spells it.

**Declining is asserted to write nothing**, for the reason AC-162 gives: a
confirm that acts anyway shows the right words, the person says no, and the
row is gone.

**The control had no name in any numbered section and now has one, which is
what lets this file stop counting checkboxes.** v1 addressed it by role inside
the form and kept the "More options" expander closed so that the steps
editor's per-row checks were off the page, leaving exactly one checkbox to
find; that was a locator standing in for a name, and the naming gap was
routed to the Integration Steward. 9.1's v2 names table closes it: "A task's
completion control | 'Complete task' when open, 'Mark as not done' when
complete". So the control is addressed by its own two names, the strictly
better move, and it survives a surface that shows the steps block without an
expander, which 9.3's v2 card does.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and onto 9.3's v2
card at S15 (items 15 and 19).** Nothing this criterion asserts moves in
either rework; where the rows are read moved in the first, and what is opened
moved in the second, "the form" becoming the task surface 9.1's roles table
names. The criterion's own sentence was amended with it, which section 12
records.

The undated rows are read on Anytime, which draws Q2 at /app/anytime now that /app/tasks
redirects, and the dated repeating row on Today, which draws Q1 at
/app/today now that Desk holds /app. The comment on the last case still
holds under both names: a dated row is deliberately not on the undated page.

Spec: 9.3 (the completion control on the v2 card), 9.1 (the v2 routes table,
the roles table and the two names of the completion control), 9.4 (the row
checkbox it is the same transition as), 9.5 ("Mark as not done" and the G-SERIES confirm),
5.1 (the transitions and the successor), frozen 7.6 and 7.2, AC-034, AC-079.
*/
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
  createTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  openTaskRow,
  taskSurface,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** The fields of frozen 7.2 a completion writes, compared between the two paths. */
interface Stored {
  status: string
  completed_at: string | null
  completed_by: string | null
}

async function storedState(page: Page, id: string): Promise<Stored> {
  await waitForApiIdle(
    page,
    'the transition has to have been sent and answered before the row is read, the two being ' +
      'different HTTP clients',
  )
  const response = await page.request.get(`/api/v1/tasks/${id}`)
  expect(
    response.status(),
    `GET /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  const body = (await response.json()) as Stored
  return {
    status: body.status,
    completed_at: body.completed_at === null ? null : 'set',
    completed_by: body.completed_by,
  }
}

/**
 * The completion control of 9.3, addressed by the two names 9.1's v2 table
 * gives it and scoped to the task surface.
 *
 * Two names rather than one because the control is a toggle and its name is
 * its state, which is the same rule 9.5's star follows: "Complete task" when
 * open, "Mark as not done" when complete. Either is accepted here because a
 * case reaches for the control before it knows which state it is in, and the
 * cases that turn on the state assert it separately.
 *
 * Scoped to the surface, so a row's own checkbox behind the card is not what
 * gets pressed. That mattered less when the form was the only thing carrying
 * a checkbox and matters more now: 9.3's card shows its steps block without
 * an expander, so per-row checks are on the surface too and an unscoped
 * checkbox match would be ambiguous.
 */
function completionControl(page: Page): Locator {
  return taskSurface(page).getByRole('checkbox', {
    name: /^\s*(Complete task|Mark as not done)\s*$/,
  })
}

async function openTheCard(page: Page, title: string): Promise<void> {
  await openTaskRow(page, title,
    'spec 9.4: a click on any row opens that task, and 9.3 makes create and edit one artifact',
  )
  // 9.4's "a task row opens that task, on every page that draws one and
  // whatever the task's status", which this file needs on Done as well as on
  // Anytime: a completed task's row is on Done, and a client whose Done rows
  // do not open has no surface for the un-complete arm at all. That clause is
  // the v2 section's own and no longer a silence, which is what its "whatever
  // the task's status" was added for.
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the task surface is a dialog when opened as one, and 9.3 makes " +
      'create and edit one artifact, so a row that was clicked has that surface over it',
  ).toBeVisible()
  await expect(
    completionControl(page),
    "spec 9.3: the card's footer toolbar carries the completion control, and 9.1's names table " +
      'gives it exactly two names, one per state, so exactly one control answers to them',
  ).toHaveCount(1)
  // And it is the completion control rather than the star, which 9.1's roles
  // table makes a switch and not a checkbox. Without this the locator above
  // would resolve to the star on any client that gave it the wrong role, and
  // every assertion below would then report that the surface completed the
  // task wrongly when what happened is that it has no completion control at
  // all. That is a red naming the wrong sentence, which is the failure mode
  // this leg's whole message discipline exists against.
  await expect(
    completionControl(page),
    "spec 9.1's roles table: a toggle switch is a switch, so the card's star is not a checkbox " +
      "and the control answering to these two names is 9.3's completion control",
  ).not.toHaveAccessibleName(/important/i)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-179: the task surface completes and un-completes', () => {
  test('AC-179: completing through the card stores what the row control stores', async ({
    page,
  }) => {
    const viaForm = await createTask(page, {
      title: 'ac-179 completed through the card',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    const viaRow = await createTask(page, {
      title: 'ac-179 completed through the row',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })

    await page.goto(routesV2.anytime)
    await openTheCard(page, 'ac-179 completed through the card')
    await clickControl(
      completionControl(page),
      'spec 9.3: the completion control completes the open task, and 9.1 names it "Complete task" while it is open',
    )
    const cardState = await storedState(page, viaForm.id)

    await page.goto(routesV2.anytime)
    await clickControl(
      taskRow(page, 'ac-179 completed through the row').getByRole('checkbox'),
      'spec 9.4: a row carries a complete checkbox, which is the transition 9.3 says the ' +
        "card's control is the same as",
    )
    const rowState = await storedState(page, viaRow.id)

    expect(
      cardState,
      'spec 9.3: the completion control "is the same transition 9.4\'s row checkbox and 9.5\'s ' +
        '\\"Mark as not done\\" make". Compared to the row control rather than to a constant, ' +
        'because a surface that ran a different code path to the same status value would satisfy ' +
        'any assertion naming one, and 5.1 hangs My Day cleanup and successor generation off ' +
        'this transition',
    ).toEqual(rowState)
    expect(
      cardState.status,
      'spec 5.1: and the transition that ran is the completion',
    ).toBe('completed')
    expect(
      cardState.completed_by,
      'spec 5.1 and AC-036: completing stamps the actor, so the viewer is who the row records',
    ).toBe(seedIds.hassan)
  })

  test('AC-179: a completed task\'s control un-completes it', async ({ page }) => {
    const task = await createTask(page, {
      title: 'ac-179 un-completed through the card',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    await page.goto(routesV2.anytime)
    await clickControl(
      taskRow(page, 'ac-179 un-completed through the card').getByRole('checkbox'),
      'spec 9.4: the row control completes it, which is the state the card control is asserted ' +
        'against',
    )
    await waitForApiIdle(page, 'the completion settles before the card is opened on it')

    await page.goto(routesV2.done)
    await openTheCard(page, 'ac-179 un-completed through the card')
    await clickControl(
      completionControl(page),
      'spec 9.3: the same control un-completes a completed task, the surface being one artifact ' +
        'over both states rather than two, and 9.1 names it "Mark as not done" in this one',
    )

    const after = await storedState(page, task.id)
    expect(
      after.status,
      'spec 5.1: un-completing returns the task to pending',
    ).toBe('pending')
    expect(
      after.completed_at,
      'spec 5.1 and AC-041: un-completing clears the completion stamps rather than leaving ' +
        'them beside a pending status, which is a row no query in section 6 knows how to read',
    ).toBeNull()
    expect(after.completed_by, 'spec 5.1 and AC-041: both stamps clear together').toBeNull()
  })

  test('AC-179: an un-complete taking a successor confirms first, and declining does nothing', async ({
    page,
  }) => {
    const title = 'ac-179 repeating and completed'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
      recurrence_rule: 'FREQ=DAILY',
    })
    // Today rather than Anytime: this row is dated, and 6 Q2 admits undated
    // rows only, so Anytime is the one page it is deliberately not on.
    await page.goto(routesV2.today)
    await clickControl(
      taskRow(page, title).getByRole('checkbox'),
      'spec 5.1: completing a rule-carrying row generates the successor in the same ' +
        'transaction, which is the occurrence the confirm is about',
    )
    await waitForApiIdle(page, 'the completion and its successor settle before the card opens')

    await page.goto(routesV2.done)
    await openTheCard(page, title)
    await clickControl(
      completionControl(page),
      'spec 9.3: the completion control un-completes a completed task',
    )

    await expect(
      page.getByText(copy.uncompleteSeriesConfirm),
      'spec 9.3: the card control "takes 9.5\'s confirmation unchanged on the G-SERIES ' +
        'successor branch". The parenthesis is the part the person cannot see: 5.1 deletes the ' +
        'successor in the same transaction and any edits already made to the next occurrence ' +
        'go with it',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel',
    )
    expect(
      (await storedState(page, task.id)).status,
      'spec 5.1: a declined confirm runs no transition, so the completed row is still ' +
        'completed and the successor it would have deleted is still pending. A dialog that ' +
        'acts anyway shows the right words and takes the occurrence, which is invisible to a ' +
        'case that only reads the dialog',
    ).toBe('completed')
  })
})

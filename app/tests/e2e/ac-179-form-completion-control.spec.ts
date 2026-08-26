/*
AC-179: given an open task opened for edit, then the form's completion control
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
constant.** A form that patched status directly would be refused by AC-034
and would fail loudly; what would not fail loudly is a form that ran the
transition and then, say, cleared the task from My Day or skipped the
successor generation of 5.1, which is a different code path reaching the same
`status` value. So each arm is run twice, once through the form and once
through the row control 9.4 gives, and the two resulting TaskDetail rows are
compared field for field.

**The confirmation is the clause most likely to be dropped.** 9.5 puts it on
"Mark as not done" and the prototype's form has no such branch at all, its
fixtures carrying no series. An un-complete that takes the successor without
warning destroys any edit already made to the next occurrence, which is the
part of the sentence the person cannot see and the reason 9.5 spells it.

**Declining is asserted to write nothing**, for the reason AC-162 gives: a
confirm that acts anyway shows the right words, the person says no, and the
row is gone.

**The control has no name in any numbered section and is addressed by role
inside the form.** That is the same move the existing specs make for 9.4's
row checkbox, which section 9 also describes without naming; the form's
expander is left closed so that the steps editor's per-row checks are not on
the page, which makes the completion control the only one there. The naming
gap is routed to the Integration Steward with the rest of this package's.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Nothing this
criterion asserts moves; where the rows are read does. The undated rows are
read on Anytime, which draws Q2 at /app/anytime now that /app/tasks
redirects, and the dated repeating row on Today, which draws Q1 at
/app/today now that Desk holds /app. The comment on the last case still
holds under both names: a dated row is deliberately not on the undated page.

Spec: 9.3 (the completion control, in edit mode), 9.1 (the v2 routes table),
9.4 (the row checkbox it is
the same transition as), 9.5 ("Mark as not done" and the G-SERIES confirm),
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
 * The form's completion control, addressed by role inside the dialog.
 *
 * 9.3 describes it and names it nowhere, so this is the move the existing
 * specs already make for 9.4's row checkbox, which section 9 also describes
 * without naming. The expander is left closed by every case below, which
 * keeps the steps editor's per-row checks off the page and makes this the
 * only checkbox inside the form; the count is asserted so that a client
 * adding a second one fails here saying so rather than somewhere later.
 */
function completionControl(page: Page): Locator {
  return page.getByRole('dialog').getByRole('checkbox')
}

async function openForEdit(page: Page, title: string): Promise<void> {
  await clickControl(
    page.getByText(title),
    'spec 9.5: a click on any row opens the task, and 9.3 makes create and edit one artifact',
  )
  // 9.5's "click on any row opens the task", which this file needs on Done as
  // well as on Tasks: a completed task's row is on Done, and a client whose
  // Done rows do not open has no surface for the un-complete arm at all.
  // Section 9 does not restate the rule in its Done bullet, which is a
  // silence raised with the Integration Steward rather than resolved here.
  await expect(
    page.getByRole('dialog'),
    "spec 9.1's roles table: the task form is a dialog, and 9.3 makes create and edit one " +
      'artifact, so a row that was clicked has a form over it',
  ).toBeVisible()
  await expect(
    completionControl(page),
    'spec 9.3: in edit mode the form carries a completion control. With the "More options" ' +
      "expander closed, the steps editor's per-row checks are not on the page, so the form " +
      'holds exactly one checkbox and it is this one',
  ).toHaveCount(1)
  // And it is the completion control rather than the important toggle, which
  // 9.1's roles table makes a switch and not a checkbox. Without this the
  // locator above resolves to the important field on any client that gave it
  // the wrong role, and every assertion below then reports that the form
  // completed the task wrongly when what happened is that it has no
  // completion control at all. That is a red naming the wrong sentence, which
  // is the failure mode this leg's whole message discipline exists against.
  await expect(
    completionControl(page),
    "spec 9.1's roles table: a toggle switch is a switch, so the form's important field is not " +
      'a checkbox and the one checkbox here is 9.3\'s completion control',
  ).not.toHaveAccessibleName(/important/i)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-179: the task form completes and un-completes', () => {
  test('AC-179: completing through the form stores what the row control stores', async ({
    page,
  }) => {
    const viaForm = await createTask(page, {
      title: 'ac-179 completed through the form',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    const viaRow = await createTask(page, {
      title: 'ac-179 completed through the row',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })

    await page.goto(routesV2.anytime)
    await openForEdit(page, 'ac-179 completed through the form')
    await clickControl(
      completionControl(page),
      'spec 9.3: the completion control completes the open task',
    )
    const formState = await storedState(page, viaForm.id)

    await page.goto(routesV2.anytime)
    await clickControl(
      taskRow(page, 'ac-179 completed through the row').getByRole('checkbox'),
      'spec 9.4: a row carries a complete checkbox, which is the transition 9.3 says the form ' +
        'control is the same as',
    )
    const rowState = await storedState(page, viaRow.id)

    expect(
      formState,
      'spec 9.3: the form control "is the same transition 9.4\'s row checkbox and 9.5\'s ' +
        '\\"Mark as not done\\" make". Compared to the row control rather than to a constant, ' +
        'because a form that ran a different code path to the same status value would satisfy ' +
        'any assertion naming one, and 5.1 hangs My Day cleanup and successor generation off ' +
        'this transition',
    ).toEqual(rowState)
    expect(
      formState.status,
      'spec 5.1: and the transition that ran is the completion',
    ).toBe('completed')
    expect(
      formState.completed_by,
      'spec 5.1 and AC-036: completing stamps the actor, so the viewer is who the row records',
    ).toBe(seedIds.hassan)
  })

  test('AC-179: a completed task\'s control un-completes it', async ({ page }) => {
    const task = await createTask(page, {
      title: 'ac-179 un-completed through the form',
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    await page.goto(routesV2.anytime)
    await clickControl(
      taskRow(page, 'ac-179 un-completed through the form').getByRole('checkbox'),
      'spec 9.4: the row control completes it, which is the state the form control is asserted ' +
        'against',
    )
    await waitForApiIdle(page, 'the completion settles before the form is opened on it')

    await page.goto(routesV2.done)
    await openForEdit(page, 'ac-179 un-completed through the form')
    await clickControl(
      completionControl(page),
      'spec 9.3: the same control un-completes a completed task, the form being one artifact ' +
        'over both states rather than two',
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
    await waitForApiIdle(page, 'the completion and its successor settle before the form opens')

    await page.goto(routesV2.done)
    await openForEdit(page, title)
    await clickControl(
      completionControl(page),
      'spec 9.3: the completion control un-completes a completed task',
    )

    await expect(
      page.getByText(copy.uncompleteSeriesConfirm),
      'spec 9.3: the form control "takes 9.5\'s confirmation unchanged on the G-SERIES ' +
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

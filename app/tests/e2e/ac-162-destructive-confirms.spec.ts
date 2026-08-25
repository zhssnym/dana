/*
AC-162: given each destructive action section 9 puts a confirm on,
then the confirm carries that section's copy and declining it performs
nothing.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

Section 9 writes four confirmations word for word and section 12 asserts
none of them. They are not decoration. Three of the four describe an effect
the person cannot see from where they are standing: abandoning removes a
task from My Day and leaves it everywhere else, deleting a folder deletes
tasks for every member and not only for the owner, and un-completing a
repeat takes the next occurrence with any edits already made to it. The
fourth, deleting a task, says the one thing about it that matters.

**Declining is asserted beside every copy.** A confirm that acts anyway is
the failure worth catching, and it is invisible to a test that only reads the
dialog: the string was correct, the person said no, and the row is gone. The
folder case asserts the folder afterwards through 7.4 rather than off the
page, because a client that deleted it and re-rendered from a stale cache
looks identical to one that did not.

**The two confirms added on 2026-08-11 fall inside this criterion rather
than beside it.** Its text is every destructive action section 9 puts a
confirm on, not a list of four, so 9.6's leave and remove confirms owe two
more cases here and no fifth number. Both state 5.3's R-CLEAN, which is
exactly the invisible consequence the four written confirms exist to state:
the person losing access also loses every assignment they held in that
folder, and nothing else on the page says so.

**The folder confirm is asserted with counts this file made.** 9.6's copy
carries three numbers, and its example (28 open, 12 completed, 3 abandoned)
is a shape rather than a value, so the fixture is built to three counts that
are all different from each other and none of them one: a client rendering
the same number three times, or rendering the 8.11 pending count where the
copy asks for open and abandoned separately, passes any assertion that only
looks for digits.

**Done's "Mark as not done" is the task row's completion checkbox**, corrected
on 2026-08-13 and recorded here because an implementing session raised it as a
question this role owes an answer to. This case addressed the control as a
button, which was the reading available while nothing named it. The P8R
mid-package change control of 2026-08-13 named it, and the row it added is
`A task row's completion checkbox, and the task form's completion control
(9.3, 9.4) | "Complete task" when open, "Mark as not done" when complete`, so
the affordance 9.5 puts on a Done row is that checkbox in its complete state
and not a second control that happens to share its words. Three sentences
agree and none of them is this table: 9.4 lists "complete checkbox" among a
row's elements, 9.1's own paragraph calls the pair "one control pointed at one
object from two places", and 9.3 as RFC 0002 rewrites it says its completion
control "is the same transition 9.4's row checkbox and 9.5's 'Mark as not
done' make, and takes 9.5's confirmation unchanged on the G-SERIES successor
branch".

That last sentence answers the objection the implementation raised, which was
that a checkbox cannot confirm before it acts and that hiding a dialog inside
the one control every other page uses unconditionally is worse than a named
button. It is a real objection about the product and it is not a reading of
the specification: 9.3 has the completion control confirm on exactly that
branch, AC-179 asserts it doing so, and so the confirming behaviour is a
property of the transition rather than of a role. Two roles for one named
control is what 9.1's addressing sentence does not admit, and this leg already
reaches the same control as a checkbox in AC-157 and in `session-path`. So the
role here is corrected rather than the client's; what this case asserts, that
the G-SERIES confirm carries 9.5's copy and that declining runs nothing, does
not move.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005).** Two cases stood
on pages that moved: the abandon confirm opens on Today, which draws Q1 at
/app/today now that Desk holds /app, and the task delete on Anytime, which
draws Q2 at /app/anytime now that /app/tasks redirects. Nothing about the
confirmations moves with them.

**Two of the six confirmations this file exercises are ones RFC 0005
removes, and they stay here until the surfaces that render them do.** This
criterion's text quantifies rather than enumerates, "each destructive action
section 9 puts a confirm on", so what it asserts is whatever that section
puts one on at the time it is read, and the answer changed twice. 9.3 now
deletes a task to Trash "with the undo bar, and no confirmation: two ways
back is why the question left", and 9.6 does the same for a folder,
"deleting moves the folder to Trash for every member at once, with the undo
bar and no confirmation". AC-225 is the criterion that reads what replaced
them.

The two cases are not removed now, and the reason is not caution. They pass
against the v1 surfaces the client still carries, so removing them would buy
this package nothing and would cost the coverage of every day between now
and S11 and S12. They go when those packages land, under this criterion's
own quantifier and without anyone's permission being needed, because a
confirm section 9 no longer puts anywhere is not a confirm this criterion
asks for. Written down here so that the session which removes them can read
why rather than decide it again. AC-183's delete-folder clause is the other
shape and its own file says so: that criterion names its strings one by one,
so its list is its text and its text is the owner's to change.

Spec: 9.3 (the delete confirm), 9.4 (the abandon confirm), 9.5 (the
G-SERIES un-complete confirm), 9.6 (the folder delete confirm and its
counts, and the leave and remove confirms), 9.1 (the regions the folder
page's header and sharing panel are, and the v2 routes table), 5.1, 5.3's
R-CLEAN, 5.4, 8.5, 8.8, 7.4, AC-225 (the undo bar the two removed confirms
become).
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
  createTask,
  csrfToken,
  regionOf,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
  waitForApiIdle,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const DOOMED = 'ac-162 folder with counted tasks'
/** Three different numbers, none of them one. */
const OPEN = 3
const COMPLETED = 2
const ABANDONED = 4

/**
 * The task's status, read after a barrier rather than straight after the
 * click that declined.
 *
 * The declining cases assert an absence, that nothing happened, and an
 * absence is the one thing a read can report by arriving early. A client that
 * acted on Cancel anyway would have its write in flight while this read
 * travels on Playwright's own HTTP client, and the case would pass against
 * exactly the implementation it exists to catch.
 */
async function statusOf(page: Page, id: string): Promise<string> {
  await waitForApiIdle(
    page,
    'a declined confirm is asserted to have written nothing, so everything the page might ' +
      'have sent has to have been sent and answered before the row is read',
  )
  const response = await page.request.get(`/api/v1/tasks/${id}`)
  expect(
    response.status(),
    `GET /tasks/${id} answered ${response.status()}: ${await response.text()}`,
  ).toBe(200)
  return ((await response.json()) as { status: string }).status
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-162: the four confirms of section 9', () => {
  test('AC-162: abandoning from Today carries 9.4\'s copy and declining does nothing', async ({
    page,
  }) => {
    const title = 'ac-162 abandon me from today'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })

    await page.goto(routesV2.today)
    await clickControl(
      taskRow(page, title).getByRole('button', { name: 'More actions', exact: true }),
      'spec 9.4: a row carries an overflow menu',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /abandon/i }),

      "spec 9.4: the row's overflow menu carries edit, abandon and delete",
    )

    await expect(
      page.getByText(copy.abandonConfirm),
      'spec 9.4: abandon from here uses this copy, which is the only thing that tells the ' +
        'person the task stays everywhere else. Copy in section 9 is normative',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.3 and 9.4: a destructive confirm can be declined, so it offers a control that does not proceed',
    )
    expect(
      await statusOf(page, task.id),
      'spec 5.1: a declined confirm runs no transition. A dialog that acts anyway shows the ' +
        'right words and takes the task, which is invisible to a test that only reads the ' +
        'dialog',
    ).toBe('pending')
  })

  test('AC-162: deleting a task carries 9.3\'s copy and declining leaves it', async ({
    page,
  }) => {
    const title = 'ac-162 delete me from the form'
    const task = await createTask(page, { title, folder_id: seedIds.groceries })

    await page.goto(routesV2.anytime)
    await clickControl(
      page.getByText(title),
      "spec 9.5: a click on any row opens the task, and 9.3 puts delete in that form's " +
        'overflow menu',
    )
    // 9.3: delete lives in the form's overflow menu. Scoped to the open form
    // rather than taken as the last match on the page, because 9.1's control
    // table gives the form's overflow menu and a task row's the same name,
    // "More actions", deliberately: they do the same thing to different
    // objects. So position is the wrong way to tell them apart and the
    // containing dialog is the right one. Reaching for the last match worked
    // only while the row count happened to leave the form's button last, and
    // it stopped working the moment this file's neighbours created different
    // rows: the click landed on a row's menu behind the form's own scrim.
    await clickControl(
      page.getByRole('dialog').getByRole('button', { name: 'More actions', exact: true }),
      'spec 9.3: the task form carries an overflow menu, which is where delete lives',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /delete/i }),
      'spec 9.3 and 9.6: delete lives in the overflow menu of the form and of the folder header',
    )

    await expect(
      page.getByText(copy.deleteTaskConfirm),
      'spec 9.3: the delete confirm is "Delete this task? This can\'t be undone.", and 5.1 ' +
        'makes that literally true, the row and its steps, entries and reminder going together',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.3 and 9.4: a destructive confirm can be declined, so it offers a control that does not proceed',
    )
    expect(
      await statusOf(page, task.id),
      'spec 5.1: the task is still there after a declined delete',
    ).toBe('pending')
  })

  test('AC-162: the folder confirm names the folder and its three counts', async ({ page }) => {
    const token = await csrfToken(page.context())
    const created = await page.request.post('/api/v1/folders', {
      data: { name: DOOMED },
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      created.status(),
      `POST /folders answered ${created.status()}: ${await created.text()}`,
    ).toBe(201)
    const folder = (await created.json()) as { id: string }

    for (let i = 0; i < OPEN; i += 1) {
      await createTask(page, { title: `ac-162 open ${i}`, folder_id: folder.id })
    }
    for (let i = 0; i < COMPLETED; i += 1) {
      const task = await createTask(page, {
        title: `ac-162 completed ${i}`,
        folder_id: folder.id,
      })
      await transition(page, task.id, 'complete', 'UTC')
    }
    for (let i = 0; i < ABANDONED; i += 1) {
      const task = await createTask(page, {
        title: `ac-162 abandoned ${i}`,
        folder_id: folder.id,
      })
      await transition(page, task.id, 'abandon', 'UTC')
    }

    await page.goto(routesV2.folder(folder.id))
    // Inside the region rather than first on the page. 9.6's menu is a third
    // control answering to "More actions" after the task form's and a task
    // row's, and reaching it by position is what the last tester return
    // flagged and what the second change control answered by naming this
    // region. A third name for the menu was declined there: the two named
    // menus share their name deliberately, being one control pointed at
    // different objects, so what separates them is the container.
    await clickControl(
      regionOf(page, 'Folder header').getByRole('button', {
        name: 'More actions',
        exact: true,
      }),
      'spec 9.6 and 9.1: the folder header is a named region carrying an overflow menu with ' +
        'rename, label, leave and delete',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /delete/i }),
      'spec 9.3 and 9.6: delete lives in the overflow menu of the form and of the folder header',
    )

    await expect(
      page.getByText(
        `Delete ${DOOMED}? This permanently deletes ${OPEN} open, ${COMPLETED} completed, ` +
          `and ${ABANDONED} abandoned tasks for every member.`,
      ),
      'spec 9.6: the folder delete confirm lists counts, and it is the only place a person is ' +
        'told the deletion reaches every member rather than only their own view. The three ' +
        'counts differ here and none is one, so a client rendering the same number three ' +
        'times, or rendering 8.11\'s pending count where the copy asks for open and abandoned ' +
        'separately, cannot pass by looking numeric',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.3 and 9.4: a destructive confirm can be declined, so it offers a control that does not proceed',
    )
    await waitForApiIdle(
      page,
      'a declined delete is asserted to have deleted nothing, so the page has to have finished ' +
        'whatever it was going to send before the folder is asked for',
    )
    const after = await page.request.get(`/api/v1/folders/${folder.id}`)
    expect(
      after.status(),
      'spec 8.8: a declined confirm runs no cascade, and the folder is asked for through 7.4 ' +
        'rather than looked for on a page that may be rendering a stale cache',
    ).toBe(200)
  })

  test('AC-162: un-completing a repeat warns about the next occurrence', async ({ page }) => {
    const title = 'ac-162 repeating and completed'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      recurrence_rule: 'FREQ=DAILY',
    })
    // 5.1: completing a rule-carrying row generates the successor in the same
    // transaction, which is the occurrence the confirm is about.
    await transition(page, task.id, 'complete', 'UTC')

    await page.goto(routesV2.done)
    await clickControl(
      taskRow(page, title).getByRole('checkbox', { name: 'Mark as not done', exact: true }),
      'spec 9.5: each Done row has "Mark as not done", which runs uncomplete and, on the ' +
        'G-SERIES successor branch, confirms first. A checkbox because 9.1\'s names table gives ' +
        "that string to a task row's completion checkbox in its complete state and 9.4 lists " +
        'that checkbox among a row\'s elements; see this file\'s header for why the confirm ' +
        'does not make it something else',
    )

    await expect(
      page.getByText(copy.uncompleteSeriesConfirm),
      'spec 9.5: on the G-SERIES successor branch, "Mark as not done" first confirms this. ' +
        '5.1 deletes the successor in the same transaction and the parenthesis is the part ' +
        'the person cannot see: any edits already made to the next occurrence go with it',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.3 and 9.4: a destructive confirm can be declined, so it offers a control that does not proceed',
    )
    expect(
      await statusOf(page, task.id),
      'spec 5.1: the declined un-complete left the completed row completed, so the successor ' +
        'it would have deleted is still pending',
    ).toBe('completed')
  })

  test("AC-162: leaving a folder carries 9.6's copy and declining keeps the membership", async ({
    browser,
  }) => {
    // The non-owner of the seeded shared folder, because 5.4 gives leave to a
    // member and gives the owner a transfer instead. A context of its own so
    // this case does not disturb the viewer every other case here signs in as.
    const context = await browser.newContext()
    const page = await context.newPage()
    await signIn(page, seedSubs.imran)

    await page.goto(routesV2.folder(seedIds.groceries))
    await clickControl(
      regionOf(page, 'Folder header').getByRole('button', {
        name: 'More actions',
        exact: true,
      }),
      'spec 9.6 and 9.1: the folder header is a named region, and its overflow menu carries ' +
        'Leave for a member who is not the owner',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /leave/i }),
      'spec 9.6: the header overflow carries Leave, non-owner only per the 5.4 matrix',
    )

    await expect(
      page.getByText(copy.leaveFolder('Groceries')),
      "spec 9.6: the leave confirm states 5.3's R-CLEAN, which is the half of leaving a " +
        'person cannot see: the assignments they hold in this folder become unassigned. Copy ' +
        'in section 9 is normative',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel',
    )

    await waitForApiIdle(
      page,
      'a declined leave is asserted to have left the membership, so the page has to have ' +
        'finished whatever it was going to send before the folder is asked for',
    )
    const after = await page.request.get(`/api/v1/folders/${seedIds.groceries}`)
    expect(
      after.status(),
      'spec 5.3: a declined leave leaves the membership, so this member can still read the ' +
        'folder. A 404 here is the leave having run anyway, which is invisible to a case that ' +
        'only reads the dialog',
    ).toBe(200)
    await context.close()
  })

  test("AC-162: removing a member carries 9.6's copy and declining keeps them", async ({
    page,
  }) => {
    // The owner removes the other member, which 5.4 gives to the owner alone.
    await page.goto(routesV2.folder(seedIds.groceries))
    await clickControl(
      page.getByRole('button', { name: 'Share' }),
      'spec 9.6: the folder header carries a Share button, which opens the sharing panel',
    )

    const panel = regionOf(page, 'Sharing panel')
    const member = panel
      .getByRole('listitem')
      .or(panel.getByRole('row'))
      .filter({ hasText: 'Imran' })
    await clickControl(
      member.getByRole('button', { name: /remove/i }),
      'spec 9.6 and 9.1: the sharing panel is a named region carrying the member list with its ' +
        'remove controls, and the row names the member the control acts on',
    )

    await expect(
      page.getByText(copy.removeMember('Imran', 'Groceries')),
      "spec 9.6: the remove confirm states 5.3's R-CLEAN for the person being removed, the " +
        'same consequence the leave confirm states for the person leaving. It names them and ' +
        'the folder from the row, the way the delete confirm takes the folder and its counts',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: every confirmation offers Continue and Cancel',
    )

    await waitForApiIdle(
      page,
      'a declined removal is asserted to have removed nobody, so the page has to have finished ' +
        'whatever it was going to send before the member list is read',
    )
    const after = await page.request.get(`/api/v1/folders/${seedIds.groceries}`)
    expect(
      after.status(),
      `GET /folders/:id answered ${after.status()}: ${await after.text()}`,
    ).toBe(200)
    const members = ((await after.json()) as { members: { user: { display_name: string } }[] })
      .members
    expect(
      members.map((entry) => entry.user.display_name).sort(),
      'spec 5.3: a declined removal removes nobody. The seeded folder keeps both members, and ' +
        'asserted through 7.4 rather than off the page because a client that removed them and ' +
        're-rendered from a stale cache looks identical to one that did not',
    ).toEqual(['Hassan', 'Imran'])
  })
})

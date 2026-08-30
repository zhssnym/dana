/*
AC-162: given each destructive action section 9 puts a confirm on,
then the confirm carries that section's copy and declining it performs
nothing.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

Section 9 wrote four confirmations word for word and section 12 asserted
none of them. They are not decoration. Three of the four described an effect
the person cannot see from where they are standing: abandoning removes a
task from Today and leaves it everywhere else, deleting a folder deletes
tasks for every member and not only for the owner, and un-completing a
repeat takes the next occurrence with any edits already made to it. The
fourth, deleting a task, said the one thing about it that matters, and it is
the one v2 retired: two ways back out of Trash is what made the question
unnecessary, which is a change to the product rather than to this rule.

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

The two cases were kept while the v1 surfaces stood, so that removing them
bought nothing and cost the coverage of every day until the packages landed.
Both packages have now landed and both cases have gone with them, under this
criterion's own quantifier and without anyone's permission being needed,
because a confirm section 9 no longer puts anywhere is not a confirm this
criterion asks for. AC-183's delete-folder clause is the other shape and its
own file says so: that criterion names its strings one by one, so its list is
its text and its text is the owner's to change.

**The folder half of that removal happened here, at RFC 0005 change control
item 14, 2026-08-25, and the task half at S15.** S12 landed 9.6's surface, so deleting a folder now
moves it to Trash for every member with the undo bar and no confirmation,
and the case that asserted the counts-carrying confirm went exactly as the
paragraph above provided: under this criterion's own quantifier, with AC-225
reading the undo bar that replaced it. Its fixture rule, three different
counts and none of them one, retired with the copy that carried the counts.

**The task half followed at S15 (RFC 0005 change control items 15 and 19),
on the same reasoning and by the same route.** 9.3's v2 replacement deletes a
task to Trash with the undo bar and no confirmation, and S15 is the package
that retires the v1 form the confirm lived in, so the case went where the
paragraph above said it would. Four confirmations remain in this file and
none of them is 9.3's, which is why the describe below no longer counts to
four: this criterion never named a number and the surfaces it quantifies over
have changed twice. In the same act the leave case stopped reaching the folder's
overflow menu inside the "Folder header" region: 9.1's replacement puts the
object's overflow menu at the window bar's right end and the v2 folder page
draws it there, so the menu is reached the way AC-217 already reaches it, by
role and name inside the main landmark, ahead of the task rows' menus that
share the name. The S9 precedent, a locator corrected inside a criterion
whose sentence did not move.

Spec: 9.3 (the v2 delete, to Trash with the undo bar and no confirmation,
which is why this file no longer reads one there), 9.4 (the abandon confirm), 9.5 (the
G-SERIES un-complete confirm), 9.6 (the leave and remove confirms, and the
undo-bar folder delete that retired its confirm), 9.1 (the window bar's
object menu, the sharing panel region, and the v2 routes table), 5.1, 5.3's
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

test.describe('AC-162: the confirms section 9 still puts on destructive acts', () => {
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

  // The task-delete case stood here until S15 landed 9.3's v2 surface, which
  // is the package the paragraph above named. 9.3 now deletes a task to Trash
  // "with the undo bar, and no confirmation: two ways back is why the question
  // left", so the confirm it asserted is not one section 9 puts anywhere; it
  // went under this criterion's own quantifier, needing nobody's permission,
  // and AC-225 reads the undo bar that replaced it.

  // The folder-delete case stood here until RFC 0005 change control item 14.
  // 9.6 now deletes to Trash with the undo bar and no confirmation, so the
  // confirm it asserted, the one carrying the folder's three counts, is not
  // one section 9 puts anywhere; the header records the removal and AC-225
  // reads the undo bar that replaced it.

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
    // The window bar's menu, not the folder header's: 9.1's replacement puts
    // the object's overflow menu at the bar's right end, so it is reached the
    // way AC-217 reaches it, by role and name inside the main landmark, ahead
    // of the task rows' menus that share the name. Corrected at RFC 0005
    // change control item 14; this criterion's sentence did not move.
    await clickControl(
      page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first(),
      "spec 9.1: the active tab's controls include the object's overflow menu, named " +
        '"More actions", and for a member who is not the owner it carries Leave (9.6)',
    )
    await clickControl(
      page.getByRole('menuitem', { name: /leave/i }),
      'spec 9.6: the object menu carries Leave, non-owner only per the 5.4 matrix',
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

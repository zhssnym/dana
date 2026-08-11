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

Spec: 9.3 (the delete confirm), 9.4 (the abandon confirm), 9.5 (the
G-SERIES un-complete confirm), 9.6 (the folder delete confirm and its
counts, and the leave and remove confirms), 9.1 (the regions the folder
page's header and sharing panel are), 5.1, 5.3's R-CLEAN, 5.4, 8.5, 8.8,
7.4.
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
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
  transition,
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

async function statusOf(page: Page, id: string): Promise<string> {
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
  test('AC-162: abandoning from My Day carries 9.4\'s copy and declining does nothing', async ({
    page,
  }) => {
    const title = 'ac-162 abandon me from my day'
    const task = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(0),
      assignee_id: seedIds.hassan,
    })

    await page.goto(routes.myDay)
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

    await page.goto(routes.tasks)
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

    await page.goto(routes.folder(folder.id))
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

    await page.goto(routes.done)
    await clickControl(
      taskRow(page, title).getByRole('button', { name: 'Mark as not done' }),
      'spec 9.5: each Done row has "Mark as not done", which runs uncomplete and, on the ' +
        'G-SERIES successor branch, confirms first',
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

    await page.goto(routes.folder(seedIds.groceries))
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
    await page.goto(routes.folder(seedIds.groceries))
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

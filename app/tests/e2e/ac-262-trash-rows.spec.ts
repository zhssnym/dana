/*
AC-262: given a deleted task and a deleted folder in the Trash, then each row
names the days it has left, in the prototype's "30d left", of 4.3 and 4.5's thirty, says its kind as a glyph
rather than as a word, and still says where it lived; and given that page, then
it offers no control that deletes anything permanently, 7.13 assigning the
purge to the tick and 9.11 naming restore alone.

**The countdown is on the row because thirty days is per item**, which the
prototype's own header argues rather than assumes: "a page-level 'items are
deleted after 30 days' would be true and useless. The thing you need is how
long *this* has, and that is a fact about the row." The built page states the
rule once at the top, correctly and verbatim, and then draws rows that carry
no time at all beyond their position in the order.

**The rule sentence is asserted alongside, because the row must not replace
it.** 9.11 requires both: "the page states the rule once" and each row naming
its own facts. The audit's addendum verified that sentence character for
character in the running app, so it is a thing this package can only break,
and asserting it here is what keeps a countdown from being added by deleting
the banner.

**The kind becomes a glyph and stops being a word, which is a replacement
rather than an addition.** The prototype's reasoning is that a person here is
answering "what did I delete" and "usually know roughly *when* rather than
*what*", so kind is "a glyph on the row rather than a heading you have to pick
first". The built row writes "Folder" or "Task" as text before its context.
Both halves are asserted, the drawing present and the word gone, because a
client that added an icon beside the word would satisfy only the first.

**"Where it lived" is asserted as surviving.** It is 9.11's own clause and the
built page already honours it, a task naming its folder and a folder naming
what comes back with it. A row rebuilt around a countdown that dropped it
would trade one clause of the section for another.

**The last case asserts an absence, and it rests on an escalation this package
raised rather than settled.** `prototype-v2/src/screens/trash-screen.tsx`
offers "Delete for ever" behind a confirm and calls it "the only act in Dana
with no way back". Two numbered sections disagree and neither is silent: 7.13
says "DELETE of a task or folder sets deleted_at (soft); purge is the tick's,
at 30 days, permanent", and 9.11 enumerates this page and names restore alone.
There is no permanent-delete route in `app/src/server/routes/`. RFC 0005
change control item 20 says a prototype-versus-numbered-section disagreement is
escalated rather than picked, so this asserts the contract as it stands and is
the arm to move if the owner rules the prototype's way. What it refuses in the
meantime is the worse outcome either way: a control drawn with nothing behind
it.

**Who deleted it is 9.11's clause and is not asserted here, because the read
cannot answer it.** `shared/trash.ts` carries `deleted_at` and no actor, and
`server/domain/trash.ts` selects none, though 4.13's event log records one. A
criterion asserting it would be red against a client that cannot pass it by
any client-side work, so it is escalated with the other two and named in the
package's log row instead of written as a failing case.

Spec: 9.11 (the page, its rule sentence, "who deleted it and when (from
4.13)", restore, and no capture anywhere), 7.13 (the soft delete and the
tick's purge), 4.3 and 4.5 (the 30-day window), and the parity audit's trash
row.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  createFolder,
  createTask,
  csrfToken,
  deleteTask,
  routesV2,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 9.11, transcribed, and verified verbatim in the audit's addendum. */
/* The prototype's own sentence, to which 9.11 was amended at S27 (RFC 0005
   change control item 52); it was "Deleted things stay here for 30 days, then
   they're gone for good." until then. */
const RETENTION_RULE = 'Deleted items are kept for 30 days, then removed.'

interface Fixture {
  taskId: string
  taskTitle: string
  folderId: string
  folderName: string
  /** The folder the task lived in, which its row still has to name. */
  homeId: string
  homeName: string
}

async function build(page: Page): Promise<Fixture> {
  const homeName = caseTitle('ac-256 home')
  const home = await createFolder(page, homeName)
  const taskTitle = caseTitle('ac-256 task')
  const task = await createTask(page, { title: taskTitle, folder_id: home.id })

  const folderName = caseTitle('ac-256 doomed')
  const folder = await createFolder(page, folderName)

  /* The two deletes answer differently and both are 7.13's soft one: a task
     answers 204 and a folder answers 200 carrying the counts of what went with
     it, which is what the undo bar and the confirm-free delete of 9.6 read. */
  const csrf = await csrfToken(page.context())
  for (const [path, expected] of [
    [`/api/v1/tasks/${task.id}`, 204],
    [`/api/v1/folders/${folder.id}`, 200],
  ] as const) {
    const response = await page.request.delete(path, {
      headers: { 'X-CSRF-Token': csrf },
    })
    expect(
      response.status(),
      `DELETE ${path} answered ${response.status()}: ${await response.text()}`,
    ).toBe(expected)
  }

  return {
    taskId: task.id,
    taskTitle,
    folderId: folder.id,
    folderName,
    homeId: home.id,
    homeName,
  }
}

function trashRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title }).first()
}

test.describe('AC-262: a Trash row carries its own facts', () => {
  let fixture: Fixture

  test.beforeEach(async ({ page }) => {
    await signIn(page, seedSubs.hassan)
    await page.goto(routesV2.desk)
    fixture = await build(page)
  })

  test.afterEach(async ({ page }) => {
    /* Both fixtures are already soft-deleted and the tick purges them at 30
       days; restoring the folder only to delete it again would leave the same
       row. The task's own id is retired so a later run's title is unique. */
    await deleteTask(page, fixture.taskId).catch(() => undefined)
  })

  test('AC-262: each row names its own countdown, and the rule is still stated once', async ({
    page,
  }) => {
    await page.goto(routesV2.trash)

    await expect(
      page.getByText(RETENTION_RULE, { exact: true }),
      'spec 9.11: "the page states the rule once". The audit\'s addendum verified this ' +
        'sentence character for character in the running app, so a countdown added by ' +
        'deleting the banner trades one clause of the section for another',
    ).toBeVisible()

    for (const [what, title] of [
      ['the task', fixture.taskTitle],
      ['the folder', fixture.folderName],
    ] as const) {
      await expect(
        trashRow(page, title),
        `${what} just deleted is in the Trash`,
      ).toBeVisible()

      await expect(
        trashRow(page, title),
        `spec 9.11 and the prototype's own header: "the countdown is on the row, not in a ` +
          `banner. Thirty days is per item, so a page-level 'items are deleted after 30 ` +
          `days' would be true and useless." A row deleted today has thirty of them left, ` +
          `and the built row carries no time at all`,
      ).toContainText(/(30|29)d left/)
    }
  })

  test('AC-262: the kind is a glyph and no longer a word', async ({ page }) => {
    await page.goto(routesV2.trash)

    const row = trashRow(page, fixture.folderName)
    await expect(
      row.locator('svg').first(),
      'spec 9.11 read through the prototype: the kind is "a glyph on the row rather than a ' +
        'heading you have to pick first", a person here answering "what did I delete"',
    ).toBeVisible()

    await expect(
      row,
      'the word is replaced rather than joined: the built row writes "Folder" or "Task" as ' +
        'text before its context, and a client that added an icon beside the word would ' +
        'satisfy the assertion above and fail this one',
    ).not.toContainText(/\bFolder\b\s*·/)

    await expect(
      trashRow(page, fixture.taskTitle),
      'spec 9.11: each row still names "where it lived", which the built page already ' +
        'honours and a rebuild must not lose',
    ).toContainText(fixture.homeName)
  })

  test('AC-262: the page offers nothing that deletes permanently', async ({ page }) => {
    await page.goto(routesV2.trash)
    await expect(trashRow(page, fixture.taskTitle)).toBeVisible()

    for (const name of [/Delete for ever/i, /Delete forever/i, /Empty Trash/i, /Delete permanently/i]) {
      await expect(
        page.getByRole('button', { name }).or(page.getByRole('menuitem', { name })),
        'spec 7.13: "DELETE of a task or folder sets deleted_at (soft); purge is the tick\'s, ' +
          'at 30 days, permanent", and 9.11 enumerates this page and names restore alone. ' +
          'There is no permanent-delete route in app/src/server/routes/, so a control here ' +
          'would have nothing behind it. The prototype offers "Delete for ever" and that ' +
          'disagreement is escalated under RFC 0005 change control item 20 rather than ' +
          'settled by a session; this arm moves if the owner rules the prototype\'s way',
      ).toHaveCount(0)
    }

    await expect(
      page.getByRole('button', { name: 'Restore', exact: true }).first(),
      'spec 9.11: restore is the act this page has, offered on every row rather than only on ' +
        'rows the viewer deleted',
    ).toBeVisible()
  })
})

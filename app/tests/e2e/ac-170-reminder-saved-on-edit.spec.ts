/*
AC-170: given a reminder set, changed, or cleared in the task form while an
existing task is edited, then the stored reminder matches the form in each of
the three cases, clearing it leaves the task with none, and a reload of the
page shows what was stored rather than what was typed.

Numbered by the Integration Steward at P8's second change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged.

**Reworked onto 9.3's v2 task surface at S15 (RFC 0005 change control items
15 and 19).** The criterion's subject is untouched and every assertion below
is the one it made before; what moved is the surface the reminder is set on
and the moment the write happens. The sentence above still says "in the task
form", which 9.3's v2 opening retires ("There is no task form"), and the
Replace that brings the words in step is recommended in this session's change
control item and is the owner's to rule; nothing this file asserts depends on
which words it carries.

The pair with AC-169, and two numbers rather than one because create and edit
were two paths to two different endpoints: the create body's reminder arm in
frozen 7.6, and frozen 7.9's PUT with DELETE /tasks/:id/reminder for the
removal, since no task body expresses one. **On the v2 surface those two
paths are one**, capture creating the row before the card opens, so the split
this pair was written for has closed on the client while both endpoints stay
frozen and stay asserted server-side by AC-149, AC-146 and AC-148. That is
recorded in AC-169's file, which is the half it changes.

**Three cases because the criterion names three, and the third is the one
that gets skipped.** Setting a reminder where there was none and changing one
that exists can share a code path; removing one cannot, because 7.9 puts it
on a different verb and a different route. An implementation that sends a PUT
with an empty body for the clear satisfies "the surface no longer shows one"
and leaves a fire instant scheduled against a task nobody expects to be
reminded about.

**Each case reads the stored row rather than the surface.** A reminder that
never left the browser renders back into the strip perfectly, which is exactly
how the defect these two criteria exist for survived a green suite.

**The barrier is the commit, not a save.** 9.3's v2 rule is "every edit
commits as it is made, there is no Save control and no draft state", so there
is no control to press and no dialog closing to sequence a read behind. What
this file waits on is `watchCommit`, which counts the requests the page has
started and will not return until this edit's own write has gone out and been
answered. API quiet on its own would return in the window between the press
and the request the press causes, and the read after it would report a stale
row, which is the exact shape of the defect this criterion exists to catch.

**The reload clause is asserted where it discriminates.** After each commit
the page is reloaded and the card reopened, so what the strip shows has come
back from the server rather than from anything the case typed. That is the
difference between a client that wrote the value and one that merely
remembers it.

Written before the implementation, this project's standing order. The red
belongs on the stored reminder after a commit; a red earlier than that is a
different sentence failing.

Spec: 9.3 (the v2 reminder row, "requires a due date; one picker, a time on
that day, writing 4.8's time_of_day mode", and the commit-as-it-is-made
rule), 9.1 (the v2 routes table and the task surface's role), frozen 7.9 (the
PUT and the DELETE), frozen 7.0 (TaskDetail's reminder), 4.8, 8.6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  chipValue,
  clearReminder,
  createTask,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  setReminderTime,
  signIn,
  storedReminder,
  taskChip,
  taskSurface,
  watchCommit,
  TEST_TIMEOUT_MS,
 openTaskRow } from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const BASE = 'ac-170 edited for its reminder'

/**
 * Opens the task from Scheduled, which is where a dated fixture's row is and
 * how 9.4's rule reaches the surface: "a task row opens that task, on every
 * page that draws one and whatever the task's status".
 *
 * No expander, and that absence is the package. 9.3's v2 card holds the
 * reminder on its header strip, so there is nothing between opening the task
 * and answering the field.
 */
async function openTheCard(page: Page, title: string): Promise<void> {
  await page.goto(routesV2.scheduled)
  await openTaskRow(page, title,
    'spec 9.4: a click on any row opens that task, which is how the card is reached',
  )
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the task surface is a dialog when opened as one, and 9.3 makes " +
      'the card the same surface a dialog presents',
  ).toBeVisible()
}

/** What the reminder chip currently says, which is the surface's own answer. */
async function shownReminder(page: Page): Promise<string> {
  return chipValue(taskChip(page, 'reminder'), 'reminder')
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-170: a reminder set, changed or cleared while editing', () => {
  test('AC-170: setting one on a task that had none stores it, and a reload shows it', async ({
    page,
  }) => {
    const title = caseTitle(BASE)
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
    })
    expect(
      await storedReminder(page, created.id),
      'the fixture starts with no reminder, which is what makes the assertion below about the ' +
        'edit rather than about the create',
    ).toBeNull()

    await openTheCard(page, title)
    const commit = watchCommit(page)
    const offered = await setReminderTime(page)
    await commit.settled(
      'spec 9.3: a chip commits as it is answered, so the reminder is on the wire before this ' +
        'case asks the server what it holds',
    )

    const stored = await storedReminder(page, created.id)
    expect(
      stored,
      'spec 9.3: the reminder is committed like every other field of this surface, and frozen ' +
        '7.9 gives that write a PUT. A null here is the surface offering a field it discards, ' +
        'with nothing on the page saying so',
    ).not.toBeNull()
    if (stored === null) throw new Error('unreachable: asserted above')
    expect(
      stored.time_of_day?.slice(0, 5) ?? null,
      "spec 4.8 and 9.3's v2 reminder row: the stored reminder matches the surface, in the " +
        'time_of_day mode that row makes the only one v2 writes',
    ).toBe(offered)
    expect(
      stored.offset_minutes,
      'spec 4.8: exactly one of the two columns is non-null, and 9.3 v2 writes the other one. ' +
        'A client still writing offsets would pass every assertion made against the strip and ' +
        'put the value on the column the section stopped using',
    ).toBeNull()

    // The reload clause. What the strip shows now has come back from the
    // server, so a client that merely remembered the value cannot pass this
    // and pass the assertion above.
    await page.reload()
    await openTheCard(page, title)
    expect(
      await shownReminder(page),
      "spec 9.3, and the criterion's own last clause: a reload shows what was stored rather " +
        'than what was typed, which is the difference between a value that was written and a ' +
        'value that was held',
    ).toBe(offered)
  })

  test('AC-170: changing one stores the new value', async ({ page }) => {
    const title = caseTitle(BASE)
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
    })

    await openTheCard(page, title)
    const firstCommit = watchCommit(page)
    const first = await setReminderTime(page)
    await firstCommit.settled('the first reminder is committed before it is read back')
    const afterFirst = await storedReminder(page, created.id)
    expect(
      afterFirst?.time_of_day?.slice(0, 5) ?? null,
      'the first reminder is stored, which is the state the change below is measured from',
    ).toBe(first)

    const secondCommit = watchCommit(page)
    const second = await setReminderTime(page, first)
    expect(
      second,
      'the case changed the reminder to a different value, which is what makes this a change ' +
        'rather than a repeat',
    ).not.toBe(first)
    await secondCommit.settled('the change is committed before it is read back')

    const stored = await storedReminder(page, created.id)
    expect(
      stored?.time_of_day?.slice(0, 5) ?? null,
      'spec 7.9: the PUT upserts the single row, so a changed reminder replaces the stored one ' +
        'rather than adding beside it. A client that wrote only when none existed leaves the ' +
        'person looking at a surface that disagrees with the notification they will get',
    ).toBe(second)
  })

  test('AC-170: clearing one leaves the task with none', async ({ page }) => {
    const title = caseTitle(BASE)
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
    })

    await openTheCard(page, title)
    const setting = watchCommit(page)
    await setReminderTime(page)
    await setting.settled('a reminder is committed so that there is one to clear')
    expect(
      await storedReminder(page, created.id),
      'a reminder exists to be cleared, which is what makes the clear below discriminate',
    ).not.toBeNull()

    const clearing = watchCommit(page)
    await clearReminder(page)
    await clearing.settled('the removal is on the wire before the row is read back')

    expect(
      await storedReminder(page, created.id),
      'spec 7.9: the removal arm is DELETE /tasks/:id/reminder, because no task body expresses ' +
        'a removal. This is the case of the three that cannot share a path with the other two, ' +
        'and an implementation that sends an empty PUT instead satisfies the surface while ' +
        'leaving 8.6 a fire instant for a reminder the person deleted',
    ).toBeNull()

    // The reload clause again, on the arm where a stale surface is most
    // misleading: the person cleared it, so the strip must come back holding
    // nothing rather than a time.
    await page.reload()
    await openTheCard(page, title)
    expect(
      await shownReminder(page),
      'spec 9.3: a reload shows what was stored, and nothing was. The chip reads its own empty ' +
        'state rather than a time, which is what a strip that always renders a value owes for ' +
        'a field holding none',
    ).not.toMatch(/\d{1,2}:\d{2}/)
  })
})

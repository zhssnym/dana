/*
AC-170: given a reminder set, changed, or cleared in the task form while an
existing task is edited, then the stored reminder matches the form in each of
the three cases, clearing it leaves the task with none, and a reload of the
page shows what was stored rather than what was typed.

Numbered by the Integration Steward at P8's second change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged.

The pair with AC-169, and two numbers rather than one because create and edit
are two paths to two different endpoints: the create body's reminder arm in
frozen 7.6, and frozen 7.9's PUT with DELETE /tasks/:id/reminder for the
removal, since no task body expresses one. Section 12 already carries that
split on the server side, AC-149 against the create arm and AC-146 and AC-148
against the PUT and the DELETE. One number covering both would pass on an
implementation that wired whichever path its author happened to try, which is
the failure that produced the pair.

**Three cases because the criterion names three, and the third is the one
that gets skipped.** Setting a reminder where there was none and changing one
that exists can share a code path; removing one cannot, because 7.9 puts it
on a different verb and a different route. An implementation that sends a PUT
with an empty body for the clear satisfies "the form no longer shows one" and
leaves a fire instant scheduled against a task nobody expects to be reminded
about.

**Each case reads the stored row rather than the form.** A reminder that
never left the browser renders back into the form perfectly, which is exactly
how the defect these two criteria exist for survived a green suite.

**The reload clause is asserted where it discriminates.** After a save the
page is reloaded and the form is reopened, so what the control shows has come
back from the server rather than from anything the case typed. That is the
difference between a client that wrote the value and one that merely
remembers it.

Written before the implementation, this project's standing order. The red
belongs on the stored reminder after a save; a red earlier than that is a
different sentence failing.

Spec: 9.3 (the reminder control, its two modes, and the ruling that it is
saved like every other field), frozen 7.9 (the PUT and the DELETE), frozen
7.0 (TaskDetail's reminder), 4.8, 8.6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clearOfferedReminder,
  clickControl,
  createTask,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  setOfferedReminder,
  signIn,
  storedReminder,
  waitForSaveToSettle,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const BASE = 'ac-170 edited for its reminder'

/**
 * Opens the task on Planned and expands the form, which is where 9.3 keeps
 * the reminder. A dated fixture so 6 Q3 puts the row on a page the case can
 * reach it from, and no due time so the control is in its time-of-day mode.
 */
async function openTheForm(page: Page, title: string): Promise<void> {
  await page.goto(routes.planned)
  await clickControl(
    page.getByText(title),
    'spec 9.5: a click on any row opens the task, which is how edit mode is reached',
  )
  await clickControl(
    page.getByRole('button', { name: 'More options' }),
    "spec 9.3: the reminder sits behind the form's one expander",
  )
}

async function save(page: Page): Promise<void> {
  await clickControl(
    page.getByRole('button', { name: 'Save', exact: true }),
    'spec 9.3: the form is committed by its Save control',
  )
  // The click returns as soon as it has been dispatched, so without this the
  // read below asks the server what it holds while the save is still being
  // written. The two are different HTTP clients: a spec's read goes out on
  // Playwright's own context and is not queued behind the page's in-flight
  // writes. This case passed on the timing of one machine and would have
  // failed against a client taking two serialised round trips here, which is
  // a false red against an implementation that satisfies the criterion.
  await waitForSaveToSettle(page)
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

    await openTheForm(page, title)
    const offered = await setOfferedReminder(page)
    await save(page)

    const stored = await storedReminder(page, created.id)
    expect(
      stored,
      'spec 9.3: the reminder is saved like every other field of this form, and frozen 7.9 ' +
        'gives the edit path a PUT for it. A null here is the form offering a field it ' +
        'discards, with nothing on the page saying so',
    ).not.toBeNull()
    if (stored === null) throw new Error('unreachable: asserted above')
    expect(
      stored.time_of_day?.slice(0, 5) ?? null,
      'spec 4.8: the stored reminder matches the form, in the mode the form offered',
    ).toBe(offered.value)

    // The reload clause. What the control shows now has come back from the
    // server, so a client that merely remembered the value cannot pass this
    // and pass the assertion above.
    await page.reload()
    await openTheForm(page, title)
    expect(
      await page.getByLabel(/^\s*reminder\s*$/i).inputValue(),
      'spec 9.3, and the criterion\'s own last clause: a reload shows what was stored rather ' +
        'than what was typed, which is the difference between a value that was written and a ' +
        'value that was held',
    ).toBe(offered.value)
  })

  test('AC-170: changing one stores the new value', async ({ page }) => {
    const title = caseTitle(BASE)
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
    })

    await openTheForm(page, title)
    const first = await setOfferedReminder(page)
    await save(page)
    const afterFirst = await storedReminder(page, created.id)
    expect(
      afterFirst?.time_of_day?.slice(0, 5) ?? null,
      'the first reminder is stored, which is the state the change below is measured from',
    ).toBe(first.value)

    await openTheForm(page, title)
    const second = await setOfferedReminder(page, first.value)
    expect(
      second.value,
      'the case changed the reminder to a different value, which is what makes this a change ' +
        'rather than a repeat',
    ).not.toBe(first.value)
    await save(page)

    const stored = await storedReminder(page, created.id)
    expect(
      stored?.time_of_day?.slice(0, 5) ?? null,
      'spec 7.9: the PUT upserts the single row, so a changed reminder replaces the stored one ' +
        'rather than adding beside it. A client that wrote only when none existed leaves the ' +
        'person looking at a form that disagrees with the notification they will get',
    ).toBe(second.value)
  })

  test('AC-170: clearing one leaves the task with none', async ({ page }) => {
    const title = caseTitle(BASE)
    const created = await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
    })

    await openTheForm(page, title)
    await setOfferedReminder(page)
    await save(page)
    expect(
      await storedReminder(page, created.id),
      'a reminder exists to be cleared, which is what makes the clear below discriminate',
    ).not.toBeNull()

    await openTheForm(page, title)
    await clearOfferedReminder(page)
    await save(page)

    expect(
      await storedReminder(page, created.id),
      'spec 7.9: the removal arm is DELETE /tasks/:id/reminder, because no task body expresses ' +
        'a removal. This is the case of the three that cannot share a path with the other two, ' +
        'and an implementation that sends an empty PUT instead satisfies the form while leaving ' +
        '8.6 a fire instant for a reminder the person deleted',
    ).toBeNull()

    // The reload clause again, on the arm where a stale form is most
    // misleading: the person cleared it, so the form must come back empty.
    await page.reload()
    await openTheForm(page, title)
    expect(
      await page.getByLabel(/^\s*reminder\s*$/i).inputValue(),
      'spec 9.3: a reload shows what was stored, and nothing was',
    ).toBe('')
  })
})

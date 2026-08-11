/*
AC-169: given a reminder set in the task form while a task is being created,
then the created task is stored carrying that reminder in the mode the form
offered, and a fresh read of the task reports it.

Numbered by the Integration Steward at P8's second change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130 and AC-133 to AC-140 precedent
for criteria numbered additively so nothing already written moves.

This one and AC-170 exist because of a defect the whole suite was green
over, and the shape of that green is the reason they are worth reading twice.
The client carries a mutation for every write of section 7 except frozen
7.9's, so a reminder set in the form lived in the form's state and was
discarded at save. Nothing was broken on either side of the seam: AC-092
asserts the form's state and says so in its own text, AC-146 to AC-150 assert
the endpoints, and no criterion read the two together. A field that is
offered and silently dropped is the worst kind of defect this suite can miss,
because the person is told nothing.

**The assertion is the stored row, read back through section 7.** What makes
this criterion discriminate is that it never reads the form again after the
save: it asks the server what it holds. A client that keeps the value in
memory, renders it back into the form on reopen and never writes it would
satisfy any assertion made against the form and fails here on the only
question that matters.

**The mode is asserted, not just the presence.** 9.3 switches the control
with due time, an offset picker with one and a time-of-day picker without,
and 4.8 stores those as two columns of which exactly one is non-null. So the
fixture is run twice, once in each mode, and each case asserts which column
the value landed in. A client that wrote every reminder as an offset would
pass a one-mode criterion and put every timeless reminder on the wrong
column.

**The value asserted is the value the form held**, read off the control after
setting it rather than fixed here, so this file states no offset the
specification does not. 10.3 bounds an offset at 0 to 10080 minutes and 9.3
calls the control preset-driven; which presets it offers is the implementer's,
and asserting one of them would be asserting a menu rather than a write.

Written before the implementation, which is this project's standing order and
was the P2, P3, P4, P5 and P6 order too. The red these produce is on the
stored reminder being null after a save that offered one; a red anywhere
earlier, on the control or on the save, would be a different sentence
failing and is worth reporting rather than repairing.

Spec: 9.3 (the reminder control, its two modes, and the ruling that it is
saved like every other field), frozen 7.6 (the create body's reminder arm),
frozen 7.0 (TaskDetail's reminder, both columns with exactly one non-null),
4.8, 8.6, 10.3.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  fillControl,
  findTaskId,
  floatingAddButton,
  formField,
  routes,
  seedDate,
  seedSubs,
  setOfferedReminder,
  signIn,
  storedReminder,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const BASE = 'ac-169 created with a reminder'

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-169: a reminder set while creating is saved', () => {
  test('AC-169: a time-of-day reminder survives the create', async ({ page }) => {
    const title = caseTitle(BASE)

    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults ' +
        'of 9.3',
    )
    await fillControl(
      formField(page, 'title'),
      title,
      'spec 9.3: title is always visible on the form',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: the reminder sits behind the form's one expander",
    )
    // A date and no time, which is what puts 9.3's control in its
    // time-of-day mode.
    await fillControl(
      formField(page, 'due date'),
      seedDate(3),
      'spec 9.3: the reminder is enabled only once a due date is set',
    )
    const offered = await setOfferedReminder(page)
    expect(
      offered.mode,
      'spec 9.3: a task with a date and no due time gets the time-of-day picker',
    ).toBe('time_of_day')

    await clickControl(
      page.getByRole('button', { name: 'Save', exact: true }),
      'spec 9.3: the form is committed by its Save control',
    )

    const stored = await storedReminder(page, await findTaskId(page, title))
    expect(
      stored,
      'spec 9.3: the reminder is saved like every other field of this form, and frozen 7.6 ' +
        "gives the create body an arm for it. A null here is the form offering a field it " +
        'discards, which is the defect this criterion exists for: the person sets a reminder, ' +
        'the task saves, and nothing anywhere says the reminder did not',
    ).not.toBeNull()
    if (stored === null) throw new Error('unreachable: asserted above')

    expect(
      stored.time_of_day?.slice(0, 5) ?? null,
      'spec 4.8 and 7.0: the time-of-day column carries what the form held',
    ).toBe(offered.value)
    expect(
      stored.offset_minutes,
      'spec 4.8: exactly one of the two columns is non-null, and this reminder was set in the ' +
        'mode that is not this one',
    ).toBeNull()
  })

  test('AC-169: an offset reminder survives the create in its own mode', async ({ page }) => {
    const title = caseTitle(BASE)

    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form',
    )
    await fillControl(
      formField(page, 'title'),
      title,
      'spec 9.3: title is always visible on the form',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: the reminder sits behind the form's one expander",
    )
    await fillControl(
      formField(page, 'due date'),
      seedDate(3),
      'spec 9.3: the reminder is enabled only once a due date is set',
    )
    // A due time, which is what switches 9.3's control to its offset mode.
    await fillControl(
      formField(page, 'due time'),
      '15:00',
      'spec 9.3: due time is enabled once a due date is set',
    )
    const offered = await setOfferedReminder(page)
    expect(
      offered.mode,
      'spec 9.3: the reminder control switches mode with due time, so a task carrying one gets ' +
        'the offset picker. Both modes are exercised because a client writing every reminder ' +
        'to one column passes a criterion that only ever sees the other',
    ).toBe('offset_minutes')

    await clickControl(
      page.getByRole('button', { name: 'Save', exact: true }),
      'spec 9.3: the form is committed by its Save control',
    )

    const stored = await storedReminder(page, await findTaskId(page, title))
    expect(
      stored,
      'spec 9.3 and frozen 7.6: the reminder arm of the create body carries what the form held',
    ).not.toBeNull()
    if (stored === null) throw new Error('unreachable: asserted above')

    expect(
      stored.offset_minutes,
      'spec 4.8: the offset column carries the offset the form was set to, which is read off ' +
        'the control rather than named here because which presets 9.3 offers is not this ' +
        "file's to fix",
    ).toBe(Number(offered.value))
    expect(
      stored.time_of_day,
      'spec 4.8: exactly one of the two columns is non-null',
    ).toBeNull()
  })

  test('AC-169: a task created with no reminder stores none', async ({ page }) => {
    // The control that keeps the two cases above honest. A client that wrote
    // a reminder unconditionally, from a default the form never showed,
    // satisfies both of them and puts a fire instant on every task a person
    // creates.
    const title = caseTitle(BASE)

    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form',
    )
    await fillControl(
      formField(page, 'title'),
      title,
      'spec 9.3: title is always visible on the form',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: the reminder sits behind the form's one expander",
    )
    await fillControl(
      formField(page, 'due date'),
      seedDate(3),
      'spec 9.3: a date is set so the reminder is enabled and deliberately left empty',
    )
    await clickControl(
      page.getByRole('button', { name: 'Save', exact: true }),
      'spec 9.3: the form is committed by its Save control',
    )

    expect(
      await storedReminder(page, await findTaskId(page, title)),
      'spec 4.8: a reminder row exists only when one was asked for. 8.6 computes a fire ' +
        'instant for every stored reminder, so a client writing one by default schedules a ' +
        'notification the person never requested',
    ).toBeNull()
  })
})

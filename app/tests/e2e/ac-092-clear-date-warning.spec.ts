/*
AC-092: given the form holds a rule and reminder, when the date is cleared,
then the warning copy shows and, on confirm, the three dependents are
disabled and empty.

"The form holds" rather than "the task holds", and the difference decides
what this file drives. 9.3's dependency graph is a property of the form as
it stands, not of a stored row: repeat and reminder become enabled the
instant due date receives a value and lose it the instant the value goes, in
the same render, before anything is saved. So the first case builds the
state inside one open form and never posts it, which is also what keeps this
criterion independent of frozen 7.9, whose endpoint arrives with P7.

Four cases, and the last two are where an implementation that satisfies the
criterion as written still fails.

**The warning is a gate, not a notice.** 9.3 says the three dependents are
disabled and cleared "after the 8.4 warning", so a warning the user declines
must leave the date, the repeat and the reminder exactly as they were. A
dialog that clears first and explains afterwards passes the criterion's own
sentence, since the copy did show and the fields did clear.

**The moment of enablement is named and is not "on save" or "on blur".**
9.3 fixes it at the instant due date receives a value, in the same render.
An implementation that enables the three dependents when the form is
submitted, or when the date field loses focus, renders a form in which the
repeat control is inoperable while a date sits in the field beside it.

**Edit mode pre-fills, which is a second path to the same state.** A task
created with a rule opens with that rule in the form (9.3's edit mode
differences), so clearing the date there must run the same warning. The
fixture is created by this spec rather than taken from the seed, because
confirming would clear a seed row's rule and every later spec would see it.

The reminder is set in the form and never saved, so nothing here calls
frozen 7.9. The rule is saved, through the 7.6 write arm P6 landed.

Spec: 9.3 (the dependency graph, the moment of enablement, the warning copy,
edit mode), 8.4 (the clear-date cascade the warning describes), 7.6, 10.3.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  chooseOption,
  clickControl,
  copy,
  createTask,
  fieldDisplay,
  fieldValue,
  fillControl,
  floatingAddButton,
  formField,
  routes,
  seedDate,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const DEPENDENTS = ['due time', 'reminder', 'repeat'] as const

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-092: clearing the date in the task form', () => {
  test('AC-092: the warning shows and confirming disables and empties the three dependents', async ({
    page,
  }) => {
    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )

    // 9.3 puts seven of the ten fields behind one expander, and names it.
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

    const dueDate = formField(page, 'due date')
    await fillControl(
      dueDate,
      seedDate(3),
      'spec 9.3: due date is always visible on the form',
    )

    // A preset, never a raw RRULE box (9.3). "Daily" is the first preset
    // that section enumerates.
    await chooseOption(page, formField(page, 'repeat'), 'Daily')
    // Without a due time the reminder control is a time-of-day picker (9.3),
    // which is what makes this reachable with no due time set.
    await fillControl(
      formField(page, 'reminder'),
      '09:00',
      'spec 9.3: the reminder is visible when expanded and enabled once a date is set',
    )

    await fillControl(
      dueDate,
      '',
      'spec 9.3: due date is always visible on the form',
    )

    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: clearing the date warns before it acts, and the copy of that warning is ' +
        'normative, being 8.4\'s cascade stated to the person about to run it',
    ).toBeVisible()

    // The confirming control of a warning has no name in section 9. Matched
    // by the two words a confirm is spelled with, and the silence is
    // escalated rather than closed with an invented string.
    await clickControl(
      page.getByRole('button', { name: /^(continue|clear|confirm|ok)$/i }),
      'spec 9.3: the 8.4 warning is confirmed before it acts, so it offers a control that proceeds',
    )

    for (const field of DEPENDENTS) {
      const control = formField(page, field)
      await expect(
        control,
        `spec 9.3: disabled means visible but inoperable, so ${field} is still on the form`,
      ).toBeVisible()
      await expect(
        control,
        `spec 9.3: ${field} is enabled only when due date is set, and the date has just gone`,
      ).toBeDisabled()
    }

    // Empty is asserted as "no longer holding what the form held", because
    // that is what 9.3's word means here and it is the only reading that
    // does not also specify how an emptied control spells itself. Due time
    // was never set, so for that one empty is literal.
    expect(
      await fieldValue(formField(page, 'due time')),
      'spec 9.3: the three dependents are empty on confirm, and this one was empty already',
    ).toBe('')
    expect(
      await fieldDisplay(formField(page, 'reminder')),
      'spec 9.3: on confirm the reminder is empty, and this control still offers the 09:00 ' +
        'the form was holding',
    ).not.toContain('09:00')
    expect(
      await fieldDisplay(formField(page, 'repeat')),
      'spec 9.3: on confirm the repeat is empty, and this control still offers the Daily ' +
        'preset the form was holding',
    ).not.toContain('Daily')

    await expect(
      page.getByText(copy.dateDependentHelper),
      'spec 9.3: the "On disable, helper" column gives all three dependents this copy, and ' +
        'a disabled control with no helper is 9.3\'s own definition of the wrong state',
    ).toBeVisible()
  })

  test('AC-092: declining the warning changes nothing', async ({ page }) => {
    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

    const dueDate = formField(page, 'due date')
    const chosen = seedDate(3)
    await fillControl(
      dueDate,
      chosen,
      'spec 9.3: due date is always visible on the form',
    )
    await chooseOption(page, formField(page, 'repeat'), 'Daily')

    await fillControl(
      dueDate,
      '',
      'spec 9.3: due date is always visible on the form',
    )
    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: the warning precedes the clearing, so it is on the page to be declined',
    ).toBeVisible()
    await clickControl(
      page.getByRole('button', { name: /^(cancel|keep|no)$/i }),
      'spec 9.3 and 9.4: a destructive confirm can be declined, so it offers a control that does not proceed',
    )

    expect(
      await fieldValue(dueDate),
      'spec 9.3 clears the three dependents after the warning, so a declined warning has ' +
        'cleared nothing, the date included. A dialog that acts first and explains second ' +
        'satisfies the criterion as written and fails here',
    ).toBe(chosen)
    await expect(
      formField(page, 'repeat'),
      'spec 9.3: repeat is enabled when due date is set, and the date was kept',
    ).toBeEnabled()
    expect(
      await fieldDisplay(formField(page, 'repeat')),
      'the declined warning left the repeat the form was holding',
    ).toContain('Daily')
  })

  test('AC-092: the three dependents enable in the render the date is set', async ({
    page,
  }) => {
    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

    for (const field of DEPENDENTS) {
      await expect(
        formField(page, field),
        `spec 9.3: ${field} is visible when expanded and enabled only when due date is set, ` +
          'and this form has no date yet',
      ).toBeDisabled()
    }

    await fillControl(
      formField(page, 'due date'),
      seedDate(1),
      'spec 9.3: due date is always visible on the form',
    )

    for (const field of DEPENDENTS) {
      // No blur, no submit, no reopen. 9.3 fixes the moment of enablement at
      // the instant the value arrives, in the same render, which is the
      // sentence an implementation enabling on blur or on save fails.
      await expect(
        formField(page, field),
        `spec 9.3, moment of enablement: ${field} is enabled the instant due date receives a ` +
          'value, in the same render, with the field still focused and nothing submitted',
      ).toBeEnabled()
    }
    await expect(
      page.getByText(copy.dateDependentHelper),
      'spec 9.3: the helper belongs to the disabled state, so it is gone once the three are ' +
        'enabled',
    ).toHaveCount(0)
  })

  test('AC-092: edit mode pre-fills a rule and clearing the date warns the same way', async ({
    page,
  }) => {
    // Created here rather than taken from the seed: confirming below clears
    // the rule, and the seed's one recurring task is read by other specs.
    const title = 'ac-092 recurring fixture'
    await createTask(page, {
      title,
      folder_id: seedIds.groceries,
      due_date: seedDate(4),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    })

    await page.goto(routes.planned)
    await clickControl(
      page.getByText(title),
      'spec 9.5: a click on any row opens the task, which is how edit mode is reached; the row ' +
        'is on Planned because 6 Q3 admits dated pending rows',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )

    const preFilled = await fieldDisplay(formField(page, 'repeat'))
    expect(
      preFilled,
      'spec 9.3, edit mode differences: fields are pre-filled, so a task carrying a rule ' +
        'opens with that rule showing in the repeat control',
    ).not.toBe('')

    await fillControl(
      formField(page, 'due date'),
      '',
      'spec 9.3: due date is always visible on the form',
    )
    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: the warning is a property of clearing the date, not of the create form, so ' +
        'the pre-filled edit path shows the same copy',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: /^(continue|clear|confirm|ok)$/i }),
      'spec 9.3: the 8.4 warning is confirmed before it acts, so it offers a control that proceeds',
    )
    for (const field of DEPENDENTS) {
      await expect(
        formField(page, field),
        `spec 9.3: ${field} is disabled once the date is gone, in edit mode as in create`,
      ).toBeDisabled()
    }
    expect(
      await fieldDisplay(formField(page, 'repeat')),
      'spec 8.4: the cascade ends the series, so the repeat the form was pre-filled with is ' +
        'gone rather than merely greyed',
    ).not.toBe(preFilled)
  })
})

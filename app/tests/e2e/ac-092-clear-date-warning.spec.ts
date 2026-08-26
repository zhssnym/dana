/*
AC-092: given the form holds a rule and reminder, when the date is cleared,
then the warning copy shows and, on confirm, the three dependents are
disabled and empty.

"The form holds" rather than "the task holds", and on the v1 surface that
difference decided what this file drove: 9.3's dependency graph was a
property of the form as it stood, not of a stored row, so the state was built
inside one open form and never posted.

**On the v2 surface that distinction is gone, and it is gone because the
section removed it rather than because this file gave it up.** 9.3's v2
opening is "every edit commits as it is made, there is no Save control and no
draft state", and 9.1's capture rule creates the row before the surface opens
("every capture creates the task with the entry defaults of 9.3 for where it
stands"). So there is no state that is the surface's and not the task's, and
what this file drives now is the same graph on a real row: the dependents
enable the instant the date arrives and lose it the instant it goes, and the
warning still gates the cascade rather than reporting it.

**The dependents are two, and the criterion above says three.** 9.3's v1
table made due time the third, disabled until a date existed; the v2 table
retires it as a field entirely, the due row reading "a day; the pickers offer
no time of day (a stored due_time from v1 is displayed and clearable, never
settable)". A field nobody can set has no enabled state to assert, so what
is left date-dependent is reminder and repeat, which the v2 table gives the
same "requires a due date" and the same helper. **The Replace that brings the
criterion's own count in step is recommended in RFC 0005 change control item
20 and is the owner's, not this session's**, on the item 14 precedent that a
criterion's sentence is ruled rather than taken; this file asserts what 9.3
now says and names the gap rather than hiding it.

Four cases, and the last two are where an implementation that satisfies the
criterion as written still fails.

**The warning is a gate, not a notice.** 9.3 keeps 8.4's sentence verbatim
and keeps it before the cascade, so a warning the person declines must leave
the date, the repeat and the reminder exactly as they were. A dialog that
clears first and explains afterwards passes the criterion's own sentence,
since the copy did show and the fields did clear.

**The moment of enablement is named and is not "on save" or "on blur".**
There is no save to enable on, so the v1 hazard has narrowed rather than
vanished: what remains available to an implementation is enabling on the
commit's response rather than on the value, which renders a strip whose
reminder chip is inoperable for a round trip after the date beside it was
answered. The third case presses the reminder chip in the same breath as the
date and never waits for the wire.

**Edit mode pre-fills, which is a second path to the same state.** A task
created with a rule opens with that rule on its repeat chip, so clearing the
date there must run the same warning. The fixture is created by this spec
rather than taken from the seed, because confirming would clear a seed row's
rule and every later spec would see it.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and onto 9.3's v2
card at S15 (items 15, 19 and 25).** The 2026-08-24 rework moved where the
form was opened from; this one removes the form. The capture point is still
Important, and still for its own reason: of the three pages 9.1 leaves the
floating button on, Important is the one whose entry defaults leave the task
undated, which is the state the third case is expressly about.

Spec: 9.3 (the v2 field rules, the two date-dependent rows and their helper,
the clear-date warning kept verbatim, the commit-as-it-is-made rule), 9.1
(the v2 capture rule, the v2 routes table, and the confirmation's two
controls), 8.4 (the clear-date cascade the warning describes), 7.6, 10.3.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  chipChoices,
  chipPicker,
  chipValue,
  clickControl,
  closeChipPicker,
  copy,
  createTask,
  fillControl,
  floatingAddButton,
  formField,
  openChipPicker,
  routesV2,
  seedDate,
  seedIds,
  seedSubs,
  setReminderTime,
  signIn,
  taskChip,
  taskSurface,
  watchCommit,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * The fields 9.3's v2 table makes conditional on a due date, in that table's
 * own words: "requires a due date... disabled helper 'Set a due date first'".
 * Two rather than v1's three, for the reason this file's header records.
 */
const DEPENDENTS = ['reminder', 'repeat'] as const

/*
The repeat preset is chosen through `chipChoices` rather than by naming a role.

9.1's addressing sentence fixes how a control is identified and says nothing
about how it is built, which is deliberate: section 9 specifies structure,
states and copy, not widgets. 9.3's repeat row is "preset-driven exactly as
v1... never a raw RRULE box" and spells no widget, and the field carries real
operands behind the preset, the chosen days, the interval and the "Ends on"
date, which a menu is the wrong container for and a picker is not. So the
choice is read across both roles a list of choices can carry, the way
`chooseOption` has always dispatched, and this file states a preset's name
rather than a widget. Corrected before the implementing half ran, on the item
17 precedent: the locator moves, the criterion's sentence does not, and an
acceptance test that names a widget is a test the next design decision breaks
for no reason of the specification's.
*/

/**
 * Captures a task from Important, names it, and waits for the name to land.
 *
 * 9.1's capture rule and 9.3's entry table working together: the capture
 * creates, and Important's row of that table leaves the task undated, which
 * is the state the third case below is about.
 *
 * **The name is committed here rather than left for the first chip to carry,
 * and the wait is what the cases after it depend on.** A surface where every
 * edit commits as it is made reaches the server on whichever edit first makes
 * the task nameable, and a case that answered a chip in the same breath would
 * be driving a surface that is reconciling with a row it has just learned the
 * identity of. Sequencing the name first is what a person does anyway, and it
 * leaves each case below reading one thing at a time.
 */
async function captureFromImportant(page: Page, title: string): Promise<void> {
  await page.goto(routesV2.important)
  await clickControl(
    floatingAddButton(page),
    'spec 9.1: the floating add button is a capture point and "every capture creates the task ' +
      'with the entry defaults of 9.3 for where it stands". Important is one of the three ' +
      'pages that section leaves the button on, and the one of the three whose entry defaults ' +
      'leave the task undated, which is the state the third case below is about',
  )
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the captured task opens on its surface, a dialog when opened " +
      'as one',
  ).toBeVisible()
  const commit = watchCommit(page)
  await fillControl(
    formField(page, 'title'),
    title,
    'spec 9.3: the title is editable in place on the card and is what the task is called',
  )
  await formField(page, 'title').blur()
  await commit.settled(
    'spec 9.3: the name commits as it is made, so the task exists before any chip is answered ' +
      'and each case below reads one thing at a time',
  )
}

/**
 * Answers the due chip, through the picker 9.3 opens in place.
 *
 * The Tomorrow preset rather than a cell of the grid, and that is a choice
 * about what these four cases are for rather than a shortcut. 9.3 says the
 * pickers "open on the answer, not the instrument: resolved presets first, a
 * calendar or list behind them", so a preset is the field's own front door;
 * AC-219 is the criterion that reads what the grid does and does not offer,
 * and none of the cases below turns on which day was chosen. Picking a
 * numbered cell would additionally have to say which month's cell it meant,
 * a six-week grid carrying two days for most numbers.
 */
async function setDue(page: Page): Promise<void> {
  await openChipPicker(
    page,
    'due date',
    'spec 9.3: the due date is a chip on the header strip, opening its picker in place',
  )
  await clickControl(
    chipPicker(page).getByRole('button', { name: 'Tomorrow', exact: true }),
    'spec 9.3: the due picker offers resolved presets first, and a day is the value the field ' +
      'takes',
  )
  await expect(
    chipPicker(page),
    'the picker closes once the day is answered, which is what "opens on the answer" means',
  ).toHaveCount(0)
}

/** Empties the due chip through the picker's own clear, which runs 8.4. */
async function clearDue(page: Page): Promise<void> {
  await openChipPicker(
    page,
    'due date',
    'spec 9.3: the due date is emptied from the same picker that sets it, there being no other ' +
      'control for the field on this surface',
  )
  await clickControl(
    page.getByRole('button', { name: /^\s*clear\s*$/i }),
    'spec 9.3 and 8.4: a dated task offers a way to become undated, and that is the act the ' +
      'warning below gates',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-092: clearing the date on the task surface', () => {
  test('AC-092: the warning shows and confirming disables and empties the dependents', async ({
    page,
  }) => {
    await captureFromImportant(page, 'ac-092 cleared after warning')
    await setDue(page)

    // A preset, never a raw RRULE box (9.3's v2 repeat row keeps that word
    // for word). "Daily" is the first preset that row enumerates.
    await openChipPicker(
      page,
      'repeat',
      'spec 9.3: repeat is a chip and is enabled once a due date is set',
    )
    await clickControl(
      chipChoices(page).filter({ hasText: 'Daily' }).first(),
      'spec 9.3: the repeat control is "preset-driven exactly as v1... never a raw RRULE box", ' +
        'and Daily is the first preset that row names',
    )
    // The repeat picker stays open on purpose, its operands living behind the
    // preset, so this case closes it before reaching for the next chip.
    await closeChipPicker(page)
    await setReminderTime(page)

    await clearDue(page)

    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: "Clearing the date keeps 8.4\'s warning verbatim", and that copy is normative, ' +
        "being 8.4's cascade stated to the person about to run it",
    ).toBeVisible()

    // 9.1's control table names both controls of every confirmation, and
    // names them uniformly: "Continue" and "Cancel", the destructive verb
    // being already in the message the person is reading.
    await clickControl(
      page.getByRole('button', { name: 'Continue', exact: true }),
      'spec 9.3: the 8.4 warning is confirmed before it acts, so it offers a control that ' +
        'proceeds',
    )

    for (const field of DEPENDENTS) {
      const chip = taskChip(page, field)
      await expect(
        chip,
        `spec 9.3: disabled means visible but inoperable, so ${field} is still on the strip`,
      ).toBeVisible()
      await expect(
        chip,
        `spec 9.3: ${field} requires a due date, and the date has just gone`,
      ).toBeDisabled()
    }

    // Empty is asserted as "no longer holding what the surface held", because
    // that is what 9.3's cascade means here and it is the only reading that
    // does not also specify how an emptied chip spells itself.
    expect(
      await chipValue(taskChip(page, 'reminder'), 'reminder'),
      'spec 8.4: the cascade removes the reminder, and this chip was reading the 09:00 the ' +
        'surface had committed',
    ).not.toContain('09:00')
    expect(
      await chipValue(taskChip(page, 'repeat'), 'repeat'),
      'spec 8.4: the cascade ends the repeat, and this chip was reading the Daily preset',
    ).not.toContain('Daily')

    await expect(
      page.getByText(copy.dateDependentHelper),
      'spec 9.3: the v2 table gives both date-dependent rows the helper "Set a due date first", ' +
        'and a disabled control with no helper is what that column exists to forbid',
    ).toBeVisible()
  })

  test('AC-092: declining the warning changes nothing', async ({ page }) => {
    await captureFromImportant(page, 'ac-092 warning declined')
    await setDue(page)
    const dated = await chipValue(taskChip(page, 'due date'), 'due date')
    expect(
      dated,
      'the due chip reads the day it was answered with, which is the state the decline below ' +
        'has to leave untouched',
    ).not.toBe('')

    await openChipPicker(
      page,
      'repeat',
      'spec 9.3: repeat is a chip and is enabled once a due date is set',
    )
    await clickControl(
      chipChoices(page).filter({ hasText: 'Daily' }).first(),
      'spec 9.3: the repeat control is preset-driven',
    )
    await closeChipPicker(page)

    await clearDue(page)
    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: the warning precedes the clearing, so it is on the page to be declined',
    ).toBeVisible()
    await clickControl(
      page.getByRole('button', { name: 'Cancel', exact: true }),
      'spec 9.1: a confirmation carries "Continue" and "Cancel", so a destructive act can be ' +
        'declined',
    )

    expect(
      await chipValue(taskChip(page, 'due date'), 'due date'),
      'spec 9.3 clears the dependents after the warning, so a declined warning has cleared ' +
        'nothing, the date included. A dialog that acts first and explains second satisfies ' +
        'the criterion as written and fails here',
    ).toBe(dated)
    await expect(
      taskChip(page, 'repeat'),
      'spec 9.3: repeat is enabled while a due date is set, and the date was kept',
    ).toBeEnabled()
    expect(
      await chipValue(taskChip(page, 'repeat'), 'repeat'),
      'the declined warning left the repeat the surface was holding',
    ).toContain('Daily')
  })

  test('AC-092: the dependents enable in the render the date is set', async ({ page }) => {
    await captureFromImportant(page, 'ac-092 enablement is immediate')

    for (const field of DEPENDENTS) {
      await expect(
        taskChip(page, field),
        `spec 9.3: ${field} requires a due date, and this task was captured from Important, ` +
          'whose row of the entry table leaves it undated',
      ).toBeDisabled()
    }
    await expect(
      page.getByText(copy.dateDependentHelper),
      'spec 9.3: the helper belongs to the disabled state, so it is on the surface while the ' +
        'two are disabled',
    ).toBeVisible()

    await setDue(page)

    for (const field of DEPENDENTS) {
      // Nothing is waited on between the date and this. 9.3 fixes enablement
      // on the value rather than on the write, and an implementation that
      // enables when the commit answers leaves the strip inoperable for a
      // round trip after the person has already answered the date.
      await expect(
        taskChip(page, field),
        `spec 9.3: ${field} is enabled by the due date having a value, and nothing here has ` +
          'waited for the commit that value caused. A strip that enables on the response ' +
          'renders a chip a person cannot press while the answer sits beside it',
      ).toBeEnabled()
    }
    await expect(
      page.getByText(copy.dateDependentHelper),
      'spec 9.3: the helper belongs to the disabled state, so it is gone once the two are ' +
        'enabled',
    ).toHaveCount(0)
  })

  test('AC-092: an existing rule pre-fills and clearing the date warns the same way', async ({
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

    await page.goto(routesV2.scheduled)
    await clickControl(
      page.getByText(title),
      'spec 9.4: a click on any row opens that task; the row is on Scheduled because 6 Q3 ' +
        'admits dated pending rows',
    )
    await expect(taskSurface(page), "spec 9.1's roles table: the task opens as a dialog").toBeVisible()

    const preFilled = await chipValue(taskChip(page, 'repeat'), 'repeat')
    expect(
      preFilled,
      "spec 9.3: the strip reads the task's own values, so a task carrying a rule opens with " +
        'that rule showing on its repeat chip',
    ).not.toBe('')

    await clearDue(page)
    await expect(
      page.getByText(copy.clearDateWarning),
      'spec 9.3: the warning is a property of clearing the date rather than of any one way in, ' +
        'so a task that already carried a rule shows the same copy',
    ).toBeVisible()

    await clickControl(
      page.getByRole('button', { name: 'Continue', exact: true }),
      'spec 9.3: the 8.4 warning is confirmed before it acts, so it offers a control that ' +
        'proceeds',
    )
    for (const field of DEPENDENTS) {
      await expect(
        taskChip(page, field),
        `spec 9.3: ${field} is disabled once the date is gone, on a task that had one as on a ` +
          'task that never did',
      ).toBeDisabled()
    }
    expect(
      await chipValue(taskChip(page, 'repeat'), 'repeat'),
      'spec 8.4: the cascade ends the series, so the repeat the chip was reading is gone rather ' +
        'than merely greyed',
    ).not.toBe(preFilled)
  })
})

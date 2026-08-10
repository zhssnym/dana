/*
AC-161 (proposed): given the task form, then an empty title shows "Give it a
title", an over-limit field shows "Too long: limit N characters", and the
steps editor shows its cap notice at fifty and appends no more rows.

**The number is provisional**, authored on this branch with its test for the
mid-package change control, from AC-154 onward because P7 is concurrently
proposing AC-144 to AC-153 and merges first. See `ac-154-quick-add-row.spec.ts`.

9.3's validation paragraph is three rules and section 12 covers none of them.
The server halves are green: AC-043 refuses a fifty-first step, 10.3's limits
answer 422 with the field named, and 7.11 files all of this under client
convenience with no authority. That is exactly why the copy needs a number.
A convenience with no authority is a convenience nobody is measuring, and the
person meeting it is the person who cannot save what they typed.

**The over-limit case names the limit.** "Too long: limit N characters" is
the copy, and N is 300 for a title by 10.3, so a form that says only "Too
long" has left the person to find out how much of it to delete by deleting.

**The step cap is asserted as a notice and as a refusal.** 9.3 puts a cap
notice at fifty in the steps editor, and 10.3 makes fifty the limit; a
notice with a working append control below it is a label, and an append
control that silently does nothing is the same defect with no words on it.
Forty-nine steps is the control, so neither assertion can pass by being
permanently true.

One copy silence is recorded rather than closed: 9.3 requires the cap notice
and spells no string for it, so what is asserted is that a notice naming the
cap is present. Escalated to the Integration Steward with the two others
this leg found.

Spec: 9.3 (the validation copy and the steps editor), 10.3 (the limits the
copy reports), 7.11 (why a client-side rule still needs measuring), 7.6.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
  createTask,
  csrfToken,
  fillControl,
  floatingAddButton,
  formField,
  routes,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/** 10.3: task title and step title are 1 to 300 characters. */
const TITLE_LIMIT = 300
/** 10.3: steps per task. */
const STEP_CAP = 50

function steps(count: number, tag: string): string[] {
  return Array.from({ length: count }, (_, index) => `${tag} step ${index + 1}`)
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-161 (proposed): the form says why it will not save', () => {
  test('AC-161: an empty title shows the copy of 9.3', async ({ page }) => {
    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )

    await clickControl(
      page.getByRole('button', { name: /^(save|add|create|done)$/i }),
      'spec 9.3: the form is committed by a control, which is what its validation copy answers',
    )

    await expect(
      page.getByText(copy.titleRequired),
      'spec 9.3 validation copy: empty title, "Give it a title". 7.6 makes the title required ' +
        'and 10.3 makes it one character at the least, so the form is refusing on the ' +
        'server\'s own rule and the copy is what says which field',
    ).toBeVisible()
    await expect(
      formField(page, 'title'),
      'the form is still open on the field that has to change, which is what a validation ' +
        'message is for',
    ).toBeVisible()
  })

  test('AC-161: an over-limit title names the limit', async ({ page }) => {
    await page.goto(routes.tasks)
    await clickControl(
      floatingAddButton(page),
      'spec 9.1: the floating add button opens the task form with the entry-point defaults '
        + 'of 9.3, and it is on every page except Done',
    )

    await fillControl(
      formField(page, 'title'),
      'x'.repeat(TITLE_LIMIT + 1),
      'spec 9.3: title is always visible on the form',
    )
    await clickControl(
      page.getByRole('button', { name: /^(save|add|create|done)$/i }),
      'spec 9.3: the form is committed by a control, which is what its validation copy answers',
    )

    await expect(
      page.getByText(`Too long: limit ${TITLE_LIMIT} characters`),
      `spec 9.3: over-limit fields show "Too long: limit N characters", and 10.3 makes N ` +
        `${TITLE_LIMIT} for a task title. A form saying only "Too long" leaves the person to ` +
        'find out how much to delete by deleting',
    ).toBeVisible()
  })

  test('AC-161: the steps editor notices the cap at fifty and stops appending', async ({
    page,
  }) => {
    const full = await createTask(page, {
      title: 'ac-161 task at the step cap',
      folder_id: seedIds.groceries,
    })
    const nearly = await createTask(page, {
      title: 'ac-161 task below the step cap',
      folder_id: seedIds.groceries,
    })

    // Through 7.7 rather than through fifty keystrokes: the cap is what this
    // case is about, not the editor's typing.
    const token = await csrfToken(page.context())
    for (const [id, count, tag] of [
      [full.id, STEP_CAP, 'full'],
      [nearly.id, STEP_CAP - 1, 'nearly'],
    ] as const) {
      for (const title of steps(count, tag)) {
        const response = await page.request.post(`/api/v1/tasks/${id}/steps`, {
          data: { title },
          headers: { 'X-CSRF-Token': token },
        })
        expect(
          response.status(),
          `POST /tasks/${id}/steps answered ${response.status()}: ${await response.text()}`,
        ).toBe(201)
      }
    }

    await page.goto(routes.tasks)
    await clickControl(
      page.getByText('ac-161 task below the step cap'),
      'spec 9.5: a click on any row opens the task, which is how its steps editor is reached',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )
    await expect(
      page.getByText(new RegExp(`\\b${STEP_CAP}\\b`)),
      `spec 9.3: the cap notice is at fifty, so a task holding ${STEP_CAP - 1} steps does not ` +
        'carry it. Without this case the assertion below passes against a notice that is ' +
        'always on screen',
    ).toHaveCount(0)

    await page.goto(routes.tasks)
    await clickControl(
      page.getByText('ac-161 task at the step cap'),
      'spec 9.5: a click on any row opens the task, which is how its steps editor is reached',
    )
    await clickControl(
      page.getByRole('button', { name: 'More options' }),
      "spec 9.3: seven of the form's ten fields sit behind one expander, and the section "
        + 'names it "More options"',
    )
    await expect(
      page.getByText(new RegExp(`\\b${STEP_CAP}\\b`)),
      'spec 9.3: the steps editor shows a cap notice at fifty. The section requires the ' +
        'notice and spells no string for it, so what is asserted is that a notice naming the ' +
        'cap is there; the copy is escalated to the Steward',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /^(add step|new step|add a step)$/i }),
      'spec 10.3 and AC-043: a fifty-first step answers 422, so an editor that still offers ' +
        'to append one is offering something the server refuses. 7.11 files this under client ' +
        'convenience, which is why it needs measuring rather than why it does not',
    ).toHaveCount(0)
  })
})

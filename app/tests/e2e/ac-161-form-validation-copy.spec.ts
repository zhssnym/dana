/*
AC-161: given 9.3's task surface, then an empty title shows "Give it a
title", an over-limit field shows "Too long: limit N characters", and the
steps editor shows its cap notice at fifty and appends no more rows.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

9.3's validation paragraph is three rules and section 12 covers none of them.
The server halves are green: AC-043 refuses a fifty-first step, 10.3's limits
answer 422 with the field named, and 7.11 files all of this under client
convenience with no authority. That is exactly why the copy needs a number.
A convenience with no authority is a convenience nobody is measuring, and the
person meeting it is the person who cannot save what they typed.

**The over-limit case names the limit.** "Too long: limit N characters" is
the copy, and N is 300 for a title by 10.3, so a surface that says only "Too
long" has left the person to find out how much of it to delete by deleting.

**The step cap is asserted as a notice and as a refusal.** 9.3 puts a cap
notice at fifty in the steps editor, and 10.3 makes fifty the limit; a
notice with a working append control below it is a label, and an append
control that silently does nothing is the same defect with no words on it.
Forty-nine steps is the control, so neither assertion can pass by being
permanently true.

The cap notice's copy was a silence when this file was written, so both cases
below asked only for a notice mentioning fifty. 9.3 spells it as of the P8
change control on 2026-08-11, "Limit 50 steps", and they ask for the string
now; 9.3's v2 steps row carries the same words. The criterion's text does not
move for that: it said the editor shows its cap notice, and what changed is
that the specification says what the notice says.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and onto 9.3's v2
card at S15 (items 15 and 19).** The first rework moved where the form was
opened from. This one removes the control the first two cases pressed, and
that is the whole of what changed here: 9.3's v2 opening is "every edit
commits as it is made, there is no Save control and no draft state", so a
refusal is no longer something a Save control answers. **What refuses is the
commit itself**, and 9.3's v2 title row says so in as many words: "1 to 300;
empty commits are refused with 'Give it a title'". The two cases therefore
finish the edit the way a person finishes an edit in place, by leaving the
field, and read what the surface says about it. The criterion's own sentence
was amended from "the task form" to "9.3's task surface", which section 12
records; nothing it asserts moved.

**Leaving the field is the commit, and this file states that rather than
assuming it.** 9.3 fixes that an edit commits and fixes no gesture, so what a
case may drive is the ordinary one: a text field being edited in place is
finished by going elsewhere. An implementation that commits on every
keystroke satisfies these cases too, the blur being a no-op after the write;
one that commits only on a control that no longer exists fails them, which is
the point.

Spec: 9.3 (the v2 title row and its refusal, the validation copy paragraph,
the steps block and its cap notice, the commit-as-it-is-made rule), 9.1 (the
v2 capture rule and the v2 routes table), 10.3 (the limits the copy reports),
7.11 (why a client-side rule still needs measuring), 7.6.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  clickControl,
  copy,
  createTask,
  csrfToken,
  fillControl,
  floatingAddButton,
  formField,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskSurface,
  TEST_TIMEOUT_MS,
  openTaskRow,
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

/**
 * Captures a task from Today and waits for its surface.
 *
 * 9.1: "every capture creates the task with the entry defaults of 9.3 for
 * where it stands", and Today is one of the three pages that section leaves
 * the floating button on.
 */
async function captureFromToday(page: Page): Promise<void> {
  await page.goto(routesV2.today)
  await clickControl(
    floatingAddButton(page),
    'spec 9.1: the floating add button is a capture point, and Today is one of the three ' +
      'pages that section leaves it on',
  )
  await expect(
    taskSurface(page),
    "spec 9.1's v2 roles table: the captured task opens on its surface, a dialog when opened " +
      'as one',
  ).toBeVisible()
}

/**
 * Finishes the title edit the way a person finishes one, by leaving the
 * field, which is what 9.3's "empty commits are refused" has to be measured
 * against on a surface with no commit control.
 */
async function leaveTheTitle(page: Page): Promise<void> {
  await formField(page, 'title').blur()
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-161: the task surface says why it will not commit', () => {
  test('AC-161: an empty title shows the copy of 9.3', async ({ page }) => {
    await captureFromToday(page)

    await fillControl(
      formField(page, 'title'),
      '',
      'spec 9.3: the title is editable in place on the card, so it is a field a person can ' +
        'empty',
    )
    await leaveTheTitle(page)

    await expect(
      page.getByText(copy.titleRequired),
      "spec 9.3's v2 title row: \"1 to 300; empty commits are refused with 'Give it a title'\". " +
        '7.6 makes the title required and 10.3 makes it one character at the least, so the ' +
        "surface is refusing on the server's own rule and the copy is what says which field",
    ).toBeVisible()
    await expect(
      formField(page, 'title'),
      'the surface is still on the field that has to change, which is what a validation ' +
        'message is for',
    ).toBeVisible()
  })

  test('AC-161: an over-limit title names the limit', async ({ page }) => {
    await captureFromToday(page)

    await fillControl(
      formField(page, 'title'),
      'x'.repeat(TITLE_LIMIT + 1),
      'spec 9.3: the title is editable in place on the card',
    )
    await leaveTheTitle(page)

    await expect(
      page.getByText(`Too long: limit ${TITLE_LIMIT} characters`),
      `spec 9.3: over-limit fields show "Too long: limit N characters", and 10.3 makes N ` +
        `${TITLE_LIMIT} for a task title. A surface saying only "Too long" leaves the person ` +
        'to find out how much to delete by deleting',
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

    await page.goto(routesV2.anytime)
    await openTaskRow(
      page,
      'ac-161 task below the step cap',
      'spec 9.4: a click on any row opens that task, which is how its steps block is reached',
    )
    await expect(
      taskSurface(page),
      "spec 9.3: the card holds \"Steps, Notes, and Attachments as blocks\", so the editor is " +
        'on the surface with nothing to expand',
    ).toBeVisible()
    await expect(
      page.getByText(copy.stepCapNotice),
      `spec 9.3: the cap notice is at fifty, so a task holding ${STEP_CAP - 1} steps does not ` +
        'carry it. Without this case the assertion below passes against a notice that is ' +
        'always on screen',
    ).toHaveCount(0)

    await page.goto(routesV2.anytime)
    await openTaskRow(
      page,
      'ac-161 task at the step cap',
      'spec 9.4: a click on any row opens that task, which is how its steps block is reached',
    )
    await expect(
      page.getByText(copy.stepCapNotice),
      'spec 9.3: the steps editor shows a cap notice at fifty, and both the v1 and the v2 ' +
        'sections spell it "Limit 50 steps". Asserted as the string rather than as a number ' +
        'somewhere on the page, which a step titled "50" would also have satisfied',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add step', exact: true }),
      'spec 10.3 and AC-043: a fifty-first step answers 422, so an editor that still offers ' +
        'to append one is offering something the server refuses. 7.11 files this under client ' +
        'convenience, which is why it needs measuring rather than why it does not',
    ).toHaveCount(0)
  })
})

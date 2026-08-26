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

**This criterion's premise is falsified by 9.3's v2 replacement, and this
file is written to say so rather than to work around it.** The sentence above
turns on there being a moment "while a task is being created" at which a
reminder can be offered and then discarded, and on the v1 surface there was
one: the form held a draft and posted it, so the reminder rode the arm of
frozen 7.6's create body. 9.3's v2 opening removes the draft ("every edit
commits as it is made, there is no Save control and no draft state") and
9.1's capture rule removes the moment ("every capture creates the task with
the entry defaults of 9.3 for where it stands"). The parity target agrees to
the letter: `prototype-v2`'s full-form affordance is `createTaskAndOpen`,
which creates the row and then opens it. **So a v2 client never sends a
reminder on a create**, the row already existing by the time any chip can be
answered, and the client-side half of this pair's split has closed.

**What that costs and what it does not.** Both endpoints stay frozen and stay
measured server-side: AC-149 reads the create body's reminder arm, AC-146 and
AC-148 read frozen 7.9's PUT and DELETE. What is no longer separately
measured is a client path that no longer exists. What is still worth a number
of its own, and is what this file now asserts, is the same defect one step
later: a person captures a task, answers its reminder on the card that opens,
and the value is dropped. That is AC-170's mechanism reached from the capture
path rather than from a row somebody opened later, and it is the arm a client
is most likely to get wrong, because a freshly created row is the one whose
identity the surface has only just learned.

**The Replace this asks for is recommended and not taken.** RFC 0005 change
control item 25 carries it, and the owner rules it on the item 14 precedent.
Until then this file asserts what the v2 surface can be held to and names,
here, exactly what the criterion's own words no longer discriminate.

**The mode is asserted, and there is now one.** 9.3's v1 switched the control
with due time, an offset picker with one and a time-of-day picker without,
and 4.8 stores those as two columns of which exactly one is non-null. The v2
table writes one rule, "one picker, a time on that day, writing 4.8's
time_of_day mode", and refuses the due picker a clock at all. So the fixture
runs once rather than twice, and the assertion that used to say "in whichever
mode was offered" now says "in the mode the section leaves". The other column
is asserted null for the reason it always was: a client writing every
reminder as an offset would pass every assertion made against the strip.

**The barrier is the commit, not a save.** `watchCommit` counts the requests
the page has started and will not return until this edit's own write has gone
out and been answered; API quiet alone would return in the window between the
press and the request the press causes, and the read after it would report a
row that had not been written. That is the exact shape of the defect this
criterion exists to catch, which is why the barrier is positive.

**The assertion is the stored row, read back through section 7.** What makes
this criterion discriminate is that it never reads the surface again after
the commit: it asks the server what it holds. A client that keeps the value
in memory, renders it back into the strip and never writes it would satisfy
any assertion made against the surface and fails here on the only question
that matters.

Spec: 9.3 (the v2 reminder row and the commit-as-it-is-made rule), 9.1 (the
v2 capture rule and the v2 routes table), frozen 7.6 (the create body's
reminder arm, now reached by no client path), frozen 7.9 (the PUT this path
uses), frozen 7.0 (TaskDetail's reminder, both columns with exactly one
non-null), 4.8, 8.6, 10.3.
*/
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  chipPicker,
  clickControl,
  fillControl,
  floatingAddButton,
  formField,
  findTaskId,
  openChipPicker,
  routesV2,
  seedSubs,
  setReminderTime,
  signIn,
  storedReminder,
  taskSurface,
  watchCommit,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

const BASE = 'ac-169 captured with a reminder'

/**
 * Captures a task from Today, names it, and leaves its surface open.
 *
 * Today rather than one of the other two capture points because its row of
 * 9.3's entry table dates the task ("folder Desk, a Today entry (membership),
 * dated today"), and the reminder requires a due date. That is the same
 * choice the v1 file made for the opposite reason: it opened here and then
 * set its own date, because the control it needed was behind an expander.
 */
async function captureNamed(page: Page, title: string): Promise<void> {
  await page.goto(routesV2.today)
  await clickControl(
    floatingAddButton(page),
    'spec 9.1: the floating add button is a capture point and "every capture creates the task ' +
      'with the entry defaults of 9.3 for where it stands"',
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
    'the title is committed before the task is looked for by it, an edit committing as it is ' +
      'made',
  )
}

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-169: a reminder set on a captured task is saved', () => {
  test('AC-169: a reminder answered on the captured card survives', async ({ page }) => {
    const title = caseTitle(BASE)
    await captureNamed(page, title)

    const commit = watchCommit(page)
    const offered = await setReminderTime(page)
    await commit.settled(
      'spec 9.3: a chip commits as it is answered, so the reminder is on the wire before this ' +
        'case asks the server what it holds',
    )

    const stored = await storedReminder(page, await findTaskId(page, title))
    expect(
      stored,
      'spec 9.3: the reminder is committed like every other field of this surface. A null here ' +
        'is the surface offering a field it discards, which is the defect this criterion ' +
        'exists for: the person sets a reminder, the task is there, and nothing anywhere says ' +
        'the reminder is not',
    ).not.toBeNull()
    if (stored === null) throw new Error('unreachable: asserted above')

    expect(
      stored.time_of_day?.slice(0, 5) ?? null,
      "spec 4.8 and 9.3's v2 reminder row: the time-of-day column carries what the picker held",
    ).toBe(offered)
    expect(
      stored.offset_minutes,
      'spec 4.8: exactly one of the two columns is non-null, and 9.3 v2 writes the other one',
    ).toBeNull()
  })

  test('AC-169: the reminder requires the date the capture point gave it', async ({ page }) => {
    // The discriminating half of the v2 reminder row, which v1 spread over
    // AC-092's dependency graph and this file's two modes. Today's entry
    // default dates the task, so the chip is operable; the criterion's own
    // subject is that a reminder answered here reaches the server, and this
    // asserts that it was answerable at all rather than assuming it.
    const title = caseTitle(BASE)
    await captureNamed(page, title)

    await openChipPicker(
      page,
      'reminder',
      'spec 9.3: the reminder requires a due date, and Today\'s row of the entry table gives ' +
        'the captured task one, so the chip opens rather than refusing',
    )
    await expect(
      chipPicker(page).getByLabel(/^\s*reminder time\s*$/i),
      'spec 9.3: the reminder picker is "one picker, a time on that day", so what it offers is ' +
        'a clock time. A picker offering an offset is the v1 control surviving its own row',
    ).toBeVisible()
  })

  test('AC-169: a captured task nobody gave a reminder stores none', async ({ page }) => {
    // The control that keeps the cases above honest. A client that wrote a
    // reminder unconditionally, from a default the surface never showed,
    // satisfies both of them and puts a fire instant on every task a person
    // captures.
    const title = caseTitle(BASE)
    await captureNamed(page, title)

    expect(
      await storedReminder(page, await findTaskId(page, title)),
      'spec 4.8: a reminder row exists only when one was asked for. 8.6 computes a fire ' +
        'instant for every stored reminder, so a client writing one by default schedules a ' +
        'notification the person never requested',
    ).toBeNull()
  })
})

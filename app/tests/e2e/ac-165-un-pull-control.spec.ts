/*
AC-165: given a My Day row whose inclusion came from an entry,
then it carries "Remove from My Day"; given one that also qualifies
automatically, then it does not, and using the control removes the row at
once.

Numbered by the Integration Steward at P8's mid-package change control on
2026-08-11, so the sentence above is section 12's own text now; it is
transcribed unchanged, the AC-125 to AC-130, AC-133 to AC-140 and AC-142
precedent for a batch authored on the branch and numbered additively so
nothing already written moves.

9.4's row list gives the un-pull control a name and a condition in the same
clause: "pulled marker with un-pull control when inclusion came from an
entry ('Remove from My Day'; absent when the row also qualifies
automatically)". Nothing asserts either part, and the absence is the half
that matters. Q1 admits a row through two disjuncts, the automatic one and
the entry, and 7.8's DELETE is honest about what it does: it removes the
viewer's entry, and "the task remains in My Day when it still qualifies
automatically". So a control offered on a row that qualifies both ways
promises a removal it cannot perform, the person presses it, and the row
stays exactly where it was with nothing on the page explaining why.

**The seed supplies the hard case ready-made.** Its pulled task is assigned
to the viewer and due today, so it satisfies both of Q1's disjuncts at once,
which is precisely the row 9.4 says carries no un-pull control. The pulled
row that needs one is created here, undated, so the entry is the only thing
putting it on the page.

**Removal is asserted as immediate and as durable.** 8.3 refetches after an
own mutation, so the row goes without a reload; and a reload afterwards is
what separates a row hidden locally from an entry actually deleted.

**Reworked onto the v2 surfaces on 2026-08-24 (RFC 0005), and one clause
escalated.** 9.1's route table moves the page this criterion is about off
/app, where Desk now is, to /app/today; section 6's Q1 heading is unchanged
and keeps the v1 name in parentheses because acceptance criteria cite it, so
every assertion below is the one it always was and only the address moved.

The clause escalated is the criterion's own string. It quotes "Remove from
My Day", and 9.4 now writes the control as reading "Remove from Today". A
criterion quoting a string the specification has since rewritten is a
criterion whose text is false, and protocol section 8 does not let this role
edit that text so an implementation passes: it is a Replace unit for RFC
0005's change control and a question for the owner. Until he rules, this file
asserts the string its own criterion quotes, which is also the string the
client still renders, so the two are wrong together rather than silently
apart. The page is S10's to redraw and the control's own name arrives with
it.

Spec: 9.4 (the row elements and the un-pull control's name and condition),
6 Q1 (the two disjuncts), 7.8 (what DELETE my-day removes and what it does
not), 8.3, INV-12.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  copy,
  createTask,
  csrfToken,
  routesV2,
  seedIds,
  seedSubs,
  signIn,
  taskRow,
  TEST_TIMEOUT_MS,
} from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
// Raised from Playwright's 30 second default so a red names its assertion
// rather than the clock, for the reason recorded at TEST_TIMEOUT_MS.
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

/**
 * A base rather than a title. Two cases create this row and the run seeds
 * once, so a shared title left two rows and the third case resolved its
 * un-pull control to both.
 */
const PULLED_ONLY_BASE = 'ac-165 undated and pulled'

test.beforeEach(async ({ page }) => {
  await signIn(page, seedSubs.hassan)
})

test.describe('AC-165: the un-pull control', () => {
  test('AC-165: a row on Today only by its entry carries the control', async ({ page }) => {
    const PULLED_ONLY = caseTitle(PULLED_ONLY_BASE)
    const task = await createTask(page, {
      title: PULLED_ONLY,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    const token = await csrfToken(page.context())
    const pulled = await page.request.post(`/api/v1/tasks/${task.id}/my-day?tz=UTC`, {
      headers: { 'X-CSRF-Token': token },
    })
    expect(
      pulled.status(),
      `POST /tasks/:id/my-day answered ${pulled.status()}: ${await pulled.text()}`,
    ).toBe(200)

    await page.goto(routesV2.today)
    await expect(
      taskRow(page, PULLED_ONLY).getByRole('button', { name: copy.removeFromMyDay }),
      'spec 9.4: a row whose inclusion came from an entry carries the un-pull control, named ' +
        '"Remove from My Day". The task is undated, so 6 Q1\'s automatic disjunct cannot hold ' +
        'and the entry is the only thing putting it here',
    ).toBeVisible()
  })

  test('AC-165: a row that also qualifies automatically carries no control', async ({
    page,
  }) => {
    await page.goto(routesV2.today)

    // The seeded pulled task is assigned to the viewer and due today, so both
    // of Q1's disjuncts hold at once. This is the row 9.4's parenthesis is
    // about, and the seed carries it ready-made.
    await expect(
      taskRow(page, 'Buy milk'),
      '6 Q1: the seeded task is on My Day, which is what makes the absence below about the ' +
        'control rather than about the row',
    ).toBeVisible()
    await expect(
      taskRow(page, 'Buy milk').getByRole('button', { name: copy.removeFromMyDay }),
      'spec 9.4: the un-pull control is absent when the row also qualifies automatically, and ' +
        '7.8 says why: DELETE removes the viewer\'s entry and the task remains in My Day when ' +
        'it still qualifies. Offered here, the control promises a removal it cannot perform, ' +
        'and the person presses it and watches nothing happen',
    ).toHaveCount(0)
  })

  test('AC-165: using the control removes the row and keeps it removed', async ({ page }) => {
    const PULLED_ONLY = caseTitle(PULLED_ONLY_BASE)
    const task = await createTask(page, {
      title: PULLED_ONLY,
      folder_id: seedIds.groceries,
      assignee_id: seedIds.hassan,
    })
    const token = await csrfToken(page.context())
    await page.request.post(`/api/v1/tasks/${task.id}/my-day?tz=UTC`, {
      headers: { 'X-CSRF-Token': token },
    })

    await page.goto(routesV2.today)
    await clickControl(
      taskRow(page, PULLED_ONLY).getByRole('button', { name: copy.removeFromMyDay }),
      'spec 9.4: the un-pull control is on a row whose inclusion came from an entry, which is ' +
        'the control this case performs',
    )

    await expect(
      taskRow(page, PULLED_ONLY),
      'spec 8.3: the client refetches the active view after an own mutation, so the row goes ' +
        'without a reload',
    ).toHaveCount(0)

    await page.reload()
    await expect(
      taskRow(page, PULLED_ONLY),
      'spec 7.8: the entry is deleted, not hidden. A reload is what separates a row the ' +
        'client dropped from its own copy of the response from one the server no longer ' +
        'returns',
    ).toHaveCount(0)
  })
})

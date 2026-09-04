/*
AC-220: given the assignee menu in a multi-member folder, then it lists that
folder's members, Invite by email, and Unassigned last; choosing Unassigned
clears the assignment.

Appended to section 12 by RFC 0005, Accepted 2026-08-24, and transcribed
unchanged. AC-094 is its API-side sibling and stays green through the v1
form; this one addresses the v2 surface and its one addition, the way out:
the v1 dropdown has no Unassigned at all, so a task could take an assignee
and never let one go (the W2 finding, DES-194). Red until S11 lands the v2
assignee menu.

**"Unassigned last" is order, asserted from the option list**, because last
is where DES-194 put it, after a separator, where "New folder…" sits in the
folder menu; a menu listing it first has copied the value and lost the
design's reason.

**The clear is asserted on the stored row**, through the surface and then the
wire: choose a member, then Unassigned, and the task's row shows no assignee
chip where it showed one.

**That paragraph was false when it was written, and the sweep of issue #159
found it on 2026-09-04.** This case read the chip and never the stored row, and
`waitForApiIdle` between the press and the read hid the difference. Replacing
that barrier with `watchCommit` failed five runs of five saying the page had
sent nothing at all, which turned out to be true of the product rather than of
the barrier: **choosing Unassigned clears the chip in the browser and writes
nothing.** Measured with the wire recorder: no request of any kind after the
press, none after the menu closes, and `GET /tasks/:id` still naming the member
four seconds later. A reload brings the assignment back.

Where it is. `components/task-card.tsx` offers the option as
`patch(task.id, { assignee: undefined })`, and `lib/task-concept.ts`'s
`conceptPatchToBody` writes `assignee_id` only when `fields.assignee` is not
`undefined` -- so the clear is indistinguishable from "this field was not
touched", the body comes out empty and no request is made. The comment beside
that line states the right rule, "a cleared assignee is `null` and not an
absent key", which is CLAUDE.md's warning about comments exactly: it describes
what the code is supposed to do. `ConceptTask['assignee']` carries no null
either, so there is no way to *say* "clear" in that type, which is why this is
a handoff rather than a one-line fix, and why it is not fixed here: it is
`app/src/client/`, it is wider than the two files
`docs/workflow/backend/allowed-frontend-changes.md` allows without one, and
three frontend branches were open on that directory the night it was found.

**So the second clause is held open rather than asserted**, on the shape
`tests/ac-397-authorization-sweep.test.ts` uses for a finding a branch is not
allowed to fix, and for the reason that file gives for preferring a manual
inversion to `test.fails`: what is asserted below is that **the finding is
still open**, so this case is green while the defect is there and red the day
it is fixed, and the red says what to do. The half that does work, the chip
leaving the surface, is asserted beside it, so the surface is not left
unmeasured.

Spec: 9.3 (the assignee chip), 9.1 (the addressing sentence), DES-194,
AC-094 (the API sibling), INV-5.
*/
import { expect, test } from '@playwright/test'

import {
  ACTION_TIMEOUT_MS,
  caseTitle,
  clickControl,
  createTask,
  seedIds,
  seedSubs,
  signIn,
  TEST_TIMEOUT_MS,
  waitForApiIdle,
  watchCommit,
 openTaskRow } from './harness.js'

test.use({ timezoneId: 'UTC', actionTimeout: ACTION_TIMEOUT_MS })
test.describe.configure({ timeout: TEST_TIMEOUT_MS })

test.describe('AC-220: the assignee menu', () => {
  test('AC-220: members, Invite by email, and Unassigned last; Unassigned clears', async ({
    page,
  }) => {
    const title = caseTitle('Assignable errand')
    await signIn(page, seedSubs.hassan)
    const task = await createTask(page, { title, folder_id: seedIds.groceries })
    await page.goto(`/app/folders/${seedIds.groceries}`)

    await openTaskRow(page, title,
      'spec 9.3: the row opens its task, whose header strip carries the assignee chip',
    )
    await clickControl(
      page.getByRole('button', { name: /assignee|assign/i }).first(),
      'spec 9.3: the assignee chip opens its picker in place. The v1 form renders a ' +
        'select with no Unassigned, which is the red this shows until S11',
    )

    const options = page.getByRole('menuitem').or(page.getByRole('option'))
    /* A settle before the list is read, added 2026-09-04 alongside the #159
       work and for the same reason as the rest of it. `allTextContents()` does
       not retry: called on a menu the browser has not finished drawing it
       returns `[]`, and every assertion below then fails saying the menu lists
       no members -- which reads as the defect this case is written to catch.
       Alone it never happened; in a run of forty-seven files it happened
       twice, the roster taking longer to arrive behind everyone else's
       fixtures. The retrying matcher is the barrier and the read is taken
       after it. Nothing about what is asserted changes. */
    await expect(
      options.first(),
      'spec 9.3: the chip opens a menu with entries in it, which is what the list below reads',
    ).toBeVisible()
    const labels = (await options.allTextContents()).map((text) => text.trim())
    for (const member of ['Hassan', 'Imran']) {
      expect(
        labels.some((label) => label.includes(member)),
        `spec 9.3: the menu lists the folder's members, and ${member} is one of ` +
          `Groceries' two. Read: ${JSON.stringify(labels)}`,
      ).toBe(true)
    }
    expect(
      labels.some((label) => /Invite by email/.test(label)),
      `AC-094's list carries into v2: Invite by email is offered. Read: ${JSON.stringify(labels)}`,
    ).toBe(true)
    expect(
      /Unassigned/.test(labels[labels.length - 1] ?? ''),
      'DES-194: Unassigned sits last, after the members and the invite, which is where ' +
        `the way out lives. Read: ${JSON.stringify(labels)}`,
    ).toBe(true)

    // Assign, then clear, and read both off the surface and off 7.6.
    /* `watchCommit` rather than API quiet on the assignment (2026-09-04, issue
       #159). Quiet is also what a page that has not yet issued the mutation
       looks like, React rendering before the request goes out, so the clear
       could otherwise be pressed on top of an assignment still sitting in the
       browser, and this case would then be measuring an order it never
       established. The clear's own barrier is the one below, and the header
       says why it is a different one. */
    const assigned = watchCommit(page)
    await clickControl(options.filter({ hasText: 'Imran' }).first(), 'assign to the member')
    await assigned.settled('the assignment reaches the server before the clear is attempted')
    await clickControl(
      page.getByRole('button', { name: /assignee|assign/i }).first(),
      'reopen the menu for the clear',
    )
    await clickControl(
      page
        .getByRole('menuitem', { name: /Unassigned/ })
        .or(page.getByRole('option', { name: /Unassigned/ }))
        .first(),
      'spec 9.3: choosing Unassigned clears the assignment, the control AC-094\'s v1 ' +
        'surface never offered',
    )
    /* Quiet and not `watchCommit` here, which is rule two of the #159 sweep
       read against the finding above: while the defect is open, what this
       press produces *is* an absence, and the barrier that waits for a request
       to go out cannot order a read whose own claim is that none did. */
    await waitForApiIdle(
      page,
      'everything the press might have sent has been sent and answered before the row is read',
    )
    await expect(
      page.getByRole('button', { name: /Imran/ }),
      'the half of the clear that works: the chip stops naming the member on the surface',
    ).toHaveCount(0)

    const stored = await page.request.get(`/api/v1/tasks/${task.id}`)
    expect(
      stored.status(),
      `GET /tasks/${task.id} answered ${stored.status()}: ${await stored.text()}`,
    ).toBe(200)
    const assignee = ((await stored.json()) as { assignee: { display_name: string } | null })
      .assignee
    expect(
      assignee?.display_name ?? null,
      'FINDING, open on 2026-09-04 and recorded rather than asserted (issue #159 sweep). ' +
        'AC-220 says "choosing Unassigned clears the assignment" and the client does not: ' +
        'the press clears the chip and sends nothing, so 7.6 still names the member and a ' +
        'reload brings the assignment back. This line asserts the defect is STILL THERE. ' +
        'When it fails, the defect is fixed: delete this block, assert the clear for real ' +
        'with expect(assignee).toBeNull(), and the criterion is satisfied. This file, ' +
        'header says where the defect is',
    ).toBe('Imran')
  })
})

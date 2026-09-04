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
wire: choose a member, then Unassigned, and 7.6 answers an assignee of null
where it named the member a moment before.

**That paragraph was false when it was written, and the sweep of issue #159
found it on 2026-09-04.** This case read the chip and never the stored row, and
`waitForApiIdle` between the press and the read hid the difference. Replacing
that barrier with `watchCommit` failed five runs of five saying the page had
sent nothing at all, which turned out to be true of the product rather than of
the barrier: choosing Unassigned cleared the chip in the browser and wrote
nothing. Measured with the wire recorder: no request of any kind after the
press, none after the menu closed, and `GET /tasks/:id` still naming the member
four seconds later. A reload brought the assignment back.

Where it was. `components/task-card.tsx` offered the option as
`patch(task.id, { assignee: undefined })`, and `lib/task-concept.ts`'s
`conceptPatchToBody` wrote `assignee_id` only when `fields.assignee` was not
`undefined` -- so the clear was indistinguishable from "this field was not
touched", the body came out empty and no request was made. The comment beside
that line stated the right rule, "a cleared assignee is `null` and not an
absent key", which is CLAUDE.md's warning about comments exactly: it described
what the code was supposed to do. `ConceptTask['assignee']` carried no null
either, so there was no way to *say* "clear" in that type.

**Closed by issue #169, 2026-09-04, the night after the sweep opened it.** The
concept type carries three values now, a person, an absent field meaning "not
touched", and null meaning "clear it"; `conceptPatchToBody` sends 7.6's
`assignee_id: null` for the third; and both menus that offer Unassigned, the
card's and the row's, send it. So the block that held this criterion's second
clause open, on `tests/ac-397-authorization-sweep.test.ts`'s shape for a
finding a branch is not allowed to fix, is **deleted**, and the sentence AC-220
actually makes is asserted in its place. The barrier moved with it: there is a
write to wait for now, so the read after the press is ordered by `watchCommit`
taken before it, which is rule one of the #159 sweep and the rule whose
application found the defect.

**The held-open arm was rewritten once in review before it was deleted, and one
sentence of that review survives the deletion** (commit `00584a7`, #159, merged
into the integration branch after #169's fix). It replaced this case's stored-row
read behind API quiet with a wire recorder, on the ground that a read of
`GET /tasks/:id` behind quiet races any write that is on its way, so an arm
holding a finding open could stay green past its own fix. The finding is closed,
so the recorder and the two settle windows behind it are gone with it; the reason
is not, and it is why the read below sits behind `watchCommit` taken before the
press rather than behind quiet.

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
    /* `watchCommit` on the clear as well, and this is the half the case exists
       for. The read below depends on what the press wrote, and quiet is also
       what a page looks like in the window between the press and the request
       the press causes, so a barrier waiting only for quiet reports the state
       the page was in beforehand -- which is the exact shape of the defect
       this clause catches. It stood on `waitForApiIdle` while the clear wrote
       nothing at all (issue #169, above), because no barrier can wait for an
       absence; the write exists, so the barrier is the positive one. */
    const cleared = watchCommit(page)
    await clickControl(
      page
        .getByRole('menuitem', { name: /Unassigned/ })
        .or(page.getByRole('option', { name: /Unassigned/ }))
        .first(),
      'spec 9.3: choosing Unassigned clears the assignment, the control AC-094\'s v1 ' +
        'surface never offered',
    )
    await cleared.settled(
      'AC-220: choosing Unassigned is an edit, and 9.3 commits an edit as it is made, so ' +
        'the clear reaches the server before the stored row is read',
    )
    await expect(
      page.getByRole('button', { name: /Imran/ }),
      'spec 9.3: the chip stops naming the member on the surface',
    ).toHaveCount(0)

    const stored = await page.request.get(`/api/v1/tasks/${task.id}`)
    expect(
      stored.status(),
      `GET /tasks/${task.id} answered ${stored.status()}: ${await stored.text()}`,
    ).toBe(200)
    const assignee = ((await stored.json()) as { assignee: { display_name: string } | null })
      .assignee
    expect(
      assignee,
      'AC-220: "choosing Unassigned clears the assignment", which is a fact about the task ' +
        'rather than about the chip. 7.6 answers the assignee it holds, so a member named ' +
        'here is the press having cleared the surface and written nothing, and a reload ' +
        'would bring the assignment back: that is issue #169, and this file, header, says ' +
        'where it lived',
    ).toBeNull()
  })
})

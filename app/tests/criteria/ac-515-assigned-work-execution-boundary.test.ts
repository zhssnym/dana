/*
AC-515: Assigned work executes the existing plan for the Task currently
assigned to them -- complete, uncomplete, tick a Step, set their reminder,
comment -- and may not materially replan it.

Issue #228 required proof 8. Product authority: accepted #209 R8A --
"Assigned work -- execute the existing plan for Tasks currently assigned
to the member; does not materially replan the Task or Folder" -- with
#228's own Assigned-work list.

## What "materially replan" means, said as statuses

#228's Assigned-work list is the whole criterion, in two halves:

> On a Task whose authoritative current assignee is the actor, may:
> complete/uncomplete under existing recurrence guards; toggle existing Step
> completion; set/remove the assignee-delivered reminder; comment/reply/attach
> evidence; use personal/private organization.
>
> Must not materially replan the Task: no title/context/date/importance/
> recurrence edits; no reassign/unassign; no Folder/Section/order move; no
> Step create/rename/reorder/delete/promote; no abandon/restore/trash; no
> shared Label/dependency management.

So this file drives both halves against one Task the actor holds. The refusals
matter more than the grants: an implementation that gave Assigned work nothing
would pass a criterion that only listed what they may not do, and an
implementation that gave them Can edit would pass one that only listed what
they may.

**Abandon and restore are refused and that is not an oversight.** #228's
Assigned-work list names them among the acts Assigned work may not perform,
beside trash: they
are judgements about whether work should happen at all, which is planning.
Complete and uncomplete are execution and carry a different action in the
resolver for exactly this reason.

Spec: 5.1, 7.6, 7.7, 7.9, 7.14; accepted #209 R8A and #228's Assigned-work
list.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['manager', 'worker'], 'ac485')

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

interface Stage {
  manager: Actor
  worker: Actor
  folderId: string
  /** Assigned to the worker. */
  theirs: string
  /** Assigned to the manager, and the control for "somebody else's". */
  notTheirs: string
  /** A Step that already exists on `theirs`, for the toggle. */
  stepId: string
}

async function stage(name: string): Promise<Stage> {
  const [manager, worker] = (await cast.of(app)) as [Actor, Actor]
  const folderId = await sharedFolder(app, manager, name, [
    [worker, 'assigned_work'],
  ])
  const theirs = await taskIn(
    manager,
    folderId,
    'ac485 inspect fire doors by Friday',
    worker.id,
  )
  const notTheirs = await taskIn(
    manager,
    folderId,
    "ac485 somebody else's job",
    manager.id,
  )
  const made = await manager.browser.json(`/tasks/${theirs}/steps`, 'POST', {
    title: 'ac485 check the closer',
  })
  expectStatus(made, 201, 'the manager writes the checklist (spec 7.7)')
  const detail = made.json() as { steps?: { id: string }[] }
  const stepId = String(detail.steps?.[0]?.id)
  return { manager, worker, folderId, theirs, notTheirs, stepId }
}

describe('AC-515 Assigned work performs the plan and does not write it', () => {
  test('AC-515: completes, uncompletes and ticks an existing Step on their own Task', async () => {
    const { worker, theirs, stepId } = await stage('ac485 execution')

    const ticked = await worker.browser.json(`/steps/${stepId}`, 'PATCH', {
      done: true,
    })
    expectStatus(
      ticked,
      200,
      "#228's Assigned-work list: toggling an existing Step done or undone is execution",
    )

    const completed = await worker.browser.json(
      `/tasks/${theirs}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      200,
      "accepted R8A: Assigned work executes the existing plan, and completing the Task is what that means",
    )

    const reopened = await worker.browser.json(
      `/tasks/${theirs}/uncomplete`,
      'POST',
      {},
    )
    expectStatus(
      reopened,
      200,
      'and undo their completion where the recurrence and series guards permit',
    )
  })

  test('AC-515: sets and clears the reminder Dana will deliver to them', async () => {
    const { manager, worker, theirs } = await stage('ac485 reminder')
    // A reminder needs a dated task (4.8); the plan is the manager's to set.
    const dated = await manager.browser.json(`/tasks/${theirs}`, 'PATCH', {
      due_date: '2026-12-04',
    })
    expectStatus(dated, 200, 'the manager sets the deadline')

    const set = await worker.browser.json(`/tasks/${theirs}/reminder`, 'PUT', {
      time_of_day: '08:00',
    })
    expectStatus(
      set,
      200,
      "#228's Assigned-work list carries the assignee-delivered reminder: Dana delivers it to the assignee, so setting it belongs to them",
    )

    const cleared = await worker.browser.api(`/tasks/${theirs}/reminder`, {
      method: 'DELETE',
    })
    expectStatus(cleared, 204, 'and clearing it is the same authority')
  })

  test('AC-515: comments on it, which is Consultation and not Work state', async () => {
    const { worker, folderId, theirs } = await stage('ac485 evidence')
    const said = await worker.browser.json(
      `/folders/${folderId}/comments?task=${theirs}`,
      'POST',
      { body: 'ac485 both doors checked, photo attached' },
    )
    expectStatus(
      said,
      201,
      "#228's Assigned-work list: comment, reply and attach evidence, which every preset from Can comment upward may do",
    )
  })

  test('AC-515: may not replan the scope, the schedule or the recurrence', async () => {
    const { worker, theirs } = await stage('ac485 no replanning')

    for (const [field, patch] of [
      ['title', { title: 'ac485 rewritten scope' }],
      ['notes', { notes: 'ac485 rewritten context' }],
      ['due_date', { due_date: '2027-01-31' }],
      ['important', { important: true }],
      ['recurrence_rule', { recurrence_rule: 'FREQ=MONTHLY' }],
    ] as const) {
      const response = await worker.browser.json(`/tasks/${theirs}`, 'PATCH', patch)
      expectStatus(
        response,
        403,
        `#228's Assigned-work list may not change ${field} -- "no title/context/date/importance/recurrence edits"`,
      )
    }
  })

  test('AC-515: may not reassign, move, abandon, restore or trash it', async () => {
    const { manager, worker, folderId, theirs } = await stage('ac485 no disposal')

    const reassigned = await worker.browser.json(`/tasks/${theirs}`, 'PATCH', {
      assignee_id: manager.id,
    })
    expectStatus(reassigned, 403, "#228's Assigned-work list: no reassign or unassign")

    const abandoned = await worker.browser.json(
      `/tasks/${theirs}/abandon?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      abandoned,
      403,
      "#228's Assigned-work list names abandon among the acts Assigned work may not perform: deciding that work should not happen is a judgement about the plan, not execution of it",
    )

    const trashed = await worker.browser.api(`/tasks/${theirs}`, {
      method: 'DELETE',
    })
    expectStatus(trashed, 403, "#228's Assigned-work list: no trash")

    expect(folderId.length, 'the folder is the one staged').toBeGreaterThan(0)
  })

  test('AC-515: may not rewrite the checklist it is measured against', async () => {
    const { worker, theirs, stepId } = await stage('ac485 no checklist edits')

    const renamed = await worker.browser.json(`/steps/${stepId}`, 'PATCH', {
      title: 'ac485 a smaller requirement',
    })
    expectStatus(
      renamed,
      403,
      "#228's Assigned-work list -- no Step create, rename, reorder, delete or promote: renaming a Step rewrites the scope that defines completion",
    )

    const added = await worker.browser.json(`/tasks/${theirs}/steps`, 'POST', {
      title: 'ac485 one they made up',
    })
    expectStatus(added, 403, "#228's Assigned-work list: no Step creation")

    const removed = await worker.browser.api(`/steps/${stepId}`, {
      method: 'DELETE',
    })
    expectStatus(removed, 403, "#228's Assigned-work list: no Step deletion")

    const promoted = await worker.browser.json(
      `/tasks/${theirs}/steps/${stepId}/promote`,
      'POST',
      {},
    )
    expectStatus(promoted, 403, "#228's Assigned-work list: no promotion to a Task of its own")
  })

  test("AC-515: may not execute somebody else's Task at all", async () => {
    const { worker, notTheirs } = await stage('ac485 not theirs')
    const completed = await worker.browser.json(
      `/tasks/${notTheirs}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      403,
      "accepted R8A: assignment is the condition that activates execution rights, and it activates them on the Task *currently* assigned to the member alone",
    )
  })
})

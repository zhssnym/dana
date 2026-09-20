/*
AC-516: the assignee that authorizes an Assigned-work or Can-contribute
mutation is read in the same transaction and under the same row lock as the
mutation itself, so a reassignment that commits first is seen -- and a stale
client projection saying "assigned to me" never authorizes.

Issue #228 required proof 9. Product authority: accepted #209 R8A and
#228's Assigned-work rule,
"Transactional requirement", which is the one place in the accepted model
that specifies an implementation property rather than a capability:

> The assignee condition must be checked in the same authoritative mutation
> transaction/snapshot used to perform the action. A stale client projection
> saying "assigned to me" must never authorize after reassignment.

## Why this needs two different cases

**The sequential case** is the one a person meets: they load a screen, somebody
reassigns the Task, and then they click Complete. It proves that the server
does not trust what the client last saw. It is deterministic and it is the
case that matters in production.

**The concurrent case** is the one a lock exists for: two requests in flight
at once, one reassigning and one completing. It proves that the two cannot
interleave *inside* the window between reading the assignee and writing the
status. Without the `FOR UPDATE OF t` in `lockedTask`, a complete could read
"mine", a reassign could commit, and the complete could then write a status
change authorized by an assignee that no longer existed.

**What the concurrent case may and may not assert.** Which of the two
transactions wins is genuinely undetermined -- that is what concurrency
means -- so this does not assert an order. What it asserts is the property
that must hold *whichever* order the database chose, read afterwards from the
rows: if the reassignment won, the completion must have been refused; if the
completion won, it was authorized by an assignee that was still true when it
wrote. An assertion about which one wins would be an assertion about the
scheduler, and it would flake.

Spec: 7.6, 8.3; accepted #209 R8A; #228's Assigned-work rule.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import { sharedFolder, taskIn } from '../support/folder-access-harness.js'
import { Cast, expectStatus } from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import type { RawResponse } from '../support/http-client.js'

let app: AuthTestApp
const cast = new Cast(['manager', 'worker', 'replacement'], 'ac486')

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
  replacement: Actor
  folderId: string
  taskId: string
}

async function stage(name: string): Promise<Stage> {
  const [manager, worker, replacement] = (await cast.of(app)) as [
    Actor,
    Actor,
    Actor,
  ]
  const folderId = await sharedFolder(app, manager, name, [
    [worker, 'assigned_work'],
    [replacement, 'assigned_work'],
  ])
  const taskId = await taskIn(manager, folderId, `${name} the task`, worker.id)
  return { manager, worker, replacement, folderId, taskId }
}

async function statusOf(actor: Actor, taskId: string): Promise<string> {
  const read = await actor.browser.api(`/tasks/${taskId}`)
  return String((read.json() as { status: string }).status)
}

/** 7.0's TaskDetail carries the assignee as a person object rather than a
 * bare id, the shape a card renders; this is the id inside it. */
async function assigneeOf(actor: Actor, taskId: string): Promise<string | null> {
  const read = await actor.browser.api(`/tasks/${taskId}`)
  const body = read.json() as { assignee?: { id?: string } | null }
  return body.assignee?.id ?? null
}

describe('AC-516 the assignee that authorizes is the assignee that is written', () => {
  test('AC-516: a projection the client already holds does not authorize after a reassignment', async () => {
    const { manager, worker, replacement, taskId } = await stage('ac486 stale')

    // The worker reads the Task and sees themselves on it. This is exactly
    // the stale "assigned to me" projection #228 names, and it is genuinely
    // true at the moment it is read.
    expect(
      await assigneeOf(worker, taskId),
      'the worker holds the Task when they load it',
    ).toBe(worker.id)

    // The manager reassigns it while the worker is looking at their screen.
    const moved = await manager.browser.json(`/tasks/${taskId}`, 'PATCH', {
      assignee_id: replacement.id,
    })
    expectStatus(moved, 200, 'the manager reassigns it (spec 7.6)')

    // The worker clicks Complete against what they last saw.
    const completed = await worker.browser.json(
      `/tasks/${taskId}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      completed,
      403,
      '#228: the assignee is checked in the same authoritative mutation transaction, so a stale client projection never authorizes after reassignment',
    )
    expect(
      await statusOf(manager, taskId),
      'and the refused completion wrote nothing: the status the manager reads is the one they left',
    ).toBe('pending')

    // The control: the person who actually holds it now can do it.
    const byHolder = await replacement.browser.json(
      `/tasks/${taskId}/complete?tz=UTC`,
      'POST',
      {},
    )
    expectStatus(
      byHolder,
      200,
      'while the current assignee, at the same preset, completes it',
    )
  })

  test('AC-516: a reassignment and a completion in flight together cannot both act on one snapshot', async () => {
    const { manager, worker, replacement, taskId } = await stage('ac486 raced')

    /*
    Both requests are started without awaiting either, so they are in flight
    at once and the database orders them. `lockedTask` takes the task row
    `FOR UPDATE OF t` in both the PATCH and the transition, so whichever
    reaches it first holds it until it commits and the other reads the result
    rather than the state before it.
    */
    const [reassigned, completed] = (await Promise.all([
      manager.browser.json(`/tasks/${taskId}`, 'PATCH', {
        assignee_id: replacement.id,
      }),
      worker.browser.json(`/tasks/${taskId}/complete?tz=UTC`, 'POST', {}),
    ])) as [RawResponse, RawResponse]

    expectStatus(
      reassigned,
      200,
      'the reassignment is the manager\'s and is never refused: they hold Full control of the folder',
    )

    const finalAssignee = await assigneeOf(manager, taskId)
    const finalStatus = await statusOf(manager, taskId)

    /*
    One property, asserted whichever way the lock went, and nothing about
    which way it went.

    - The completion was **refused**: then the reassignment reached the row
      first, and the refusal is correct -- at the moment the completion held
      the lock, the Task was the replacement's.
    - The completion **succeeded**: then it reached the row first, and it was
      authorized by an assignee that was still true under the lock it held.
      The reassignment then applied on top, which is why the final assignee is
      the replacement either way.

    What must never happen is a completion that was refused *and* wrote, or
    one that succeeded while the Task had already moved -- both of which are
    the same defect, a decision made outside the lock that performs the
    write.
    */
    /* The body rides the message because the one wrong answer this race can
       give is a 500, and a 500 with no body says nothing about which of the
       two locks it died on. It gave one on 2026-09-20, from a lock-order
       inversion in `patchTask` that `domain/tasks.ts` now records and fixes;
       leaving the body out would have cost that investigation an hour. */
    expect(
      [200, 403],
      `the completion answered ${String(completed.status)}, which is neither the grant nor the refusal this race admits; body ${completed.body.slice(0, 300)}`,
    ).toContain(completed.status)
    expect(
      finalStatus,
      completed.status === 200
        ? 'a completion that answered 200 held the lock while the Task was still theirs, so the status moved'
        : 'a completion that answered 403 wrote nothing, so the status did not move',
    ).toBe(completed.status === 200 ? 'completed' : 'pending')
    expect(
      finalAssignee,
      'and the reassignment landed whichever order the two took',
    ).toBe(replacement.id)
  })

  test('AC-516: the same rule binds Can contribute, whose authority is the same boundary', async () => {
    const [manager, worker, replacement] = (await cast.of(app)) as [
      Actor,
      Actor,
      Actor,
    ]
    const folderId = await sharedFolder(app, manager, 'ac486 contribute', [
      [worker, 'can_contribute'],
      [replacement, 'can_contribute'],
    ])
    const taskId = await taskIn(manager, folderId, 'ac486 handed on', worker.id)

    const moved = await manager.browser.json(`/tasks/${taskId}`, 'PATCH', {
      assignee_id: replacement.id,
    })
    expectStatus(moved, 200, 'the manager reassigns it')

    const edited = await worker.browser.json(`/tasks/${taskId}`, 'PATCH', {
      title: 'ac486 edited after it moved on',
    })
    expectStatus(
      edited,
      403,
      "R8 gives Can contribute authority over work *currently* assigned to them, and the word is load-bearing: the edit reads the locked row's assignee, not the one the client last saw",
    )
  })

  test('AC-516: a Step toggle is gated by the parent Task\'s locked assignee too', async () => {
    const { manager, worker, replacement, taskId } = await stage('ac486 steps')
    const made = await manager.browser.json(`/tasks/${taskId}/steps`, 'POST', {
      title: 'ac486 a requirement',
    })
    expectStatus(made, 201, 'the manager writes the checklist')
    const stepId = String(
      (made.json() as { steps?: { id: string }[] }).steps?.[0]?.id,
    )

    const beforeMove = await worker.browser.json(`/steps/${stepId}`, 'PATCH', {
      done: true,
    })
    expectStatus(
      beforeMove,
      200,
      "while it is theirs, the holder ticks the Step (#228's Assigned-work list)",
    )

    const moved = await manager.browser.json(`/tasks/${taskId}`, 'PATCH', {
      assignee_id: replacement.id,
    })
    expectStatus(moved, 200, 'the manager reassigns it')

    const afterMove = await worker.browser.json(`/steps/${stepId}`, 'PATCH', {
      done: false,
    })
    expectStatus(
      afterMove,
      403,
      "a Step's authorization is its parent Task's, and the parent is read under its own lock: the previous holder cannot untick it afterwards",
    )
  })
})

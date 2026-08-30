/*
AC-311: given a task with an assignee, when another member comments on it,
then the assignee gains a notification whether or not they have spoken in the
thread, the event's detail names the task, and the notification carries the
task's id so the bell can open the thread; the actor is never notified.

**Why the thread's voices were not enough.** 4.14 fans a comment to "the
people it concerns", and 7.14's first cut read that as the thread's earlier
authors alone, so a comment on a task you were assigned and had not yet
answered reached nobody, while 9.12's own empty state promised "when someone
... answers you, it lands here". The polish round of 2026-08-30 (search F1)
adds the task's assignee and creator to the fan-out; AC-207 still pins the
folder-thread rule this widens rather than replaces.

Spec: 4.14, 7.12, 7.14, 9.12 as amended at the polish round.
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
} from './folders-harness.js'
import { createTaskOk } from './tasks-harness.js'
import type { Actor } from './folders-harness.js'

let app: AuthTestApp
const cast = new Cast(['owner', 'assignee'])

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-311 a comment on a task reaches the task\'s people', () => {
  test('the silent assignee is notified, with the task named and its id carried', async () => {
    const [owner, assignee] = (await cast.of(app)) as [Actor, Actor]
    await connect(app.db, owner.id, assignee.id)
    const folderId = await createFolder(owner, 's1 ac311 fanout')
    await addMemberOk(owner, folderId, assignee.id)

    const task = await createTaskOk(
      owner,
      {
        title: 's1 ac311 pack the kitchen',
        folder_id: folderId,
        assignee_id: assignee.id,
      },
      'the assignment must commit before a comment is made on it (spec 7.6)',
    )

    const comment = await owner.browser.json(`/folders/${folderId}/comments?task=${task.id}`, 'POST', {
      body: 's1 ac311 the owner asks a question',
    })
    expectStatus(comment, 201, 'the comment stages (spec 7.14)')

    const inbox = await assignee.browser.json('/notifications', 'GET')
    expectStatus(inbox, 200, 'the assignee lists notifications (spec 7.12)')
    const rows = (inbox.json() as { notifications: Array<Record<string, unknown>> }).notifications
    const about = rows.filter((row) => JSON.stringify(row).includes('ac311 the owner asks'))
    expect(
      about.length,
      'exactly one notification for the comment, though the assignee never spoke (spec 4.14, ' +
        '9.12: "when someone answers you, it lands here")',
    ).toBe(1)
    const row = about[0] as { task_id: unknown; event: { detail: unknown; subject_kind: unknown } }
    expect(row.event.subject_kind, 'the subject is the comment (spec 4.13)').toBe('comment')
    expect(
      row.event.detail,
      'the detail names the task the comment landed on, so the bell reads as a sentence',
    ).toBe('commented on "s1 ac311 pack the kitchen"')
    expect(
      row.task_id,
      'the notification carries the task id, so the bell can open the task with its thread',
    ).toBe(task.id)

    const actors = await owner.browser.json('/notifications', 'GET')
    expectStatus(actors, 200, 'the actor lists notifications (spec 7.12)')
    expect(
      JSON.stringify(actors.json()).includes('ac311 the owner asks'),
      'an actor is never notified of their own act (spec 4.14)',
    ).toBe(false)
  })
})

/*
AC-034: given a PATCH containing a status field, then 409.

The rule is about presence, not about value: 7.6 says "status is not
accepted here (409 if present): transitions have their own endpoints". So
the case that matters most is the one that looks harmless, a PATCH sending
the status the task already has. An implementation that compares the sent
status to the stored one and shrugs when they match has left the door open,
and the door is the whole point of the rule, because 8.3 routes every status
write through the four guarded transition endpoints so recurrence
generation can be exactly-once.

This also sits deliberately outside 7.0's tolerated-unknown rule. Unknown
fields are ignored; status is not unknown, it is refused, and the two
behaviors differ by a status code. An implementation that strips status as
if it were noise answers 200 and fails here.

Attacked beside the criterion: status beside a legal field, where the legal
field must not land, since a refused request applies none of itself; and
each of the three 4.5 statuses, so no single value is special.

Spec: 7.6 (PATCH, status is not accepted), 8.3 (status writes go through
the guarded transition endpoints), 5.1, 7.0 (409, and the tolerated-unknown
rule that does not cover this).
*/
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import { Cast, createFolder, expectStatus } from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTaskOk,
  expectTaskInvariants,
  patchTask,
  patchTaskOk,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  folderId: string
  taskId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const folderId = await createFolder(author, 'p3 ac034 statuses')
    const task = await createTaskOk(
      author,
      { title: 'p3 ac034 pending forever', folder_id: folderId },
      'the task the PATCHes are aimed at must be creatable (spec 7.6)',
    )
    staged = { author, folderId, taskId: task.id }
  }
  return staged
}

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-034: a PATCH carrying status is refused', () => {
  test('AC-034: status completed answers 409', async () => {
    const { author, taskId } = await stage()
    const response = await patchTask(author, taskId, { status: 'completed' })
    expectStatus(
      response,
      409,
      'status is not accepted on PATCH; the transitions have their own endpoints (spec 7.6, 8.3)',
    )
    const row = await requireTaskRow(app.db, taskId)
    expect(row.status, 'and the task is still pending').toBe('pending')
    expect(
      row.completed_at,
      'nothing wrote the completion columns behind the refusal (INV-8)',
    ).toBeNull()
  })

  test('AC-034: the status the task already has answers 409 too', async () => {
    const { author, taskId } = await stage()
    const response = await patchTask(author, taskId, { status: 'pending' })
    expectStatus(
      response,
      409,
      'the rule is presence, not difference: a status field is refused whatever it says (spec 7.6)',
    )
  })

  test('AC-034: abandoned answers 409 as well', async () => {
    const { author, taskId } = await stage()
    const response = await patchTask(author, taskId, { status: 'abandoned' })
    expectStatus(
      response,
      409,
      'no value of status is accepted on this endpoint (spec 7.6)',
    )
  })

  test('AC-034 adversarial: a legal field beside status does not land', async () => {
    const { author, taskId } = await stage()
    const before = await requireTaskRow(app.db, taskId)
    const response = await patchTask(author, taskId, {
      important: true,
      status: 'completed',
    })
    expectStatus(
      response,
      409,
      'the refused field decides the whole request (spec 7.6)',
    )
    const after = await requireTaskRow(app.db, taskId)
    expect(
      after.important,
      'a refused PATCH applies none of its fields, not merely the refused one',
    ).toBe(before.important)
    expect(String(after.updated_at), 'and it touched nothing').toBe(
      String(before.updated_at),
    )
  })

  test('AC-034 adversarial: the same field alone is accepted, so the 409 is status\'s', async () => {
    const { author, taskId } = await stage()
    const body = await patchTaskOk(
      author,
      taskId,
      { important: true },
      'important is an ordinary PATCH field and must be accepted on its own (spec 7.6)',
    )
    expect(body.important, 'which proves the 409 above belongs to status').toBe(
      true,
    )
  })

  test('AC-034: invariants hold afterwards', async () => {
    const { author, folderId, taskId } = await stage()
    await expectTaskInvariants(app.db, [taskId], [folderId], [author.id])
  })
})

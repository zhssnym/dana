/*
AC-027: given creation with due_time and no due_date, then 422.

INV-6 says due_time exists only while due_date is set, and 4.5 backs it with
a CHECK, so the wrong implementation of this criterion is not a wrong answer
but a wrong layer: a create that hands the body straight to the database
gets the rejection from the constraint and answers 500, and the criterion
asks for 422 with the field named (7.6, 10.3). The difference is invisible
in the row and obvious on the wire, which is why this file reads the status
and the message rather than the table.

Attacked beside the criterion: the same dependency on the PATCH side, where
7.6's special rules do not restate it and 7.11 lists the date-dependency
rules as server-authoritative anyway, and the allowed side of the boundary,
a due_date and due_time together, so the refusal is attributable to the
missing date rather than to an endpoint that refuses times generally.

Spec: 7.6 (POST /tasks dependency checks; PATCH), 7.11 (the
date-dependency rules are always revalidated), INV-6, 4.5, 10.3.
*/
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from './auth-harness.js'
import type { AuthTestApp } from './auth-harness.js'
import {
  Cast,
  countRows,
  defaultFolderOf,
  expectStatus,
} from './folders-harness.js'
import type { Actor } from './folders-harness.js'
import {
  createTask,
  createTaskOk,
  expectTaskInvariants,
  patchTask,
  requireTaskRow,
} from './tasks-harness.js'

let app: AuthTestApp
const cast = new Cast(['author'], 'p3')

interface Stage {
  author: Actor
  inboxId: string
  undatedId: string
}
let staged: Stage | undefined

async function stage(): Promise<Stage> {
  if (staged === undefined) {
    const [author] = await cast.of(app)
    if (author === undefined) throw new Error('cast must produce one actor')
    const inboxId = await defaultFolderOf(app.db, author.id)
    const undated = await createTaskOk(
      author,
      { title: 'p3 ac027 undated' },
      'the undated task the PATCH case needs must be creatable (spec 7.6)',
    )
    staged = { author, inboxId, undatedId: undated.id }
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

describe('AC-027: a due_time without a due_date is refused', () => {
  test('AC-027: the create answers 422', async () => {
    const { author } = await stage()
    const response = await createTask(author, {
      title: 'p3 ac027 timed and undated',
      due_time: '09:30',
    })
    expectStatus(
      response,
      422,
      'due_time requires due_date, and the dependency check answers 422 rather than letting the 4.5 CHECK answer 500 (spec 7.6, INV-6)',
    )
  })

  test('AC-027: the 422 names the field', async () => {
    const { author } = await stage()
    const response = await createTask(author, {
      title: 'p3 ac027 named field',
      due_time: '09:30',
    })
    expect(
      response.body.toLowerCase(),
      'validation failures carry field errors (spec 7.0, 10.3), so the body must name due_time or the due_date it depends on',
    ).toMatch(/due_time|due_date/)
  })

  test('AC-027 adversarial: the refused create wrote nothing', async () => {
    const { author, inboxId } = await stage()
    // The title is this suite's own string, so the probe can name it.
    await createTask(author, {
      title: 'p3 ac027 must not exist',
      due_time: '10:15',
    })
    expect(
      await countRows(
        app.db,
        sql`SELECT count(*)::int AS n FROM tasks
             WHERE folder_id = ${inboxId} AND title = ${'p3 ac027 must not exist'}`,
      ),
      'a 422 is a refusal, so no row may exist for the body that was refused',
    ).toBe(0)
  })

  test('AC-027 adversarial: a due_date with a due_time is accepted', async () => {
    const { author } = await stage()
    const body = await createTaskOk(
      author,
      { title: 'p3 ac027 dated and timed', due_date: '2026-08-20', due_time: '09:30' },
      'a due_time beside a due_date satisfies INV-6 and must be accepted (spec 7.6)',
    )
    expect(body.due_date, 'the date is stored as sent').toBe('2026-08-20')
    expect(
      String(body.due_time).slice(0, 5),
      'the time is stored as sent, at 4.11 minute precision',
    ).toBe('09:30')
    const row = await requireTaskRow(app.db, body.id)
    expect(row.due_date).toBe('2026-08-20')
  })

  test('AC-027 adversarial: PATCHing a due_time onto an undated task answers 422', async () => {
    const { author, undatedId } = await stage()
    const response = await patchTask(author, undatedId, { due_time: '08:00' })
    expectStatus(
      response,
      422,
      'the date-dependency rules are server-authoritative on every path (spec 7.11), so a PATCH cannot reach the 4.5 CHECK with a bare due_time',
    )
    const row = await requireTaskRow(app.db, undatedId)
    expect(row.due_time, 'the refused PATCH stored nothing').toBeNull()
    expect(row.due_date, 'the task is still undated').toBeNull()
  })

  test('AC-027: invariants hold afterwards', async () => {
    const { author, inboxId, undatedId } = await stage()
    await expectTaskInvariants(app.db, [undatedId], [inboxId], [author.id])
  })
})

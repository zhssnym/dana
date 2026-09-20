/*
The two writes the workflow import makes through this directory, checked for
the properties no run of the acceptance suite can see (issue #279).

`createWorkflowFolderLabels` and `applyWorkflowTaskLabels` were a statement per
definition and a statement per assignment, bounded by 10.3 at 12,500 and
100,000 inside one write transaction, and a version 3 file at those caps held
that transaction open for about eleven seconds. Both are set-based now. What
the criteria see is the answer — AC-780 and AC-782 for the refusal, AC-547 and
its neighbours for the round trip — and what nothing sees is the property the
change is *for*: how many statements the path issues, and what one statement
does that many statements did for free.

So this is `cap-guards.test.ts`'s shape, for the same reason and against the
same kind of property: drive the real functions against a real database through
a recorder that renders every statement, and assert the count rather than the
seconds. A timing assertion would be a flake; a count is the thing that moved.

**Three properties, and each one is a way the change could be undone quietly.**

*The statement count does not move with the file.* A later edit that puts the
loop back — "for clarity", or to get a per-row error message — passes every
criterion in the suite and silently restores the eleven seconds.

*A file naming one key twice on one Task is absorbed rather than raising.* The
per-assignment loop got that from `ON CONFLICT DO NOTHING` against rows already
written; one multi-row INSERT needs the same clause to absorb duplicates
*within* the statement, which it does — it is `DO UPDATE` rather than
`DO NOTHING` that refuses to touch a row twice in one command. Nothing else in
the suite drives a file that names one key twice on one Task.

*The refusal names the file's own spelling and the caller's folder index.* The
endpoint criteria assert the field path and the sentence; neither asserts which
of the two colliding spellings the message carries, and the folder index is
asserted only through a route that has one folder index to give it. Both are
this class's whole reason to exist, so both are asserted here directly.

No criterion number appears in a string literal in this file on purpose: it is
a colocated test rather than a criterion, and `tests/guards/guard-criterion-
citations.test.ts` reads a number in a literal as a claim that this file runs
it.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { createTestDb, rows } from '../../../tests/support/helpers.js'
import type { Executor } from '../database.js'
import {
  WorkflowLabelNameConflict,
  applyWorkflowTaskLabels,
  createWorkflowFolderLabels,
} from './labels.js'

let client: DbClient
let db: Db

const dialect = new PgDialect()

/* An Executor that records what it is asked to run and then runs it. Both
   functions under test take one, so wrapping `execute` is the whole surface;
   the real transaction is the importer's and is not what this measures. */
function recording(real: Db, log: string[]): Executor {
  return {
    execute: async (statement: SQL) => {
      log.push(
        dialect.sqlToQuery(statement).sql.replace(/\s+/g, ' ').trim().toLowerCase(),
      )
      return (real as unknown as Executor).execute(statement)
    },
  }
}

const seededUsers: string[] = []

async function seedUser(): Promise<string> {
  const tag = randomUUID()
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`wlw-${tag}`}, ${`${tag}@workflow-label-writes.test`},
                ${'Workflow writes'})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name)
        VALUES (${ownerId}::uuid, ${'workflow label writes'})
        RETURNING id`,
  )
  const folderId = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${folderId}::uuid, ${ownerId}::uuid, 'full_control')`,
  )
  return folderId
}

async function seedTask(folderId: string, ownerId: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO tasks (folder_id, title, assignee_id, created_by)
        VALUES (${folderId}::uuid, ${'workflow label writes task'},
                ${ownerId}::uuid, ${ownerId}::uuid)
        RETURNING id`,
  )
  return String(found[0]?.id)
}

/** The shape the importer hands over: the file's own key, and the three value
 * fields the schema has already validated. */
function definitions(
  count: number,
  prefix: string,
): { key: string; name: string; color: string }[] {
  return Array.from({ length: count }, (_unused, index) => ({
    key: `k${String(index)}`,
    name: `${prefix} ${String(index)}`,
    color: '#AA1122',
  }))
}

async function labelCount(folderId: string): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM labels
         WHERE folder_id = ${folderId}::uuid AND scope = 'folder'`,
  )
  return Number(found[0]?.n ?? -1)
}

async function assignmentCount(taskId: string): Promise<number> {
  const found = await rows(
    db,
    sql`SELECT count(*)::int AS n FROM task_folder_labels
         WHERE task_id = ${taskId}::uuid`,
  )
  return Number(found[0]?.n ?? -1)
}

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  for (const id of seededUsers) {
    await db.execute(sql`DELETE FROM folder_members WHERE user_id = ${id}`)
    await db.execute(sql`DELETE FROM tasks WHERE created_by = ${id}`)
    await db.execute(sql`DELETE FROM folders WHERE owner_id = ${id}`)
    await db.execute(sql`DELETE FROM users WHERE id = ${id}`)
  }
  await client.close()
})

describe('the workflow import writes a vocabulary in a fixed number of statements', () => {
  test('two statements for the fold and the INSERT, whatever the folder declares', async () => {
    const ownerId = await seedUser()
    const small = await seedFolder(ownerId)
    const large = await seedFolder(ownerId)

    const fewLog: string[] = []
    const few = await createWorkflowFolderLabels(
      recording(db, fewLog),
      small,
      definitions(3, 'small'),
      0,
    )
    const manyLog: string[] = []
    const many = await createWorkflowFolderLabels(
      recording(db, manyLog),
      large,
      definitions(250, 'large'),
      0,
    )

    expect(
      [fewLog.length, manyLog.length],
      'three definitions and 10.3’s cap of 250 cost the same two statements: the fold that refuses a file disagreeing with itself, and one multi-row INSERT. One statement per definition is what held the import transaction open for eleven seconds at the format’s caps',
    ).toEqual([2, 2])
    expect(
      manyLog[1]?.includes('insert into labels'),
      'and the second of the two is the write',
    ).toBe(true)

    expect(
      [few.size, many.size],
      'every declared key is answered with the id it was given',
    ).toEqual([3, 250])
    expect(
      [await labelCount(small), await labelCount(large)],
      'and every definition reached the table',
    ).toEqual([3, 250])

    const named = await rows(
      db,
      sql`SELECT name FROM labels WHERE id = ${String(many.get('k249'))}::uuid`,
    )
    expect(
      String(named[0]?.name),
      'the key the file used maps to the row that carries its own name, which is what the import remaps every task’s assignments through: RETURNING answers ids in no promised order, so a map built from it is only sound while the names are known distinct',
    ).toBe('large 249')
  })

  test('a name declared twice is refused with the file’s own spelling and the caller’s folder index', async () => {
    const ownerId = await seedUser()
    const folderId = await seedFolder(ownerId)

    const log: string[] = []
    const refused = await createWorkflowFolderLabels(recording(db, log), folderId, [
      { key: 'a', name: 'Someday', color: '#AA1122' },
      { key: 'b', name: 'Urgent', color: '#112233' },
      { key: 'c', name: 'URGENT', color: '#334455' },
    ]
      , 7).then(
      () => null,
      (error: unknown) => error,
    )

    expect(
      refused instanceof WorkflowLabelNameConflict,
      'the fold is the database’s lower(), run over the file’s own rows one statement ahead of the INSERT, and a multi-row INSERT could not say which row it was',
    ).toBe(true)
    const conflict = refused as WorkflowLabelNameConflict
    expect(
      conflict.labelName,
      'the name it carries is the later of the two, spelled as the file spelled it: that is the definition the per-definition loop’s own INSERT used to raise 23505 on, and nothing that drives this through the endpoint asserts which of the two it is',
    ).toBe('URGENT')
    expect(
      conflict.folderIndex,
      'and the folder is the one the importer was iterating rather than the first of the file',
    ).toBe(7)
    expect(conflict.field, 'which is the path the message is addressed by').toBe(
      'folders.7.labels',
    )
    expect(
      log.length,
      'and it costs one statement: the fold refuses before the write rather than after it',
    ).toBe(1)
  })

  test('nothing declared is no statement at all', async () => {
    const ownerId = await seedUser()
    const folderId = await seedFolder(ownerId)
    const log: string[] = []
    const made = await createWorkflowFolderLabels(recording(db, log), folderId, [], 0)
    expect([log.length, made.size], 'a folder with no vocabulary asks nothing').toEqual([
      0, 0,
    ])
  })
})

describe('the workflow import writes a task’s assignments in one statement', () => {
  test('one statement per task, whatever the task wears', async () => {
    const ownerId = await seedUser()
    const folderId = await seedFolder(ownerId)
    const vocabulary = await createWorkflowFolderLabels(
      db as unknown as Executor,
      folderId,
      definitions(100, 'assigned'),
      0,
    )
    const ids = [...vocabulary.values()]
    const oneTask = await seedTask(folderId, ownerId)
    const otherTask = await seedTask(folderId, ownerId)

    const fewLog: string[] = []
    await applyWorkflowTaskLabels(recording(db, fewLog), folderId, oneTask, ids.slice(0, 4))
    const manyLog: string[] = []
    await applyWorkflowTaskLabels(recording(db, manyLog), folderId, otherTask, ids)

    expect(
      [fewLog.length, manyLog.length],
      'four labels and 10.3’s per-task cap of 100 cost one statement each: one INSERT per assignment is 100,000 of them for a file at the format’s caps, which is what issue #279 measured at eleven seconds',
    ).toEqual([1, 1])
    expect(
      [await assignmentCount(oneTask), await assignmentCount(otherTask)],
      'and every assignment the file asked for is there',
    ).toEqual([4, 100])
  })

  test('one key named twice on one task is one row rather than a rejection', async () => {
    const ownerId = await seedUser()
    const folderId = await seedFolder(ownerId)
    const vocabulary = await createWorkflowFolderLabels(
      db as unknown as Executor,
      folderId,
      definitions(2, 'twice'),
      0,
    )
    const [first, second] = [...vocabulary.values()]
    const taskId = await seedTask(folderId, ownerId)

    const log: string[] = []
    await applyWorkflowTaskLabels(recording(db, log), folderId, taskId, [
      String(first),
      String(second),
      String(first),
    ])

    expect(
      await assignmentCount(taskId),
      'the file may name one key twice on one task — the schema caps the array and does not make it a set — and the pair (task, label) is a primary key, so what absorbs the repeat is ON CONFLICT DO NOTHING absorbing a row the same statement already inserted. DO UPDATE is the one that refuses to touch a row twice in one command; losing the clause, or reaching for that one, is a 500 on a file that imported before',
    ).toBe(2)
    expect(log.length, 'still one statement').toBe(1)
  })

  test('a task wearing nothing is no statement at all', async () => {
    const ownerId = await seedUser()
    const folderId = await seedFolder(ownerId)
    const taskId = await seedTask(folderId, ownerId)
    const log: string[] = []
    await applyWorkflowTaskLabels(recording(db, log), folderId, taskId, [])
    expect(
      [log.length, await assignmentCount(taskId)],
      'the common case of a file with a vocabulary its tasks do not use costs nothing',
    ).toEqual([0, 0])
  })
})

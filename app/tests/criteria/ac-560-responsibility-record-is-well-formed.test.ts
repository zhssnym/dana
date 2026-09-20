/*
AC-560: the Responsibility record's own CHECK constraints refuse the rows they
were written to refuse, driven behaviourally rather than read by name.

Issue #230, the schema half. Product authority: #209 R10.

## Why this criterion exists at all

AC-001 asserts every constraint in this schema by **name** and by **which
columns it mentions**, and never by what its expression does. That is the
right shape for a catalog and it has one blind spot, recorded in the backend
README and paid for once already (issue #27): **a CHECK fails only on FALSE,
and UNKNOWN is as good as TRUE to it**, so a constraint written with a
comparison against a possibly-null column admits exactly the row it was
written to refuse -- and passes AC-001, and passes the whole suite.

Migration 0025 adds four CHECKs, three of them over nullable columns. So this
is the behavioural case the README says is the author's job when a migration
adds one: each is driven with the bad row and must be refused, and each is
driven with the good rows either side of it and must admit them.

Every assertion is a SQLSTATE and a constraint name. Never the message: the
worker databases answer in the cluster's own language and
`guard-postgres-leg-isolation.test.ts` fails a file that reads server prose.

Spec: 4, 11.10; #209 R10.
*/
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import { createTestDb, expectRejectedBy, rows } from '../support/helpers.js'

let client: DbClient

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await client.close()
})

/** A folder with an owner, made straight from SQL: this file is about the
 * table's own refusals, so it wants rows rather than a surface. */
async function scaffold(): Promise<{ userId: string; folderId: string }> {
  const userId = randomUUID()
  const folderId = randomUUID()
  await client.db.execute(
    sql`INSERT INTO users (id, google_sub, email, display_name)
        VALUES (${userId}::uuid, ${`ac560-${userId}`}, ${`ac560-${userId}@ac560.test`}, 'AC-560')`,
  )
  await client.db.execute(
    sql`INSERT INTO folders (id, owner_id, name, is_default)
        VALUES (${folderId}::uuid, ${userId}::uuid, 'AC-560', false)`,
  )
  return { userId, folderId }
}

async function makeDocument(
  folderId: string,
  userId: string,
): Promise<string> {
  const created = await rows(
    client.db,
    sql`INSERT INTO folder_responsibilities
          (folder_id, member_id, content, content_hash, current_revision_no,
           updated_by)
        VALUES (${folderId}::uuid, ${userId}::uuid,
                ${'{"version":1,"blocks":[]}'}::jsonb, 'hash-560', 1,
                ${userId}::uuid)
        RETURNING id`,
  )
  return String(created[0]?.id)
}

describe('AC-560 the Responsibility record refuses the rows it was written to refuse', () => {
  test('AC-560: a content-bearing entry must carry a revision number and a hash, and one without content must carry neither', async () => {
    const { userId, folderId } = await scaffold()
    const documentId = await makeDocument(folderId, userId)

    // The good rows first, so that a constraint which refused everything
    // could not be mistaken for one that works.
    await client.db.execute(
      sql`INSERT INTO folder_responsibility_history
            (folder_id, member_id, responsibility_id, transition, revision_no,
             content, content_hash, actor_id)
          VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                  'responsibility_created', 1,
                  ${'{"version":1,"blocks":[]}'}::jsonb, 'h', ${userId}::uuid)`,
    )
    await client.db.execute(
      sql`INSERT INTO folder_responsibility_history
            (folder_id, member_id, responsibility_id, transition, revision_no,
             content, content_hash, actor_id)
          VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                  'responsibility_ended', NULL, NULL, NULL, ${userId}::uuid)`,
    )

    /* A revision with no content. This is the row the naive spelling admits:
       `revision_no IS NULL OR content IS NOT NULL` reads fine and is FALSE
       here, but a spelling that compared `revision_no = ...` against a null
       would be UNKNOWN and would let it through. */
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                      'responsibility_updated', 2, NULL, NULL, ${userId}::uuid)`,
        ),
      'folder_responsibility_history_revision_check',
    )

    // Content with no revision number: the same rule from the other side.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                      'responsibility_updated', NULL,
                      ${'{"version":1,"blocks":[]}'}::jsonb, 'h',
                      ${userId}::uuid)`,
        ),
      'folder_responsibility_history_revision_check',
    )

    // Content on a transition that is not a revision. Without this clause a
    // grant toggle could carry a document and be read back as a revision.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                      'self_edit_granted', 3,
                      ${'{"version":1,"blocks":[]}'}::jsonb, 'h',
                      ${userId}::uuid)`,
        ),
      'folder_responsibility_history_revision_check',
    )

    // A revision entry with no document to belong to.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, NULL,
                      'responsibility_created', 1,
                      ${'{"version":1,"blocks":[]}'}::jsonb, 'h',
                      ${userId}::uuid)`,
        ),
      'folder_responsibility_history_document_check',
    )

    // And a transition nobody declared.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                      'responsibility_deleted', NULL, NULL, NULL,
                      ${userId}::uuid)`,
        ),
      'folder_responsibility_history_transition_check',
    )
  })

  test('AC-560: one revision number per document, and one active document per membership', async () => {
    const { userId, folderId } = await scaffold()
    const documentId = await makeDocument(folderId, userId)

    await client.db.execute(
      sql`INSERT INTO folder_responsibility_history
            (folder_id, member_id, responsibility_id, transition, revision_no,
             content, content_hash, actor_id)
          VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                  'responsibility_created', 1,
                  ${'{"version":1,"blocks":[]}'}::jsonb, 'h', ${userId}::uuid)`,
    )
    /* R10's "append-only" needs a number nobody can reuse, or two writers
       racing would both claim revision 2 and the current pointer would name
       whichever won. The index is partial so the standing entries, which have
       no number, do not collide with each other. */
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_responsibility_history
                (folder_id, member_id, responsibility_id, transition,
                 revision_no, content, content_hash, actor_id)
              VALUES (${folderId}::uuid, ${userId}::uuid, ${documentId}::uuid,
                      'responsibility_updated', 1,
                      ${'{"version":1,"blocks":[]}'}::jsonb, 'h2',
                      ${userId}::uuid)`,
        ),
      'folder_responsibility_history_revision_no_idx',
    )

    /* "At most one current Responsibility document per active membership"
       (#230) as a database fact. Ending the first frees the pair, which is
       what makes a rejoin start from nothing rather than from the old row. */
    await expectRejectedBy(
      () => makeDocument(folderId, userId),
      'folder_responsibilities_folder_id_member_id_active_idx',
    )
    await client.db.execute(
      sql`UPDATE folder_responsibilities
             SET ended_at = now(), ended_by = ${userId}::uuid
           WHERE id = ${documentId}::uuid`,
    )
    const second = await makeDocument(folderId, userId)
    expect(
      second,
      'once the first document has ended, the membership may hold a new current one (#209 R10, rejoin)',
    ).not.toBe(documentId)
  })

  test('AC-560: a document ends with both stamps or neither', async () => {
    const { userId, folderId } = await scaffold()
    const documentId = await makeDocument(folderId, userId)
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`UPDATE folder_responsibilities SET ended_at = now()
               WHERE id = ${documentId}::uuid`,
        ),
      'folder_responsibilities_ended_check',
    )
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`UPDATE folder_responsibilities SET ended_by = ${userId}::uuid
               WHERE id = ${documentId}::uuid`,
        ),
      'folder_responsibilities_ended_check',
    )
  })

  test('AC-560: a folderless invite cannot carry initial Responsibility content', async () => {
    const { userId } = await scaffold()
    /* The same both-or-neither shape `invites.access` already carries, and
       for the same reason: a roster invite creates no Folder standing for a
       Responsibility to belong to. */
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO invites (inviter_id, email, folder_id, responsibility)
              VALUES (${userId}::uuid, ${`ac560-${randomUUID()}@ac560.test`},
                      NULL, ${'{"version":1,"blocks":[]}'}::jsonb)`,
        ),
      'invites_responsibility_requires_folder_check',
    )
  })
})

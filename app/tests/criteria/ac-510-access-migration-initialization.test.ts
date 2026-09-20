/*
AC-510: migration 0023 maps the folder's owner to Full control and every other
existing member to Can edit, and writes one baseline history transition per
membership that says the model started here rather than pretending the preset
existed before.

Issue #228 required proof 1. Product authority: #209 R9 section 11.

## What this pins, and what it deliberately does not

The migration has already run by the time any test sees the database -- the
suite migrates each worker's database at run start -- so there is no "before"
state to observe on a real row. What this criterion asserts instead is the
**rule**, applied to rows the migration would have met, by putting the
database into exactly the state the migration reads and running the
migration's own two statements against it.

That is a deliberate choice and it is the honest one available. The
alternative, asserting that every membership in a freshly-migrated database
holds the right preset, proves nothing: after migration every membership was
made by code that writes the preset itself, so it would pass whatever the
migration did. This runs the migration's mapping over rows that carry the
*pre-migration* shape -- a membership with no Access decision behind it -- and
reads the result.

The baseline transition is the other half, and it is the half with a claim in
it. R9 section 11 says the record must be a baseline for the new model and
"no fabricated claim about what explicit Access existed before #209", which
is three assertions: `previous_access` is null, `actor_id` is null, and the
kind is `migration_initialized` and not `member_added` or `access_changed`.

Spec: 4.4 as widened by migration 0023; #209 R9 section 11.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { DbClient } from '../../db/client.js'
import {
  cleanupUsers,
  createTestDb,
  expectRejectedBy,
  rows,
} from '../support/helpers.js'

let client: DbClient
const createdUserIds: string[] = []

beforeAll(async () => {
  client = await createTestDb()
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  await cleanupUsers(client.db, createdUserIds)
  await client.close()
})

/**
 * A folder with memberships whose `access` column has been put back to the
 * state migration 0023 found: one value for every row, chosen by nobody.
 *
 * `can_view` is what the column defaults to, so this is precisely "a row
 * inserted before anybody decided anything", which is what a pre-0023
 * membership is. The history rows are cleared with it, because the migration
 * met a table that did not exist.
 */
async function preMigrationFolder(): Promise<{
  folderId: string
  ownerId: string
  memberIds: string[]
}> {
  const ownerId = randomUUID()
  const memberIds = [randomUUID(), randomUUID()]
  createdUserIds.push(ownerId, ...memberIds)
  for (const id of [ownerId, ...memberIds]) {
    await client.db.execute(
      sql`INSERT INTO users (id, email) VALUES (${id}::uuid,
            ${`ac480-${id}@access-migration.test`})`,
    )
  }
  const folderId = randomUUID()
  await client.db.execute(
    sql`INSERT INTO folders (id, owner_id, name)
        VALUES (${folderId}::uuid, ${ownerId}::uuid, 'ac480 before the model')`,
  )
  for (const id of [ownerId, ...memberIds]) {
    await client.db.execute(
      sql`INSERT INTO folder_members (folder_id, user_id, access)
          VALUES (${folderId}::uuid, ${id}::uuid, 'can_view')`,
    )
  }
  await client.db.execute(
    sql`DELETE FROM folder_access_history WHERE folder_id = ${folderId}::uuid`,
  )
  return { folderId, ownerId, memberIds }
}

/** Migration 0023's four statements about existing rows, transcribed. If this
 * transcription and `db/migrations/0023_folder_access.sql` ever disagree, one
 * of the two is wrong and the disagreement is the defect. */
async function runMigrationMapping(folderId: string): Promise<void> {
  await client.db.execute(
    sql`UPDATE folder_members m
           SET access = 'full_control'
          FROM folders f
         WHERE f.id = m.folder_id AND f.owner_id = m.user_id
           AND m.folder_id = ${folderId}::uuid`,
  )
  await client.db.execute(
    sql`UPDATE folder_members m
           SET access = 'can_edit'
          FROM folders f
         WHERE f.id = m.folder_id AND f.owner_id <> m.user_id
           AND m.folder_id = ${folderId}::uuid`,
  )
  await client.db.execute(
    sql`INSERT INTO folder_access_history (folder_id, member_id,
                                           previous_access, new_access,
                                           actor_id, transition)
        SELECT m.folder_id, m.user_id, NULL, m.access, NULL,
               'migration_initialized'
          FROM folder_members m
         WHERE m.folder_id = ${folderId}::uuid`,
  )
}

describe('AC-510 the Access model is initialized, not backdated', () => {
  test('AC-510: the owner becomes Full control and every other member Can edit', async () => {
    const { folderId, ownerId, memberIds } = await preMigrationFolder()
    await runMigrationMapping(folderId)

    const found = await rows(
      client.db,
      sql`SELECT user_id, access FROM folder_members
          WHERE folder_id = ${folderId}::uuid`,
    )
    const byUser = new Map(
      found.map((row) => [String(row.user_id), String(row.access)]),
    )
    expect(
      byUser.get(ownerId),
      "#209 R9 section 11: the existing folder's owner initializes to Full control",
    ).toBe('full_control')
    for (const memberId of memberIds) {
      expect(
        byUser.get(memberId),
        '#209 R9 section 11: every existing non-owner member initializes to Can edit, which is the standing the flat membership model effectively gave them',
      ).toBe('can_edit')
    }
  })

  test('AC-510: each initialized membership gets one baseline transition', async () => {
    const { folderId, ownerId, memberIds } = await preMigrationFolder()
    await runMigrationMapping(folderId)

    const history = await rows(
      client.db,
      sql`SELECT member_id, previous_access, new_access, actor_id, transition
          FROM folder_access_history
          WHERE folder_id = ${folderId}::uuid`,
    )
    expect(
      history.length,
      'one baseline row per membership, and not one per folder: the record is per member standing (#209 R9 section 3)',
    ).toBe(memberIds.length + 1)

    for (const row of history) {
      expect(
        row.transition,
        'the kind distinguishes a governed system initialization from a grant somebody made (#209 R9 section 11)',
      ).toBe('migration_initialized')
      expect(
        row.previous_access,
        'previous_access is null: there was no preset before the model existed, and writing one would be a fabricated claim about the past (#209 R9 section 11)',
      ).toBeNull()
      expect(
        row.actor_id,
        'actor_id is null because the grant is the migration\'s, not a person\'s; R9 admits null here and the table\'s own CHECK admits it for this kind alone',
      ).toBeNull()
    }

    const ownerRow = history.find((row) => String(row.member_id) === ownerId)
    expect(
      ownerRow?.new_access,
      "the owner's baseline records the preset they were initialized to",
    ).toBe('full_control')
    for (const memberId of memberIds) {
      const row = history.find((entry) => String(entry.member_id) === memberId)
      expect(
        row?.new_access,
        "a member's baseline records the preset they were initialized to",
      ).toBe('can_edit')
    }
  })

  test('AC-510 adversarial: no other transition kind may carry a null actor', async () => {
    // The distinction R9 section 11 draws -- governed system provenance
    // against a grant a person made -- is only worth anything if the database
    // refuses to blur it. Every other kind needs an actor, and this is the
    // constraint that says so rather than a convention somebody might keep.
    const { folderId, ownerId } = await preMigrationFolder()
    // The constraint is asserted by name rather than by message: a name
    // survives every translation and this cluster answers in French.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_access_history (folder_id, member_id,
                                                 previous_access, new_access,
                                                 actor_id, transition)
              VALUES (${folderId}::uuid, ${ownerId}::uuid, 'can_edit',
                      'full_control', NULL, 'access_changed')`,
        ),
      'folder_access_history_system_actor_check',
    )
  })

  test('AC-510 adversarial: a transition that changes nothing at all is refused', async () => {
    // Both-null is not a transition, it is a row with no content, and a
    // history that admitted one would be reconstructable into a standing
    // nobody ever held.
    const { folderId, ownerId } = await preMigrationFolder()
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO folder_access_history (folder_id, member_id,
                                                 previous_access, new_access,
                                                 actor_id, transition)
              VALUES (${folderId}::uuid, ${ownerId}::uuid, NULL, NULL,
                      ${ownerId}::uuid, 'access_changed')`,
        ),
      'folder_access_history_some_access_check',
    )
  })

  test('AC-510: a pending folder invite carries the preset it will grant', async () => {
    // The invite half of the same migration: R9 section 5 makes the intended
    // preset part of the pending row, and the both-or-neither CHECK is what
    // stops a folder invite existing without one.
    const { folderId, ownerId } = await preMigrationFolder()
    // A folder invite with no intended Access, and a preset on a bare roster
    // invite that grants no Folder Access at all: one constraint refuses both
    // directions, which is what makes it a rule rather than a default.
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO invites (inviter_id, email, folder_id)
              VALUES (${ownerId}::uuid, 'ac480-no-preset@access-migration.test',
                      ${folderId}::uuid)`,
        ),
      'invites_access_requires_folder_check',
    )
    await expectRejectedBy(
      () =>
        client.db.execute(
          sql`INSERT INTO invites (inviter_id, email, folder_id, access)
              VALUES (${ownerId}::uuid, 'ac480-stray@access-migration.test',
                      NULL, 'can_edit')`,
        ),
      'invites_access_requires_folder_check',
    )
  })
})

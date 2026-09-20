/*
The page module's own scope, driven directly (issue #35).

Why a unit file rather than a criterion. Until this change `pageView` and
`putPage` took no viewer at all: they were the one place in `src/server/domain`
where authorization lived entirely in the caller, and every other read in this
directory writes the membership check inside the `FROM` clause so that a query
which forgets it returns nothing rather than another person's rows. Every
caller had in fact gated — `routes/workshop.ts` calls `accessOf` before both
folder-page routes and `shelfView` before both shelf-page routes — so nothing
here was ever reachable through the API, and it still is not. That is exactly
why an acceptance criterion cannot assert it: the route refuses the stranger
before the module is called, so a criterion would measure the route's gate and
report the module's. This file calls the module.

What it asserts is one property in two directions. A viewer who cannot see the
page's home reads no blocks and writes none, and a viewer who can is unaffected.
The write half is the load-bearing one: the insert names `home.folderId` as it
was handed over, so a scoped read alone would leave an ungated caller finding no
stored blocks, refusing nothing, and inserting into somebody else's folder.

The trashed-folder case is here because "visible" has one definition and this
proves the module shares it: `accessOf` requires `deleted_at IS NULL`, so a
member of a trashed folder reads its page as empty rather than as theirs.

Spec: 4.17, 4.18, 7.16, 10.2. Related: #74 (nothing structurally checks
authorization), still open, and #107 (putPage accepted a file_id from another
folder), **closed 2026-09-04 and asserted by AC-375 rather than here**, because
that one is reachable through the API and this file exists for the property
that is not. #107's one-line description was a folder page's half of it: a
shelf-homed page has no folder id at all, so "from another folder" does not
name the case and a folder-scoped gate cannot answer it. `putPage` now carries
both clauses and `fileScopeCondition` beside it says which is which.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { pageView, putPage } from './pages.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

let owner = ''
let stranger = ''
let folderId = ''
let trashedFolderId = ''
let shelfId = ''

async function seedUser(label: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name)
        VALUES (${`pages-${label}-${randomUUID()}`},
                ${`${label}-${randomUUID()}@pages-scope.test`},
                ${`Pages ${label}`})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  seededUsers.push(id)
  return id
}

async function seedFolder(ownerId: string, name: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name) VALUES (${ownerId}::uuid, ${name})
        RETURNING id`,
  )
  const id = String(found[0]?.id)
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${id}::uuid, ${ownerId}::uuid, 'full_control')`,
  )
  return id
}

async function seedShelf(ownerId: string, name: string): Promise<string> {
  const found = await rows(
    db,
    sql`INSERT INTO shelves (user_id, name) VALUES (${ownerId}::uuid, ${name})
        RETURNING id`,
  )
  return String(found[0]?.id)
}

const PARAGRAPH = [
  { kind: 'paragraph', position: 0, text: 'the owner wrote this' },
] as const

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
  owner = await seedUser('owner')
  stranger = await seedUser('stranger')
  folderId = await seedFolder(owner, 'a folder with a page')
  trashedFolderId = await seedFolder(owner, 'a folder in the trash')
  shelfId = await seedShelf(owner, `shelf ${randomUUID().slice(0, 8)}`)

  await putPage(db, owner, { folderId, shelfId: null }, [...PARAGRAPH])
  await putPage(db, owner, { folderId: null, shelfId }, [...PARAGRAPH])
  await putPage(
    db,
    owner,
    { folderId: trashedFolderId, shelfId: null },
    [...PARAGRAPH],
  )
  await db.execute(
    sql`UPDATE folders SET deleted_at = now() WHERE id = ${trashedFolderId}::uuid`,
  )
}, 60_000)

afterAll(async () => {
  if ((client as DbClient | undefined) === undefined) return
  for (const id of seededUsers) {
    // 4.13's events name their actor under a RESTRICT foreign key, and every
    // putPage above wrote one, so they go before the rows they point at.
    await db.execute(sql`DELETE FROM events WHERE actor_id = ${id}::uuid`)
    await db.execute(sql`DELETE FROM shelves WHERE user_id = ${id}::uuid`)
  }
  await cleanupUsers(db, seededUsers)
  await client.close()
})

describe('domain/pages scopes both of its statements to the viewer', () => {
  test('the member reads the folder page and the stranger reads nothing', async () => {
    expect(
      (await pageView(db, owner, { folderId, shelfId: null })).blocks.length,
      'the member who wrote the page still reads it',
    ).toBe(1)
    expect(
      (await pageView(db, stranger, { folderId, shelfId: null })).blocks,
      'a non-member reads an empty page rather than the folder\'s blocks: the membership check is in the FROM clause, so forgetting the gate returns nothing rather than somebody else\'s rows',
    ).toEqual([])
  })

  test('the owner reads the shelf page and nobody else does', async () => {
    expect(
      (await pageView(db, owner, { folderId: null, shelfId })).blocks.length,
      '4.18: a shelf is its owner\'s alone, and this is the owner',
    ).toBe(1)
    expect(
      (await pageView(db, stranger, { folderId: null, shelfId })).blocks,
      'and anybody else reads it empty',
    ).toEqual([])
  })

  test('a trashed folder reads empty even to its own member', async () => {
    expect(
      (await pageView(db, owner, { folderId: trashedFolderId, shelfId: null }))
        .blocks,
      'accessOf requires deleted_at IS NULL, and this module answers the same question the routes gate with rather than a second one of its own',
    ).toEqual([])
  })

  test('a stranger\'s write into a folder page is refused and inserts nothing', async () => {
    const outcome = await putPage(db, stranger, { folderId, shelfId: null }, [
      { kind: 'paragraph', position: 0, text: 'planted by a stranger' },
    ])
    expect(
      outcome.kind,
      'the module refuses a home the viewer cannot see rather than trusting its caller to have gated',
    ).toBe('not_found')
    const after = await pageView(db, owner, { folderId, shelfId: null })
    expect(
      after.blocks.map((block) => block.text),
      'and the page the member reads is the one they wrote: an insert names home.folderId as it was handed over, so a scoped read alone would not have stopped this',
    ).toEqual(['the owner wrote this'])
  })

  test('a stranger\'s write into a shelf page is refused and inserts nothing', async () => {
    const outcome = await putPage(db, stranger, { folderId: null, shelfId }, [
      { kind: 'paragraph', position: 0, text: 'planted by a stranger' },
    ])
    expect(outcome.kind, '4.18 again, on the write path').toBe('not_found')
    expect(
      (await pageView(db, owner, { folderId: null, shelfId })).blocks.map(
        (block) => block.text,
      ),
      'and the shelf page is untouched',
    ).toEqual(['the owner wrote this'])
  })

  test('the member\'s own write still lands', async () => {
    const outcome = await putPage(db, owner, { folderId, shelfId: null }, [
      { kind: 'paragraph', position: 0, text: 'the owner wrote this' },
      { kind: 'paragraph', position: 1, text: 'and this' },
    ])
    expect(
      outcome.kind,
      'the scope refuses the stranger and nobody else: this is the case that would fail if the condition were wrong rather than merely present',
    ).toBe('written')
    expect(
      (await pageView(db, owner, { folderId, shelfId: null })).blocks.length,
    ).toBe(2)
  })
})

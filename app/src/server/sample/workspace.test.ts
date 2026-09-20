/*
The sample workspace's membership INSERT, executed.

**Why this file exists: nothing in either vitest leg ran that statement.**
`createSampleWorkspace` is reached from one place, `auth/provisioning.ts`,
behind `options.sample === true`, and `tests/support/vitest-setup.ts` sets
`DANA_SAMPLE_WORKSPACE=off` for the whole suite. So every sign-in in every
acceptance file provisions an account *without* the sample, and the raw
`INSERT INTO folder_members (folder_id, user_id, shelf_name, access)` in
`workspace.ts` was compiled by `tsc`, read by reviewers, and executed by no
test at all. Raw SQL in a template literal is exactly what the type checker
cannot see: a column that does not exist, a column list that no longer matches
its VALUES, or a value written into the wrong column are all well-typed.

That mattered to #247 in particular. Its first release stopped writing
`folder_members.label` on five paths, AC-479 drives three of them over the
wire, and this one was the path its own comment names ("the sample workspace
or the seed") and could not reach. Its second release, migration 0026, dropped
the column, so a `label` left in this statement now answers 42703 **inside
7.1's provisioning transaction** — that is, every new account, at sign-in, in
production, with no test having gone red first. That is no longer a hazard
waiting on a future release: it is what this file executes on every run.

## What this asserts, and what would have to be true for it to pass wrongly

It calls `createSampleWorkspace` directly against the test database for a
freshly seeded user, and then reads the membership rows it wrote:

- one per sample folder, so the statement ran for every one of them;
- `access` set, which is the fourth column of that INSERT and the one #228
  added, so a column list that drifted out of step with its VALUES would put
  a shelf name here and fail;
- `shelf_name` carrying the shelf the content file names for that folder,
  which is the same check from the other side: the third column and the third
  value still belong to each other;
- and `folder_members` carrying no `label` column at all, read from the
  catalog. That bullet said "`label` NULL on every row" while the column
  stood; migration 0026 dropped it, so the fact worth asserting moved from
  the value to the column. It is not dropped from this file, because it is
  what says the statement above is reaching a table of the shape it names.

The counts the call returns are asserted first, so a run in which the sample
wrote nothing at all fails as a setup failure rather than passing four
assertions over an empty set.

## The seed's identical statement, and why there is no second case here

`app/db/seed.ts` carries the same shape of raw INSERT and its own column list.
It is **not callable in isolation** and no test here drives it: `seed()` is one
exported function that truncates every table in the schema before it writes,
builds a database client of its own from `DATABASE_URL` rather than taking an
executor, and refuses outright — by design, with an error naming the hazard —
when `TEST_DATABASE_URL` is set and `DATABASE_URL` is not, which is precisely
the state of a worker process on the Postgres leg. Calling it from a test would
mean emptying this worker's database mid-run, or on the PGlite fallback writing
the repository's `.data` directory, to witness one statement.

**It is not unwitnessed, which is the part worth knowing before anybody writes
that test.** `npm run e2e:app` is `vite build && tsx db/seed.ts && tsx
src/server/index.ts`, and `playwright.config.ts` runs it as the browser leg's
`webServer` on every run with `reuseExistingServer: false`. So step six of the
gate executes `seed.ts` end to end, against PGlite, before a single spec runs —
and a bad column there is not a subtle red, it is a `webServer` that never
becomes healthy and a leg that fails to start. The sample workspace had no such
witness, which is why it is the one that got a test.

Spec: 4.4, 4.18, 7.1, 11.10. Issue #247, #226, #228, and item 60.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { Db, DbClient } from '../../../db/client.js'
import { cleanupUsers, createTestDb, rows } from '../../../tests/support/helpers.js'
import { SAMPLE_WORKSPACE } from './content.js'
import { createSampleWorkspace } from './workspace.js'

let client: DbClient
let db: Db

const seededUsers: string[] = []

beforeAll(async () => {
  client = await createTestDb()
  db = client.db
}, 60_000)

afterAll(async () => {
  if ((db as Db | undefined) === undefined) return
  await cleanupUsers(db, seededUsers)
  await client.close()
})

/**
 * A brand-new account, seeded the way provisioning leaves one just before it
 * reaches the sample: the user row, and the default folder the sample's desk
 * tasks are written into. Nothing else, because nothing else is what the
 * sample is handed.
 */
async function freshAccount(): Promise<string> {
  const made = await rows(
    db,
    sql`INSERT INTO users (google_sub, email, display_name, timezone)
        VALUES (${`sample-${randomUUID()}`},
                ${`sample-${randomUUID()}@sample-workspace.test`},
                ${'Sample Witness'}, ${'UTC'})
        RETURNING id`,
  )
  const userId = String(made[0]?.id)
  seededUsers.push(userId)

  const desk = await rows(
    db,
    sql`INSERT INTO folders (owner_id, name, is_default)
        VALUES (${userId}::uuid, ${'Desk'}, true)
        RETURNING id`,
  )
  await db.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, access)
        VALUES (${String(desk[0]?.id)}::uuid, ${userId}::uuid, 'full_control')`,
  )
  return userId
}

interface MembershipRow {
  name: string
  shelf_name: string | null
  access: string | null
}

/** Every membership the sample's folders gave this account, by folder name. */
async function sampleMemberships(userId: string): Promise<MembershipRow[]> {
  return (await rows(
    db,
    sql`SELECT f.name, m.shelf_name, m.access
          FROM folder_members m
          JOIN folders f ON f.id = m.folder_id
          JOIN sample_objects s ON s.id = f.id AND s.kind = 'folder'
         WHERE m.user_id = ${userId}::uuid AND s.user_id = ${userId}::uuid
         ORDER BY f.name`,
  )) as unknown as MembershipRow[]
}

describe('the sample workspace writes the memberships it claims to', () => {
  test('createSampleWorkspace puts every sample folder on its shelf, with access, and the retired label column is gone', async () => {
    const userId = await freshAccount()

    const counts = await createSampleWorkspace(db, userId, 'UTC')
    expect(
      counts.folders,
      'the sample must have written its folders, or every assertion below is about an empty set',
    ).toBe(SAMPLE_WORKSPACE.folders.length)

    const memberships = await sampleMemberships(userId)
    expect(
      memberships.length,
      'one membership row per sample folder: this is the statement under test having run at all, for each folder it was run for',
    ).toBe(SAMPLE_WORKSPACE.folders.length)

    /* The shelf each folder is meant to be on, from the content file rather
       than from a list written twice. A value landing in the wrong column of
       that four-column INSERT shows up here as a shelf that is null or as
       somebody else's name. */
    const expected = new Map(
      SAMPLE_WORKSPACE.folders.map((folder) => [folder.name, folder.shelf ?? null]),
    )
    expect(
      new Map(memberships.map((row) => [row.name, row.shelf_name])),
      'each sample folder sits on the shelf its content names, which is the third column of that INSERT still matching the third value',
    ).toEqual(expected)

    for (const row of memberships) {
      expect(
        row.access,
        `${row.name} must carry the Access preset the sample grants its own account. It is the fourth column of a hand-written column list, and a list that drifted from its VALUES would put a shelf name or a null here (issue #228, R9)`,
      ).toBe('full_control')
    }

    /* And the retired column is gone rather than merely unwritten. This
       asserted `label` NULL on every row while the column stood, which is
       what proved this write path had stopped reaching it; migration 0026
       dropped it, so the same fact is now the catalog's. Read rather than
       inferred from the SELECT above: a `label` still in that statement would
       throw 42703 and take this file red with an error nobody asked for,
       which says the same thing far less legibly (11.5, issue #247). */
    const columns = (await rows(
      db,
      sql`SELECT column_name FROM information_schema.columns
           WHERE table_name = 'folder_members'
           ORDER BY column_name`,
    )) as unknown as { column_name: string }[]
    expect(
      columns.map((column) => column.column_name),
      'folder_members must carry no `label` column: migration 0026 dropped it, and a catalog still holding it would mean that migration never ran — which is what a journal `when` below an already-applied one does, silently and permanently',
    ).not.toContain('label')
  })
})

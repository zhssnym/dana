/*
Harness for the P2 folder and membership criteria (AC-011 to AC-024), built
on the P1 auth harness: the same booted application, stub identity provider,
and cookie-jar browsers, plus what this package needs on top.

Three decisions worth the words:

**Setup goes through the API wherever the API is in this package.** Folders
are created with POST /folders and members added with POST members, because
those surfaces are P2's own: a broken create fails every file here on one
attributable sentence, which is the correct verdict for the package. Setup
that the package does not deliver (roster connections arrive with P5's
invites, tasks with P3, and the invite rows themselves with P5) is seeded
directly in the database instead, so no criterion here depends on a package
that has not been built.

**Memberships are seeded directly only where the spec turns on join time.**
AC-019's transfer rule reads folder_members.created_at, ties included, and
an API cannot be asked to produce two equal timestamps; those rows are
inserted with explicit instants. Everywhere else membership arrives through
the endpoint under test.

**Database assertions are scoped to this suite's own rows.** On the
TEST_DATABASE_URL leg every worker shares one database (helpers.ts), so the
invariant checks here take explicit folder and user ids and never sweep
whole tables.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { expect } from 'vitest'

import type { Db } from '../../db/client.js'
import {
  cleanupAuthSubs,
  cleanupAuthUsers,
  signIn,
  userForSub,
} from './auth-harness.js'
import type { AuthTestApp, UserRow } from './auth-harness.js'
import type { RawResponse, TestBrowser } from './http-client.js'
import { rows } from './helpers.js'

/* ------------------------------------------------------------------ *
 * Actors: signed-in users with their browsers
 * ------------------------------------------------------------------ */

export interface Actor {
  sub: string
  email: string
  id: string
  browser: TestBrowser
}

/** The package prefix only names rows: on the TEST_DATABASE_URL leg every
 * worker shares one database, so a stray row should say which package left
 * it. Defaulted so the P2 files that predate the parameter read unchanged. */
export async function signInActor(
  app: AuthTestApp,
  slug: string,
  prefix = 'p2',
): Promise<Actor> {
  const sub = `${prefix}-${slug}-${randomUUID()}`
  const email = `${slug}-${randomUUID()}@${prefix}-folders.test`
  app.stub.nextIdentity({
    sub,
    email,
    email_verified: true,
    name: `${prefix.toUpperCase()} ${slug}`,
  })
  const { browser } = await signIn(app)
  const row = await userForSub(app.db, sub)
  expect(
    row,
    `sign-in must provision a user row for ${slug} (spec 7.1; P1 is merged, so this is expected to hold)`,
  ).toBeDefined()
  return { sub, email, id: (row as UserRow).id, browser }
}

/*
Lazily signed-in actors, the P1 holder() pattern generalized. A failure in
beforeAll reports the whole file as one error and marks its tests skipped,
hiding which criteria were being asserted; signing in on first use makes
each test fail under its own name instead.
*/
export class Cast {
  private actors: Actor[] | undefined
  private readonly seededUserIds: string[] = []

  constructor(
    private readonly slugs: readonly string[],
    private readonly prefix = 'p2',
  ) {}

  async of(app: AuthTestApp): Promise<Actor[]> {
    if (this.actors === undefined) {
      const created: Actor[] = []
      for (const slug of this.slugs) {
        created.push(await signInActor(app, slug, this.prefix))
      }
      this.actors = created
    }
    return this.actors
  }

  /** Registers a directly-seeded user for cleanup beside the signed-in ones. */
  trackUser(id: string): void {
    this.seededUserIds.push(id)
  }

  async cleanup(db: Db): Promise<void> {
    if (this.actors !== undefined) {
      await cleanupAuthSubs(
        db,
        this.actors.map((actor) => actor.sub),
      )
    }
    await cleanupAuthUsers(db, this.seededUserIds)
  }
}

/* ------------------------------------------------------------------ *
 * Uniform status assertion
 * ------------------------------------------------------------------ */

function bodySnippet(response: RawResponse): string {
  const text = response.body.replace(/\s+/g, ' ').trim()
  return text.length > 160 ? `${text.slice(0, 160)}...` : text
}

/** Failure messages carry the status and body, because before the package
 * lands every folder route answers 404 and the sentence must say so. */
export function expectStatus(
  response: RawResponse,
  expected: number,
  why: string,
): void {
  expect(
    response.status,
    `${why}; answered ${String(response.status)} with body: ${bodySnippet(response)}`,
  ).toBe(expected)
}

/* ------------------------------------------------------------------ *
 * Setup through the package's own API
 * ------------------------------------------------------------------ */

/** POST /folders, asserted: 7.4 answers 201 with the Folder object. */
/** POST /folders, unjudged: the transport AC-124's raced pair needs, where
 * one of the two creates is refused and the other is not. */
export function postFolder(actor: Actor, name: string): Promise<RawResponse> {
  return actor.browser.json('/folders', 'POST', { name })
}

export async function createFolder(
  actor: Actor,
  name: string,
): Promise<string> {
  const response = await postFolder(actor, name)
  expectStatus(
    response,
    201,
    `POST /folders must create ${JSON.stringify(name)} and answer 201 with the Folder object (spec 7.4)`,
  )
  const body = response.json() as { id?: unknown }
  expect(
    typeof body.id,
    'the 201 body must be the Folder object, which opens with its id (spec 7.0)',
  ).toBe('string')
  return body.id as string
}

export function addMember(
  actor: Actor,
  folderId: string,
  targetUserId: string,
): Promise<RawResponse> {
  return actor.browser.json(`/folders/${folderId}/members`, 'POST', {
    user_id: targetUserId,
  })
}

/** POST members, asserted, for setup where the add itself is not the case. */
export async function addMemberOk(
  actor: Actor,
  folderId: string,
  targetUserId: string,
): Promise<void> {
  const response = await addMember(actor, folderId, targetUserId)
  expectStatus(
    response,
    201,
    'POST /folders/:id/members must admit a connected target and answer 201 (spec 7.4, 5.3)',
  )
}

export function removeMember(
  actor: Actor,
  folderId: string,
  targetUserId: string,
): Promise<RawResponse> {
  return actor.browser.api(`/folders/${folderId}/members/${targetUserId}`, {
    method: 'DELETE',
  })
}

/* ------------------------------------------------------------------ *
 * Setup that later packages will own, seeded directly
 * ------------------------------------------------------------------ */

/** Roster connections are P5's surface (invites); P2 only reads them. The
 * canonical column order is INV-9's, delegated to SQL rather than restated. */
export async function connect(db: Db, a: string, b: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO connections (user_a_id, user_b_id)
    VALUES (least(${a}::uuid, ${b}::uuid), greatest(${a}::uuid, ${b}::uuid))
    ON CONFLICT DO NOTHING
  `)
}

/** A membership row with a chosen join instant, for AC-019's transfer order.
 * Everything else adds members through the endpoint instead. */
export async function seedMembership(
  db: Db,
  folderId: string,
  userId: string,
  options: { createdAt?: string } = {},
): Promise<void> {
  if (options.createdAt !== undefined) {
    await db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id, created_at)
      VALUES (${folderId}, ${userId}, ${options.createdAt}::timestamptz)
    `)
  } else {
    await db.execute(sql`
      INSERT INTO folder_members (folder_id, user_id)
      VALUES (${folderId}, ${userId})
    `)
  }
}

/*
A user row without a sign-in, for cases that need bodies rather than
sessions (the 25-member cap). Deliberately minimal: no settings row and no
default folder, which provisioning would add, because the add-member guard
under test reads neither. Register with Cast.trackUser for cleanup.
*/
export async function seedUser(db: Db, slug: string): Promise<string> {
  const found = await rows(
    db,
    sql`
      INSERT INTO users (google_sub, email, display_name)
      VALUES (${`p2-seed-${slug}-${randomUUID()}`},
              ${`${slug}-${randomUUID()}@p2-folders.test`},
              ${`Seeded ${slug}`})
      RETURNING id
    `,
  )
  return String(found[0]?.id)
}

export interface SeedTaskOptions {
  folderId: string
  createdBy: string
  title?: string
  status?: 'pending' | 'completed' | 'abandoned'
  important?: boolean
  assigneeId?: string | null
  dueDate?: string | null
  dueTime?: string | null
}

/** Tasks are P3's surface; P2's transactions act on their rows. INV-8's
 * completion columns follow the status so seeds satisfy section 4. */
export async function seedTask(
  db: Db,
  options: SeedTaskOptions,
): Promise<string> {
  const id = randomUUID()
  const completed = options.status === 'completed'
  await db.execute(sql`
    INSERT INTO tasks (id, folder_id, title, status, important, due_date,
                       due_time, assignee_id, created_by, completed_at,
                       completed_by)
    VALUES (${id}::uuid, ${options.folderId}::uuid,
            ${options.title ?? `p2 task ${id.slice(0, 8)}`},
            ${options.status ?? 'pending'}, ${options.important ?? false},
            ${options.dueDate ?? null}::date, ${options.dueTime ?? null}::time,
            ${options.assigneeId ?? null}::uuid, ${options.createdBy}::uuid,
            ${completed ? new Date().toISOString() : null}::timestamptz,
            ${completed ? options.createdBy : null}::uuid)
  `)
  return id
}

export async function seedStep(
  db: Db,
  taskId: string,
  position: number,
): Promise<string> {
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO steps (id, task_id, title, position)
    VALUES (${id}::uuid, ${taskId}::uuid, ${`p2 step ${String(position)}`}, ${position})
  `)
  return id
}

export async function seedMyDayEntry(
  db: Db,
  taskId: string,
  userId: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO my_day_entries (task_id, user_id, added_on)
    VALUES (${taskId}::uuid, ${userId}::uuid, CURRENT_DATE)
  `)
}

/** One reminder per task (4.8). Date-only mode by default; fire_at is any
 * future instant, since only the row's existence matters to P2's cascades. */
export async function seedReminder(
  db: Db,
  taskId: string,
  createdBy: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO reminders (task_id, time_of_day, fire_at, created_by)
    VALUES (${taskId}::uuid, ${'09:00'}::time,
            ${new Date(Date.now() + 86_400_000).toISOString()}::timestamptz,
            ${createdBy}::uuid)
  `)
}

export interface SeedInviteOptions {
  inviterId: string
  email?: string
  folderId?: string | null
  taskId?: string | null
  status?: string
}

/** Invite rows are P5's surface; P2's folder deletion cascades them and
 * R-CLEAN leaves them standing. */
export async function seedInvite(
  db: Db,
  options: SeedInviteOptions,
): Promise<string> {
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO invites (id, inviter_id, email, folder_id, task_id, status)
    VALUES (${id}::uuid, ${options.inviterId}::uuid,
            ${options.email ?? `invitee-${randomUUID()}@p2-folders.test`},
            ${options.folderId ?? null}::uuid, ${options.taskId ?? null}::uuid,
            ${options.status ?? 'pending'})
  `)
  return id
}

/* ------------------------------------------------------------------ *
 * Reading the folder surface
 * ------------------------------------------------------------------ */

export interface FolderListEntry extends Record<string, unknown> {
  id: string
  name: string
  is_default: boolean
}

/*
Settled at 04's shape review and ruled into frozen 7.4 by the human owner
(grounds in src/shared/folders.ts, commit 7a40172; the Steward transcribes
the sentence at the merge): GET /folders answers the bare array, because
7.10's wrapped responses are the ones carrying more than rows. The
single-wrapper-key tolerance this helper held while the shape was open is
gone with the openness; a wrapper is a contract violation now and fails
here, once, with the ruling named.
*/
export async function listFolders(actor: Actor): Promise<FolderListEntry[]> {
  const response = await actor.browser.api('/folders')
  expectStatus(
    response,
    200,
    'GET /folders must answer the accessible folders (spec 7.4)',
  )
  const body = response.json()
  expect(
    Array.isArray(body),
    'GET /folders answers the bare array of Folder objects (7.4 as ruled at the shape review)',
  ).toBe(true)
  return body as FolderListEntry[]
}

export async function folderInList(
  actor: Actor,
  folderId: string,
): Promise<FolderListEntry | undefined> {
  const list = await listFolders(actor)
  return list.find((entry) => entry.id === folderId)
}

export async function defaultFolderOf(db: Db, userId: string): Promise<string> {
  const found = await rows(
    db,
    sql`SELECT id FROM folders WHERE owner_id = ${userId} AND is_default`,
  )
  expect(
    found.length,
    'provisioning must have created exactly one default folder (INV-2; P1 is merged)',
  ).toBe(1)
  return String(found[0]?.id)
}

/* ------------------------------------------------------------------ *
 * Database truth, scoped to this suite's rows
 * ------------------------------------------------------------------ */

export async function membershipUserIds(
  db: Db,
  folderId: string,
): Promise<string[]> {
  const found = await rows(
    db,
    sql`SELECT user_id FROM folder_members WHERE folder_id = ${folderId} ORDER BY user_id`,
  )
  return found.map((row) => String(row.user_id))
}

export async function taskAssignee(
  db: Db,
  taskId: string,
): Promise<string | null | undefined> {
  const found = await rows(
    db,
    sql`SELECT assignee_id FROM tasks WHERE id = ${taskId}`,
  )
  const first = found[0]
  if (first === undefined) return undefined
  return first.assignee_id === null ? null : String(first.assignee_id)
}

/*
The count contract, asserted rather than trusted since the P6 implementer
review. This helper reads one column named n from one row, and every caller
writes count(*)::int AS n. A query that answers anything else used to produce
NaN: not zero, not an error, but a value that compares equal to itself under
Object.is, which toBe uses. Three P6 call sites passed SELECT id instead. One
met .toBe(0) and failed visibly; the other two compared a count before an
operation against the count after, NaN on both sides, so "a refused create
writes no task at all" passed while asserting nothing whatever. That is the
vacuous green this role exists to prevent, and it is worse than the red beside
it because nothing reports it.

The call sites are repaired. This guard is what makes the next one fail
loudly, and it changes nothing for a correct caller: count(*) answers exactly
one row even when it counts to zero, so every existing caller satisfies it.
*/
export async function countRows(db: Db, query: ReturnType<typeof sql>): Promise<number> {
  const found = await rows(db, query)
  const first = found[0]
  expect(
    first !== undefined && first.n !== undefined && first.n !== null,
    `countRows needs a query answering one row with one column named n, as in count(*)::int AS n. This is a harness misuse rather than a finding about the application; got ${JSON.stringify(found[0] ?? null)}`,
  ).toBe(true)
  const value = Number((first as Record<string, unknown>).n)
  expect(
    Number.isFinite(value),
    `countRows read a non-numeric n (${JSON.stringify((first as Record<string, unknown>).n)}); a NaN compares equal to itself and would make the assertion reading it vacuous`,
  ).toBe(true)
  return value
}

/*
The invariant sweep the persona requires after mutation-heavy tests, scoped
to named rows. Deleted folders are skipped: the deleting test asserts the
cascade itself, and section 3 speaks of rows that exist.
*/
export async function expectFolderInvariants(
  db: Db,
  folderIds: readonly string[],
  userIds: readonly string[],
): Promise<void> {
  for (const folderId of folderIds) {
    const folder = (
      await rows(
        db,
        sql`SELECT owner_id, is_default FROM folders WHERE id = ${folderId}`,
      )
    )[0]
    if (folder === undefined) continue
    const ownerId = String(folder.owner_id)
    const memberIds = await membershipUserIds(db, folderId)

    expect(
      memberIds,
      `INV-10: the owner of folder ${folderId} must hold a membership row`,
    ).toContain(ownerId)

    if (folder.is_default === true) {
      expect(
        memberIds,
        `INV-3: default folder ${folderId} must have exactly its owner's membership`,
      ).toEqual([ownerId])
    }

    const unassignedToMembers = await rows(
      db,
      sql`
        SELECT t.id FROM tasks t
        LEFT JOIN folder_members fm
          ON fm.folder_id = t.folder_id AND fm.user_id = t.assignee_id
        WHERE t.folder_id = ${folderId}
          AND t.assignee_id IS NOT NULL
          AND fm.user_id IS NULL
      `,
    )
    expect(
      unassignedToMembers,
      `INV-4: every assigned task in folder ${folderId} must point at a member`,
    ).toEqual([])

    const only = memberIds.length === 1 ? memberIds[0] : undefined
    if (only !== undefined) {
      const strays = await rows(
        db,
        sql`
          SELECT id FROM tasks
          WHERE folder_id = ${folderId}
            AND (assignee_id IS NULL OR assignee_id <> ${only})
        `,
      )
      expect(
        strays,
        `INV-5: folder ${folderId} has exactly one member, so every task in it must be assigned to that member`,
      ).toEqual([])
    }
  }

  for (const userId of userIds) {
    const defaults = await countRows(
      db,
      sql`
        SELECT count(*)::int AS n FROM folders f
        WHERE f.owner_id = ${userId} AND f.is_default
          AND EXISTS (SELECT 1 FROM users u
                      WHERE u.id = ${userId} AND u.deleted_at IS NULL)
      `,
    )
    expect(
      defaults,
      `INV-2: user ${userId} must have exactly one default folder`,
    ).toBe(1)
  }
}

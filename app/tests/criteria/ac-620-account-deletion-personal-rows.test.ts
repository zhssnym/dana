/*
AC-620, AC-621 and AC-622: the 8.10 step 6c sweep, its scope, and the one
row it deliberately leaves standing.

**Why these criteria exist rather than a schema reading.** Fourteen foreign
keys in section 4's schema point at `users(id)` with `ON DELETE CASCADE`, and
10.1's `sessions` is a fifteenth outside it. Every one of them is inert for
account deletion, because 8.10 step 7 scrubs the `users` row rather than
deleting it and a cascade hangs off a `DELETE`. Issue #253 is that nine of
the fifteen were therefore keeping a departed account's rows indefinitely:
their shelves by name, their saved Views with the criteria they wrote, their
preferences, their notification history, their page dressing, their sample
bookkeeping, their likes and their Personal Labels. Nothing failed, nothing
logged, and the schema read as though it were handled.

**`labels` is the ninth and it was added at the rebase rather than by the
branch author**, which is worth saying because it is a behaviour change
inside a rebase: issue #226 landed 4.24's Label model on `main` while this
branch waited, `labels_owner_user_id_fkey` is one of the fourteen, and
`db/migrations/0022_labels.sql` claims beside that constraint that "A
person's Personal Labels go with their account (8.10)". They did not. The
guard went red on it in both directions, which is the whole reason the guard
reads the schema rather than a list.

**AC-621 is the half that is easy to leave out and is the reason this file is
shaped as a pair.** #227 shipped the same class of fix, and a reviewer found
that replacing its `WHERE owner_user_id = <user>` with a bare
`WHERE scope = 'personal'` — which wipes every account's rows product-wide —
left the whole suite green. So every probe below is run twice over an
identical fixture, once for the account being deleted and once for a
bystander who is merely nearby, and the second read is what a sweep that lost
its `WHERE` fails. The two accounts' rows are seeded by one function taking a
user id, so "identical" is a property of the fixture rather than a claim in a
comment.

**AC-622 is the retention, asserted rather than assumed.** 8.10 keeps
`page_document_receipts` on purpose: the rows carry no text, and a folder's
receipts are read as the mark that its document is on #184's transaction
path, so taking a departed member's off a folder other people still edit
would change that folder's behaviour for them. What makes the retention
bounded rather than a leak is the other key on the table — `folder_id` is a
cascade off a real `DELETE`, so step 3 takes the receipts of every folder
that dies with the account — and both halves are asserted here.

**Rows are seeded rather than driven through their own endpoints, with two
exceptions.** The subject is what deletion removes; the create surfaces have
criteria of their own, and a seeded fixture is the only way to make the
departing and the bystanding rows provably the same shape, which is AC-621's
whole content. AC-138 is the standing precedent for seeding a fixture row
this way. The two exceptions are the comment and its two likes, which go
through 7.14 because a like is one call and because `comment_likes` is the
one table here whose deletion is visible to somebody else — the count on a
surviving comment.

Spec: 8.10 steps 6c and 7 as amended 2026-09-20, 4.10, 4.14, 4.15, 4.18,
4.19, 4.20, 4.21, 4.22, 10.1; issue #253.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { startAuthTestApp } from '../support/auth-harness.js'
import type { AuthTestApp } from '../support/auth-harness.js'
import {
  Cast,
  addMemberOk,
  connect,
  createFolder,
  expectStatus,
  seedTask,
} from '../support/folders-harness.js'
import type { Actor } from '../support/folders-harness.js'
import { deleteAccount, userRowById } from '../support/sharing-harness.js'
import { rows } from '../support/helpers.js'

let app: AuthTestApp
const cast = new Cast(['departing', 'bystander'], 'ac620')

interface Stage {
  departing: Actor
  bystander: Actor
  /** Owned by the bystander, the departing account a member: it outlives the
   * deletion, which is what makes every survivor assertion meaningful. */
  sharedFolder: string
  /** Owned by the departing account alone, so step 3 deletes it outright. */
  soloFolder: string
  commentId: string
  eventId: string
  shelfOf: Record<string, string>
  viewOf: Record<string, string>
  /** A task in the surviving folder, carrying one Personal Label from each
   * person and the Folder Label below. */
  taskId: string
  /** Each person's own Personal Label (4.24, scope 'personal'). */
  labelOf: Record<string, string>
  /** A Folder Label on the surviving folder. It is owned by no user —
   * owner_user_id is NULL on it — and is the row that tells a sweep scoped
   * by owner_user_id from one that took the whole table. */
  folderLabel: string
  receiptOf: Record<string, string>
  /** The receipt the departing account left in the folder that dies with it. */
  soloReceipt: string
}
let staged: Stage | undefined

/*
One person's whole personal footprint, seeded identically for the account
being deleted and for the bystander. Every row here hangs off a foreign key
declared `REFERENCES users(id) ON DELETE CASCADE`, which is exactly the
promise 8.10 step 7 cannot keep.
*/
async function seedPersonalRows(
  userId: string,
  label: string,
  taskId: string,
): Promise<{ shelfId: string; viewId: string; labelId: string }> {
  const shelf = await rows(
    app.db,
    sql`INSERT INTO shelves (user_id, name, description)
        VALUES (${userId}::uuid, ${`ac620 ${label} shelf`},
                ${`what ${label} wrote about this shelf`})
        RETURNING id`,
  )
  const shelfId = String(shelf[0]?.id)
  const view = await rows(
    app.db,
    sql`INSERT INTO user_views (user_id, name, definition, pinned)
        VALUES (${userId}::uuid, ${`ac620 ${label} view`},
                ${JSON.stringify({ status: 'pending' })}::jsonb, true)
        RETURNING id`,
  )
  const viewId = String(view[0]?.id)
  // Provisioning already made this row (4.19), so the preference is written
  // rather than inserted: what must not survive is the value, not the shape.
  await app.db.execute(
    sql`UPDATE user_settings SET theme = ${label === 'departing' ? 'dark' : 'light'}
         WHERE user_id = ${userId}::uuid`,
  )
  await app.db.execute(
    sql`INSERT INTO user_page_covers (user_id, place, preset, focal_y)
        VALUES (${userId}::uuid, 'today', ${`ac620-${label}`}, 40)`,
  )
  await app.db.execute(
    sql`INSERT INTO user_page_descriptions (user_id, place, description)
        VALUES (${userId}::uuid, 'today',
                ${`${label} wrote this about their own Today page`})`,
  )
  await app.db.execute(
    sql`INSERT INTO sample_objects (user_id, kind, id)
        VALUES (${userId}::uuid, 'shelf', ${shelfId}::uuid)`,
  )
  /*
  4.24's Personal Label, added when this branch rebased onto issue #226.
  `labels_owner_user_id_fkey` is a fourteenth inert cascade in section 4 and
  0022_labels.sql's comment claimed these rows "go with their account
  (8.10)"; they did not, and step 6c is what makes that sentence true. The
  assignment row beside it is the second half of the claim: it hangs off
  labels(id, owner_user_id) ON DELETE CASCADE, which is a cascade off a real
  DELETE and therefore one that does fire.
  */
  const personalLabel = await rows(
    app.db,
    sql`INSERT INTO labels (scope, owner_user_id, name, color, description)
        VALUES ('personal', ${userId}::uuid, ${`ac620 ${label} label`},
                ${label === 'departing' ? '#AA1122' : '#22AA11'},
                ${`what ${label} wrote about this label`})
        RETURNING id`,
  )
  const labelId = String(personalLabel[0]?.id)
  await app.db.execute(
    sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
        VALUES (${taskId}::uuid, ${labelId}::uuid, ${userId}::uuid)`,
  )
  return { shelfId, viewId, labelId }
}

async function stage(): Promise<Stage> {
  if (staged !== undefined) return staged
  const [departing, bystander] = await cast.of(app)
  if (departing === undefined || bystander === undefined) {
    throw new Error('cast must produce two actors')
  }
  await connect(app.db, bystander.id, departing.id)
  const sharedFolder = await createFolder(bystander, 'ac620 shared, outlives')
  await addMemberOk(bystander, sharedFolder, departing.id)
  const soloFolder = await createFolder(departing, 'ac620 solo, dies at step 3')

  // 7.14's own surfaces: the bystander writes a comment in the folder they
  // own, and both people like it. The comment survives the deletion
  // (comments_author_id_fkey is RESTRICT and its folder is the bystander's),
  // so the like count afterwards is what a remaining member actually sees.
  const posted = await bystander.browser.json(
    `/folders/${sharedFolder}/comments`,
    'POST',
    { body: 'ac620: a comment two people liked' },
  )
  expectStatus(posted, 201, 'POST /folders/:id/comments must answer 201 (spec 7.14)')
  const commentId = String((posted.json() as { id?: unknown }).id)
  for (const actor of [departing, bystander]) {
    expectStatus(
      await actor.browser.api(`/comments/${commentId}/like`, { method: 'PUT' }),
      204,
      'PUT /comments/:id/like must answer 204 (spec 7.14)',
    )
  }

  // One event in the surviving folder, with a notification copy for each
  // person: 4.14's row is one recipient's own, so two rows on one event is
  // the shape that tells a scoped delete from an unscoped one.
  const event = await rows(
    app.db,
    sql`INSERT INTO events (actor_id, verb, subject_kind, subject_id,
                            subject_name, folder_id)
        VALUES (${bystander.id}::uuid, 'created', 'folder',
                ${sharedFolder}::uuid, 'ac620 shared, outlives',
                ${sharedFolder}::uuid)
        RETURNING id`,
  )
  const eventId = String(event[0]?.id)

  // One task in the folder that outlives the deletion, and one Folder Label
  // on that folder. The Folder Label's owner_user_id is NULL: it belongs to
  // the folder and to every member, so it must survive a member's departure.
  const taskId = await seedTask(app.db, {
    folderId: sharedFolder,
    createdBy: bystander.id,
    title: 'ac620 task carrying labels',
  })
  const folderLabelRow = await rows(
    app.db,
    sql`INSERT INTO labels (scope, folder_id, name, color)
        VALUES ('folder', ${sharedFolder}::uuid, 'ac620 folder label', '#123456')
        RETURNING id`,
  )
  const folderLabel = String(folderLabelRow[0]?.id)
  await app.db.execute(
    sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
        VALUES (${sharedFolder}::uuid, ${taskId}::uuid, ${folderLabel}::uuid)`,
  )

  const shelfOf: Record<string, string> = {}
  const viewOf: Record<string, string> = {}
  const labelOf: Record<string, string> = {}
  for (const [label, actor] of [
    ['departing', departing],
    ['bystander', bystander],
  ] as const) {
    await app.db.execute(
      sql`INSERT INTO notifications (user_id, event_id)
          VALUES (${actor.id}::uuid, ${eventId}::uuid)`,
    )
    const seeded = await seedPersonalRows(actor.id, label, taskId)
    shelfOf[label] = seeded.shelfId
    viewOf[label] = seeded.viewId
    labelOf[label] = seeded.labelId
  }

  // 8.10's one deliberate retention, both halves. Each person leaves a
  // receipt on the folder that outlives the deletion; the departing account
  // leaves a third on the folder that dies with it.
  const receiptOf: Record<string, string> = {}
  for (const [label, actor] of [
    ['departing', departing],
    ['bystander', bystander],
  ] as const) {
    const mutationId = randomUUID()
    receiptOf[label] = mutationId
    await app.db.execute(
      sql`INSERT INTO page_document_receipts
            (actor_id, folder_id, mutation_id, payload_hash,
             committed_revision, created_task_ids)
          VALUES (${actor.id}::uuid, ${sharedFolder}::uuid,
                  ${mutationId}::uuid, ${`hash-${label}`},
                  ${`revision-${label}`}, '[]'::jsonb)`,
    )
  }
  const soloReceipt = randomUUID()
  await app.db.execute(
    sql`INSERT INTO page_document_receipts
          (actor_id, folder_id, mutation_id, payload_hash,
           committed_revision, created_task_ids)
        VALUES (${departing.id}::uuid, ${soloFolder}::uuid,
                ${soloReceipt}::uuid, 'hash-solo', 'revision-solo',
                '[]'::jsonb)`,
  )

  expectStatus(
    await deleteAccount(departing),
    204,
    'DELETE /me with the literal confirm string answers 204 (spec 7.1)',
  )
  staged = {
    departing,
    bystander,
    sharedFolder,
    soloFolder,
    commentId,
    eventId,
    shelfOf,
    viewOf,
    taskId,
    labelOf,
    folderLabel,
    receiptOf,
    soloReceipt,
  }
  return staged
}

/*
The nine tables 8.10 step 6c names, each with the column that ties a row to
one account. Written out rather than derived from the schema on purpose: this
is the acceptance side of the contract, and a list computed from the same
place the implementation reads would agree with a wrong implementation.
`app/tests/guards/guard-account-deletion-sweep.test.ts` is the other
direction, and holds the schema and the implementation's own declaration
equal.
*/
const SWEPT_TABLES = [
  'comment_likes',
  'labels',
  'notifications',
  'sample_objects',
  'shelves',
  'user_page_covers',
  'user_page_descriptions',
  'user_settings',
  'user_views',
] as const

/*
The column that ties a row to one account, where it is not `user_id`.
`labels` is the only one: 4.24 calls it `owner_user_id` because the same
table holds Folder Labels, whose owner is NULL, and the sweep must reach the
personal catalog without touching the shared one.
*/
const SCOPE_COLUMN: Record<string, string> = { labels: 'owner_user_id' }

async function rowCount(table: string, userId: string): Promise<number> {
  const column = SCOPE_COLUMN[table] ?? 'user_id'
  const found = await rows(
    app.db,
    sql`SELECT count(*)::int AS n FROM ${sql.raw(table)}
         WHERE ${sql.raw(column)} = ${userId}::uuid`,
  )
  return Number(found[0]?.n ?? 0)
}

/*
All nine counts read at once and compared as one object, rather than nine
assertions in a loop. A loop stops at its first failure, so a sweep missing
eight tables would report the first alphabetically and say nothing about the
other seven until somebody fixed that one and ran it again. The object form
names every table that is wrong in a single red.
*/
async function sweptCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of SWEPT_TABLES) counts[table] = await rowCount(table, userId)
  return counts
}

const ALL_EMPTY: Record<string, number> = Object.fromEntries(
  SWEPT_TABLES.map((table) => [table, 0]),
)

beforeAll(async () => {
  app = await startAuthTestApp()
}, 60_000)

afterAll(async () => {
  if ((app as AuthTestApp | undefined) === undefined) return
  await cast.cleanup(app.db)
  await app.close()
})

describe('AC-620: the scrub leaves no personal row behind', () => {
  test('AC-620: the fixture was real before the deletion', async () => {
    const { bystander } = await stage()
    // The bystander's half of the same fixture is read here as the premise
    // of every "gone" assertion below: nine tables, each holding a row for
    // a person, seeded by the one function that seeded the departing
    // account's. A zero here would make the file pass while proving nothing.
    expect(
      await sweptCounts(bystander.id),
      'every table step 6c names must hold a row for the bystander, or AC-620\'s "gone" assertions measure an empty table',
    ).toEqual(Object.fromEntries(SWEPT_TABLES.map((table) => [table, 1])))
  })

  test('AC-620: every table step 6c names holds nothing for the account', async () => {
    const { departing } = await stage()
    expect(
      await sweptCounts(departing.id),
      'each of these tables ties its rows to an account by a column declared ON DELETE CASCADE REFERENCES users(id), and 8.10 step 7 scrubs the users row rather than deleting it, so nothing but step 6c\'s own statements removes any of them (spec 8.10; issue #253)',
    ).toEqual(ALL_EMPTY)
  })

  test('AC-620: the Personal Label assignments go with the label', async () => {
    const { departing, labelOf } = await stage()
    // The half a disposal entry cannot assert by itself. Step 6c deletes the
    // labels row, and task_personal_labels keys onto labels(id,
    // owner_user_id) ON DELETE CASCADE — a cascade off a real DELETE, so
    // unlike the one on users(id) it fires. If it did not, the assignment
    // would be a dangling classification of a live task by a label that no
    // longer exists.
    const assignments = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM task_personal_labels
           WHERE owner_user_id = ${departing.id}::uuid
              OR label_id = ${labelOf.departing}::uuid`,
    )
    expect(
      Number(assignments[0]?.n ?? 0),
      "the departed account's Personal Label assignments are gone with the label itself (spec 4.25): task_personal_labels hangs off labels(id, owner_user_id), which is a cascade off a real DELETE and does fire, unlike the one on users(id) that issue #253 is about",
    ).toBe(0)
  })

  test('AC-620: the row the deletion is built around is still scrubbed', async () => {
    const { departing } = await stage()
    const row = await userRowById(app.db, departing.id)
    expect(
      row,
      'the premise 6c exists for: step 7 keeps the users row, which is why no cascade off it fires (spec 8.10 step 7, 4.1)',
    ).toBeDefined()
    expect(row?.email, 'and scrubs it').toBeNull()
    expect(row?.deleted_at, 'with deleted_at set').not.toBeNull()
  })
})

describe('AC-621: the sweep reaches one account and no other', () => {
  test('AC-621: the bystander keeps a row in all nine tables', async () => {
    const { bystander } = await stage()
    expect(
      await sweptCounts(bystander.id),
      "the bystander still holds one row in each: a sweep that lost its WHERE, or scoped itself by anything other than the account, wipes every account in the instance and passes every single-account assertion above (issue #227's review finding, #253)",
    ).toEqual(Object.fromEntries(SWEPT_TABLES.map((table) => [table, 1])))
  })

  test('AC-621: the bystander keeps the values, not merely the rows', async () => {
    const { bystander, shelfOf, viewOf, eventId } = await stage()
    const shelf = await rows(
      app.db,
      sql`SELECT name, description FROM shelves WHERE id = ${shelfOf.bystander}::uuid`,
    )
    expect(shelf.length, "the bystander's shelf survives (spec 4.18)").toBe(1)
    expect(shelf[0]?.name).toBe('ac620 bystander shelf')
    expect(
      shelf[0]?.description,
      'including the text they wrote on it, which is what makes the departing account\'s loss of the same row the point',
    ).toBe('what bystander wrote about this shelf')

    const view = await rows(
      app.db,
      sql`SELECT name, definition FROM user_views WHERE id = ${viewOf.bystander}::uuid`,
    )
    expect(view.length, "the bystander's saved View survives (spec 4.19)").toBe(1)
    expect(view[0]?.name).toBe('ac620 bystander view')

    const settings = await rows(
      app.db,
      sql`SELECT theme FROM user_settings WHERE user_id = ${bystander.id}::uuid`,
    )
    expect(
      settings[0]?.theme,
      "the bystander's preference is the value they chose, not a default a re-created row would carry (spec 4.10)",
    ).toBe('light')

    const notification = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM notifications
           WHERE user_id = ${bystander.id}::uuid AND event_id = ${eventId}::uuid`,
    )
    expect(
      Number(notification[0]?.n ?? 0),
      "the bystander's copy of the shared event survives while the departing account's copy of the same event is gone (spec 4.14)",
    ).toBe(1)
    const event = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM events WHERE id = ${eventId}::uuid`,
    )
    expect(
      Number(event[0]?.n ?? 0),
      'and the event itself is untouched: events_actor_id_fkey is RESTRICT, so history is not what 6c sweeps (spec 4.13)',
    ).toBe(1)
  })

  test('AC-621: the surviving catalogs are the bystander\'s and the folder\'s', async () => {
    const { bystander, labelOf, folderLabel, taskId } = await stage()
    const mine = await rows(
      app.db,
      sql`SELECT name, color, description FROM labels
           WHERE id = ${labelOf.bystander}::uuid`,
    )
    expect(
      mine.length,
      "the bystander's own Personal Label survives (spec 4.24): a sweep that dropped its owner_user_id predicate would take every Personal Label in the instance and still pass every assertion scoped to one account",
    ).toBe(1)
    expect(mine[0]?.name).toBe('ac620 bystander label')
    expect(
      mine[0]?.description,
      'including the text they wrote on it, which is what makes the departed account losing the same row the point',
    ).toBe('what bystander wrote about this label')

    // The Folder Label is the sharper half. Its owner_user_id is NULL, so a
    // sweep written as "DELETE FROM labels WHERE scope = 'personal'", or as
    // an unqualified delete, takes a catalog that belongs to the folder and
    // to everyone still in it. 8.10 removes a member, not a folder's shared
    // vocabulary.
    const shared = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM labels WHERE id = ${folderLabel}::uuid`,
    )
    expect(
      Number(shared[0]?.n ?? 0),
      "the surviving folder's own Folder Label is untouched: it belongs to the folder and its remaining members (spec 4.24), and step 6c is scoped by owner_user_id, which is NULL on every Folder Label",
    ).toBe(1)
    const stillClassified = await rows(
      app.db,
      sql`SELECT label_id FROM task_folder_labels WHERE task_id = ${taskId}::uuid`,
    )
    expect(
      stillClassified.map((row) => String(row.label_id)),
      'and the task in that folder is still classified by it (spec 4.27)',
    ).toEqual([folderLabel])
    const survivingPersonal = await rows(
      app.db,
      sql`SELECT owner_user_id FROM task_personal_labels
           WHERE task_id = ${taskId}::uuid`,
    )
    expect(
      survivingPersonal.map((row) => String(row.owner_user_id)),
      "exactly one Personal Label assignment remains on the shared task and it is the bystander's: two would be the departed account's classification still standing, and zero would be a sweep that took a remaining member's with it (spec 4.25)",
    ).toEqual([bystander.id])
  })

  test('AC-621: the comment survives and carries exactly the surviving like', async () => {
    const { bystander, commentId } = await stage()
    const comment = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM comments WHERE id = ${commentId}::uuid`,
    )
    expect(
      Number(comment[0]?.n ?? 0),
      "the comment is the bystander's and outlives the deletion (spec 4.15, comments_author_id_fkey RESTRICT)",
    ).toBe(1)
    const likes = await rows(
      app.db,
      sql`SELECT user_id FROM comment_likes WHERE comment_id = ${commentId}::uuid`,
    )
    expect(
      likes.map((row) => String(row.user_id)),
      "exactly one like remains and it is the bystander's: two would be the departed account's glance still counted on somebody else's comment, and zero would be a sweep that took the whole comment's reactions with it (spec 4.15, 8.10 step 6c)",
    ).toEqual([bystander.id])
  })
})

describe('AC-622: the one retention, and its bound', () => {
  test('AC-622: a receipt on a folder that outlives the account is kept', async () => {
    const { departing, sharedFolder, receiptOf } = await stage()
    const kept = await rows(
      app.db,
      sql`SELECT actor_id, committed_revision FROM page_document_receipts
           WHERE mutation_id = ${receiptOf.departing}::uuid`,
    )
    expect(
      kept.length,
      "8.10 keeps page_document_receipts deliberately: a folder's receipts mark its document as being on #184's transaction path, so removing a departed member's could re-open the legacy writer for the people still editing it (spec 8.10 as amended)",
    ).toBe(1)
    expect(
      String(kept[0]?.actor_id),
      'and the kept row still names the scrubbed account, which is 8.10\'s surviving-reference shape rather than an orphan',
    ).toBe(departing.id)
    const folder = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM folders WHERE id = ${sharedFolder}::uuid`,
    )
    expect(
      Number(folder[0]?.n ?? 0),
      'the premise: the folder the receipt belongs to outlived the deletion',
    ).toBe(1)
  })

  test('AC-622: a receipt on a folder that dies with the account goes with it', async () => {
    const { soloFolder, soloReceipt } = await stage()
    expect(
      (
        await rows(
          app.db,
          sql`SELECT count(*)::int AS n FROM folders WHERE id = ${soloFolder}::uuid`,
        )
      )[0]?.n,
      "the premise: the account's sole-member folder is deleted outright at step 3 (spec 8.10)",
    ).toBe(0)
    const gone = await rows(
      app.db,
      sql`SELECT count(*)::int AS n FROM page_document_receipts
           WHERE mutation_id = ${soloReceipt}::uuid`,
    )
    expect(
      Number(gone[0]?.n ?? 0),
      'page_document_receipts_folder_id_fkey is a cascade off a real DELETE, so it fires where the users one cannot: the retention is bounded to folders that outlive the account rather than unbounded (spec 8.10 as amended; issue #253)',
    ).toBe(0)
  })

  test("AC-622: the bystander's receipt on the same folder is untouched", async () => {
    const { bystander, receiptOf } = await stage()
    const kept = await rows(
      app.db,
      sql`SELECT actor_id FROM page_document_receipts
           WHERE mutation_id = ${receiptOf.bystander}::uuid`,
    )
    expect(
      kept.map((row) => String(row.actor_id)),
      "a retention argued over the departing account must not be a sweep over the folder: the bystander's receipt on the same folder is not this deletion's to touch",
    ).toEqual([bystander.id])
  })
})

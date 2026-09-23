/*
The sample workspace (7.20): written into a
brand-new account inside 7.1's provisioning transaction, so the first page a
person sees is already full, and taken out again in one act.

**Every object the sample makes is registered in sample_objects by its own
id**, and that register is the whole of the removal's knowledge. It is a
register rather than a column on the owning rows because the rows are
section 4's, and because a task the person completes, moves, renames
or trashes keeps its id, so the register still finds it however it has been
handled since. What it deliberately does not carry are the objects that ride
another's fate: steps, page blocks, comments, reminders, Today pulls and
events all cascade with their task or folder by 4's own named constraints,
so recording them would be recording the cascade twice.

**Two rules.**

A task moved out of the sample is the person's. Removal takes a registered
task whose folder is still a sample folder or Desk (the sample put four
there itself); a task the person has moved into a folder they made
themselves has been adopted, and it stays, its register row dropped. The
same for a folder the person has shared: a sample folder with another
member is left where it is, reported back so the strip can say so, and its
register row dropped, because the moment it had a second member it stopped
being a sample and became a thing two people hold.

Removal goes through `domain/trash.ts`'s `destroyFolders` and `destroyTasks`,
the one collection the purge and the permanent delete already share, so a
file the person attached to a sample conversation is collected and its bytes
removed after the commit exactly as 7.15 orders it. Nothing here writes a
DELETE against a task or folder table of its own.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { SampleCounts, SampleStatus } from '../../shared/sample.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from '../domain/events.js'
import { createNativeFacets } from '../domain/facets.js'
import { recordAccessTransition } from '../domain/folder-access.js'
import { upsertReminder } from '../domain/tasks.js'
import { destroyFolders, destroyTasks } from '../domain/trash.js'
import { today } from '../time/today.js'
import { SAMPLE_WORKSPACE } from './content.js'
import type { SampleDue, SampleFolder, SampleTask } from './content.js'

/* ------------------------------------------------------------------ *
 * Dates, relative to today in the person's zone
 * ------------------------------------------------------------------ */

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

function parseDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function shiftDays(date: string, days: number): string {
  const d = parseDay(date)
  d.setUTCDate(d.getUTCDate() + days)
  return formatDay(d)
}

/** Resolves a content date against today: a count of days, the next given
 * weekday (today counts), or the next given day of the month (today counts). */
export function resolveDue(anchor: string, due: SampleDue): string {
  if (typeof due === 'number') return shiftDays(anchor, due)
  const base = parseDay(anchor)
  if ('weekday' in due) {
    const want = WEEKDAYS.indexOf(due.weekday)
    const ahead = (want - base.getUTCDay() + 7) % 7
    return shiftDays(anchor, ahead)
  }
  if (base.getUTCDate() <= due.monthday) {
    base.setUTCDate(due.monthday)
    return formatDay(base)
  }
  base.setUTCMonth(base.getUTCMonth() + 1, due.monthday)
  return formatDay(base)
}

/* ------------------------------------------------------------------ *
 * Creation
 * ------------------------------------------------------------------ */

type SampleKind = 'shelf' | 'folder' | 'task' | 'view'

async function register(
  tx: Executor,
  userId: string,
  kind: SampleKind,
  id: string,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO sample_objects (user_id, kind, id)
        VALUES (${userId}::uuid, ${kind}, ${id}::uuid)`,
  )
}

async function writeTask(
  tx: Executor,
  userId: string,
  anchor: string,
  folderId: string,
  task: SampleTask,
  sections: ReadonlyMap<string, string>,
): Promise<string> {
  const dueDate = task.due === undefined ? null : resolveDue(anchor, task.due)
  const completed = task.doneDaysAgo !== undefined
  const sectionId = task.section === undefined ? null : (sections.get(task.section) ?? null)
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO tasks
          (folder_id, title, notes, important, status, due_date, due_time,
           recurrence_rule, series_id, assignee_id, created_by,
           completed_at, completed_by, section_block_id, deleted_at)
        VALUES (${folderId}::uuid, ${task.title}, ${task.notes ?? null},
                ${task.important ?? false},
                ${completed ? 'completed' : 'pending'},
                ${dueDate}::date, ${task.time ?? null}::time,
                ${task.repeat ?? null},
                ${task.repeat === undefined ? sql`NULL` : sql`gen_random_uuid()`},
                ${userId}::uuid, ${userId}::uuid,
                ${completed ? sql`now() - make_interval(days => ${task.doneDaysAgo ?? 0})` : sql`NULL`},
                ${completed ? sql`${userId}::uuid` : sql`NULL`},
                ${sectionId}::uuid,
                ${task.trashed === true ? sql`now()` : sql`NULL`})
        RETURNING id`,
  )
  const taskId = String(inserted[0]?.id)
  await register(tx, userId, 'task', taskId)

  for (const [index, step] of (task.steps ?? []).entries()) {
    await tx.execute(
      sql`INSERT INTO steps (task_id, title, done, position)
          VALUES (${taskId}::uuid, ${step.title}, ${step.done ?? false}, ${index})`,
    )
  }
  if (task.today === true && !completed && task.trashed !== true) {
    await tx.execute(
      sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
          VALUES (${taskId}::uuid, ${userId}::uuid, ${anchor}::date)`,
    )
  }
  if (task.reminder !== undefined && dueDate !== null) {
    await upsertReminder(
      tx,
      taskId,
      'at' in task.reminder
        ? { offsetMinutes: null, timeOfDay: task.reminder.at }
        : { offsetMinutes: task.reminder.before, timeOfDay: null },
      userId,
    )
  }
  for (const comment of task.thread ?? []) {
    const parent = await rowsOf(
      tx,
      sql`INSERT INTO comments (folder_id, task_id, author_id, body)
          VALUES (${folderId}::uuid, ${taskId}::uuid, ${userId}::uuid, ${comment.body})
          RETURNING id`,
    )
    for (const reply of comment.replies ?? []) {
      await tx.execute(
        sql`INSERT INTO comments (folder_id, task_id, parent_id, author_id, body)
            VALUES (${folderId}::uuid, ${taskId}::uuid,
                    ${String(parent[0]?.id)}::uuid, ${userId}::uuid, ${reply})`,
      )
    }
  }
  return taskId
}

async function writeFolder(
  tx: Executor,
  userId: string,
  anchor: string,
  folder: SampleFolder,
): Promise<void> {
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO folders (owner_id, name, icon, color, description, deleted_at)
        VALUES (${userId}::uuid, ${folder.name}, ${folder.icon ?? null},
                ${folder.color ?? null}, ${folder.description ?? null},
                ${folder.trashed === true ? sql`now()` : sql`NULL`})
        RETURNING id`,
  )
  const folderId = String(inserted[0]?.id)
  await register(tx, userId, 'folder', folderId)
  // 4.18: a folder is on a shelf by the viewer's own membership, held in step
  // with the shelf's name. One column since issue #247 contracted migration
  // 0022's expand half: this INSERT stopped naming `folder_members.label` one
  // release, and migration 0026 dropped that column the next, which is 11.5's
  // order and not an unfinished rename.
  /* The sample workspace is the new account's own, so its folders are theirs
     to own and to administer: owner plus Full control, with the baseline
     transition beside it (issue #228). */
  await tx.execute(
    sql`INSERT INTO folder_members (folder_id, user_id, shelf_name, access)
        VALUES (${folderId}::uuid, ${userId}::uuid, ${folder.shelf ?? null},
                'full_control')`,
  )
  await recordAccessTransition(tx, {
    folderId,
    memberId: userId,
    previousAccess: null,
    newAccess: 'full_control',
    actorId: userId,
    transition: 'created_owner',
  })

  /* The four native facets, in this same transaction (issue #210, 4.30:
   "natives are created with the Folder and never lazily"). Every path
   that inserts a `folders` row owes this call, and nothing checks that
   automatically. */
  await createNativeFacets(tx, folderId, userId)

  const sections = new Map<string, string>()
  for (const [index, block] of (folder.blocks ?? []).entries()) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO page_blocks (folder_id, kind, position, text)
          VALUES (${folderId}::uuid, ${block.kind}, ${index}, ${block.text})
          RETURNING id`,
    )
    if (block.kind === 'section') sections.set(block.text, String(made[0]?.id))
  }

  for (const task of folder.tasks) {
    await writeTask(tx, userId, anchor, folderId, task, sections)
  }
  for (const comment of folder.conversation ?? []) {
    await tx.execute(
      sql`INSERT INTO comments (folder_id, author_id, body)
          VALUES (${folderId}::uuid, ${userId}::uuid, ${comment.body})`,
    )
  }
  await recordEvent(tx, {
    actorId: userId,
    verb: 'created',
    subjectKind: 'folder',
    subjectId: folderId,
    subjectName: folder.name,
    folderId,
    detail: 'part of the sample workspace',
  })
}

/**
 * Writes the whole sample for one account on the caller's executor. The
 * caller owns the transaction: provisioning runs it inside 7.1's own, so a
 * fault anywhere takes the account down with it rather than leaving half a
 * workspace, and POST /sample runs it inside one of its own.
 */
export async function createSampleWorkspace(
  tx: Executor,
  userId: string,
  zone: string,
): Promise<SampleCounts> {
  const anchor = today(zone)

  for (const shelf of SAMPLE_WORKSPACE.shelves) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO shelves (user_id, name, icon, color, description)
          VALUES (${userId}::uuid, ${shelf.name}, ${shelf.icon ?? null},
                  ${shelf.color ?? null}, ${shelf.description ?? null})
          RETURNING id`,
    )
    await register(tx, userId, 'shelf', String(made[0]?.id))
  }

  for (const folder of SAMPLE_WORKSPACE.folders) {
    await writeFolder(tx, userId, anchor, folder)
  }

  const desk = await rowsOf(
    tx,
    sql`SELECT id FROM folders WHERE owner_id = ${userId}::uuid AND is_default`,
  )
  const deskId = String(desk[0]?.id)
  for (const task of SAMPLE_WORKSPACE.desk) {
    await writeTask(tx, userId, anchor, deskId, task, new Map())
  }

  for (const view of SAMPLE_WORKSPACE.views) {
    const made = await rowsOf(
      tx,
      sql`INSERT INTO user_views (user_id, name, definition, pinned)
          VALUES (${userId}::uuid, ${view.name},
                  ${JSON.stringify(view.definition)}::jsonb, ${view.pinned})
          RETURNING id`,
    )
    await register(tx, userId, 'view', String(made[0]?.id))
  }

  return countLive(tx, userId)
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** The registered objects that still exist, by kind. A register row whose
 * object the person destroyed themselves counts for nothing. */
async function countLive(db: Executor, userId: string): Promise<SampleCounts> {
  const rows = await rowsOf(
    db,
    sql`SELECT
          (SELECT count(*)::int FROM sample_objects s JOIN shelves o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'shelf') AS shelves,
          (SELECT count(*)::int FROM sample_objects s JOIN folders o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'folder') AS folders,
          (SELECT count(*)::int FROM sample_objects s JOIN tasks o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'task') AS tasks,
          (SELECT count(*)::int FROM sample_objects s JOIN user_views o ON o.id = s.id
            WHERE s.user_id = ${userId}::uuid AND s.kind = 'view') AS views`,
  )
  const row = rows[0]
  return {
    shelves: Number(row?.shelves ?? 0),
    folders: Number(row?.folders ?? 0),
    tasks: Number(row?.tasks ?? 0),
    views: Number(row?.views ?? 0),
  }
}

export async function sampleStatus(db: Executor, userId: string): Promise<SampleStatus> {
  const counts = await countLive(db, userId)
  const present = counts.shelves + counts.folders + counts.tasks + counts.views > 0
  return { present, counts }
}

/* ------------------------------------------------------------------ *
 * Removal
 * ------------------------------------------------------------------ */

export interface SampleRemoval {
  /** The files rows the cascades dropped; the caller removes the bytes
   * after its commit (7.15's order). */
  fileIds: string[]
  /** Sample folders left standing because someone else is a member. */
  keptFolders: string[]
}

function idList(ids: readonly string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
}

export async function removeSampleWorkspace(
  db: Db,
  userId: string,
): Promise<SampleRemoval> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${userId}::uuid FOR UPDATE`)

    const folders = await rowsOf(
      tx,
      sql`SELECT f.id, f.name,
                 (SELECT count(*)::int FROM folder_members m
                   WHERE m.folder_id = f.id AND m.user_id <> ${userId}::uuid) AS others
          FROM sample_objects s
          JOIN folders f ON f.id = s.id AND f.owner_id = ${userId}::uuid
          WHERE s.user_id = ${userId}::uuid AND s.kind = 'folder'`,
    )
    const doomedFolders = folders
      .filter((row) => Number(row.others) === 0)
      .map((row) => String(row.id))
    const keptFolders = folders
      .filter((row) => Number(row.others) > 0)
      .map((row) => String(row.name))

    // The tasks still where the sample put them: in a doomed sample folder
    // or on Desk. A task in any other folder has been adopted.
    const doomedTasks: SQL = sql`
      SELECT t.id FROM sample_objects s
      JOIN tasks t ON t.id = s.id
      JOIN folders f ON f.id = t.folder_id
      WHERE s.user_id = ${userId}::uuid AND s.kind = 'task'
        AND (f.is_default AND f.owner_id = ${userId}::uuid
             ${doomedFolders.length === 0 ? sql`` : sql`OR f.id IN (${idList(doomedFolders)})`})`

    const tasks = await destroyTasks(tx, doomedTasks)
    const fileIds = [...tasks.fileIds]
    if (doomedFolders.length > 0) {
      const destroyed = await destroyFolders(
        tx,
        sql`SELECT id FROM folders WHERE id IN (${idList(doomedFolders)}) FOR UPDATE`,
      )
      fileIds.push(...destroyed.fileIds)
    }

    // Shelves, and the memberships that spelled them on any folder the person
    // put on one themselves (4.18 holds the two in step).
    const shelves = await rowsOf(
      tx,
      sql`DELETE FROM shelves
          WHERE user_id = ${userId}::uuid
            AND id IN (SELECT id FROM sample_objects
                        WHERE user_id = ${userId}::uuid AND kind = 'shelf')
          RETURNING id, name`,
    )
    if (shelves.length > 0) {
      await tx.execute(
        sql`UPDATE folder_members SET shelf_name = NULL
            WHERE user_id = ${userId}::uuid
              AND shelf_name IN (${sql.join(
                shelves.map((row) => sql`${String(row.name)}`),
                sql`, `,
              )})`,
      )
      await tx.execute(
        sql`DELETE FROM events
            WHERE subject_kind = 'shelf'
              AND subject_id IN (${idList(shelves.map((row) => String(row.id)))})`,
      )
    }

    const views = await rowsOf(
      tx,
      sql`DELETE FROM user_views
          WHERE user_id = ${userId}::uuid
            AND id IN (SELECT id FROM sample_objects
                        WHERE user_id = ${userId}::uuid AND kind = 'view')
          RETURNING id`,
    )

    // The settings bundle's references to what is gone: the sidebar's
    // order, the pin list and the per-page arrangements are keyed by id.
    const gone = [
      ...doomedFolders,
      ...shelves.map((row) => String(row.id)),
      ...views.map((row) => String(row.id)),
    ]
    if (gone.length > 0) {
      const goneJson = JSON.stringify(gone)
      await tx.execute(
        sql`UPDATE user_settings SET
              sidebar_order = COALESCE(
                (SELECT jsonb_agg(e) FROM jsonb_array_elements(sidebar_order) e
                  WHERE NOT (${goneJson}::jsonb ? (e #>> '{}'))), '[]'::jsonb),
              pinned_views = CASE WHEN pinned_views IS NULL THEN NULL ELSE COALESCE(
                (SELECT jsonb_agg(e) FROM jsonb_array_elements(pinned_views) e
                  WHERE NOT (${goneJson}::jsonb ? (e #>> '{}'))), '[]'::jsonb) END,
              arrangements = COALESCE(
                (SELECT jsonb_object_agg(k, v) FROM jsonb_each(arrangements) AS kv(k, v)
                  WHERE NOT (${goneJson}::jsonb ? k)), '{}'::jsonb)
            WHERE user_id = ${userId}::uuid`,
      )
    }

    // The register is spent whatever it named: adopted tasks and kept
    // folders are the person's from here.
    await tx.execute(sql`DELETE FROM sample_objects WHERE user_id = ${userId}::uuid`)

    return { fileIds, keptFolders }
  })
}

export type RestoreSampleResult =
  | { kind: 'restored'; status: SampleStatus }
  | { kind: 'shelf_name_taken' }

/**
 * POST /sample: the workspace again for an account that no longer has one.
 * Idempotent while it is present, which is what lets the undo bar and a
 * double press both land on one workspace.
 *
 * The person's zone is read here rather than handed in, under the same lock
 * that serialises the restore, and the refusal below is classified here
 * rather than in the route (issue #38): `routes/sample.ts` held both, and it
 * was the only route file in the directory issuing SQL of its own or reading
 * a driver's error code. A route parses, calls, and maps a result to a
 * status; this is the result for it to map.
 */
export async function restoreSampleWorkspace(
  db: Db,
  userId: string,
): Promise<RestoreSampleResult> {
  try {
    const status = await inTransaction(db, async (tx) => {
      const locked = await rowsOf(
        tx,
        sql`SELECT timezone FROM users WHERE id = ${userId}::uuid FOR UPDATE`,
      )
      const current = await sampleStatus(tx, userId)
      if (current.present) return current
      await tx.execute(sql`DELETE FROM sample_objects WHERE user_id = ${userId}::uuid`)
      const counts = await createSampleWorkspace(
        tx,
        userId,
        String(locked[0]?.timezone ?? 'UTC'),
      )
      return { present: true, counts }
    })
    return { kind: 'restored', status }
  } catch (error) {
    // 4.18's (user_id, name) unique: the person has a shelf of their own by
    // one of the sample's names, and the sample will not rename theirs to
    // make room for its own.
    const message = String((error as { message?: string })?.message ?? error)
    if (/23505|unique/i.test(message)) return { kind: 'shelf_name_taken' }
    throw error
  }
}

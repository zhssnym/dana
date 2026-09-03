/*
The S5 object acts (7.16, RFC 0005): duplicate for tasks and folders under
DES-198's copy rules, the workflow import under DES-206's, and the direct
ownership transfer of 8.9's second form.

DES-198, as the design record settles it after its own shipped
contradiction: a copy takes the structure and never the grants, the
progress, or the conversation; the work lands on whoever made the copy; and
due dates are shifted rather than copied, but only when the plan is spent.
The intervals are what a template keeps, so when the folder's earliest date
has already passed, every date moves forward by the same days that bring
that earliest date to today; dates still ahead are a live plan and copy
untouched. The comparison day is the database's current_date: the endpoint
carries no tz parameter (7.16), and a boundary-hour duplicate landing a day
off is a template being a day conservative, not a lie.

The import is the same maker's-work rule with a file for a source, and its
refusals are the schema's shape (shared/workflows.ts): what the caps admit
is created, and what the file smuggled was never read.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ImportWorkflowBody } from '../../shared/workflows.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { upsertReminder } from './tasks.js'

/* ------------------------------------------------------------------ *
 * POST /folders/:id/duplicate
 * ------------------------------------------------------------------ */

export type DuplicateFolderResult =
  | { kind: 'duplicated'; id: string; name: string; shiftedDays: number }
  | { kind: 'folder_cap' }

/** The caller has resolved member access on the source (10.2). */
export async function duplicateFolder(
  db: Db,
  viewerId: string,
  sourceFolderId: string,
): Promise<DuplicateFolderResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
    const owned = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folders
          WHERE owner_id = ${viewerId} AND NOT is_default
            AND deleted_at IS NULL`,
    )
    if (Number(owned[0]?.n ?? 0) >= 200) return { kind: 'folder_cap' } as const

    const source = (
      await rowsOf(
        tx,
        sql`SELECT name, icon, color, description, cover_preset, cover_focal_y FROM folders
            WHERE id = ${sourceFolderId}`,
      )
    )[0]
    const name = `${String(source?.name ?? 'Folder')} (copy)`.slice(0, 100)
    const made = await rowsOf(
      tx,
      sql`INSERT INTO folders (owner_id, name, icon, color, description,
                               cover_preset, cover_focal_y)
          VALUES (${viewerId}::uuid, ${name}, ${source?.icon ?? null},
                  ${source?.color ?? null}, ${source?.description ?? null},
                  ${source?.cover_preset ?? null},
                  ${Number(source?.cover_focal_y ?? 50)})
          RETURNING id`,
    )
    const copyId = String(made[0]?.id)
    await tx.execute(
      sql`INSERT INTO folder_members (folder_id, user_id)
          VALUES (${copyId}::uuid, ${viewerId}::uuid)`,
    )

    // The page first, so the section map exists when the tasks arrive. The
    // cover is deliberately not carried: its file row is the source
    // folder's and its visibility scope would lie in the copy.
    const blocks = await rowsOf(
      tx,
      sql`SELECT id, kind, position, text, ref_folder_id FROM page_blocks
          WHERE folder_id = ${sourceFolderId}
          ORDER BY position ASC, id ASC`,
    )
    const sectionMap = new Map<string, string>()
    for (const block of blocks) {
      const inserted = await rowsOf(
        tx,
        sql`INSERT INTO page_blocks
              (folder_id, kind, position, text, ref_folder_id)
            VALUES (${copyId}::uuid, ${String(block.kind)},
                    ${Number(block.position)},
                    ${block.text === null ? null : String(block.text)},
                    ${block.ref_folder_id === null ? null : String(block.ref_folder_id)})
            RETURNING id`,
      )
      if (String(block.kind) === 'section') {
        sectionMap.set(String(block.id), String(inserted[0]?.id))
      }
    }

    // Structure, never the life (DES-198): every status arrives pending,
    // steps arrive undone, the work is the maker's, a repeat is a new
    // series, and my_day, reminders, comments and events stay home.
    const tasks = await rowsOf(
      tx,
      sql`SELECT id, title, notes, important,
                 to_char(due_date, 'YYYY-MM-DD') AS due_date,
                 recurrence_rule, section_block_id, position
          FROM tasks
          WHERE folder_id = ${sourceFolderId} AND deleted_at IS NULL
          ORDER BY created_at ASC, id ASC`,
    )
    for (const task of tasks) {
      const section =
        task.section_block_id === null
          ? null
          : (sectionMap.get(String(task.section_block_id)) ?? null)
      const rule =
        task.recurrence_rule === null ? null : String(task.recurrence_rule)
      const inserted = await rowsOf(
        tx,
        /* polish: folderpage F9. The hand order (4.5's position, item 44's
           B4) is part of the structure a duplicate keeps: without it the
           copy came out in creation order, which is not the order the
           person had arranged. */
        sql`INSERT INTO tasks
              (folder_id, title, notes, important, due_date, recurrence_rule,
               series_id, assignee_id, created_by, section_block_id, position)
            VALUES (${copyId}::uuid, ${String(task.title)},
                    ${task.notes === null ? null : String(task.notes)},
                    ${task.important === true},
                    ${task.due_date === null ? null : String(task.due_date)}::date,
                    ${rule},
                    ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                    ${viewerId}::uuid, ${viewerId}::uuid, ${section},
                    ${task.position === null || task.position === undefined ? null : String(task.position)})
            RETURNING id`,
      )
      const newTaskId = String(inserted[0]?.id)
      const steps = await rowsOf(
        tx,
        sql`SELECT title, position FROM steps
            WHERE task_id = ${String(task.id)}::uuid
            ORDER BY position ASC, id ASC`,
      )
      for (const step of steps) {
        await tx.execute(
          sql`INSERT INTO steps (task_id, title, position)
              VALUES (${newTaskId}::uuid, ${String(step.title)},
                      ${Number(step.position)})`,
        )
      }
    }

    // DES-198's date rule: spent plans re-anchor whole, live plans copy
    // untouched. The shift is read once, then one UPDATE moves every date
    // by the same days, which is what keeps the intervals.
    const anchor = await rowsOf(
      tx,
      sql`SELECT (current_date - min(due_date))::int AS shift
          FROM tasks
          WHERE folder_id = ${copyId}::uuid AND due_date IS NOT NULL`,
    )
    const shift = Number(anchor[0]?.shift ?? 0)
    if (shift > 0) {
      await tx.execute(
        sql`UPDATE tasks SET due_date = due_date + ${shift}::int
            WHERE folder_id = ${copyId}::uuid AND due_date IS NOT NULL`,
      )
    }

    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'duplicated',
      subjectKind: 'folder',
      subjectId: copyId,
      subjectName: name,
      folderId: copyId,
      /* The bar and the History line say which of 9.6's two things happened
         (ledger L-055, RFC 0005 change control item 58): the prototype's own
         two sentences. */
      detail:
        shift > 0
          ? `from ${String(source?.name ?? 'a folder')}, dates moved to start today`
          : `from ${String(source?.name ?? 'a folder')}`,
    })
    return {
      kind: 'duplicated',
      id: copyId,
      name,
      shiftedDays: shift > 0 ? shift : 0,
    } as const
  })
}

/* ------------------------------------------------------------------ *
 * POST /tasks/:id/duplicate (caller has resolved access; source given)
 * ------------------------------------------------------------------ */

export interface DuplicableSource {
  id: string
  folderId: string
  title: string
}

/**
 * RFC 0005 change control items 46 and 47(b), enacted by RFC 0004's S28a:
 * the copy carries the title, the notes, the importance, the steps (all
 * undone), the section, the due date and the repeat, and never the
 * conversation, the completion, or the assignment, which lands on whoever
 * made the copy (item 44's B10). The date follows 9.6's one rule for a
 * folder applied to one task: a spent due date re-anchors on today and a
 * future one keeps, the repeat riding whichever the copy carries.
 */
export async function duplicateTask(
  db: Db,
  viewerId: string,
  source: DuplicableSource,
): Promise<string> {
  return inTransaction(db, async (tx) => {
    const row = (
      await rowsOf(
        tx,
        sql`SELECT title, notes, important,
                   to_char(CASE WHEN due_date < current_date
                                THEN current_date ELSE due_date END,
                           'YYYY-MM-DD') AS due_date,
                   recurrence_rule, section_block_id
            FROM tasks WHERE id = ${source.id}::uuid`,
      )
    )[0]
    const rule =
      row?.recurrence_rule === null || row?.recurrence_rule === undefined
        ? null
        : String(row.recurrence_rule)
    const title = `${String(row?.title ?? source.title)} (copy)`.slice(0, 300)
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks
            (folder_id, title, notes, important, due_date, recurrence_rule,
             series_id, assignee_id, created_by, section_block_id)
          VALUES (${source.folderId}::uuid, ${title},
                  ${row?.notes === null ? null : String(row?.notes ?? '')},
                  ${row?.important === true},
                  ${row?.due_date === null ? null : String(row?.due_date)}::date,
                  ${rule},
                  ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                  ${viewerId}::uuid, ${viewerId}::uuid,
                  ${row?.section_block_id === null ? null : String(row?.section_block_id)})
          RETURNING id`,
    )
    const newId = String(inserted[0]?.id)
    const steps = await rowsOf(
      tx,
      sql`SELECT title, position FROM steps
          WHERE task_id = ${source.id}::uuid
          ORDER BY position ASC, id ASC`,
    )
    for (const step of steps) {
      await tx.execute(
        sql`INSERT INTO steps (task_id, title, position)
            VALUES (${newId}::uuid, ${String(step.title)},
                    ${Number(step.position)})`,
      )
    }
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'duplicated',
      subjectKind: 'task',
      subjectId: newId,
      subjectName: title,
      folderId: source.folderId,
      detail: `from ${source.title}`,
    })
    return newId
  })
}

/* ------------------------------------------------------------------ *
 * POST /workflows/import
 * ------------------------------------------------------------------ */

export type ImportResult =
  | { kind: 'imported'; folders: Array<{ id: string; name: string }> }
  | { kind: 'folder_cap' }

export async function importWorkflow(
  db: Db,
  viewerId: string,
  file: ImportWorkflowBody,
  /** today(V) in the zone the request named, or null where the file asks no
   * date to be evaluated. The caller resolves it, because 8.1 makes the zone
   * an input of the request rather than a fact the server holds. */
  anchor: string | null = null,
): Promise<ImportResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
    const owned = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folders
          WHERE owner_id = ${viewerId} AND NOT is_default
            AND deleted_at IS NULL`,
    )
    if (Number(owned[0]?.n ?? 0) + file.folders.length > 200) {
      return { kind: 'folder_cap' } as const
    }

    const created: Array<{ id: string; name: string }> = []
    for (const folder of file.folders) {
      const made = await rowsOf(
        tx,
        sql`INSERT INTO folders (owner_id, name)
            VALUES (${viewerId}::uuid, ${folder.name})
            RETURNING id`,
      )
      const folderId = String(made[0]?.id)
      await tx.execute(
        sql`INSERT INTO folder_members (folder_id, user_id)
            VALUES (${folderId}::uuid, ${viewerId}::uuid)`,
      )
      for (const [index, block] of (folder.blocks ?? []).entries()) {
        await tx.execute(
          sql`INSERT INTO page_blocks (folder_id, kind, position, text)
              VALUES (${folderId}::uuid, ${block.kind}, ${index},
                      ${block.text})`,
        )
      }
      // Work arrives as typed work would: pending, unticked, the
      // importer's (the DES-198 contradiction's one rule). What travels is
      // item 44's B3 list and no more, which is the widening; what does not
      // is still ids, people, due dates and states.
      for (const task of folder.tasks ?? []) {
        // A repeat needs 4.5's anchor and a reminder needs 8.6's, and the
        // file carries no date, so the day the run began is the date they
        // get. A task carrying neither stays undated, which is what the
        // exclusion is about (change control item 46(a)).
        const dated =
          task.recurrence_rule !== undefined || task.reminder !== undefined
        const madeTask = await rowsOf(
          tx,
          sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                                 recurrence_rule, series_id, assignee_id,
                                 created_by)
              VALUES (${folderId}::uuid, ${task.title},
                      ${task.notes ?? null}, ${task.important ?? false},
                      ${dated ? anchor : null}::date,
                      ${task.recurrence_rule ?? null},
                      ${task.recurrence_rule === undefined ? null : randomUUID()}::uuid,
                      ${viewerId}::uuid, ${viewerId}::uuid)
              RETURNING id`,
        )
        const taskId = String(madeTask[0]?.id)
        for (const [index, step] of (task.steps ?? []).entries()) {
          await tx.execute(
            sql`INSERT INTO steps (task_id, title, position)
                VALUES (${taskId}::uuid, ${step.title}, ${index})`,
          )
        }
        if (task.reminder !== undefined) {
          await upsertReminder(
            tx,
            taskId,
            { offsetMinutes: null, timeOfDay: task.reminder.time_of_day },
            viewerId,
          )
        }
      }
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'created',
        subjectKind: 'folder',
        subjectId: folderId,
        subjectName: folder.name,
        folderId,
        detail: 'imported from a workflow file',
      })
      created.push({ id: folderId, name: folder.name })
    }
    return { kind: 'imported', folders: created } as const
  })
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/transfer-ownership (8.9's direct form)
 * ------------------------------------------------------------------ */

export type TransferResult =
  | { kind: 'transferred'; ownerId: string }
  | { kind: 'target_not_member' }

/** The caller has resolved owner access and refused the default folder. */
export async function transferOwnershipTo(
  db: Db,
  actorId: string,
  folderId: string,
  targetId: string,
): Promise<TransferResult> {
  return inTransaction(db, async (tx) => {
    const member = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM folder_members
          WHERE folder_id = ${folderId} AND user_id = ${targetId}`,
    )
    if (member.length === 0) return { kind: 'target_not_member' } as const
    await tx.execute(
      sql`UPDATE folders SET owner_id = ${targetId}::uuid
          WHERE id = ${folderId}::uuid`,
    )
    const named = await namesFor(tx, folderId, targetId)
    await recordEvent(tx, {
      actorId,
      verb: 'edited',
      subjectKind: 'folder',
      subjectId: folderId,
      subjectName: named.folderName,
      folderId,
      detail: `ownership transferred to ${named.targetName}`,
      recipients: [targetId],
    })
    return { kind: 'transferred', ownerId: targetId } as const
  })
}

async function namesFor(
  tx: Executor,
  folderId: string,
  userId: string,
): Promise<{ folderName: string; targetName: string }> {
  const rows = await rowsOf(
    tx,
    sql`SELECT f.name AS folder_name,
               (SELECT u.display_name FROM users u WHERE u.id = ${userId})
                 AS target_name
        FROM folders f WHERE f.id = ${folderId}`,
  )
  return {
    folderName: String(rows[0]?.folder_name ?? ''),
    targetName: String(rows[0]?.target_name ?? 'a member'),
  }
}

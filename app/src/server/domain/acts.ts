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
untouched.

**The comparison day is today in the caller's zone, and until 2026-09-04 it was
the database session's `current_date` (issue #76).** The header here defended
that as "a template being a day conservative, not a lie". It was a lie: 8.1
defines today as the current date in the request's tz and says in terms that an
endpoint which evaluates a date and takes no tz is an incomplete surface rather
than an invitation to substitute the stored zone below — recorded at the P4
merge review after this exact mistake had been made once already, and 7.8 is
the endpoint that was completed then. Both duplicates now take `tz` on 7.8's
precedent, exactly as 7.16's import does: present and invalid is 422, absent is
422 when a date would be evaluated, and absent is fine when none would.

Whether a date would be evaluated is decided without a zone, because the zone
is the thing that may be missing. Across every IANA offset the caller's today
is at most the UTC date plus a day, so a due date after that is ahead of the
plan in every zone on earth and needs no re-anchoring and no tz; a date on or
before the UTC date could be spent in some zone and the server refuses to guess
which. That is a shade conservative by construction, and conservative in the
direction of asking rather than of quietly anchoring on a day nobody asked
for.

The import is the same maker's-work rule with a file for a source, and its
refusals are the schema's shape (shared/workflows.ts): what the caps admit
is created, and what the file smuggled was never read.
*/
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ImportWorkflowBody } from '../../shared/workflows.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { copyCoverFile } from './files.js'
import { upsertReminder } from './tasks.js'

/**
 * Whether the copy can be made without knowing the caller's zone.
 *
 * `earliest` is the earliest due date the copy will carry, as YYYY-MM-DD, or
 * null where it carries none. The bound is the UTC date: today(V) is at most
 * one day ahead of it in the furthest zone, and a date strictly after that
 * bound is therefore in the future wherever the caller is standing, so nothing
 * re-anchors and 8.1 has nothing to say. Anything on or before it might be
 * spent, and the endpoint asks rather than guesses.
 *
 * The instant is a parameter for the same reason `today` in `server/time`
 * takes one: a helper that read the clock out of sight would settle where the
 * clock comes from by accident.
 */
export function zoneIsNeededToReanchor(
  earliest: string | null,
  at: Date = new Date(),
): boolean {
  if (earliest === null) return false
  return earliest <= at.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ *
 * POST /folders/:id/duplicate
 * ------------------------------------------------------------------ */

export type DuplicateFolderResult =
  | { kind: 'duplicated'; id: string; name: string; shiftedDays: number }
  | { kind: 'folder_cap' }
  /** A date would be re-anchored and the request named no zone to anchor it
   * in (8.1, issue #76). The route answers 422 naming tz; the copy is not
   * made, this being one unit. */
  | { kind: 'tz_required' }
  /** 10.3's 1 GB, spent by the copied cover picture (issue #116). 413 with
   * section 9's copy, as an upload over the quota answers. */
  | { kind: 'quota_exceeded' }

/**
 * The caller has resolved member access on the source (10.2).
 *
 * `anchor` is today(V) in the zone the request named, or null where it named
 * none — resolved by the route, because 8.1 makes the zone an input of the
 * request rather than a fact the server holds, which is the same seam
 * `importWorkflow` takes below.
 */
export async function duplicateFolder(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  sourceFolderId: string,
  anchor: string | null = null,
): Promise<DuplicateFolderResult> {
  /** Bytes the cover copy wrote inside the transaction; removed if it throws,
   * because a rollback cannot un-write a file (issue #116). */
  const copiedObjects: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
      const owned = await rowsOf(
        tx,
        sql`SELECT count(*)::int AS n FROM folders
            WHERE owner_id = ${viewerId} AND NOT is_default
              AND deleted_at IS NULL`,
      )
      if (Number(owned[0]?.n ?? 0) >= 200) return { kind: 'folder_cap' } as const

      /* Before anything is written, because a request is one unit and a copy
         half-made in the wrong zone is worse than no copy — and since issue
         #116 what is written includes bytes, which a rollback cannot take
         back, so this guard standing first matters more than it did (issue
         #76). The earliest date the copy will carry is the earliest of the
         tasks it will copy, which is the same set the loop below reads. */
      const earliest = await rowsOf(
        tx,
        sql`SELECT to_char(min(due_date), 'YYYY-MM-DD') AS earliest FROM tasks
            WHERE folder_id = ${sourceFolderId} AND deleted_at IS NULL
              AND due_date IS NOT NULL`,
      )
      const earliestDue =
        earliest[0]?.earliest === null || earliest[0]?.earliest === undefined
          ? null
          : String(earliest[0].earliest)
      if (anchor === null && zoneIsNeededToReanchor(earliestDue)) {
        return { kind: 'tz_required' } as const
      }

      const source = (
        await rowsOf(
          tx,
          sql`SELECT name, icon, color, description, cover_file_id,
                     cover_preset, cover_focal_y FROM folders
              WHERE id = ${sourceFolderId}`,
        )
      )[0]
      const name = `${String(source?.name ?? 'Folder')} (copy)`.slice(0, 100)

      /*
      **The cover picture is carried, and until 2026-09-04 it was not.** This
      block said "the cover is deliberately not carried: its file row is the
      source folder's and its visibility scope would lie in the copy", which
      diagnosed the problem exactly and then dropped the picture rather than
      solving it — so a duplicated folder wore its preset and its crop (AC-293)
      and silently lost an uploaded photograph, which is #117's fault one object
      over. The copy is made **inside the new folder**, so its scope is the
      copy's own membership and nothing lies. It spends the duplicator's quota,
      which is right — they are the owner of the folder they just made. Issues
      #116 and #128.

      **It runs before the folder is inserted, and that ordering is the whole
      of the fix reviewed on 2026-09-04.** It ran after, and the quota refusal
      below was an ordinary `return` out of the `inTransaction` callback —
      which resolves it, so drizzle *commits*. A caller at 10.3's gigabyte got
      413 and kept an empty "(copy)" folder with a membership row, no blocks,
      no tasks and no picture, counting against the 200 cap and needing hand
      deletion. `duplicateShelf` had the right shape already: copy first, then
      insert, so every early return has written nothing that a rollback is
      needed to take back. This is the same shape with one extra step, the
      scope, because a folder cover's `folder_id` cannot name a folder that
      does not exist yet: the copy is made folder-less and given its scope
      immediately after the INSERT, inside the same transaction, so no other
      statement can ever observe it unscoped.
      */
      let coverFileId: string | null = null
      if (source?.cover_file_id !== null && source?.cover_file_id !== undefined) {
        const held = await copyCoverFile(
          tx,
          store,
          viewerId,
          String(source.cover_file_id),
          null,
        )
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') {
          copiedObjects.push(held.id)
          coverFileId = held.id
        }
        /* 'bytes_missing' leaves the new folder wearing nothing, which is
           what the source draws too when its object has gone. */
      }

      const made = await rowsOf(
        tx,
        sql`INSERT INTO folders (owner_id, name, icon, color, description,
                                 cover_file_id, cover_preset, cover_focal_y)
            VALUES (${viewerId}::uuid, ${name}, ${source?.icon ?? null},
                    ${source?.color ?? null}, ${source?.description ?? null},
                    ${coverFileId}::uuid,
                    ${coverFileId === null ? (source?.cover_preset ?? null) : null},
                    ${Number(source?.cover_focal_y ?? 50)})
            RETURNING id`,
      )
      const copyId = String(made[0]?.id)
      await tx.execute(
        sql`INSERT INTO folder_members (folder_id, user_id)
            VALUES (${copyId}::uuid, ${viewerId}::uuid)`,
      )
      if (coverFileId !== null) {
        // The scope, now that there is a folder to name (4.16, 7.15).
        await tx.execute(
          sql`UPDATE files SET folder_id = ${copyId}::uuid
              WHERE id = ${coverFileId}::uuid`,
        )
      }

      // The page next, so the section map exists when the tasks arrive.
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

      /* DES-198's date rule: spent plans re-anchor whole, live plans copy
         untouched. The shift is read once, then one UPDATE moves every date by
         the same days, which is what keeps the intervals. The comparison day is
         the caller's, passed in as a date literal rather than read from the
         session's `current_date` (issue #76); where no zone was named, the
         guard above has already established that no date can be spent, so
         there is nothing to shift and no day to compare against. */
      const shifted =
        anchor === null
          ? []
          : await rowsOf(
              tx,
              sql`SELECT (${anchor}::date - min(due_date))::int AS shift
                  FROM tasks
                  WHERE folder_id = ${copyId}::uuid AND due_date IS NOT NULL`,
            )
      const shift = Number(shifted[0]?.shift ?? 0)
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
  } catch (error: unknown) {
    for (const id of copiedObjects) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes; they must not replace the real error below.
      }
    }
    throw error
  }
}

/* ------------------------------------------------------------------ *
 * POST /tasks/:id/duplicate (caller has resolved access; source given)
 * ------------------------------------------------------------------ */

export interface DuplicableSource {
  id: string
  folderId: string
  title: string
}

export type DuplicateTaskResult =
  | { kind: 'duplicated'; id: string }
  /** As the folder's: a spent date would be re-anchored and the request named
   * no zone (8.1, issue #76). */
  | { kind: 'tz_required' }

/**
 * RFC 0005 change control items 46 and 47(b), enacted by RFC 0004's S28a:
 * the copy carries the title, the notes, the importance, the steps (all
 * undone), the section, the due date and the repeat, and never the
 * conversation, the completion, or the assignment, which lands on whoever
 * made the copy (item 44's B10). The date follows 9.6's one rule for a
 * folder applied to one task: a spent due date re-anchors on today and a
 * future one keeps, the repeat riding whichever the copy carries.
 *
 * `anchor` is today(V) in the request's zone, or null where it named none,
 * and the read below refuses rather than substituting a day of its own
 * (issue #76). Today is the caller's, never the database session's.
 */
export async function duplicateTask(
  db: Db,
  viewerId: string,
  source: DuplicableSource,
  anchor: string | null = null,
): Promise<DuplicateTaskResult> {
  return inTransaction(db, async (tx) => {
    const stored = (
      await rowsOf(
        tx,
        sql`SELECT title, notes, important,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date,
                   recurrence_rule, section_block_id
            FROM tasks WHERE id = ${source.id}::uuid`,
      )
    )[0]
    const storedDue =
      stored?.due_date === null || stored?.due_date === undefined
        ? null
        : String(stored.due_date)
    if (anchor === null && zoneIsNeededToReanchor(storedDue)) {
      return { kind: 'tz_required' } as const
    }
    /* 9.6's rule applied in the caller's zone: a date already behind them
       moves up to today, a date still ahead of them copies as it stands. In
       the arm where no zone was named, the guard above has proved the date is
       ahead in every zone, so `anchor` being null cannot reach the
       comparison. */
    const dueForCopy =
      storedDue !== null && anchor !== null && storedDue < anchor
        ? anchor
        : storedDue
    const row = stored
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
                  ${dueForCopy}::date,
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
    return { kind: 'duplicated', id: newId } as const
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

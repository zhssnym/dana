// Object acts (7.16): task and folder duplicate, workflow import, and direct ownership transfer.
// A copy takes structure, never grants, progress or conversation; the work lands on the copier. Spent due dates
// shift forward by one delta to today in the caller's zone (never the database's current_date).
import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { DocumentOperation } from '../../shared/pages.js'
import { parseDanaLink, referencePath } from '../../shared/references.js'
import type { ReferenceKind } from '../../shared/references.js'
import {
  readWorkflowPage,
  workflowDependencyEdges,
} from '../../shared/workflows.js'
import type {
  ImportWorkflowBody,
  ImportWorkflowTask,
} from '../../shared/workflows.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, pairSet, rowsOf } from '../database.js'
import type { Executor, IdPair } from '../database.js'
import { recordEvent } from './events.js'
import { folderActorFacts, mayPerform, recordAccessTransition } from './folder-access.js'
import { projectCapReached } from './folders.js'
import { addDocPage, purposeTabOf } from './project-tabs.js'
import { copyCoverFile, copyPageFile, readableFileScope } from './files.js'
import {
  appendHomeBlock,
  lastChildPosition,
  lockPageTree,
  mayAddChildUnder,
  PAGE_TREE_EDIT_ACTION,
} from './page-tree.js'
import { applyDocument, documentMetadata, DocumentRefusal } from './page-document.js'
import {
  applyWorkflowTaskLabels,
  copyFolderLabelAssignments,
  copyFolderLabelCatalog,
  copyTaskLabelsForDuplicate,
  createWorkflowFolderLabels,
} from './labels.js'
import { upsertReminder } from './tasks.js'
import { appendChecklist, ChecklistCapRefusal, copyTaskDocument } from './task-document.js'
import { positionAtSectionEnd, seededItems } from './page-order.js'
import { initialKeys, keyBetween } from './fractional-index.js'
import { copyDependenciesWithin } from './task-dependencies.js'
/* Both ends are UTC midnights, so no DST shift can round the division. */
import { addDays, daysBetween } from '../time/calendar-date.js'

/**
 * Whether the copy can be made without the caller's zone: true when `earliest` is on or before the UTC date.
 * Today is at most a day ahead of UTC anywhere, so later dates are in the future in every zone.
 */
export function zoneIsNeededToReanchor(
  earliest: string | null,
  at: Date = new Date(),
): boolean {
  if (earliest === null) return false
  return earliest <= at.toISOString().slice(0, 10)
}

export type DuplicateFolderResult =
  | { kind: 'duplicated'; id: string; name: string; shiftedDays: number }
  | { kind: 'folder_cap' }
  /** A date would be re-anchored and the request named no zone (8.1): 422 on tz, nothing copied. */
  | { kind: 'tz_required' }
  /** 10.3's 1 GB quota, spent by the copied pictures: 413. */
  | { kind: 'quota_exceeded' }

/**
 * A quota refusal after the folder row is written. Thrown, not returned: returning from `inTransaction`
 * commits, and would leave a half-made folder. Caught only at the bottom of `duplicateFolder`.
 */
class QuotaRefusal extends Error {}

/** Rewrite only Dana Links whose targets this copy remapped; other links stay as authored. */
function remapRichContentLinks(
  value: unknown,
  remap: (kind: ReferenceKind, id: string) => string | null,
): unknown {
  if (Array.isArray(value)) return value.map((item) => remapRichContentLinks(item, remap))
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key !== 'href' || typeof item !== 'string') return [key, remapRichContentLinks(item, remap)]
    const target = parseDanaLink(item)
    const id = target === null ? null : remap(target.kind, target.id)
    return [key, target === null || id === null ? item : referencePath(target.kind, id)]
  }))
}

/**
 * A sub-page copy goes right after the original under the same parent. Null (top level) when the source
 * is a root or the duplicator may not add a page under its parent.
 */
async function placeOfCopy(
  tx: Executor,
  viewerId: string,
  sourceId: string,
): Promise<{ parentId: string; childPosition: string } | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT f.parent_folder_id, f.child_position FROM folders f
          JOIN folders p ON p.id = f.parent_folder_id AND p.deleted_at IS NULL
         WHERE f.id = ${sourceId}::uuid`,
  )
  const row = found[0]
  if (row === undefined) return null
  const parentId = String(row.parent_folder_id)
  const parent = await folderActorFacts(tx, viewerId, parentId)
  if (parent === null || parent.isDefault) return null
  if (!mayPerform(parent, PAGE_TREE_EDIT_ACTION).allowed) return null
  if (!(await mayAddChildUnder(tx, parentId))) return null
  if (row.child_position === null || row.child_position === undefined) {
    return { parentId, childPosition: await lastChildPosition(tx, parentId) }
  }
  const lower = String(row.child_position)
  const next = await rowsOf(
    tx,
    sql`SELECT min(child_position) AS upper FROM folders
         WHERE parent_folder_id = ${parentId}::uuid AND child_position > ${lower}`,
  )
  const upper = next[0]?.upper
  return {
    parentId,
    childPosition: keyBetween(lower, upper === null || upper === undefined ? null : String(upper)),
  }
}

/** A top-level copy: the original's collection, and the slot after it in the duplicator's `sidebar_order`. */
async function placeBesideInLibrary(
  tx: Executor,
  viewerId: string,
  sourceId: string,
  copyId: string,
): Promise<void> {
  await tx.execute(
    sql`UPDATE folder_members SET shelf_name = (
          SELECT shelf_name FROM folder_members
           WHERE folder_id = ${sourceId}::uuid AND user_id = ${viewerId}::uuid)
         WHERE folder_id = ${copyId}::uuid AND user_id = ${viewerId}::uuid`,
  )
  const settings = await rowsOf(
    tx,
    sql`SELECT sidebar_order FROM user_settings WHERE user_id = ${viewerId}::uuid FOR UPDATE`,
  )
  const raw: unknown = settings[0]?.sidebar_order
  const order: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!Array.isArray(order)) return
  const at = order.indexOf(sourceId)
  // 300 is `patchSettingsBody.sidebar_order`'s limit.
  if (at < 0 || order.length >= 300) return
  const next = [...order.slice(0, at + 1), copyId, ...order.slice(at + 1)]
  await tx.execute(
    sql`UPDATE user_settings SET sidebar_order = ${JSON.stringify(next)}::jsonb
         WHERE user_id = ${viewerId}::uuid`,
  )
}

/** The caller has resolved member access on the source. `anchor` is today(V) in the request's zone, or null. */
export async function duplicateFolder(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  sourceFolderId: string,
  anchor: string | null = null,
): Promise<DuplicateFolderResult> {
  /** Bytes copied inside the transaction; removed if it throws, since a rollback cannot un-write files. */
  const copiedObjects: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      /* The tree lock first, so the copy's place beside the original cannot move. */
      await lockPageTree(tx)
      const place = await placeOfCopy(tx, viewerId, sourceFolderId)
      /* A copy into a page is a sub-page, which the cap does not count. */
      if (place === null && (await projectCapReached(tx, viewerId, 1))) {
        return { kind: 'folder_cap' } as const
      }

      /* Before anything is written, including bytes a rollback cannot take back. */
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
                     cover_preset, cover_focal_y, kind, project_id FROM folders
              WHERE id = ${sourceFolderId}`,
        )
      )[0]
      const name = `${String(source?.name ?? 'Folder')} (copy)`.slice(0, 100)

      /*
      The cover is copied before the folder INSERT, so an early quota return has written nothing.
      The copy is made folder-less and scoped to the new folder right after the INSERT, in the same transaction.
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
        /* A missing source object leaves the copy with no cover, as the source draws none. */
      }

      /* A top-level copy is a new project of the source page's kind; a sub-page copy joins its parent's project. */
      const newId = randomUUID()
      const sourceKind = source?.kind === null || source?.kind === undefined ? null : String(source.kind)
      const made = await rowsOf(
        tx,
        sql`INSERT INTO folders (id, owner_id, name, icon, color, description,
                                 cover_file_id, cover_preset, cover_focal_y,
                                 parent_folder_id, child_position,
                                 project_id, kind, tab_position)
            VALUES (${newId}::uuid,
                    ${place === null ? sql`${viewerId}::uuid` : sql`(SELECT p.owner_id FROM folders p WHERE p.id = ${place.parentId}::uuid)`},
                    ${name}, ${source?.icon ?? null},
                    ${source?.color ?? null}, ${source?.description ?? null},
                    ${coverFileId}::uuid,
                    ${coverFileId === null ? (source?.cover_preset ?? null) : null},
                    ${Number(source?.cover_focal_y ?? 50)},
                    ${place?.parentId ?? null}::uuid, ${place?.childPosition ?? null},
                    ${place === null ? sql`${newId}::uuid` : sql`(SELECT p.project_id FROM folders p WHERE p.id = ${place.parentId}::uuid)`},
                    ${place === null ? (sourceKind ?? 'work') : sourceKind === 'discussion' || sourceKind === null ? 'doc' : sourceKind},
                    ${place === null ? 'a0' : null})
            RETURNING id`,
      )
      const copyId = String(made[0]?.id)
      /* The duplicator owns the copy with Full control; no source Access or Responsibility travels.
      Only a top-level copy gets a membership row. */
      if (place === null) {
        await tx.execute(
          sql`INSERT INTO folder_members (folder_id, user_id, access)
              VALUES (${copyId}::uuid, ${viewerId}::uuid, 'full_control')`,
        )
        await recordAccessTransition(tx, {
          folderId: copyId,
          memberId: viewerId,
          previousAccess: null,
          newAccess: 'full_control',
          actorId: viewerId,
          transition: 'created_owner',
        })
      }
      if (place === null) await placeBesideInLibrary(tx, viewerId, sourceFolderId, copyId)
      else await appendHomeBlock(tx, place.parentId, copyId)
      if (coverFileId !== null) {
        // The scope, now that there is a folder to name (4.16, 7.15).
        await tx.execute(
          sql`UPDATE files SET folder_id = ${copyId}::uuid
              WHERE id = ${coverFileId}::uuid`,
        )
      }

      // Copy explicit membership and placement; never infer parents from proximity.
      // `page` blocks stay behind: sub-pages keep their home in the source.
      const blocks = await rowsOf(tx,sql`SELECT * FROM page_blocks WHERE folder_id=${sourceFolderId}::uuid AND kind <> 'page' ORDER BY position,id`)
      const sectionMap = new Map(blocks.map(block=>[String(block.id),randomUUID()]))
      /* Each page asset becomes an independent file in the new folder with the source's own kind (`copyPageFile`).
      One copy per source file, so a picture placed twice stays one row. */
      const copiedFiles = new Map<string,string>()
      for(const block of blocks){
        let fileId:string|null=null
        if(block.file_id != null){
          const originalFile=String(block.file_id)
          fileId=copiedFiles.get(originalFile)??null
          if(fileId===null){
            const held=await copyPageFile(tx,store,viewerId,originalFile,copyId)
            /* Thrown, not returned: the page assets are scoped to the new folder, so a refusal must roll back.
            The catch at the bottom removes the copied bytes and answers `quota_exceeded`. */
            if(held.kind==='quota_exceeded')throw new QuotaRefusal()
            if(held.kind==='copied'){
              fileId=held.id;copiedObjects.push(fileId);copiedFiles.set(originalFile,fileId)
            }
          }
        }
        await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,kind,position,text,rich_content,ref_folder_id,file_id,width_pct,page_position,checked) VALUES (${sectionMap.get(String(block.id))}::uuid,${copyId}::uuid,${String(block.kind)},${Number(block.position)},${block.text??null},${block.rich_content==null?null:JSON.stringify(block.rich_content)}::jsonb,${block.ref_folder_id??null}::uuid,${fileId}::uuid,${block.width_pct??null},${block.page_position??null},${block.checked==null?null:Boolean(block.checked)})`)
      }
      /* Section and list parents are remapped through the copied-id map, never inferred. Checklist ticks are copied. */
      for(const block of blocks)if(block.section_block_id!=null)await tx.execute(sql`UPDATE page_blocks SET section_block_id=${sectionMap.get(String(block.section_block_id))??null}::uuid WHERE id=${sectionMap.get(String(block.id))}::uuid`)
      for(const block of blocks)if(block.list_parent_block_id!=null)await tx.execute(sql`UPDATE page_blocks SET list_parent_block_id=${sectionMap.get(String(block.list_parent_block_id))??null}::uuid WHERE id=${sectionMap.get(String(block.id))}::uuid`)

      /* The Folder's Labels, re-created under new ids before the tasks that point at them; archived ones stay archived. */
      const labelPairs = await copyFolderLabelCatalog(
        tx,
        sourceFolderId,
        copyId,
      )

      // Structure, never the life: tasks arrive pending and the copier's; my_day, reminders, comments and events stay home.
      const tasks = await rowsOf(
        tx,
        sql`SELECT id, title, notes, important,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
                   to_char(start_time, 'HH24:MI') AS start_time,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date,
                   recurrence_rule, section_block_id, position, page_position
            FROM tasks
            WHERE folder_id = ${sourceFolderId} AND deleted_at IS NULL
            ORDER BY created_at ASC, id ASC`,
      )
      /* Old task id to new. Dependencies and Labels are copied only between tasks in this map. */
      const taskIdentity = new Map<string, string>()
      for (const task of tasks) {
        const section =
          task.section_block_id === null
            ? null
            : (sectionMap.get(String(task.section_block_id)) ?? null)
        const rule =
          task.recurrence_rule === null ? null : String(task.recurrence_rule)
        const inserted = await rowsOf(
          tx,
          /* The hand order is copied too. */
          sql`INSERT INTO tasks
                (folder_id, title, notes, important, start_date, start_time, due_date, recurrence_rule,
                 series_id, assignee_id, created_by, section_block_id, position, page_position)
              VALUES (${copyId}::uuid, ${String(task.title)},
                      ${task.notes === null ? null : String(task.notes)},
                      ${task.important === true},
                      ${task.start_date === null || task.start_date === undefined ? null : String(task.start_date)}::date,
                      ${task.start_time === null || task.start_time === undefined ? null : String(task.start_time)}::time,
                      ${task.due_date === null ? null : String(task.due_date)}::date,
                      ${rule},
                      ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                      ${viewerId}::uuid, ${viewerId}::uuid, ${section},
                      ${task.position === null || task.position === undefined ? null : String(task.position)}, ${task.page_position??null})
              RETURNING id`,
        )
        const newTaskId = String(inserted[0]?.id)
        taskIdentity.set(String(task.id), newTaskId)
        /* The Task's document travels with its checklist unticked; media files are copied once via the shared map. */
        await copyTaskDocument(tx, String(task.id), newTaskId, async (originalFile) => {
          const known = copiedFiles.get(originalFile)
          if (known !== undefined) return known
          const held = await copyPageFile(tx, store, viewerId, originalFile, copyId)
          if (held.kind === 'quota_exceeded') throw new QuotaRefusal()
          if (held.kind !== 'copied') return null
          copiedObjects.push(held.id)
          copiedFiles.set(originalFile, held.id)
          return held.id
        }, { uncheck: true })
      }

      /*
      Purpose is reusable context, so a project copy gets its own Purpose tab, copied only if the duplicator can read it.
      Results and other tabs are not copied: they record the source's own outcomes.
       */
      const purposeCandidate = place === null ? await purposeTabOf(tx, sourceFolderId) : null
      const sourcePurposeTab =
        purposeCandidate !== null && (await folderActorFacts(tx, viewerId, purposeCandidate.id)) !== null
          ? purposeCandidate
          : null
      if (sourcePurposeTab !== null) {
        const sourcePurposeId = sourcePurposeTab.id
        const copiedPurposeId = await addDocPage(tx, viewerId, copyId, sourcePurposeTab.name, 'before')
        const purposeFiles = new Map<string, string>()
        const purposeBlocks = await rowsOf(
          tx,
          sql`SELECT id, kind, position, text, rich_content, file_id, width_pct,
                     checked, list_parent_block_id, page_position, toggleable
                FROM page_blocks
               WHERE folder_id = ${sourcePurposeId}::uuid
               ORDER BY page_position ASC NULLS LAST, position ASC, id ASC`,
        )
        const purposeIdentity = new Map(
          purposeBlocks.map((block) => [String(block.id), randomUUID()]),
        )
        for (const block of purposeBlocks) {
          if (block.kind === 'page') continue
          let fileId: string | null = null
          if (block.file_id !== null && block.file_id !== undefined) {
            const originalFile = String(block.file_id)
            fileId = purposeFiles.get(originalFile) ?? null
            if (fileId === null) {
              // A page accepts only its own files, so the copy is scoped to the new Purpose tab.
              const held = await copyPageFile(tx, store, viewerId, originalFile, copiedPurposeId)
              if (held.kind === 'quota_exceeded') throw new QuotaRefusal()
              if (held.kind === 'copied') {
                fileId = held.id
                copiedObjects.push(fileId)
                purposeFiles.set(originalFile, fileId)
              }
            }
          }
          const richContent =
            block.rich_content === null || block.rich_content === undefined
              ? null
              : remapRichContentLinks(block.rich_content, (kind, id) => {
                  if (kind === 'folder' && id === sourceFolderId) return copyId
                  if ((kind === 'facet' || kind === 'folder') && id === sourcePurposeId) {
                    return copiedPurposeId
                  }
                  if (kind === 'task') return taskIdentity.get(id) ?? null
                  return null
                })
          await tx.execute(
            sql`INSERT INTO page_blocks
                  (id, folder_id, kind, position, text, rich_content, file_id,
                   width_pct, checked, page_position, toggleable)
                VALUES (${purposeIdentity.get(String(block.id))}::uuid,
                        ${copiedPurposeId}::uuid, ${String(block.kind)},
                        ${Number(block.position)}, ${block.text ?? null},
                        ${richContent === null ? null : JSON.stringify(richContent)}::jsonb,
                        ${fileId}::uuid, ${block.width_pct ?? null},
                        ${block.checked === null || block.checked === undefined ? null : Boolean(block.checked)},
                        ${block.page_position ?? null},
                        ${block.toggleable === true ? true : null})`,
          )
        }
        for (const block of purposeBlocks) {
          if (block.list_parent_block_id === null || block.list_parent_block_id === undefined) {
            continue
          }
          const child = purposeIdentity.get(String(block.id))
          const parent = purposeIdentity.get(String(block.list_parent_block_id))
          if (child === undefined || parent === undefined) {
            throw new DocumentRefusal(
              'not_convertible',
              'Purpose list structure names content the source Purpose does not hold.',
            )
          }
          await tx.execute(
            sql`UPDATE page_blocks
                    SET list_parent_block_id = ${parent}::uuid
                  WHERE id = ${child}::uuid AND folder_id = ${copiedPurposeId}::uuid`,
          )
        }
      }

      /* After every task exists. Only edges with both ends in the map are carried. */
      await copyDependenciesWithin(tx, taskIdentity, viewerId)

      /*
      Label assignments: Folder Labels remapped to the copy's vocabulary, plus the duplicator's own active
      Personal Labels. Nobody else's Personal Labels cross, and no archived Personal Label is newly attached.
       */
      await copyFolderLabelAssignments(
        tx,
        viewerId,
        sourceFolderId,
        copyId,
        labelPairs,
        [...taskIdentity],
      )

      /* Spent plans re-anchor whole, live plans copy untouched: one delta for every date keeps the intervals.
      Without a zone the guard above proved nothing is spent. */
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
        /* start_date takes the same delta so intervals hold and tasks_start_before_due_check still passes.
        NULL + int is NULL, so neither SET tests its column. */
        await tx.execute(
          sql`UPDATE tasks
                 SET due_date = due_date + ${shift}::int,
                     start_date = start_date + ${shift}::int
               WHERE folder_id = ${copyId}::uuid
                 AND (due_date IS NOT NULL OR start_date IS NOT NULL)`,
        )
      }

      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'duplicated',
        subjectKind: 'folder',
        subjectId: copyId,
        subjectName: name,
        folderId: copyId,
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
    if (error instanceof QuotaRefusal) return { kind: 'quota_exceeded' } as const
    throw error
  }
}

export interface DuplicableSource {
  id: string
  folderId: string
  title: string
}

export type DuplicateTaskResult =
  | { kind: 'duplicated'; id: string }
  /** As the folder's: a spent date and no zone (8.1). */
  | { kind: 'tz_required' }

/**
 * Copies the title, notes, document (checklist unticked), section, dates and repeat; never the conversation,
 * completion or assignment. `anchor` is today in the request's zone, or null when it named none.
 */
export async function duplicateTask(
  db: Db,
  viewerId: string,
  source: DuplicableSource,
  anchor: string | null = null,
): Promise<DuplicateTaskResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${source.folderId}::uuid FOR UPDATE`)
    const stored = (
      await rowsOf(
        tx,
        sql`SELECT title, notes, important,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
                   to_char(start_time, 'HH24:MI') AS start_time,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date,
                   recurrence_rule, section_block_id
            FROM tasks WHERE id = ${source.id}::uuid`,
      )
    )[0]
    const storedDue =
      stored?.due_date === null || stored?.due_date === undefined
        ? null
        : String(stored.due_date)
    const storedStart =
      stored?.start_date === null || stored?.start_date === undefined
        ? null
        : String(stored.start_date)
    /* The start is the earlier end, so it decides whether a zone is needed. */
    if (anchor === null && zoneIsNeededToReanchor(storedStart ?? storedDue)) {
      return { kind: 'tz_required' } as const
    }
    /*
    A duplicate never begins before it existed. No start: a spent due moves to today. A past start moves to today,
    and a spent due moves forward by the original span. Without a zone, every date is ahead and copies as is.
     */
    let startForCopy = storedStart
    let dueForCopy = storedDue
    if (anchor !== null) {
      if (storedStart === null) {
        if (storedDue !== null && storedDue < anchor) dueForCopy = anchor
      } else if (storedStart < anchor) {
        startForCopy = anchor
        if (storedDue !== null && storedDue < anchor) {
          dueForCopy = addDays(anchor, daysBetween(storedStart, storedDue))
        }
      }
    }
    const row = stored
    const rule =
      row?.recurrence_rule === null || row?.recurrence_rule === undefined
        ? null
        : String(row.recurrence_rule)
    const title = `${String(row?.title ?? source.title)} (copy)`.slice(0, 300)
    const pagePosition=positionAtSectionEnd(await seededItems(tx,source.folderId),null,row?.section_block_id==null?null:String(row.section_block_id))
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks
            (folder_id, title, notes, important, start_date, start_time, due_date, recurrence_rule,
             series_id, assignee_id, created_by, section_block_id,page_position)
          VALUES (${source.folderId}::uuid, ${title},
                  ${row?.notes === null ? null : String(row?.notes ?? '')},
                  ${row?.important === true},
                  ${startForCopy}::date,
                  ${row?.start_time === null || row?.start_time === undefined ? null : String(row.start_time)}::time,
                  ${dueForCopy}::date,
                  ${rule},
                  ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                  ${viewerId}::uuid, ${viewerId}::uuid,
                  ${row?.section_block_id === null ? null : String(row?.section_block_id)},${pagePosition})
          RETURNING id`,
    )
    const newId = String(inserted[0]?.id)
    /* Same Folder, so Folder Label ids carry as they are. Only the duplicator's own Personal Labels cross,
    and no archived Label is newly attached. */
    /* The document travels with its notes; same folder, so media blocks name the same file. Checklist unticked. */
    await copyTaskDocument(tx, source.id, newId, undefined, { uncheck: true })
    await copyTaskLabelsForDuplicate(tx, viewerId, source.id, newId)
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

export type ImportResult =
  | { kind: 'imported'; folders: Array<{ id: string; name: string }> }
  | { kind: 'folder_cap' }
  /* Only with `parentId`, on `createSubPage`'s terms: 404, 403, or 422 for a default or too-deep parent. */
  | { kind: 'parent_not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'default_parent' }
  | { kind: 'too_deep' }

export async function importWorkflow(
  db: Db,
  viewerId: string,
  file: ImportWorkflowBody,
  /** today(V) in the request's zone, or null when the file needs no date evaluated. */
  anchor: string | null = null,
  store?: ObjectStore,
  /** The page the file's folders become sub-pages of; absent, they are top-level. */
  parentId?: string,
): Promise<ImportResult> {
  const copiedObjects:string[]=[]
  /* The import's own clock: one transaction has one now(), so each row takes its own millisecond in file order. */
  let tick = 0
  const clock = (): SQL => {
    tick += 1
    return sql`now() - interval '60 seconds' + ${tick}::int * interval '1 millisecond'`
  }
  return inTransaction(db, async (tx) => {
    /* `createSubPage`'s gate under the tree lock, so a concurrent move cannot change the parent. */
    if (parentId !== undefined) {
      await lockPageTree(tx)
      const parent = await folderActorFacts(tx, viewerId, parentId)
      if (parent === null) return { kind: 'parent_not_found' } as const
      const decision = mayPerform(parent, PAGE_TREE_EDIT_ACTION)
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
      if (parent.profileDoc === true) {
        return { kind: 'forbidden', reason: 'A Work import cannot be added to a profile Doc.' } as const
      }
      if (parent.isDefault) return { kind: 'default_parent' } as const
      if (!(await mayAddChildUnder(tx, parentId))) return { kind: 'too_deep' } as const
    }
    /* Sub-pages are not counted by the project cap. */
    if (parentId === undefined && (await projectCapReached(tx, viewerId, file.folders.length))) {
      return { kind: 'folder_cap' } as const
    }

    const created: Array<{ id: string; name: string }> = []
    /** The file's task keys mapped to minted ids across every folder: dependencies may cross Folders. */
    const taskIdOfKey = new Map<string, string>()
    /* Indexed so a refused vocabulary can be named as `folders.<n>.labels`. */
    for (const [folderIndex, folder] of file.folders.entries()) {
      const childPosition =
        parentId === undefined ? null : await lastChildPosition(tx, parentId)
      /* A top-level import is a Work project; into a page, a Work sub-page of that page's project. */
      const newId = randomUUID()
      const made = await rowsOf(
        tx,
        sql`INSERT INTO folders (id, owner_id, name, created_at,
                                 parent_folder_id, child_position,
                                 project_id, kind, tab_position)
            VALUES (${newId}::uuid,
                    ${parentId === undefined ? sql`${viewerId}::uuid` : sql`(SELECT p.owner_id FROM folders p WHERE p.id = ${parentId}::uuid)`},
                    ${folder.name}, ${clock()},
                    ${parentId ?? null}::uuid, ${childPosition},
                    ${parentId === undefined ? sql`${newId}::uuid` : sql`(SELECT p.project_id FROM folders p WHERE p.id = ${parentId}::uuid)`},
                    'work', ${parentId === undefined ? 'a0' : null})
            RETURNING id`,
      )
      const folderId = String(made[0]?.id)
      /* The importer owns the new Folder with Full control. Into a page, it is a sub-page with its project's people
      and a home block at the end of the parent's Main document. */
      if (parentId === undefined) {
        await tx.execute(
          sql`INSERT INTO folder_members (folder_id, user_id, access)
              VALUES (${folderId}::uuid, ${viewerId}::uuid, 'full_control')`,
        )
        await recordAccessTransition(tx, {
          folderId,
          memberId: viewerId,
          previousAccess: null,
          newAccess: 'full_control',
          actorId: viewerId,
          transition: 'created_owner',
        })
      } else {
        await appendHomeBlock(tx, parentId, folderId)
      }
      const taskMap = new Map<string,string>()
      /* New Labels in this Folder, never merged by name. A duplicate name (by lower(name)) throws to the route's 422,
      rolling back the whole import. */
      const labelIdOf = await createWorkflowFolderLabels(
        tx,
        folderId,
        folder.labels ?? [],
        folderIndex,
      )
      const flatBlocks =
        folder.document === undefined && folder.page === undefined
          ? (folder.blocks ?? [])
          : []
      for (const [index, block] of flatBlocks.entries()) {
        await tx.execute(
          sql`INSERT INTO page_blocks (folder_id, kind, position, text)
              VALUES (${folderId}::uuid, ${block.kind}, ${index},
                      ${block.text})`,
        )
      }
      /* Format 4 Tasks are page blocks, formats 1 to 3 a collection; the schema refuses a folder carrying both. */
      const work: ImportWorkflowTask[] =
        folder.page === undefined
          ? (folder.tasks ?? [])
          : folder.page.blocks.flatMap((block) =>
              block.kind === 'task' ? [block] : [],
            )
      /** Minted ids in file order, so format 4's page can name its Tasks by position. */
      const madeTaskIds: string[] = []
      // Imported work arrives pending, unticked and the importer's. Ids, people, due dates and states never travel.
      for (const [taskIndex,task] of work.entries()) {
        // A repeat or a reminder needs a date and the file carries none, so it gets the day the import ran.
        const dated =
          task.recurrence_rule !== undefined || task.reminder !== undefined
        const madeTask = await rowsOf(
          tx,
          sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                                 recurrence_rule, series_id, assignee_id,
                                 created_by, created_at)
              VALUES (${folderId}::uuid, ${task.title},
                      ${task.notes ?? null}, ${task.important ?? false},
                      ${dated ? anchor : null}::date,
                      ${task.recurrence_rule ?? null},
                      ${task.recurrence_rule === undefined ? null : randomUUID()}::uuid,
                      ${viewerId}::uuid, ${viewerId}::uuid, ${clock()})
              RETURNING id`,
        )
        const taskId = String(madeTask[0]?.id)
        madeTaskIds.push(taskId)
        if (task.key !== undefined) taskIdOfKey.set(task.key, taskId)
        const sourceTaskId=folder.document?.task_ids[taskIndex]
        if(sourceTaskId!==undefined)taskMap.set(sourceTaskId,taskId)
        // A workflow's steps are the task's checklist, after its notes.
        try {
          await appendChecklist(tx, taskId, task.steps ?? [])
        } catch (error: unknown) {
          if (!(error instanceof ChecklistCapRefusal)) throw error
          throw new DocumentRefusal(
            'not_convertible',
            error.message,
            folder.page === undefined
              ? `folders.${String(folderIndex)}.tasks.${String(taskIndex)}.steps`
              : `folders.${String(folderIndex)}.page`,
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
        /* The schema refused undeclared keys, so this lookup is total. */
        await applyWorkflowTaskLabels(
          tx,
          folderId,
          taskId,
          (task.labels ?? []).flatMap((key) => {
            const id = labelIdOf.get(key)
            return id === undefined ? [] : [id]
          }),
        )
      }
      /*
      Format 4's page goes through `applyDocument`, so it obeys exactly the rules of a person's own save.
      This code only turns positions into fresh ids; a placeholder resolves to nothing.
       */
      if(folder.page!==undefined){
        const page=folder.page
        const reading=readWorkflowPage(page.blocks)
        /* Unreachable through the endpoint (`canonicalWorkflowBody` refuses it); asserted to avoid a half-built page. */
        /* The folder index, carried on every refusal so a multi-folder file says which page broke. */
        const pageField=`folders.${String(folderIndex)}.page`
        if(reading.issues.length>0)throw new DocumentRefusal('not_convertible','The workflow page names content it does not carry.',pageField)
        const idOf=new Map<number,string>()
        let placed=0
        for(const item of reading.items){
          if(item.kind==='task'){
            const made=madeTaskIds[placed]
            placed+=1
            if(made===undefined)throw new DocumentRefusal('not_convertible','The workflow page names more Tasks than it carries.',pageField)
            idOf.set(item.index,made)
          } else idOf.set(item.index,randomUUID())
        }
        const operations:DocumentOperation[]=[]
        for(const item of reading.items){
          const block=page.blocks[item.index]
          if(item.kind==='task'||block===undefined||block.kind==='task'||block.kind==='omitted')continue
          operations.push({
            op:'put_block',
            id:idOf.get(item.index) as string,
            block_kind:block.kind,
            text:block.text??null,
            rich_content:block.rich_content??null,
            /* Format 4 pages carry writing only: no file, no folder reference. */
            file_id:null,
            ref_folder_id:null,
            width_pct:null,
            checked:block.kind==='checklist'?(block.checked??false):null,
          })
        }
        operations.push({op:'set_outline' as const,items:reading.items.map(item=>({
          kind:item.kind,
          id:idOf.get(item.index) as string,
          section_block_id:item.sectionIndex===null?null:(idOf.get(item.sectionIndex) as string),
          list_parent_block_id:item.listParentIndex===null?null:(idOf.get(item.listParentIndex) as string),
        }))})
        const base=await documentMetadata(tx,folderId)
        /* Adds the field path to a `DocumentRefusal`; anything else passes through, so a 500 stays a 500. */
        try{
          await applyDocument(tx,viewerId,folderId,{action:'document_transaction',mutation_id:randomUUID(),base_revision:base.revision,operations})
        }catch(error:unknown){
          if(error instanceof DocumentRefusal && error.field===undefined)throw new DocumentRefusal(error.kind,error.message,pageField)
          throw error
        }
      }
      if(folder.document!==undefined){
        const document=folder.document
        if(document.task_ids.length!==(folder.tasks??[]).length || new Set(document.task_ids).size!==document.task_ids.length)throw new DocumentRefusal('not_convertible','Workflow Task identities do not match its work.')
        const blockMap=new Map(document.blocks.map(op=>{
          if(op.op!=='put_block')throw new DocumentRefusal('not_convertible','Workflow blocks must be typed content.')
          return [op.id,randomUUID()]
        }))
        const imageMap=new Map<string,string>()
        const operations:DocumentOperation[]=[]
        for(const op of document.blocks){
          if(op.op!=='put_block')throw new DocumentRefusal('not_convertible','Workflow blocks must be typed content.')
          let fileId=op.file_id
          /* A file_id is account-specific: the importer must be able to read it, or the import is refused.
          `copyPageFile` keeps the file's kind. */
          if(fileId!==null){
            const permitted=await rowsOf(tx,sql`SELECT f.id FROM files f WHERE f.id=${fileId}::uuid AND ${readableFileScope(viewerId)}`)
            if(permitted.length===0||store===undefined)throw new DocumentRefusal('file_not_here','A file this workflow refers to is not accessible to you.')
            const existing=imageMap.get(fileId)
            if(existing!==undefined)fileId=existing
            else {
              const held=await copyPageFile(tx,store,viewerId,fileId,folderId)
              if(held.kind!=='copied')throw new DocumentRefusal('file_not_here','A file this workflow refers to could not be copied.')
              copiedObjects.push(held.id);imageMap.set(fileId,held.id);fileId=held.id
            }
          }
          operations.push({...op,id:blockMap.get(op.id)!,file_id:fileId})
        }
        const outline=document.outline.map(item=>{
          const id=(item.kind==='block'?blockMap:taskMap).get(item.id)
          const parent=item.section_block_id===null?null:blockMap.get(item.section_block_id)
          // A list parent the file does not carry is a broken file, refused.
          const listParent=item.list_parent_block_id===null?null:blockMap.get(item.list_parent_block_id)
          if(id===undefined||parent===undefined||listParent===undefined)throw new DocumentRefusal('not_convertible','Workflow outline references missing content.')
          return {...item,id,section_block_id:parent,list_parent_block_id:listParent}
        })
        operations.push({op:'set_outline' as const,items:outline})
        const base=await documentMetadata(tx,folderId)
        await applyDocument(tx,viewerId,folderId,{action:'document_transaction',mutation_id:randomUUID(),base_revision:base.revision,operations})
      }
      if (folder.purpose !== undefined) {
        /* Format 5's Purpose becomes the project's Purpose tab (a child Doc page when importing into a page). */
        const purposeId = await addDocPage(
          tx,
          viewerId,
          folderId,
          folder.purpose.display_name ?? 'Purpose',
          'before',
        )
        const idOf = new Map<number, string>()
        const carried = folder.purpose.blocks
          .map((block, index) => ({ block, index }))
          .filter(({ block }) => block.kind !== 'omitted')
        carried.forEach(({ index }) => idOf.set(index, randomUUID()))
        const keys = initialKeys(carried.length)
        for (const [position, entry] of carried.entries()) {
          const block = entry.block
          if (block.kind === 'omitted') continue
          const id = idOf.get(entry.index)
          if (id === undefined) {
            throw new DocumentRefusal(
              'not_convertible',
              'Purpose block identity could not be reconstructed.',
              `folders.${String(folderIndex)}.purpose`,
            )
          }
          await tx.execute(
            sql`INSERT INTO page_blocks
                  (id, folder_id, kind, position, text, rich_content, file_id,
                   width_pct, checked, page_position)
                VALUES (${id}::uuid, ${purposeId}::uuid, ${block.kind},
                        ${position}, ${block.text ?? null},
                        ${block.rich_content === null || block.rich_content === undefined
                          ? null
                          : JSON.stringify(block.rich_content)}::jsonb,
                        NULL, NULL,
                        ${block.kind === 'checklist' ? (block.checked ?? false) : null},
                        ${keys[position] as string})`,
          )
        }
        for (const entry of carried) {
          const block = entry.block
          if (block.kind === 'omitted' || block.list_parent === undefined) {
            continue
          }
          const child = idOf.get(entry.index)
          const parent = idOf.get(block.list_parent)
          if (child === undefined || parent === undefined) {
            throw new DocumentRefusal(
              'not_convertible',
              'Purpose list structure names content the file did not carry.',
              `folders.${String(folderIndex)}.purpose`,
            )
          }
          await tx.execute(
            sql`UPDATE page_blocks
                    SET list_parent_block_id = ${parent}::uuid
                  WHERE id = ${child}::uuid AND folder_id = ${purposeId}::uuid`,
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
    /* The file's own dependencies, after every Task exists, in this transaction. The schema already refused
    duplicate keys, self-edges and cycles. */
    const edges = workflowDependencyEdges(file.folders).flatMap(
      ([dependentKey, blockerKey]): IdPair[] => {
        const dependent = taskIdOfKey.get(dependentKey)
        const blocker = taskIdOfKey.get(blockerKey)
        return dependent === undefined || blocker === undefined ? [] : [[dependent, blocker]]
      },
    )
    // One statement for every edge. `pairSet` columns: `old_id` is the dependent, `new_id` the blocker.
    if (edges.length > 0) {
      await tx.execute(
        sql`INSERT INTO task_dependencies
              (dependent_task_id, blocking_task_id, created_by)
            SELECT e.old_id, e.new_id, ${viewerId}::uuid FROM ${pairSet(edges)} e
            ON CONFLICT ON CONSTRAINT task_dependencies_pair_key DO NOTHING`,
      )
    }
    return { kind: 'imported', folders: created } as const
  }).catch(async(error:unknown)=>{
    if(store!==undefined)for(const id of copiedObjects){try{await store.remove(id)}catch{/* Preserve the original refusal. */}}
    throw error
  })
}

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
    // Every page of the project has the project's owner.
    await tx.execute(
      sql`UPDATE folders SET owner_id = ${targetId}::uuid
          WHERE project_id = ${folderId}::uuid`,
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

/*
The object acts (7.16): duplicate for tasks and folders under
DES-198's copy rules, the workflow import under DES-206's, and the direct
ownership transfer of 8.9's second form.

DES-198, as 7.16 states it: a copy takes the structure and never the grants, the
progress, or the conversation; the work lands on whoever made the copy; and
due dates are shifted rather than copied, but only when the plan is spent.
The intervals are what a template keeps, so when the folder's earliest date
has already passed, every date moves forward by the same days that bring
that earliest date to today; dates still ahead are a live plan and copy
untouched.

**The comparison day is today in the caller's zone, never the database
session's `current_date` (issue #76).** 8.1 defines today as the current date
in the request's tz and says in terms that an endpoint which evaluates a date
and takes no tz is an incomplete surface rather than an invitation to
substitute the stored zone. Both duplicates take `tz` on 7.8's precedent, exactly as 7.16's import does: present and invalid is 422, absent is
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
/* 4.11 calendar arithmetic rather than a second copy of it here: both ends are
   UTC midnights, so no DST shift can round the division (issue #215). */
import { addDays, daysBetween } from '../time/calendar-date.js'

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
/**
 * 10.3's gigabyte, refused from inside a transaction that has already written.
 *
 * It is an error rather than a returned outcome for one reason, and the reason
 * is measured: a `return` out of an `inTransaction` callback resolves it and
 * drizzle commits, so a refusal raised after the folder row exists leaves that
 * folder behind. Issue #128 found that for the folder cover and answered it by
 * copying before the INSERT; a page asset's scope is the new folder's id, so it
 * cannot be copied first and has to leave by the path that rolls back instead.
 * Never caught anywhere but at the bottom of `duplicateFolder`, which turns it
 * back into the ordinary `quota_exceeded` answer 10.3 specifies.
 */
class QuotaRefusal extends Error {}

/** Rewrite only Dana Links whose targets this copy has actually remapped.
 * Everything else remains authored text pointing where the author pointed it. */
function remapRichContentLinks(
  value: unknown,
  remap: (kind: ReferenceKind, id: string) => string | null,
): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const content = value as { version?: unknown; runs?: unknown }
  if (!Array.isArray(content.runs)) return value
  return {
    ...content,
    runs: content.runs.map((run) => {
      if (typeof run !== 'object' || run === null || Array.isArray(run)) return run
      const record = run as Record<string, unknown>
      const href = typeof record.href === 'string' ? record.href : null
      if (href === null) return run
      const target = parseDanaLink(href)
      if (target === null) return run
      const id = remap(target.kind, target.id)
      return id === null
        ? run
        : { ...record, href: referencePath(target.kind, id) }
    }),
  }
}

/**
 * Where a sub-page's copy goes: under the same parent, directly after the
 * original. Null (a top-level copy) when the source is a root, or when the
 * duplicator may not add a page under its parent.
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

/** A top-level copy: the original's collection, and the slot after it in the
 * duplicator's stored Library order (4.19's `sidebar_order`) when that names it. */
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
      /* The tree lock before anything is read (lock order), so the copy's
         place beside the original cannot move under it. */
      await lockPageTree(tx)
      const place = await placeOfCopy(tx, viewerId, sourceFolderId)
      /* Step 8: a copy into a page is a sub-page, which the cap does not
         count (projectCapReached). */
      if (place === null && (await projectCapReached(tx, viewerId, 1))) {
        return { kind: 'folder_cap' } as const
      }

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
                     cover_preset, cover_focal_y, kind, project_id FROM folders
              WHERE id = ${sourceFolderId}`,
        )
      )[0]
      const name = `${String(source?.name ?? 'Folder')} (copy)`.slice(0, 100)

      /*
      **The cover picture is carried, and until 2026-09-04 it was not.** This
      block said "the cover is deliberately not carried: its file row is the
      source folder's and its visibility scope would lie in the copy", which
      diagnosed the problem exactly and then dropped the picture rather than
      solving it — so a duplicated folder wore its preset and its crop
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

      /* Step 7: a top-level copy is a new project of the source page's kind;
         a sub-page copy joins its parent's project. */
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
      /* #228 puts duplication with Can edit, and the copy is the
         duplicator's own new Folder, so they are its owner and its Full
         control, and **nothing about the source's
         Access travels** -- R10B says member identities, Access standing and
         Responsibility documents are not copied by duplication or workflows
         (issue #228). Step 8: a sub-page copy's people and owner are its
         project's, so only a top-level copy gets a membership row. */
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
      /* Beside the original: a sub-page as `createSubPage` makes one, or a
         top-level page next to it in the duplicator's own Library. */
      if (place === null) await placeBesideInLibrary(tx, viewerId, sourceFolderId, copyId)
      else await appendHomeBlock(tx, place.parentId, copyId)
      if (coverFileId !== null) {
        // The scope, now that there is a folder to name (4.16, 7.15).
        await tx.execute(
          sql`UPDATE files SET folder_id = ${copyId}::uuid
              WHERE id = ${coverFileId}::uuid`,
        )
      }

      // Copy explicit membership and mixed placement; never infer parents from proximity.
      // Wave 2: a `page` block is its sub-page's one home and the duplicate
      // copies this page alone, so the sub-pages keep theirs in the source.
      const blocks = await rowsOf(tx,sql`SELECT * FROM page_blocks WHERE folder_id=${sourceFolderId}::uuid AND kind <> 'page' ORDER BY position,id`)
      const sectionMap = new Map(blocks.map(block=>[String(block.id),randomUUID()]))
      /*
      Every page asset is copied into the new folder as an independent file,
      and **the copy keeps the source's own kind** (#220).

      This used to be `copyCoverFile` followed by `UPDATE files SET
      kind = 'image'`, which was exactly right while a page block could only
      hold a picture and is exactly wrong now that it may be a File, an Audio
      or a Video. Those two statements would have made a duplicated MP4 declare
      itself an image and a duplicated generic File — untrusted bytes, served
      as an attachment — declare itself previewable media, which is the
      insertion mode the person chose being destroyed by the copy. `copyPageFile`
      is the primitive both call sites wanted: same bytes, same kind, same
      metadata, new row, new scope. Nothing rewrites the kind afterwards.

      One copy per source file rather than one per block, so a picture placed
      twice on a page is one new row read twice and not two rows free to
      diverge. Quota refusal returns out of the transaction before any folder
      row exists, and `copiedObjects` carries what has been written so the
      catch can remove the bytes: no half-created folder and no orphan.
      */
      const copiedFiles = new Map<string,string>()
      for(const block of blocks){
        let fileId:string|null=null
        if(block.file_id != null){
          const originalFile=String(block.file_id)
          fileId=copiedFiles.get(originalFile)??null
          if(fileId===null){
            const held=await copyPageFile(tx,store,viewerId,originalFile,copyId)
            /* **Thrown rather than returned, and that is a fix rather than a
               style (#220, proof 16).** A `return` out of an `inTransaction`
               callback *resolves* it, so drizzle commits — which is the exact
               fault issue #128 found and fixed for the folder cover by moving
               that copy ahead of the INSERT. The page assets cannot move ahead
               of it, because their scope is the new folder's id. So the other
               half of #128's lesson applies instead: a refusal that must undo
               a write has to leave by the path that rolls back. Measured on
               this branch before the change — a caller at 10.3's gigabyte got
               413 and kept a "(copy)" folder with a membership row, a partial
               page and the file rows copied before the refusal.

               The catch at the bottom recognises it, removes the bytes the
               rollback cannot reach, and answers `quota_exceeded` exactly as
               the return did. Nothing above this sees an exception. */
            if(held.kind==='quota_exceeded')throw new QuotaRefusal()
            if(held.kind==='copied'){
              fileId=held.id;copiedObjects.push(fileId);copiedFiles.set(originalFile,fileId)
            }
          }
        }
        await tx.execute(sql`INSERT INTO page_blocks (id,folder_id,kind,position,text,rich_content,ref_folder_id,file_id,width_pct,page_position,checked) VALUES (${sectionMap.get(String(block.id))}::uuid,${copyId}::uuid,${String(block.kind)},${Number(block.position)},${block.text??null},${block.rich_content==null?null:JSON.stringify(block.rich_content)}::jsonb,${block.ref_folder_id??null}::uuid,${fileId}::uuid,${block.width_pct??null},${block.page_position??null},${block.checked==null?null:Boolean(block.checked)})`)
      }
      /* Both parent relations are remapped through the same copied-id map and
         neither is inferred: a Section stays a Section's, a nested list item
         stays that list item's (#219). A checklist item's tick is authored
         content and is copied with the writing, unlike a Task's status, which
         the comment below explains arrives pending. */
      for(const block of blocks)if(block.section_block_id!=null)await tx.execute(sql`UPDATE page_blocks SET section_block_id=${sectionMap.get(String(block.section_block_id))??null}::uuid WHERE id=${sectionMap.get(String(block.id))}::uuid`)
      for(const block of blocks)if(block.list_parent_block_id!=null)await tx.execute(sql`UPDATE page_blocks SET list_parent_block_id=${sectionMap.get(String(block.list_parent_block_id))??null}::uuid WHERE id=${sectionMap.get(String(block.id))}::uuid`)

      /*
      The Folder's Label vocabulary, before the tasks that point at it (#227
      area 2). A duplicated Folder is a **new Folder-Label scope**: every
      definition is re-created under a new id, archived ones archived, and the
      copied tasks' assignments are remapped onto those ids below. Pointing the
      copy at the source's ids would be refused by migration 0022's composite
      key, so the only way to get this wrong is to lose the classification
      rather than to share it.
      */
      const labelPairs = await copyFolderLabelCatalog(
        tx,
        sourceFolderId,
        copyId,
      )

      // Structure, never the life (DES-198): every status arrives pending,
      // steps arrive undone, the work is the maker's, a repeat is a new
      // series, and my_day, reminders, comments and events stay home.
      const tasks = await rowsOf(
        tx,
        sql`SELECT id, title, notes, important,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
                   to_char(due_date, 'YYYY-MM-DD') AS due_date,
                   recurrence_rule, section_block_id, position, page_position
            FROM tasks
            WHERE folder_id = ${sourceFolderId} AND deleted_at IS NULL
            ORDER BY created_at ASC, id ASC`,
      )
      /* Old task id to new, built as the loop below inserts, because the
         dependency relation is copied from it afterwards (issue #224) and the
         Label remap below reads it too (#227 area 2). The rule is that
         relationships travel only when both ends travel together, and this map
         is the definition of "travelled": a task that is not in it did not
         come, whether because it is trashed or because it lives in another
         folder, and an edge touching it is dropped rather than pointed back at
         the original. Nothing else pairs the two rows: the copy shares the
         source's title and its position and has neither its id nor any column
         pointing back at it. */
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
          /* The hand order (4.5's position) is part of the structure a duplicate keeps: without it the
             copy came out in creation order, which is not the order the
             person had arranged. */
          sql`INSERT INTO tasks
                (folder_id, title, notes, important, start_date, due_date, recurrence_rule,
                 series_id, assignee_id, created_by, section_block_id, position, page_position)
              VALUES (${copyId}::uuid, ${String(task.title)},
                      ${task.notes === null ? null : String(task.notes)},
                      ${task.important === true},
                      ${task.start_date === null || task.start_date === undefined ? null : String(task.start_date)}::date,
                      ${task.due_date === null ? null : String(task.due_date)}::date,
                      ${rule},
                      ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                      ${viewerId}::uuid, ${viewerId}::uuid, ${section},
                      ${task.position === null || task.position === undefined ? null : String(task.position)}, ${task.page_position??null})
              RETURNING id`,
        )
        const newTaskId = String(inserted[0]?.id)
        taskIdentity.set(String(task.id), newTaskId)
        /* #221: the Task's document travels with it, its checklist (the
           subtasks) unticked. A media block's file is
           copied into the new folder once, through the same map the page's
           own assets use, and a quota refusal rolls the whole copy back. */
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
      #211: Purpose is reusable authored Folder context. Since step 7 it is the
      project's Purpose tab (`purposeTabOf`: the first Doc tab before Work),
      and a copy of a project gets its own Purpose tab with independent
      blocks and files. Dana Links are remapped only for targets this
      duplicate already has an identity map for.
      #213: Results is deliberately not copied. It records the source
      Folder's actual outcomes, not reusable intent (7.16). Nor are the other
      tabs, as a facet never was. The Purpose tab is a page with its own
      people, so it is copied only when the duplicator can read it.
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
              // A page accepts only its own files: the copy is scoped to the
              // new Purpose tab.
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

      /* The dependency relation, after every task exists and so after the
         identity map is whole (issue #224). It is inside this transaction
         with everything else: a folder whose work arrived and whose ordering
         between that work did not is a half-made copy, and the copy is one
         unit. Only edges with both endpoints in the map are carried, which is
         the accepted rule stated once in `copyDependenciesWithin`. */
      await copyDependenciesWithin(tx, taskIdentity, viewerId)

      /*
      The assignments, now that both id mappings exist (#227 area 2). Three
      statements: the Tasks' Folder Labels remapped onto the copy's own
      vocabulary, the duplicator's active Personal Labels on the source Folder,
      and their active Personal Labels on the source Tasks. Nobody else's
      Personal Labels cross, and no archived Personal Label is newly attached —
      while the Folder's own archived definitions and the assignments against
      them do come across, because that is the taxonomy being duplicated rather
      than a new application of a retired Label.
      */
      await copyFolderLabelAssignments(
        tx,
        viewerId,
        sourceFolderId,
        copyId,
        labelPairs,
        [...taskIdentity],
      )

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
        /*
        start_date moves with it (issue #215).

        The point of this shift is in the line above it: one delta for the whole
        folder, so the copy keeps the intervals the person arranged. A start
        date left where it stood breaks exactly that, and breaks it worst on the
        task the shift is derived from - a plan starting 1 January and due 10
        January, duplicated in September, would come out starting in January and
        due today. Copying the field as it stands is right only for the
        single-task act below, where one spent deadline is clamped onto today
        rather than a folder being moved bodily.

        Both columns take the same delta, so a pair that satisfied
        tasks_start_before_due_check still does. The WHERE widens because the
        shift is computed from due dates but is a property of the folder: a
        start-only task in a folder being moved forward moves with it. NULL + int
        is NULL, so neither SET has to test the column it writes.
        */
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
        /* The bar and the History line say which of 9.6's two things happened
           (L-055). */
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
 * The copy carries the title, the notes, the document with its checklist
 * (all unticked), the section, the due date and the repeat, and never the
 * conversation, the completion, or the assignment, which lands on whoever
 * made the copy. The date follows 9.6's one rule for a
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
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${source.folderId}::uuid FOR UPDATE`)
    const stored = (
      await rowsOf(
        tx,
        sql`SELECT title, notes, important,
                   to_char(start_date, 'YYYY-MM-DD') AS start_date,
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
    /* The start is the earlier end, so it is the one that decides whether a
       zone is needed to tell past from future. */
    if (anchor === null && zoneIsNeededToReanchor(storedStart ?? storedDue)) {
      return { kind: 'tz_required' } as const
    }
    /*
    9.6's rule applied in the caller's zone, and Imran's ruling on #215 for the
    start: a duplicate never begins before it existed.

    - no start: a spent due date moves up to today, a future one copies;
    - a start today or later copies with its due date as they stand;
    - a past start moves to today; a due date still ahead stays, a spent one
      moves forward by the original start-to-due span; a start alone just moves.

    In the arm where no zone was named, the guard above has proved every date
    is ahead in every zone, so `anchor` being null copies both as they stand.
    tasks_start_before_due_check holds in every arm: the pair either keeps its
    order or is rebuilt from today plus a non-negative span.
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
            (folder_id, title, notes, important, start_date, due_date, recurrence_rule,
             series_id, assignee_id, created_by, section_block_id,page_position)
          VALUES (${source.folderId}::uuid, ${title},
                  ${row?.notes === null ? null : String(row?.notes ?? '')},
                  ${row?.important === true},
                  ${startForCopy}::date,
                  ${dueForCopy}::date,
                  ${rule},
                  ${rule === null ? sql`NULL` : sql`gen_random_uuid()`},
                  ${viewerId}::uuid, ${viewerId}::uuid,
                  ${row?.section_block_id === null ? null : String(row?.section_block_id)},${pagePosition})
          RETURNING id`,
    )
    const newId = String(inserted[0]?.id)
    /*
    The Labels (#227 area 1). The copy is in the source's own Folder, so the
    Folder Label assignments carry the **same** ids: the vocabulary is already
    the copy's. The duplicator's own Personal assignments cross, nobody else's
    does, and neither side newly attaches an archived Label — a duplicate is a
    new application, and archived means "may not be newly applied".

    Classification is structure rather than life, which is the DES-198 line
    this sits under: the copy arrives pending, unassigned to anyone but its
    maker and with its conversation left behind, and it arrives wearing the
    same Labels the original wore.
    */
    /* #221: the Task's document travels with its notes, which is its
       projection. Same folder, so a media block names the same file. Its
       checklist (the subtasks) comes across unticked. */
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

/* ------------------------------------------------------------------ *
 * POST /workflows/import
 * ------------------------------------------------------------------ */

export type ImportResult =
  | { kind: 'imported'; folders: Array<{ id: string; name: string }> }
  | { kind: 'folder_cap' }
  /* Only with `parentId` (POST /folders/:id/import), on `createSubPage`'s
     terms: the parent is missing, trashed or not the actor's (404); below
     edit rights there (403); a default folder (422); too deep (422). */
  | { kind: 'parent_not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'default_parent' }
  | { kind: 'too_deep' }

export async function importWorkflow(
  db: Db,
  viewerId: string,
  file: ImportWorkflowBody,
  /** today(V) in the zone the request named, or null where the file asks no
   * date to be evaluated. The caller resolves it, because 8.1 makes the zone
   * an input of the request rather than a fact the server holds. */
  anchor: string | null = null,
  store?: ObjectStore,
  /** The page the file's folders become sub-pages of, in file order after
   * its existing children; absent, they are top-level pages. */
  parentId?: string,
): Promise<ImportResult> {
  const copiedObjects:string[]=[]
  /*
  The import's own clock, the sample workspace's fix (`server/sample/workspace.ts`).
  The whole import is one transaction, where `now()` is one instant, so every
  Folder and Task it made shared a `created_at`, and every list ordering by
  `created_at, id` fell through to the random uuid: the Tasks read in a
  different order from the file. Each row takes its own millisecond instead, in
  file order, within the minute before now so nothing is created in the future.
  */
  let tick = 0
  const clock = (): SQL => {
    tick += 1
    return sql`now() - interval '60 seconds' + ${tick}::int * interval '1 millisecond'`
  }
  return inTransaction(db, async (tx) => {
    /* Into a page: `createSubPage`'s gate, under the tree lock taken before
       anything is read, so a concurrent move cannot deepen or trash the
       parent between the check and the inserts. */
    if (parentId !== undefined) {
      await lockPageTree(tx)
      const parent = await folderActorFacts(tx, viewerId, parentId)
      if (parent === null) return { kind: 'parent_not_found' } as const
      const decision = mayPerform(parent, PAGE_TREE_EDIT_ACTION)
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason } as const
      if (parent.isDefault) return { kind: 'default_parent' } as const
      if (!(await mayAddChildUnder(tx, parentId))) return { kind: 'too_deep' } as const
    }
    /* Step 8: into a page, the file's folders are sub-pages, which the cap
       does not count (projectCapReached). */
    if (parentId === undefined && (await projectCapReached(tx, viewerId, file.folders.length))) {
      return { kind: 'folder_cap' } as const
    }

    const created: Array<{ id: string; name: string }> = []
    /** The file's task keys (#207) onto the ids this import minted, across
     * every folder of the file, because a dependency may cross Folders. */
    const taskIdOfKey = new Map<string, string>()
    /* Indexed, because `createWorkflowFolderLabels` needs to be able to say
       *which* folder of the file the database refused a vocabulary for, and
       the path it answers with — `folders.<n>.labels` — is the one
       `canonicalWorkflowBody`'s own refusals already use. */
    for (const [folderIndex, folder] of file.folders.entries()) {
      const childPosition =
        parentId === undefined ? null : await lastChildPosition(tx, parentId)
      /* Step 7: a top-level import is a Work project; into a page, a Work
         sub-page of that page's project. */
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
      /* #228's account-state boundary: importing a workflow is an
         account-level creation act, so the importer becomes owner and Full
         control of the Folder it
         creates, and the file carries no member standing to restore.
         Step 8: into a page, the new page is a sub-page as `createSubPage`
         makes one: its project's people and owner, and a home block at the
         end of the parent's Main document. */
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
      /*
      The Folder's reusable vocabulary, before the work that points at it
      (#227 area 4). **New identities inside this Folder**, always active, and
      never merged against anything by name: the Folder was created three
      statements ago and its catalog is empty, so there is nothing to merge
      with. The file's own keys are the only join, and the schema has already
      refused a file that names a key it does not declare.

      **A file whose vocabulary contradicts itself by *name* is refused here
      rather than by the schema**, and that is deliberate: the fold is
      `labels_folder_name_idx`'s `lower(name)` and a second one in JavaScript
      disagrees with it. The throw leaves this transaction on its way to the
      route, which turns it into the same 422 the schema's own refusals
      answer, so nothing half-made survives — the folder three statements ago
      included.
      */
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
      /*
      The work, wherever the file wrote it.

      **A format 4 Task is a block of the page and a format 1 to 3 Task is a
      member of a collection, and they are the same Task** — the same keys, the
      same caps, the same anchor rule. So the loop below reads one list, and
      which list that is is the only thing the version decides. The schema has
      already refused a folder that carries both (#185), so there is no case in
      which these two sources are both non-empty.
      */
      const work: ImportWorkflowTask[] =
        folder.page === undefined
          ? (folder.tasks ?? [])
          : folder.page.blocks.flatMap((block) =>
              block.kind === 'task' ? [block] : [],
            )
      /** The ids this import minted, in the file's own order, so that format
       * 4's page can name its Tasks by position. */
      const madeTaskIds: string[] = []
      // Work arrives as typed work would: pending, unticked, the
      // importer's (the DES-198 contradiction's one rule). What travels is
      // the 7.16 list and no more; what does not
      // is still ids, people, due dates and states.
      for (const [taskIndex,task] of work.entries()) {
        // A repeat needs 4.5's anchor and a reminder needs 8.6's, and the
        // file carries no date, so the day the run began is the date they
        // get. A task carrying neither stays undated, which is what the
        // exclusion is about.
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
        /* The file's keys remapped onto the ids this import minted. A key the
           file never declared cannot reach here — `canonicalWorkflowBody`
           refuses the file — so the lookup is total and nothing is dropped in
           silence. */
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
      Format 4's page, rebuilt through the transaction that already owns a
      page's structure (#185).

      **`applyDocument` is the validator, and reusing it is the point.** It is
      what a person's own save goes through, so an imported page is refused by
      exactly the rules a typed one is: contiguous Sections, at most
      `MAX_SECTION_DEPTH` heading levels, a list parent that precedes its
      descendants and shares their Section, 500 blocks, 1000 Tasks, no repeated
      identity, and no Task left off the outline. Writing a second validator
      here would be a second set of rules to keep in step with that one, which
      is the failure mode this whole issue is about.

      **What this code does and nothing more**: turn positions into identities.
      Every carried block gets a fresh uuid, every Task block resolves to the
      row the loop above just inserted, and the outline's two parents are those
      same positions looked up in the same table. A placeholder resolves to
      nothing at all, which is what makes it import as nothing.
      */
      if(folder.page!==undefined){
        const page=folder.page
        const reading=readWorkflowPage(page.blocks)
        /* Unreachable through the endpoint: `canonicalWorkflowBody` runs the
           same reading and answers 422 naming the block. Asserted rather than
           assumed because the alternative is a `Map.get` returning undefined
           three lines down and a half-built page. */
        /* Where in the body this page came from, carried on every refusal this
           arm can raise. `readWorkflowPage`'s own issues reach a caller as a
           zod path down to the block; `applyDocument`'s reach them as a rule
           about a page, and a file with two folders in it deserves to be told
           which page (7.16's 2026-09-21 amendment). The folder index is the
           least this can say and is said always; nothing here pretends to
           locate a structural refusal at a block, because `applyDocument`
           works in minted ids and has no way back to a file position. */
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
            /* A format 4 file carries no picture, no stored file and no folder
               reference, so there is nothing here to authorize and nothing to
               copy: the page it rebuilds holds writing only (#185). */
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
        /* The structural rules are `applyDocument`'s and stay there; what this
           adds is the address. A refusal that already names a field keeps it,
           and anything that is not a `DocumentRefusal` passes through
           untouched — a 500 is not made into a 422 by being caught here. */
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
          /*
          A workflow file names a `file_id`, and **that id is account-specific
          rather than portable**. #185 owns the portable asset bundle and #220
          must not pretend to have built one, so the rule here is unchanged and
          is the truthful one: the importer must be able to read the row the
          file names, or the import is refused outright. It is never silently
          dropped and the block is never imported pointing at nothing, because
          either would be a workflow claiming to carry an asset it does not.

          What #220 changes is only the copy, for the reason the duplication
          path above gives: `copyPageFile` preserves the kind, where
          `copyCoverFile` plus a rewrite to `image` would have relabelled a
          File, an Audio or a Video on the way in. The wording widens with it —
          these are not all images any more.
          */
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
          // #219's second parent, remapped through the same map and refused on
          // the same terms: a file naming a list parent it does not carry is a
          // broken file rather than a flattened list.
          const listParent=item.list_parent_block_id===null?null:blockMap.get(item.list_parent_block_id)
          if(id===undefined||parent===undefined||listParent===undefined)throw new DocumentRefusal('not_convertible','Workflow outline references missing content.')
          return {...item,id,section_block_id:parent,list_parent_block_id:listParent}
        })
        operations.push({op:'set_outline' as const,items:outline})
        const base=await documentMetadata(tx,folderId)
        await applyDocument(tx,viewerId,folderId,{action:'document_transaction',mutation_id:randomUUID(),base_revision:base.revision,operations})
      }
      if (folder.purpose !== undefined) {
        /* Step 7: format 5's Purpose becomes the project's Purpose tab, a Doc
           tab before Work (a child Doc page when importing into a page). */
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
    /*
    The file's internal dependencies, after every Task of every folder exists
    (#207), in this same transaction so that work whose ordering did not arrive
    is never a half-made import. `workflowDependencyEdges` keeps only edges
    whose both ends the file declares, and the schema has already refused a
    duplicated key, a self-dependency and a cycle, so every edge here is one
    the live endpoint would admit. No other edge can reach a Task minted three
    statements ago, which is why the file's own graph is the whole graph.
    */
    const edges = workflowDependencyEdges(file.folders).flatMap(
      ([dependentKey, blockerKey]): IdPair[] => {
        const dependent = taskIdOfKey.get(dependentKey)
        const blocker = taskIdOfKey.get(blockerKey)
        return dependent === undefined || blocker === undefined ? [] : [[dependent, blocker]]
      },
    )
    // One statement for every edge (at most WORKFLOW_DEPENDENCY_CAP), not one
    // round trip each; `pairSet`'s columns are named for a copy, and here
    // `old_id` is the dependent and `new_id` the blocker.
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
    // Step 8: every page of the project has the project's owner.
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

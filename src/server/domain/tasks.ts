import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PatchTaskBody,
  PostTasksBody,
  PutTaskReminderBody,
  ReminderInput,
  TaskCard,
  TaskDetail,
  TaskStatus,
} from '../../shared/tasks.js'
import type { DocumentTransaction, PageView } from '../../shared/pages.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import type { ObjectStore } from '../files/store.js'
import {
  applySeriesGuard,
  generateSuccessor,
  planReminder,
  recomputeReminders,
  today,
} from '../time/index.js'
import type { ReminderTrigger } from '../time/index.js'
import { recordEvent } from './events.js'
import { carryTaskFilesOnMove } from './files.js'
import {
  accessOf,
  joinVisibleFolder,
  mayPerform,
  resolveScoped,
  visibleFolder,
} from './folder-access.js'
import type { Scoped } from './folder-access.js'
import type {
  FolderAction,
  FolderActionDecision,
  FolderActorFacts,
} from './folder-access.js'
import { dropFolderLabelsOnMove, taskLabelsOf } from './labels.js'
import { taskDependencyCountsOf } from './task-dependency-counts.js'
import { positionAfter, positionAtSectionEnd, seededItems } from './page-order.js'
import {
  ChecklistCapRefusal,
  TaskDocumentRefusal,
  appendChecklist,
  applyTaskDocumentLocked,
  checklistTicks,
  legacyNotesWrite,
  materializeNotesLocked,
  needsMaterializing,
  taskChecklist,
  taskDocumentViewIn,
} from './task-document.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** A blank Discussion made from a task stays hidden until used. `created_via_task` is provenance only. */
export const UNSTARTED_TASK_THREAD = sql`(
  EXISTS (SELECT 1 FROM discussion_tasks udt
           WHERE udt.discussion_id = d.id AND udt.created_via_task)
  AND d.context IS NULL AND d.current_outcome_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM comments uc WHERE uc.discussion_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM discussion_input_rounds ur
                   WHERE ur.discussion_id = d.id))`

const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
const START_TIME = sql`to_char(t.start_time, 'HH24:MI')`
const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

export interface TaskAccess {
  id: string
  folderId: string
  pageFacetId: string | null
  title: string
  status: TaskStatus
  assigneeId: string | null
  assigneeIds: string[]
  dueDate: string | null
  dueTime: string | null
  recurrenceRule: string | null
  sectionBlockId: string | null
  startDate: string | null
  startTime: string | null
  facts: FolderActorFacts
}

const TASK_ACCESS_COLUMNS = sql`t.id, t.folder_id, t.page_facet_id, t.title, t.status,
       t.assignee_id, t.assignee_ids, ${START_DATE} AS start_date,
       ${START_TIME} AS start_time,
       ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
       t.recurrence_rule, t.section_block_id`

function taskAccessFrom(scoped: Scoped | null): TaskAccess | null {
  if (scoped === null) return null
  const { row, facts } = scoped
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    pageFacetId: nullableString(row.page_facet_id),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    assigneeId: nullableString(row.assignee_id),
    assigneeIds: Array.isArray(row.assignee_ids) ? row.assignee_ids.map(String) : [],
    dueDate: nullableString(row.due_date),
    dueTime: nullableString(row.due_time),
    recurrenceRule: nullableString(row.recurrence_rule),
    sectionBlockId: nullableString(row.section_block_id),
    startDate: nullableString(row.start_date),
    startTime: nullableString(row.start_time),
    facts,
  }
}

export function mayActOnTask(
  task: TaskAccess,
  action: FolderAction,
): FolderActionDecision {
  return mayPerform(task.facts, action, {
    assigneeId: task.assigneeIds.includes(task.facts.actorId)
      ? task.facts.actorId
      : task.assigneeId,
  })
}

export async function accessibleTask(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  return taskAccessFrom(
    await resolveScoped(executor, 'task', taskId, viewerId, {
      columns: TASK_ACCESS_COLUMNS,
    }),
  )
}

async function lockedTask(
  tx: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  return taskAccessFrom(
    await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: TASK_ACCESS_COLUMNS,
      lock: true,
    }),
  )
}

async function displayNameOf(
  executor: Executor,
  userId: string,
): Promise<string> {
  const found = await rowsOf(
    executor,
    sql`SELECT display_name FROM users WHERE id = ${userId}`,
  )
  const name = found[0]?.display_name
  return name === null || name === undefined ? 'a member' : String(name)
}

async function folderMemberIds(
  executor: Executor,
  folderId: string,
): Promise<string[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT user_id FROM folder_members
         WHERE folder_id = (SELECT project_id FROM folders WHERE id = ${folderId}::uuid)
        ORDER BY user_id`,
  )
  return found.map((row) => String(row.user_id))
}

function assigneeArray(ids: readonly string[]): SQL {
  return sql`ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) AS values(value))`
}

function validAssignees(ids: readonly string[], members: readonly string[]): boolean {
  return new Set(ids).size === ids.length && ids.every((id) => members.includes(id))
}

async function inboxOf(executor: Executor, viewerId: string): Promise<string> {
  const found = await rowsOf(
    executor,
    sql`SELECT id FROM folders WHERE owner_id = ${viewerId} AND is_default`,
  )
  const row = found[0]
  if (row === undefined) {
    throw new Error(`user ${viewerId} has no default folder (INV-2)`)
  }
  return String(row.id)
}

/** One TaskDetail read for all Task endpoints. Linked Discussions show only when the viewer can open them. */
export async function taskView(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT t.id, t.title, t.status, t.important, t.notes,
               ${START_DATE} AS start_date, ${START_TIME} AS start_time,
               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
               t.recurrence_rule, t.series_id,
               t.completed_at, t.completed_by,
               cb.id AS creator_id, cb.display_name AS creator_display_name,
               cb.avatar_url AS creator_avatar_url,
               t.created_at, t.updated_at,
               f.id AS folder_id,
               CASE WHEN f.tab_position IS NOT NULL AND f.project_id <> f.id
                 THEN (SELECT pr.name FROM folders pr WHERE pr.id = f.project_id)
                 ELSE f.name END AS folder_name,
               f.is_default AS folder_is_default,
               a.id AS assignee_id, a.display_name AS assignee_display_name,
               a.avatar_url AS assignee_avatar_url,
               (SELECT coalesce(json_agg(json_build_object(
                         'id', au.id, 'display_name', au.display_name,
                         'avatar_url', au.avatar_url) ORDER BY ids.ord), '[]'::json)
                  FROM unnest(t.assignee_ids) WITH ORDINALITY AS ids(user_id, ord)
                  JOIN users au ON au.id = ids.user_id) AS assignees,
               (SELECT count(*)::int FROM page_blocks ck
                 WHERE ck.task_id = t.id AND ck.kind = 'checklist')
                 AS steps_total,
               (SELECT count(*)::int FROM page_blocks ck
                 WHERE ck.task_id = t.id AND ck.kind = 'checklist' AND ck.checked)
                 AS steps_done,
               EXISTS (SELECT 1 FROM my_day_entries e
                        WHERE e.task_id = t.id AND e.user_id = ${viewerId})
                 AS pulled,
               (SELECT i.email FROM invites i
                 WHERE i.task_id = t.id AND i.status = 'pending'
                 ORDER BY i.created_at DESC, i.id DESC LIMIT 1)
                 AS pending_invite_email,
               r.task_id AS reminder_task_id, r.offset_minutes,
               to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day,
               t.section_block_id,
               COALESCE((
                 SELECT json_agg(
                          json_build_object(
                            'id', d.id,
                            'title', d.title,
                            'state', d.state
                          )
                          ORDER BY d.last_activity_at DESC, d.id DESC)
                   FROM discussion_tasks dt
                   JOIN discussions d ON d.id = dt.discussion_id
                  WHERE dt.task_id = t.id
                    AND d.trashed_at IS NULL
                    AND NOT ${UNSTARTED_TASK_THREAD}
                    AND ${visibleFolder(sql`d.folder_id`, viewerId)}
               ), '[]'::json) AS linked_discussions
        FROM tasks t
        ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
        LEFT JOIN users a ON a.id = t.assignee_id
        LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
        LEFT JOIN reminders r ON r.task_id = t.id
        WHERE t.id = ${taskId} AND t.deleted_at IS NULL`,
  )
  const row = found[0]
  if (row === undefined) return null
  const linkedDiscussions = arrayValue(row.linked_discussions).flatMap((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
    const discussion = value as Record<string, unknown>
    if (discussion.id === undefined || discussion.title === undefined) return []
    return [{
      id: String(discussion.id),
      title: String(discussion.title),
      state: discussion.state === 'resolved' ? ('resolved' as const) : ('open' as const),
    }]
  })

  return {
    id: String(row.id),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    important: row.important === true,
    start_date: nullableString(row.start_date),
    start_time: nullableString(row.start_time),
    due_date: nullableString(row.due_date),
    due_time: nullableString(row.due_time),
    folder: {
      id: String(row.folder_id),
      name: String(row.folder_name),
      is_default: row.folder_is_default === true,
    },
    assignee:
      row.assignee_id === null || row.assignee_id === undefined
        ? null
        : {
            id: String(row.assignee_id),
            display_name: nullableString(row.assignee_display_name),
            avatar_url: nullableString(row.assignee_avatar_url),
          },
    assignees: Array.isArray(row.assignees) ? row.assignees as TaskCard['assignees'] : [],
    is_recurring: row.recurrence_rule !== null,
    recurrence_rule: nullableString(row.recurrence_rule),
    steps_done: Number(row.steps_done),
    steps_total: Number(row.steps_total),
    pulled: row.pulled === true,
    pending_invite_email: nullableString(row.pending_invite_email),
    section_block_id: nullableString(row.section_block_id),
    created_by:
      row.creator_id === null || row.creator_id === undefined
        ? null
        : {
            id: String(row.creator_id),
            display_name: nullableString(row.creator_display_name),
            avatar_url: nullableString(row.creator_avatar_url),
          },
    labels: await taskLabelsOf(executor, viewerId, taskId),
    ...(await taskDependencyCountsOf(executor, viewerId, taskId)),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    notes: nullableString(row.notes),
    series_id: nullableString(row.series_id),
    reminder:
      row.reminder_task_id === null || row.reminder_task_id === undefined
        ? null
        : {
            offset_minutes:
              row.offset_minutes === null || row.offset_minutes === undefined
                ? null
                : Number(row.offset_minutes),
            time_of_day: nullableString(row.reminder_time_of_day),
          },
    steps: await taskChecklist(executor, taskId),
    completed_at: row.completed_at === null ? null : toIso(row.completed_at),
    completed_by: nullableString(row.completed_by),
    linked_discussions: linkedDiscussions,
  }
}

function cardOf(detail: TaskDetail): TaskCard {
  const {
    notes: _notes,
    series_id: _seriesId,
    reminder: _reminder,
    steps: _steps,
    completed_at: _completedAt,
    completed_by: _completedBy,
    linked_discussions: _linkedDiscussions,
    ...card
  } = detail
  return card
}

async function viewOrFail(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDetail> {
  const view = await taskView(executor, viewerId, taskId)
  if (view === null) {
    throw new Error(`task ${taskId} vanished between write and read`)
  }
  return view
}

interface ReminderMode {
  offsetMinutes: number | null
  timeOfDay: string | null
}

function modeOf(reminder: ReminderInput | PutTaskReminderBody): ReminderMode {
  return {
    offsetMinutes: reminder.offset_minutes,
    timeOfDay: reminder.time_of_day,
  }
}

export interface ReminderRefusal {
  field: 'offset_minutes' | 'time_of_day'
  problem: string
}

function reminderRefusal(
  dueDate: string | null,
  dueTime: string | null,
  mode: ReminderMode,
): ReminderRefusal | null {
  const field = mode.offsetMinutes !== null ? 'offset_minutes' : 'time_of_day'
  if (dueDate === null) {
    return { field, problem: 'requires a due_date on the task' }
  }
  if (mode.offsetMinutes !== null && dueTime === null) {
    return {
      field,
      problem: 'is the mode for a task with a due_time, and this task has none',
    }
  }
  if (mode.timeOfDay !== null && dueTime !== null) {
    return {
      field,
      problem: 'is the mode for a task without a due_time, and this task has one',
    }
  }
  return null
}

export async function upsertReminder(
  tx: Executor,
  taskId: string,
  mode: ReminderMode,
  createdBy: string,
): Promise<void> {
  const plan = await planReminder(tx, {
    taskId,
    offsetMinutes: mode.offsetMinutes,
    timeOfDay: mode.timeOfDay,
    createdBy,
  })
  const firedAt = plan.firedAt === null ? null : plan.firedAt.toISOString()
  await tx.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, ${mode.offsetMinutes},
                ${mode.timeOfDay}::time,
                ${plan.fireAt.toISOString()}::timestamptz,
                ${plan.state}, ${firedAt}::timestamptz, ${createdBy}::uuid)
        ON CONFLICT (task_id) DO UPDATE
           SET offset_minutes = EXCLUDED.offset_minutes,
               time_of_day = EXCLUDED.time_of_day,
               fire_at = EXCLUDED.fire_at,
               state = EXCLUDED.state,
               fired_at = EXCLUDED.fired_at,
               created_by = EXCLUDED.created_by`,
  )
}

export type CreateTaskResult =
  | { kind: 'created'; task: TaskDetail }
  | { kind: 'folder_not_found' }
  | { kind: 'assignee_not_member' }
  | { kind: 'section_not_here' }
  | { kind: 'forbidden'; reason: string }

async function sectionInFolder(
  executor: Executor,
  blockId: string,
  folderId: string,
  facetId?: string,
): Promise<boolean> {
  const found = await rowsOf(
    executor,
    sql`SELECT 1 AS present FROM page_blocks
        WHERE id = ${blockId} AND folder_id = ${folderId}
          AND ${facetId === undefined ? sql`(page_facet_id IS NULL OR page_facet_id = (SELECT id FROM page_facets WHERE content_folder_id = ${folderId}::uuid))` : sql`page_facet_id = ${facetId}::uuid`}
          AND kind = 'section'`,
  )
  return found.length > 0
}

export async function createTaskIn(
  tx: Executor,
  viewerId: string,
  body: PostTasksBody,
  options: { readonly pagePosition?: string; readonly id?: string } = {},
): Promise<CreateTaskResult> {
  const folderId = body.folder_id ?? (await inboxOf(tx, viewerId))
  const access = await accessOf(tx, viewerId, folderId)
  if (access === null) return { kind: 'folder_not_found' }
  const admitted = mayPerform(access, 'task.create')
  if (!admitted.allowed) return { kind: 'forbidden', reason: admitted.reason }

  await tx.execute(
    sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
  )
  if (body.page_facet_id !== undefined) {
    const facet = await rowsOf(tx, sql`
      SELECT id FROM page_facets
       WHERE id = ${body.page_facet_id}::uuid AND deleted_at IS NULL
         AND (content_folder_id = ${folderId}::uuid OR
              (content_folder_id IS NULL AND page_id = ${folderId}::uuid))
         AND EXISTS (SELECT 1 FROM folders f WHERE f.id = ${folderId}::uuid
                      AND f.deleted_at IS NULL AND f.archived_at IS NULL)`)
    if (!facet.length) return { kind: 'folder_not_found' }
  }
  const members = await folderMemberIds(tx, folderId)
  const onlyMember = members.length === 1 ? members[0] : undefined
  let assigneeId: string | null
  if (onlyMember !== undefined) {
    assigneeId = onlyMember
  } else if (body.assignee_id === undefined) {
    assigneeId = viewerId
  } else {
    assigneeId = body.assignee_id
    if (assigneeId !== null && !members.includes(assigneeId)) {
      return { kind: 'assignee_not_member' }
    }
  }
  const assigneeIds = onlyMember !== undefined
    ? [onlyMember]
    : body.assignee_ids ?? (assigneeId === null ? [] : [assigneeId])
  if (!validAssignees(assigneeIds, members)) return { kind: 'assignee_not_member' }
  assigneeId = assigneeIds[0] ?? null

  const sectionId = body.section_block_id ?? null
  if (sectionId !== null && !(await sectionInFolder(tx, sectionId, folderId, body.page_facet_id))) {
    return { kind: 'section_not_here' }
  }

  let pagePosition = options.pagePosition
  if (pagePosition === undefined) {
    const items = await seededItems(tx, folderId, body.page_facet_id)
    pagePosition = positionAtSectionEnd(items, null, sectionId) ?? undefined
    if (pagePosition === undefined) return { kind: 'section_not_here' }
  }

  const rule = body.recurrence_rule ?? null
  const seriesId = rule === null ? sql`NULL` : sql`gen_random_uuid()`
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO tasks (id, folder_id, page_facet_id, title, notes, important,
                           start_date, start_time, due_date,
                           due_time, recurrence_rule, series_id,
                           assignee_id, assignee_ids, created_by, section_block_id,
                           page_position)
        VALUES (${options.id === undefined ? sql`gen_random_uuid()` : sql`${options.id}::uuid`}, ${folderId}::uuid, ${body.page_facet_id ?? null}::uuid, ${body.title}, ${body.notes ?? null},
                ${body.important ?? false},
                ${body.start_date ?? null}::date,
                ${body.start_time ?? null}::time,
                ${body.due_date ?? null}::date,
                ${body.due_time ?? null}::time, ${rule}, ${seriesId},
                ${assigneeId}::uuid, ${assigneeArray(assigneeIds)}, ${viewerId}::uuid, ${sectionId},
                ${pagePosition})
        RETURNING id`,
  )
  const taskId = String(inserted[0]?.id)

  if (body.reminder !== undefined && body.reminder !== null) {
    await upsertReminder(tx, taskId, modeOf(body.reminder), viewerId)
  }
  await appendChecklist(tx, taskId, (body.steps ?? []).map((title) => ({ title })))
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'created',
    subjectKind: 'task',
    subjectId: taskId,
    subjectName: body.title,
    folderId,
    detail:
      assigneeId !== null && assigneeId !== viewerId
        ? `assigned to ${await displayNameOf(tx, assigneeId)}`
        : undefined,
    recipients: assigneeIds,
  })
  return { kind: 'created', task: await viewOrFail(tx, viewerId, taskId) }
}

export async function createTask(
  db: Db,
  viewerId: string,
  body: PostTasksBody,
): Promise<CreateTaskResult> {
  return inTransaction(db, (tx) => createTaskIn(tx, viewerId, body))
}

export type PatchTaskResult =
  | { kind: 'patched'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'target_not_found' }
  | { kind: 'assignee_not_member' }
  | { kind: 'unassign_single_member' }
  | { kind: 'time_without_date' }
  | { kind: 'start_time_without_date' }
  | { kind: 'rule_without_date' }
  | { kind: 'start_after_due'; field: 'start_date' | 'due_date' }
  | { kind: 'start_after_due_time'; field: 'start_date' | 'start_time' | 'due_date' | 'due_time' }
  | { kind: 'section_not_here' }
  | { kind: 'reminder_refused'; refusal: ReminderRefusal }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'quota_exceeded' }

class MoveQuotaRefusal extends Error {}

export async function patchTask(
  db: Db,
  viewerId: string,
  taskId: string,
  patch: PatchTaskBody,
  store?: ObjectStore,
): Promise<PatchTaskResult> {
  const copiedObjects: string[] = []
  try {
    return await patchTaskIn(db, viewerId, taskId, patch, store, copiedObjects)
  } catch (error: unknown) {
    if (store !== undefined) {
      for (const id of copiedObjects) {
        try {
          await store.remove(id)
        } catch {
          // Preserve the original error.
        }
      }
    }
    if (error instanceof MoveQuotaRefusal) return { kind: 'quota_exceeded' }
    throw error
  }
}

async function patchTaskIn(
  db: Db,
  viewerId: string,
  taskId: string,
  patch: PatchTaskBody,
  store: ObjectStore | undefined,
  copiedObjects: string[],
): Promise<PatchTaskResult> {
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) return { kind: 'not_found' }
    const folderIds = [
      ...new Set([
        preview.folderId,
        ...(patch.folder_id === undefined ? [] : [patch.folder_id]),
      ]),
    ].sort()
    for (const lockedFolderId of folderIds) {
      await tx.execute(sql`SELECT 1 FROM folders
                            WHERE id = ${lockedFolderId}::uuid FOR UPDATE`)
    }
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null || current.folderId !== preview.folderId) {
      return { kind: 'not_found' }
    }

    const acts: FolderAction[] = []
    if (
      patch.title !== undefined ||
      patch.notes !== undefined ||
      patch.important !== undefined ||
      patch.start_date !== undefined ||
      patch.start_time !== undefined ||
      patch.due_date !== undefined ||
      patch.due_time !== undefined ||
      patch.recurrence_rule !== undefined
    ) acts.push('task.edit')
    if (
      patch.assignee_id !== undefined || patch.assignee_ids !== undefined ||
      patch.assignee_add_id !== undefined || patch.assignee_remove_id !== undefined
    ) acts.push('task.assign')
    if (patch.folder_id !== undefined || patch.section_block_id !== undefined) {
      acts.push('task.move')
    }
    if (patch.reminder !== undefined) acts.push('task.reminder.manage')
    for (const act of acts) {
      const decision = mayActOnTask(current, act)
      if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    }

    const target =
      patch.folder_id !== undefined && patch.folder_id !== current.folderId
        ? patch.folder_id
        : undefined
    if (target !== undefined) {
      const into = await accessOf(tx, viewerId, target)
      if (into === null) return { kind: 'target_not_found' }
      const admitted = mayPerform(into, 'task.move')
      if (!admitted.allowed) return { kind: 'forbidden', reason: admitted.reason }
    }
    const moving = target !== undefined
    const folderId = target ?? current.folderId
    const members = await folderMemberIds(tx, folderId)
    const onlyMember = members.length === 1 ? members[0] : undefined

    let assigneeId: string | null | undefined
    if (patch.assignee_id !== undefined) {
      if (patch.assignee_id === null) {
        if (onlyMember !== undefined) return { kind: 'unassign_single_member' }
        assigneeId = null
      } else {
        if (!members.includes(patch.assignee_id)) return { kind: 'assignee_not_member' }
        assigneeId = patch.assignee_id
      }
    } else if (moving) {
      const survives = current.assigneeId !== null && members.includes(current.assigneeId)
      assigneeId = onlyMember ?? (survives ? current.assigneeId : null)
    }

    let assigneeIds: string[] | undefined
    if (patch.assignee_ids !== undefined) {
      assigneeIds = patch.assignee_ids
    } else if (patch.assignee_add_id !== undefined) {
      assigneeIds = current.assigneeIds.includes(patch.assignee_add_id)
        ? current.assigneeIds
        : [...current.assigneeIds, patch.assignee_add_id]
    } else if (patch.assignee_remove_id !== undefined) {
      assigneeIds = current.assigneeIds.filter((id) => id !== patch.assignee_remove_id)
    } else if (patch.assignee_id !== undefined) {
      assigneeIds = assigneeId === null ? [] : [assigneeId!]
    } else if (moving) {
      assigneeIds = onlyMember === undefined
        ? current.assigneeIds.filter((id) => members.includes(id))
        : [onlyMember]
    }
    if (assigneeIds !== undefined) {
      if (assigneeIds.length === 0 && onlyMember !== undefined) {
        return { kind: 'unassign_single_member' }
      }
      if (!validAssignees(assigneeIds, members)) return { kind: 'assignee_not_member' }
      assigneeId = assigneeIds[0] ?? null
      if (
        !moving && assigneeIds.length === current.assigneeIds.length &&
        assigneeIds.every((id, index) => id === current.assigneeIds[index])
      ) {
        assigneeIds = undefined
        assigneeId = undefined
      }
    }

    let sectionId: string | null | undefined
    if (patch.section_block_id !== undefined) {
      if (
        patch.section_block_id !== null &&
        !(await sectionInFolder(tx, patch.section_block_id, folderId, moving ? undefined : current.pageFacetId ?? undefined))
      ) return { kind: 'section_not_here' }
      sectionId = patch.section_block_id
    } else if (moving) {
      sectionId = null
    }

    const effectiveSectionId = sectionId === undefined ? current.sectionBlockId : sectionId
    const repositioning = moving || effectiveSectionId !== current.sectionBlockId
    let pagePosition: string | undefined
    if (repositioning) {
      const pageItems = await seededItems(tx, folderId, moving ? undefined : current.pageFacetId ?? undefined)
      const placed = positionAtSectionEnd(
        pageItems,
        moving ? null : { kind: 'task', id: taskId },
        effectiveSectionId,
      )
      if (placed === null) return { kind: 'section_not_here' }
      pagePosition = placed
    }

    const clearing = patch.due_date === null
    const finalDueDate = patch.due_date !== undefined ? patch.due_date : current.dueDate
    if (
      !clearing && patch.due_time !== undefined && patch.due_time !== null &&
      finalDueDate === null
    ) return { kind: 'time_without_date' }
    const settingRule = patch.recurrence_rule !== undefined && patch.recurrence_rule !== null
    if (!clearing && settingRule && finalDueDate === null) {
      return { kind: 'rule_without_date' }
    }

    const clearingStart = patch.start_date === null
    const finalStartDate = patch.start_date !== undefined ? patch.start_date : current.startDate
    if (
      !clearingStart && patch.start_time !== undefined && patch.start_time !== null &&
      finalStartDate === null
    ) return { kind: 'start_time_without_date' }
    const finalStartTime = clearingStart
      ? null
      : patch.start_time !== undefined
        ? minuteOf(patch.start_time)
        : current.startTime
    if (
      finalStartDate !== null && finalDueDate !== null && finalStartDate > finalDueDate
    ) {
      return {
        kind: 'start_after_due',
        field: patch.start_date !== undefined ? 'start_date' : 'due_date',
      }
    }

    const finalDueTime = clearing
      ? null
      : patch.due_time !== undefined
        ? minuteOf(patch.due_time)
        : current.dueTime
    if (
      finalStartDate !== null && finalDueDate !== null &&
      finalStartDate === finalDueDate && finalStartTime !== null &&
      finalDueTime !== null && finalStartTime > finalDueTime
    ) {
      return {
        kind: 'start_after_due_time',
        field:
          patch.start_time !== undefined
            ? 'start_time'
            : patch.due_time !== undefined
              ? 'due_time'
              : patch.start_date !== undefined
                ? 'start_date'
                : 'due_date',
      }
    }

    const reminder = patch.reminder === undefined ? null : modeOf(patch.reminder)
    if (reminder !== null) {
      const refusal = reminderRefusal(finalDueDate, finalDueTime, reminder)
      if (refusal !== null) return { kind: 'reminder_refused', refusal }
    }

    const sets: SQL[] = []
    if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`)
    if (patch.notes !== undefined) {
      sets.push(sql`notes = ${await legacyNotesWrite(tx, taskId, patch.notes)}`)
    }
    if (patch.important !== undefined) sets.push(sql`important = ${patch.important}`)
    if (moving) sets.push(sql`folder_id = ${folderId}::uuid`)
    if (assigneeId !== undefined) sets.push(sql`assignee_id = ${assigneeId}::uuid`)
    if (assigneeIds !== undefined) sets.push(sql`assignee_ids = ${assigneeArray(assigneeIds)}`)
    if (sectionId !== undefined) sets.push(sql`section_block_id = ${sectionId}`)
    if (pagePosition !== undefined) sets.push(sql`page_position = ${pagePosition}`)
    if (clearingStart) {
      sets.push(sql`start_date = NULL`)
      sets.push(sql`start_time = NULL`)
    } else {
      if (patch.start_date !== undefined) sets.push(sql`start_date = ${patch.start_date}::date`)
      if (patch.start_time !== undefined) sets.push(sql`start_time = ${patch.start_time}::time`)
    }
    if (clearing) {
      sets.push(sql`due_date = NULL`)
      sets.push(sql`due_time = NULL`)
      sets.push(sql`recurrence_rule = NULL`)
    } else {
      if (patch.due_date !== undefined) sets.push(sql`due_date = ${patch.due_date}::date`)
      if (patch.due_time !== undefined) sets.push(sql`due_time = ${patch.due_time}::time`)
      if (patch.recurrence_rule !== undefined) {
        sets.push(sql`recurrence_rule = ${patch.recurrence_rule}`)
        if (settingRule && current.recurrenceRule === null) {
          sets.push(sql`series_id = gen_random_uuid()`)
        }
      }
    }

    if (sets.length > 0) {
      sets.push(sql`updated_at = now()`)
      if (moving) {
        await dropFolderLabelsOnMove(tx, taskId)
        /* Only the Task's own document files follow a move; linked Discussions stay put. */
        const carried = await carryTaskFilesOnMove(
          tx,
          store,
          viewerId,
          taskId,
          current.folderId,
          folderId,
          copiedObjects,
        )
        if (carried === 'quota_exceeded') throw new MoveQuotaRefusal()
      }
      await tx.execute(
        sql`UPDATE tasks SET ${sql.join(sets, sql`, `)}
            WHERE id = ${taskId}::uuid`,
      )
    }

    if (clearing) {
      await tx.execute(sql`DELETE FROM reminders WHERE task_id = ${taskId}::uuid`)
    } else if (patch.due_time !== undefined && finalDueTime !== current.dueTime) {
      if (finalDueTime === null) {
        await tx.execute(
          sql`DELETE FROM reminders
               WHERE task_id = ${taskId}::uuid AND offset_minutes IS NOT NULL`,
        )
      } else if (current.dueTime === null) {
        await tx.execute(
          sql`DELETE FROM reminders
               WHERE task_id = ${taskId}::uuid AND time_of_day IS NOT NULL`,
        )
      }
    }

    if (reminder !== null) {
      await upsertReminder(tx, taskId, reminder, viewerId)
    } else {
      const trigger = movedTrigger(taskId, patch, current, {
        clearing,
        finalDueTime,
        finalAssigneeId: assigneeId === undefined ? current.assigneeId : assigneeId,
      })
      if (trigger !== null) await recomputeReminders(tx, trigger)
    }

    if (sets.length > 0 || reminder !== null) {
      const addedAssignees = (assigneeIds ?? current.assigneeIds)
        .filter((id) => !current.assigneeIds.includes(id))
      const newAssignee = addedAssignees[0] ?? null
      const verb = moving
        ? 'moved'
        : patch.title !== undefined && patch.title !== current.title
          ? 'renamed'
          : 'edited'
      await recordEvent(tx, {
        actorId: viewerId,
        verb,
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: patch.title ?? current.title,
        folderId,
        detail:
          newAssignee !== null
            ? `assigned to ${await displayNameOf(tx, newAssignee)}`
            : reminder !== null && sets.length === 0
              ? 'set a reminder'
              : verb === 'edited'
                ? await plainEditDetail(tx, patch, current, assigneeId)
                : undefined,
        recipients: addedAssignees.length === 0 ? undefined : addedAssignees,
      })
    }

    return { kind: 'patched', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

async function plainEditDetail(
  tx: Executor,
  patch: { readonly notes?: string | null; readonly due_date?: string | null; readonly start_date?: string | null },
  current: { readonly assigneeId: string | null; readonly dueDate: string | null; readonly startDate: string | null },
  assigneeId: string | null | undefined,
): Promise<string | undefined> {
  if (assigneeId === null && current.assigneeId !== null) {
    return `unassigned ${await displayNameOf(tx, current.assigneeId)}`
  }
  if (patch.notes !== undefined) return 'edited the description'
  if (patch.due_date !== undefined && patch.due_date !== current.dueDate) {
    return patch.due_date === null ? 'removed the due date' : `set the due date to ${patch.due_date}`
  }
  if (patch.start_date !== undefined && patch.start_date !== current.startDate) {
    return patch.start_date === null ? 'removed the start date' : `set the start date to ${patch.start_date}`
  }
  return undefined
}

function minuteOf(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

function movedTrigger(
  taskId: string,
  patch: PatchTaskBody,
  current: TaskAccess,
  applied: {
    clearing: boolean
    finalDueTime: string | null
    finalAssigneeId: string | null
  },
): ReminderTrigger | null {
  if (
    !applied.clearing && patch.due_date !== undefined &&
    patch.due_date !== current.dueDate
  ) return { kind: 'due_date', taskId }
  if (
    !applied.clearing && patch.due_time !== undefined &&
    applied.finalDueTime !== current.dueTime
  ) return { kind: 'due_time', taskId }
  if (applied.finalAssigneeId !== current.assigneeId) {
    return { kind: 'assignee_id', taskId }
  }
  return null
}

export async function deleteTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) return 'not_found'
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${preview.folderId}::uuid FOR UPDATE`)
    const current = await accessibleTask(tx, viewerId, taskId)
    if (current === null) return 'not_found'
    const decision = mayActOnTask(current, 'task.trash')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    await tx.execute(
      sql`UPDATE tasks SET deleted_at = now(), updated_at = now()
          WHERE id = ${taskId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: current.title,
      folderId: current.folderId,
      detail: 'moved to Trash for 30 days',
    })
    return 'deleted'
  })
}

export type TransitionEvent = 'complete' | 'uncomplete' | 'abandon' | 'restore'

export type TransitionResult =
  | {
      kind: 'transitioned'
      task: TaskDetail
      generatedTask: TaskCard | null
      deletedSuccessorId: string | null
    }
  | { kind: 'noop'; task: TaskDetail }
  | { kind: 'conflict'; message: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'tz_required' }

interface TransitionRule {
  from: TaskStatus
  settled: TaskStatus
  conflict: string
  generates: boolean
  guarded: boolean
  set: (actorId: string) => SQL
}

const TRANSITIONS: Record<TransitionEvent, TransitionRule> = {
  complete: {
    from: 'pending',
    settled: 'completed',
    conflict: 'Restore the task first.',
    generates: true,
    guarded: false,
    set: (actorId) => sql`status = 'completed', completed_at = now(),
             completed_by = ${actorId}::uuid, updated_at = now()`,
  },
  uncomplete: {
    from: 'completed',
    settled: 'pending',
    conflict: 'An abandoned task returns to pending through restore.',
    generates: false,
    guarded: true,
    set: () => sql`status = 'pending', completed_at = NULL,
             completed_by = NULL, updated_at = now()`,
  },
  abandon: {
    from: 'pending',
    settled: 'abandoned',
    conflict: 'Complete tasks cannot be abandoned; un-complete first.',
    generates: true,
    guarded: false,
    set: () => sql`status = 'abandoned', updated_at = now()`,
  },
  restore: {
    from: 'abandoned',
    settled: 'pending',
    conflict: 'A completed task returns to pending through uncomplete.',
    generates: false,
    guarded: true,
    set: () => sql`status = 'pending', updated_at = now()`,
  },
}

const TRANSITION_VERBS: Record<
  TransitionEvent,
  'completed' | 'reopened' | 'abandoned' | 'restored'
> = {
  complete: 'completed',
  uncomplete: 'reopened',
  abandon: 'abandoned',
  restore: 'restored',
}

export async function transitionTask(
  db: Db,
  viewerId: string,
  taskId: string,
  event: TransitionEvent,
  tz?: string,
): Promise<TransitionResult> {
  const rule = TRANSITIONS[event]
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) return { kind: 'not_found' }
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${preview.folderId}::uuid FOR UPDATE`)
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }
    const decision = mayActOnTask(
      current,
      event === 'complete' || event === 'uncomplete'
        ? 'task.status.complete'
        : 'task.status.abandon',
    )
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }

    const winning = current.status === rule.from
    const generating = winning && rule.generates && current.recurrenceRule !== null
    if (generating && tz === undefined) return { kind: 'tz_required' }

    let deletedSuccessorId: string | null = null
    if (winning && rule.guarded) {
      const guard = await applySeriesGuard(tx, taskId)
      if (guard.kind === 'refused') return { kind: 'conflict', message: guard.message }
      if (guard.kind === 'reclaimed') deletedSuccessorId = guard.deletedSuccessorId
    }

    const updated = await rowsOf(
      tx,
      sql`UPDATE tasks SET ${rule.set(viewerId)}
          WHERE id = ${taskId}::uuid AND status = ${rule.from}
          RETURNING id`,
    )
    if (updated.length === 1) {
      let generatedTask: TaskCard | null = null
      if (generating && tz !== undefined) {
        const outcome = await generateSuccessor(tx, { taskId, tz })
        if (outcome.kind === 'generated') {
          const items = await seededItems(tx, current.folderId, current.pageFacetId ?? undefined)
          const successor = { kind: 'task', id: outcome.successorId } as const
          const position = positionAfter(items, successor, { kind: 'task', id: taskId })
            ?? positionAtSectionEnd(items, successor, current.sectionBlockId)
          await tx.execute(
            sql`UPDATE tasks SET page_position=${position},section_block_id=${current.sectionBlockId}::uuid
                 WHERE id=${outcome.successorId}::uuid`,
          )
          generatedTask = cardOf(await viewOrFail(tx, viewerId, outcome.successorId))
        }
      }
      await recordEvent(tx, {
        actorId: viewerId,
        verb: TRANSITION_VERBS[event],
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: current.title,
        folderId: current.folderId,
      })
      return {
        kind: 'transitioned',
        task: await viewOrFail(tx, viewerId, taskId),
        generatedTask,
        deletedSuccessorId,
      }
    }

    const after = await accessibleTask(tx, viewerId, taskId)
    if (after === null) return { kind: 'not_found' }
    if (after.status === rule.settled) {
      return { kind: 'noop', task: await viewOrFail(tx, viewerId, taskId) }
    }
    return { kind: 'conflict', message: rule.conflict }
  })
}

export type MyDayResult =
  | { kind: 'ok'; task: TaskDetail }
  | { kind: 'not_found' }

export async function pullIntoMyDay(
  db: Db,
  viewerId: string,
  taskId: string,
  tz: string,
): Promise<MyDayResult> {
  return inTransaction(db, async (tx) => {
    if ((await accessibleTask(tx, viewerId, taskId)) === null) {
      return { kind: 'not_found' }
    }
    await tx.execute(
      sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
          VALUES (${taskId}::uuid, ${viewerId}::uuid, ${today(tz)}::date)
          ON CONFLICT DO NOTHING`,
    )
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

export async function dropFromMyDay(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<MyDayResult> {
  return inTransaction(db, async (tx) => {
    if ((await accessibleTask(tx, viewerId, taskId)) === null) {
      return { kind: 'not_found' }
    }
    await tx.execute(
      sql`DELETE FROM my_day_entries
          WHERE task_id = ${taskId}::uuid AND user_id = ${viewerId}::uuid`,
    )
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

export type PutReminderResult =
  | { kind: 'written'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'refused'; refusal: ReminderRefusal }
  | { kind: 'forbidden'; reason: string }

export async function putTaskReminder(
  db: Db,
  viewerId: string,
  taskId: string,
  body: PutTaskReminderBody,
): Promise<PutReminderResult> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }
    const decision = mayActOnTask(current, 'task.reminder.manage')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    const mode = modeOf(body)
    const refusal = reminderRefusal(current.dueDate, current.dueTime, mode)
    if (refusal !== null) return { kind: 'refused', refusal }
    await upsertReminder(tx, taskId, mode, viewerId)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: current.title,
      folderId: current.folderId,
      detail: 'set a reminder',
    })
    return { kind: 'written', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

export async function deleteTaskReminder(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return 'not_found'
    const decision = mayActOnTask(current, 'task.reminder.manage')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM reminders WHERE task_id = ${taskId}::uuid RETURNING task_id`,
    )
    if (removed.length > 0) {
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'edited',
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: current.title,
        folderId: current.folderId,
        detail: 'removed the reminder',
      })
    }
    return 'deleted'
  })
}

export async function taskDocument(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<PageView | null> {
  return inTransaction(db, async (tx) => {
    const access = await accessibleTask(tx, viewerId, taskId)
    if (access === null) return null
    if (await needsMaterializing(tx, taskId)) {
      await tx.execute(sql`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`)
      await materializeNotesLocked(tx, taskId)
    }
    return taskDocumentViewIn(tx, taskId, viewerId)
  })
}

function itemWord(text: string): string {
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

export async function writeTaskDocument(
  db: Db,
  viewerId: string,
  taskId: string,
  body: DocumentTransaction,
): Promise<PageView> {
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) throw new TaskDocumentRefusal('not_found', 'Not found.')
    await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${preview.folderId}::uuid FOR UPDATE`)
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null || current.folderId !== preview.folderId) {
      throw new TaskDocumentRefusal('not_found', 'Not found.')
    }
    const decision = mayActOnTask(current, 'task.edit')
    const ticks = await checklistTicks(tx, taskId, body)
    if (!decision.allowed && !(mayActOnTask(current, 'step.toggle').allowed && ticks !== null)) {
      throw new TaskDocumentRefusal('forbidden', decision.reason)
    }
    const result = await applyTaskDocumentLocked(tx, viewerId, current.folderId, taskId, body)
    if (result.changed) {
      const details = ticks !== null
        ? ticks.map((tick) => `${tick.checked ? 'completed' : 'reopened'} the step '${itemWord(tick.text)}'`)
        : ['edited the description']
      for (const detail of details) {
        await recordEvent(tx, {
          actorId: viewerId,
          verb: 'edited',
          subjectKind: 'task',
          subjectId: taskId,
          subjectName: current.title,
          folderId: current.folderId,
          detail,
        })
      }
    }
    return result.view
  })
}

export type ChecklistShimResult =
  | { kind: 'ok'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'cap' }
  | { kind: 'forbidden'; reason: string }

async function lockedForShim(
  tx: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  const preview = await accessibleTask(tx, viewerId, taskId)
  if (preview === null) return null
  await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${preview.folderId}::uuid FOR UPDATE`)
  const current = await lockedTask(tx, viewerId, taskId)
  return current === null || current.folderId !== preview.folderId ? null : current
}

async function shimEvent(
  tx: Executor,
  viewerId: string,
  task: TaskAccess,
  detail: string,
): Promise<void> {
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'edited',
    subjectKind: 'task',
    subjectId: task.id,
    subjectName: task.title,
    folderId: task.folderId,
    detail,
  })
}

export async function addChecklistItemShim(
  db: Db,
  viewerId: string,
  taskId: string,
  title: string,
): Promise<ChecklistShimResult> {
  return inTransaction(db, async (tx) => {
    const current = await lockedForShim(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }
    const decision = mayActOnTask(current, 'task.edit')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    try {
      await appendChecklist(tx, taskId, [{ title }])
    } catch (error: unknown) {
      if (error instanceof ChecklistCapRefusal) return { kind: 'cap' }
      throw error
    }
    await shimEvent(tx, viewerId, current, `added a step '${itemWord(title)}'`)
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

async function lockedChecklistItem(
  tx: Executor,
  viewerId: string,
  itemId: string,
): Promise<{ task: TaskAccess; text: string; checked: boolean } | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT task_id FROM page_blocks
         WHERE id = ${itemId}::uuid AND kind = 'checklist' AND task_id IS NOT NULL`,
  )
  const taskId = found[0]?.task_id
  if (taskId === undefined || taskId === null) return null
  const task = await lockedForShim(tx, viewerId, String(taskId))
  if (task === null) return null
  const item = await rowsOf(
    tx,
    sql`SELECT text, checked FROM page_blocks
         WHERE id = ${itemId}::uuid AND kind = 'checklist'
           AND task_id = ${task.id}::uuid FOR UPDATE`,
  )
  const row = item[0]
  if (row === undefined) return null
  return {
    task,
    text: typeof row.text === 'string' ? row.text : '',
    checked: row.checked === true,
  }
}

export async function patchChecklistItemShim(
  db: Db,
  viewerId: string,
  itemId: string,
  patch: { readonly title?: string; readonly done?: boolean },
): Promise<ChecklistShimResult> {
  return inTransaction(db, async (tx) => {
    const item = await lockedChecklistItem(tx, viewerId, itemId)
    if (item === null) return { kind: 'not_found' }
    const decision = mayActOnTask(
      item.task,
      patch.title !== undefined ? 'task.edit' : 'step.toggle',
    )
    const edit = mayActOnTask(item.task, 'task.edit')
    if (!decision.allowed && !edit.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    if (patch.title !== undefined && patch.title !== item.text) {
      await tx.execute(
        sql`UPDATE page_blocks SET text = ${patch.title}, rich_content = NULL, updated_at = now()
             WHERE id = ${itemId}::uuid`,
      )
      await shimEvent(tx, viewerId, item.task, `renamed a step to '${itemWord(patch.title)}'`)
    }
    if (patch.done !== undefined && patch.done !== item.checked) {
      await tx.execute(
        sql`UPDATE page_blocks SET checked = ${patch.done}, updated_at = now()
             WHERE id = ${itemId}::uuid`,
      )
      await shimEvent(
        tx,
        viewerId,
        item.task,
        `${patch.done ? 'completed' : 'reopened'} the step '${itemWord(patch.title ?? item.text)}'`,
      )
    }
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, item.task.id) }
  })
}

export async function deleteChecklistItemShim(
  db: Db,
  viewerId: string,
  itemId: string,
): Promise<ChecklistShimResult> {
  return inTransaction(db, async (tx) => {
    const item = await lockedChecklistItem(tx, viewerId, itemId)
    if (item === null) return { kind: 'not_found' }
    const decision = mayActOnTask(item.task, 'task.edit')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    await tx.execute(
      sql`UPDATE page_blocks c SET list_parent_block_id = d.list_parent_block_id
            FROM page_blocks d
           WHERE d.id = ${itemId}::uuid AND c.list_parent_block_id = d.id`,
    )
    await tx.execute(sql`DELETE FROM page_blocks WHERE id = ${itemId}::uuid`)
    await shimEvent(tx, viewerId, item.task, `removed the step '${itemWord(item.text)}'`)
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, item.task.id) }
  })
}

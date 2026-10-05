/* Shared Task request/response contract. */
import { z } from 'zod'

import { folderMemberUser, folderName } from './folders.js'
import { taskLabels } from './labels.js'
import { parseRecurrenceRule } from './recurrence.js'

function isSet<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export const TASK_TITLE_LIMIT = 300
export const TASK_NOTES_LIMIT = 10000

export const taskTitle = z
  .string({ error: 'must be a string' })
  .min(1, { error: `must be 1 to ${String(TASK_TITLE_LIMIT)} characters` })
  .max(TASK_TITLE_LIMIT, {
    error: `must be 1 to ${String(TASK_TITLE_LIMIT)} characters`,
  })
export const stepTitle = taskTitle

export const taskNotes = z
  .string({ error: 'must be a string' })
  .max(TASK_NOTES_LIMIT, {
    error: `must be at most ${String(TASK_NOTES_LIMIT)} characters`,
  })

export const dueDate = z.iso.date({
  error: 'must be a calendar date in YYYY-MM-DD form',
})

export const dueTime = z
  .string({ error: 'must be a string' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, {
    error: 'must be a wall-clock time in HH:MM form, at minute precision',
  })

// Start and Due times share the floating minute-precision form.
export const startTime = dueTime

export const wallClockTime = z.iso.time({
  error: 'must be a wall-clock time',
})

export const taskStatus = z.enum(['pending', 'completed', 'abandoned'], {
  error: 'must be pending, completed, or abandoned',
})
export type TaskStatus = z.infer<typeof taskStatus>

export const stepPosition = z.int32({ error: 'must be a 32-bit integer' })

export const reminderOffsetMinutes = z
  .int({ error: 'must be an integer' })
  .min(0, { error: 'must be 0 to 10080 minutes' })
  .max(10080, { error: 'must be 0 to 10080 minutes' })

export const reminderTimeOfDay = dueTime

function carriesExactlyOneMode(reminder: {
  offset_minutes: number | null
  time_of_day: string | null
}): boolean {
  return (reminder.offset_minutes === null) !== (reminder.time_of_day === null)
}

const reminderShape = {
  offset_minutes: reminderOffsetMinutes.nullable().default(null),
  time_of_day: reminderTimeOfDay.nullable().default(null),
}
const reminderModes = z.object(reminderShape)
const EXACTLY_ONE_MODE = 'must carry exactly one of offset_minutes and time_of_day'

export const reminderInput = reminderModes.refine(carriesExactlyOneMode, {
  error: EXACTLY_ONE_MODE,
})
export type ReminderInput = z.infer<typeof reminderInput>

const patchReminderInput = z
  .object(reminderShape, {
    error:
      'must be a reminder object; removal is DELETE /tasks/:id/reminder, never a null here',
  })
  .refine(carriesExactlyOneMode, { error: EXACTLY_ONE_MODE })

export const recurrenceRule = z
  .string({ error: 'must be a string' })
  .max(200, { error: 'must be at most 200 characters' })
  .superRefine((value, ctx) => {
    const parsed = parseRecurrenceRule(value)
    if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.reason })
  })

const uuid = z.uuid({ error: 'must be a uuid' })

export const postTasksBody = z
  .object({
    title: taskTitle,
    folder_id: uuid.optional(),
    notes: taskNotes.nullable().optional(),
    important: z.boolean({ error: 'must be a boolean' }).optional(),
    start_date: dueDate.nullable().optional(),
    start_time: startTime.nullable().optional(),
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    recurrence_rule: recurrenceRule.nullable().optional(),
    assignee_id: uuid.nullable().optional(),
    assignee_ids: z.array(uuid).max(100).refine(
      (ids) => new Set(ids).size === ids.length,
      { error: 'must not repeat a person' },
    ).optional(),
    section_block_id: uuid.nullable().optional(),
    reminder: reminderInput.nullable().optional(),
    steps: z
      .array(stepTitle)
      .max(50, { error: 'must be at most 50 steps' })
      .optional(),
  })
  .refine((body) => body.assignee_id === undefined || body.assignee_ids === undefined, {
    error: 'use assignee_id or assignee_ids', path: ['assignee_ids'],
  })
  .refine((body) => !isSet(body.due_time) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['due_time'],
  })
  .refine((body) => !isSet(body.start_time) || isSet(body.start_date), {
    error: 'requires a start_date',
    path: ['start_time'],
  })
  .refine((body) => !isSet(body.recurrence_rule) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['recurrence_rule'],
  })
  .refine((body) => !isSet(body.reminder) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['reminder'],
  })
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.offset_minutes === null ||
      isSet(body.due_time),
    {
      error: 'requires a due_time on the task, which this body does not set',
      path: ['reminder', 'offset_minutes'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.time_of_day === null ||
      !isSet(body.due_time),
    {
      error: 'is the mode for a task without a due_time, and this body sets one',
      path: ['reminder', 'time_of_day'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.start_date) ||
      !isSet(body.due_date) ||
      body.start_date <= body.due_date,
    {
      error: 'must not be later than due_date',
      path: ['start_date'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.start_date) ||
      !isSet(body.due_date) ||
      body.start_date !== body.due_date ||
      !isSet(body.start_time) ||
      !isSet(body.due_time) ||
      body.start_time.slice(0, 5) <= body.due_time.slice(0, 5),
    {
      error: 'must not be later than due_time when start_date and due_date are the same day',
      path: ['start_time'],
    },
  )
export type PostTasksBody = z.infer<typeof postTasksBody>

export const patchTaskBody = z
  .object({
    title: taskTitle.optional(),
    notes: taskNotes.nullable().optional(),
    important: z.boolean({ error: 'must be a boolean' }).optional(),
    start_date: dueDate.nullable().optional(),
    start_time: startTime.nullable().optional(),
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    recurrence_rule: recurrenceRule.nullable().optional(),
    folder_id: uuid.optional(),
    assignee_id: uuid.nullable().optional(),
    assignee_ids: z.array(uuid).max(100).refine(
      (ids) => new Set(ids).size === ids.length,
      { error: 'must not repeat a person' },
    ).optional(),
    assignee_add_id: uuid.optional(),
    assignee_remove_id: uuid.optional(),
    section_block_id: uuid.nullable().optional(),
    reminder: patchReminderInput.optional(),
  })
  .refine((body) => [body.assignee_id, body.assignee_ids,
    body.assignee_add_id, body.assignee_remove_id].filter((value) => value !== undefined).length <= 1, {
    error: 'send one assignment change', path: ['assignee_ids'],
  })
  .refine((body) => !(body.due_date === null && isSet(body.due_time)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['due_time'],
  })
  .refine((body) => !(body.start_date === null && isSet(body.start_time)), {
    error: 'cannot be set in a body that clears start_date',
    path: ['start_time'],
  })
  .refine((body) => !(body.due_date === null && isSet(body.recurrence_rule)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['recurrence_rule'],
  })
  .refine((body) => !(body.due_date === null && isSet(body.reminder)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['reminder'],
  })
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.offset_minutes === null ||
      body.due_time !== null,
    {
      error: 'is the mode for a task with a due_time, and this body clears it',
      path: ['reminder', 'offset_minutes'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.time_of_day === null ||
      !isSet(body.due_time),
    {
      error: 'is the mode for a task without a due_time, and this body sets one',
      path: ['reminder', 'time_of_day'],
    },
  )
export type PatchTaskBody = z.infer<typeof patchTaskBody>

export function carriesStatus(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'status' in body
  )
}

export const postTaskOrderBody = z.object({
  after_id: z.uuid().nullable(),
  before_id: z.uuid().nullable(),
})
export type PostTaskOrderBody = z.infer<typeof postTaskOrderBody>

export const postTaskStepsBody = z.object({ title: stepTitle })
export type PostTaskStepsBody = z.infer<typeof postTaskStepsBody>

export const patchStepBody = z.object({
  title: stepTitle.optional(),
  done: z.boolean({ error: 'must be a boolean' }).optional(),
})
export type PatchStepBody = z.infer<typeof patchStepBody>

export const putTaskReminderBody = reminderModes.refine(carriesExactlyOneMode, {
  error: 'Exactly one of offset_minutes and time_of_day is required.',
})
export type PutTaskReminderBody = z.infer<typeof putTaskReminderBody>

export const taskCardFolder = z.object({
  id: z.uuid(),
  name: folderName,
  is_default: z.boolean(),
})

export const taskReminder = z
  .object({
    offset_minutes: reminderOffsetMinutes.nullable(),
    time_of_day: wallClockTime.nullable(),
  })
  .refine(carriesExactlyOneMode, {
    error: 'must carry exactly one of offset_minutes and time_of_day',
  })
export type TaskReminder = z.infer<typeof taskReminder>

export const taskStep = z.object({
  id: z.uuid(),
  title: z.string().max(4000),
  done: z.boolean(),
  position: stepPosition,
})
export type TaskStep = z.infer<typeof taskStep>

export const taskCard = z.object({
  id: z.uuid(),
  title: taskTitle,
  status: taskStatus,
  important: z.boolean(),
  start_date: dueDate.nullable(),
  start_time: wallClockTime.nullable(),
  due_date: dueDate.nullable(),
  due_time: wallClockTime.nullable(),
  folder: taskCardFolder,
  assignee: folderMemberUser.nullable(),
  assignees: z.array(folderMemberUser).optional(),
  is_recurring: z.boolean(),
  recurrence_rule: recurrenceRule.nullable(),
  steps_done: z.int().nonnegative(),
  steps_total: z.int().nonnegative(),
  pulled: z.boolean(),
  pending_invite_email: z.string().min(1).nullable(),
  section_block_id: z.uuid().nullable(),
  created_by: folderMemberUser.nullable(),
  labels: taskLabels,
  blocked_by_count: z.int().nonnegative().optional(),
  blocks_count: z.int().nonnegative().optional(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})
export type TaskCard = z.infer<typeof taskCard>

/** A Discussion reference on TaskDetail. */
export const taskLinkedDiscussion = z.object({
  id: z.uuid(),
  title: z.string(),
  state: z.enum(['open', 'resolved']),
})
export type TaskLinkedDiscussion = z.infer<typeof taskLinkedDiscussion>

export const taskDetail = taskCard.extend({
  notes: taskNotes.nullable(),
  series_id: z.uuid().nullable(),
  reminder: taskReminder.nullable(),
  steps: z.array(taskStep),
  completed_at: z.iso.datetime().nullable(),
  completed_by: z.uuid().nullable(),
  /** Only linked Discussions that are live and readable to this viewer. */
  linked_discussions: z.array(taskLinkedDiscussion),
})
export type TaskDetail = z.infer<typeof taskDetail>

export const taskTransitionResponse = z.object({
  task: taskDetail,
  generated_task: taskCard.nullable(),
  deleted_successor_id: z.uuid().nullable(),
})
export type TaskTransitionResponse = z.infer<typeof taskTransitionResponse>

export const postTasksResponse = taskDetail
export const getTaskResponse = taskDetail
export const patchTaskResponse = taskDetail
export const postTaskMyDayResponse = taskDetail
export const deleteTaskMyDayResponse = taskDetail
export const putTaskReminderResponse = taskDetail

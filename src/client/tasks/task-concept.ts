/*
 * Maps between API tasks and the card's `ConceptTask`, both ways. Composes presenters; computes no date or
 * label. A `TaskCard` maps to no steps (it carries only counts); a `TaskDetail` maps to the real ones. The
 * repeat is unpacked from the detail's rule so the picker opens on what is stored; `ruleFor` packs it.
 */

import type { Folder } from '../../shared/folders.js'
import { parseRecurrenceRule } from '../../shared/recurrence.js'
import type { RecurrenceFrequency } from '../../shared/recurrence.js'
import type { PatchTaskBody, TaskCard, TaskDetail } from '../../shared/tasks.js'
import { dueDisplay, folderDisplay, personDisplay } from '../parts/presenters.js'
import { minutesOfClock, parseIsoDate, reminderWords, type ConceptTask } from './task-model.js'
import type { TimeFormat } from '../lib/time-format.js'

/** The same facts `useRowBasis()` hands a page. */
export interface ConceptContext {
  /** From `presenterToday()`; never read from a clock here. */
  readonly today: string
  readonly folders: readonly Folder[]
  readonly clock?: TimeFormat
}

const REPEAT_UNITS: Record<RecurrenceFrequency, NonNullable<ConceptTask['repeatUnit']>> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}

/* A civil date's weekday as RFC 5545 names it ("SU"), or null. */
function weekdayOf(date: string | null): string | null {
  if (date === null) return null
  const [year, month, day] = date.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? null
}

/**
 * Minutes from the due day's midnight: time_of_day, or due_time less the offset for a timed task. Negative when
 * an offset reaches before the due day. Null when there is none.
 */
export function reminderMinutes(detail: TaskDetail): number | null {
  const reminder = detail.reminder
  if (reminder === null) return null
  if (reminder.time_of_day !== null) return minutesOfClock(reminder.time_of_day.slice(0, 5))
  if (reminder.offset_minutes === null || detail.due_time === null) return null
  return minutesOfClock(detail.due_time.slice(0, 5)) - reminder.offset_minutes
}

function isDetail(task: TaskCard | TaskDetail): task is TaskDetail {
  return 'steps' in task
}

/** Takes either shape: a detail fills `steps`, `notes` and `repeatUnit`, a card leaves them out. */
export function toConceptTask(
  task: TaskCard | TaskDetail,
  context: ConceptContext,
): ConceptTask {
  const { today, folders, clock = '12' } = context
  const folder = folderDisplay(task.folder, folders)
  const detail = isDetail(task) ? task : null

  /*
   * No assignee maps to absent, not null: null is a patch meaning "clear this". The row's suppression rule is
   * applied in `taskRowDisplay`.
   */
  const assignee =
    task.assignee === null ? undefined : toConceptPerson(task.assignee)

  const parsed =
    task.recurrence_rule === null ? null : parseRecurrenceRule(task.recurrence_rule)

  return {
    id: task.id,
    title: task.title,
    done: task.status === 'completed',
    abandoned: task.status === 'abandoned',
    folder: { name: folder.name, color: folder.color, id: task.folder.id },
    due: dueDisplay(task, today, clock),
    ...(task.due_date === null || task.due_time === null ? {} : { dueTime: task.due_time.slice(0, 5) }),
    ...(task.start_date === null ? {} : { start: task.start_date }),
    ...(task.start_date === null || task.start_time === null ? {} : { startTime: task.start_time.slice(0, 5) }),
    assignee,
    assignees: (task.assignees ?? (task.assignee === null ? [] : [task.assignee]))
      .map(toConceptPerson),
    important: task.important,
    pulled: task.pulled,
    recurrence: task.is_recurring,
    /* Guarded: a hand-built stub card may carry no labels. */
    labels: [...(task.labels?.personal ?? []), ...(task.labels?.folder ?? [])]
      .filter((label) => !label.archived)
      .map((label) => ({ id: label.id, name: label.name, color: label.color, scope: label.scope })),
    /* The whole rule, so the picker opens on what is stored: interval, days ("MO" as "Mo") and end date. */
    ...(parsed !== null && parsed.ok
      ? {
          repeatUnit: REPEAT_UNITS[parsed.rule.freq],
          /* A single weekday is left implicit (the due date's), as the presets write it. */
          repeatEvery: String(parsed.rule.interval),
          ...(parsed.rule.byDay === null ||
          parsed.rule.byDay.length === 0 ||
          (parsed.rule.byDay.length === 1 && parsed.rule.byDay[0] === weekdayOf(task.due_date))
            ? {}
            : { repeatDays: parsed.rule.byDay.map((day) => `${day.charAt(0)}${day.charAt(1).toLowerCase()}`) }),
          ...(parsed.rule.until === null ? {} : { repeatEnds: parsed.rule.until }),
          ...(parsed.rule.byMonthDay === null ? {} : { repeatMonthDay: parsed.rule.byMonthDay }),
        }
      : {}),
    ...(detail === null
      ? {}
      : {
          steps: detail.steps.map((step) => ({ id: step.id, title: step.title, done: step.done })),
          ...(detail.notes === null ? {} : { notes: detail.notes }),
          /*
           * A stored reminder comes back as its chip's words, so a reload shows what was stored (AC-170). A
           * timed task stores an offset, which `reminderMinutes` reads back.
           */
          ...(reminderMinutes(detail) === null
            ? {}
            : {
                reminderAt: reminderMinutes(detail) ?? 0,
                reminder: reminderWords(
                  detail.due_date === null ? null : parseIsoDate(detail.due_date),
                  reminderMinutes(detail) ?? 0,
                ),
              }),
        }),
  }
}

/** `personDisplay` plus the id, for pickers and rosters without a task in hand. */
export function toConceptPerson(person: {
  readonly id: string
  readonly display_name: string | null
  readonly avatar_url: string | null
}): NonNullable<ConceptTask['assignee']> {
  return { id: person.id, ...personDisplay(person) }
}

/**
 * Only fields 7.6's PATCH carries. Completion, My Day, reminders and steps have their own verbs
 * (`writtenElsewhere`), and would be refused or silently dropped here. Folder and assignee map only through an
 * id.
 */
export function conceptPatchToBody(fields: Partial<ConceptTask>): PatchTaskBody {
  const body: Record<string, unknown> = {}
  if (fields.title !== undefined) body['title'] = fields.title
  if (fields.notes !== undefined) body['notes'] = fields.notes
  if (fields.important !== undefined) body['important'] = fields.important
  if (fields.folder?.id !== undefined) body['folder_id'] = fields.folder.id
  /*
   * A cleared assignee is `null`, not an absent key: undefined means "not touched". A person named without an
   * id also maps to null.
   */
  if (fields.assignees !== undefined) {
    body['assignee_ids'] = fields.assignees.map((person) => person.id)
  } else if (fields.assignee !== undefined) {
    body['assignee_id'] = fields.assignee?.id ?? null
  }
  return body as PatchTaskBody
}

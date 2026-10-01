/*
Where 7.0's task and the card's task meet, and the only place they do.

One direction turns a `TaskCard` or a `TaskDetail` into the `ConceptTask` a card
and a row read; the other turns the fields a card reports back into the 7.6 body
that carries them. Every surface asks this module rather than reading a wire
shape, so the two vocabularies cannot drift.

**Nothing here computes a date, an ordering or a label of its own.** The due
badge is `parts/presenters.ts`'s `dueDisplay`, which owns 4.11's today and 9.7's
clock and is the only thing in this client that reads a calendar; the folder's
colour is `folderDisplay`'s, resolved against the `/folders` table the chrome
already holds; the initials are `initialsOf`'s. A second answer to any of those
questions would drift, which is why this file composes rather than computes.

**Three fields are deliberately left undefined.**

- `steps` from a `TaskCard`. 7.0's card carries `steps_done` and `steps_total`
  and not the items, and a mapper that invented them ("Step 1", "Step 2") would
  let a task round-trip through the shell and come back with its steps renamed.
  So a card maps to no steps at all and a `TaskDetail` maps to the real ones.
  The row draws the count through its own `steps` prop, which is a separate prop
  on `TaskRowProps` precisely so the count and the items need not travel
  together.

**The repeat is read from the detail's rule.** `repeatUnit`, `repeatEvery`,
`repeatDays` and `repeatEnds` are the parts of 4.11's RRULE, taken apart so the
repeat picker opens on what is stored; `ruleFor` in `tasks/task-model.ts` puts
them back together for the write. `reminder` is the words its chip says and
is mapped from the detail below.
*/

import type { Folder } from '../../shared/folders.js'
import { parseRecurrenceRule } from '../../shared/recurrence.js'
import type { RecurrenceFrequency } from '../../shared/recurrence.js'
import type { PatchTaskBody, TaskCard, TaskDetail } from '../../shared/tasks.js'
import { dueDisplay, folderDisplay, personDisplay } from '../parts/presenters.js'
import { minutesOfClock, parseIsoDate, reminderWords, type ConceptTask } from './task-model.js'
import type { TimeFormat } from '../lib/time-format.js'

/**
 * The page-level facts no `TaskCard` carries, which is `RowContext` minus the
 * parts that are the row's own presentation choices.
 *
 * The same facts `useRowBasis()` already hands a page, so a screen drawing
 * rows and cards together reads one cache entry for both (8.3).
 */
export interface ConceptContext {
  /** 4.11's today, from `presenterToday()`. Never read from a clock here. */
  readonly today: string
  /** `useFolders()`'s rows, the table a folder's colour is resolved against. */
  readonly folders: readonly Folder[]
  /** The viewer's clock (9.7, stored at 4.19). */
  readonly clock?: TimeFormat
}

/** 4.11's four frequencies as the card's `repeatUnit` spells them. */
const REPEAT_UNITS: Record<RecurrenceFrequency, NonNullable<ConceptTask['repeatUnit']>> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
}

/* A civil date's weekday as RFC 5545 names it ("SU"), or null undated. */
function weekdayOf(date: string | null): string | null {
  if (date === null) return null
  const [year, month, day] = date.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return null
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? null
}

/**
 * When a stored reminder fires, in minutes from the due day's midnight: 4.8's
 * time_of_day as it is, or a timed task's due_time less its offset (the mode
 * 7.9 requires once a task has one). Negative where an offset reaches back
 * before the due day, which is still a reminder and is shown as one. Null
 * where there is none.
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

/**
 * One 7.0 task as a lifted card and a lifted row read it.
 *
 * Takes either shape on purpose. A view endpoint answers cards and a card is
 * all a list has; opening one reads 7.6's detail. Passing the richer shape
 * fills `steps`, `notes` and `repeatUnit` and passing the thinner one leaves
 * them out, which is the truth about what each response carries rather than a
 * choice this function makes.
 */
export function toConceptTask(
  task: TaskCard | TaskDetail,
  context: ConceptContext,
): ConceptTask {
  const { today, folders, clock = '12' } = context
  const folder = folderDisplay(task.folder, folders)
  const detail = isDetail(task) ? task : null

  /*
  The assignee is mapped plainly, and the row's suppression is the row's.

  9.4's "assignee chip when not the viewer" is a rule about what a *row* draws
  under a heading that has already said who is carrying the work, which is why
  `taskRowDisplay` applies it and this does not. A card shows the task, and who
  it is assigned to is a fact of the task. `TaskRowProps.given` states the same
  split from the other side: a row says what its page does not, decided per list
  and never per row.
  */
  /* A task nobody is assigned maps to an absent assignee rather than to the
     null of #169: that null is a *patch* saying "clear this", and a whole
     task has nothing to clear. Every reader of this field asks it by
     truthiness, so the two empties are one answer here. */
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
    assignee,
    assignees: (task.assignees ?? (task.assignee === null ? [] : [task.assignee]))
      .map(toConceptPerson),
    important: task.important,
    pulled: task.pulled,
    recurrence: task.is_recurring,
    /* Guarded: a stub card built by hand (a test, an optimistic row) may
       carry no labels at all. */
    labels: [...(task.labels?.personal ?? []), ...(task.labels?.folder ?? [])]
      .filter((label) => !label.archived)
      .map((label) => ({ id: label.id, name: label.name, color: label.color, scope: label.scope })),
    /* The whole rule, so the picker opens on what is stored: its interval,
       its days ("MO" read as the picker's "Mo") and its end date. */
    ...(parsed !== null && parsed.ok
      ? {
          repeatUnit: REPEAT_UNITS[parsed.rule.freq],
          /* The rule's shape, so the card's Repeat panel opens on the rule
             that is stored rather than on "every 1 week". A single weekday
             is left implicit (the due date's), which is how the presets
             write it and what "Weekly on Sunday" names. */
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
          **A stored reminder comes back as the words its chip says.**

          The picker writes 4.8's `time_of_day` through 7.9, and this is the way
          back, so a reload shows the stored reminder rather than "No reminder".
          AC-170: a reload shows what was stored rather than what was typed,
          which is the difference between a value that was written and a value
          that was held.

          The words are the picker's own, "27 Aug at 09:00", and the clock
          inside them is re-read for the viewer by `reminderChipValue`, so the
          format the person set is the format they are shown. A task with a
          due_time stores its reminder as an offset (7.9 refuses a time_of_day
          there), and `reminderMinutes` reads that back, on the day before where
          the offset reaches past midnight.
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

/**
 * A person, as a surface takes one, from 7.0's person shape.
 *
 * Exported because the assignee picker and the roster of
 * `lib/people-library.ts` need the same three fields without a task in hand,
 * and a second spelling of "name, initials, face" is how a roster and a chip
 * come to disagree about one person.
 *
 * **It is `personDisplay` plus the id**, so the initials and `avatar_url` are
 * spelled once: a card and the row for the same task cannot show a face on one
 * and a disc on the other.
 */
export function toConceptPerson(person: {
  readonly id: string
  readonly display_name: string | null
  readonly avatar_url: string | null
}): NonNullable<ConceptTask['assignee']> {
  return { id: person.id, ...personDisplay(person) }
}

/**
 * The fields of a card's report that 7.6's PATCH can carry, and only those.
 *
 * **This function's refusals are the point of it.** A card reports every edit
 * through one path (`tasks/task-writer.tsx`), and the fields it reports do not
 * all belong to one endpoint: completion is 7.6's transition, My Day is 7.8's
 * pull, a reminder is 7.9's PUT, and the steps are the body's checklist.
 * Mapping those into a PATCH body would send a body the server refuses, or
 * worse, one it accepts having quietly dropped the field. So they are absent
 * here, and `writtenElsewhere` below is the list in one place so the mapper
 * and the writer cannot disagree about which is which.
 *
 * `folder` and `assignee` map only through an id. A name is not an address in
 * this client, and resolving one here would let a name-keyed call site keep
 * working, which is how the habit survives a port. The writer resolves a name
 * against the folder table where it must, and says so where it does it.
 */
export function conceptPatchToBody(fields: Partial<ConceptTask>): PatchTaskBody {
  const body: Record<string, unknown> = {}
  if (fields.title !== undefined) body['title'] = fields.title
  if (fields.notes !== undefined) body['notes'] = fields.notes
  if (fields.important !== undefined) body['important'] = fields.important
  if (fields.folder?.id !== undefined) body['folder_id'] = fields.folder.id
  /*
  A cleared assignee is `null` and not an absent key: 7.6 distinguishes the two,
  and unassigned is a member of the set, not the absence of one (issue #169).

  `ConceptTask['assignee']` carries the null (`tasks/task-model.ts` says what
  each of the three values means), so a caller that means "clear" can say so
  rather than `undefined`, which is read here as "this field was not touched".
  Both spellings of an empty assignee land on the same null: an explicit clear,
  and a person named without an id, who is not an address this client can send
  (see the paragraph above about `folder`).
  */
  if (fields.assignees !== undefined) {
    body['assignee_ids'] = fields.assignees.map((person) => person.id)
  } else if (fields.assignee !== undefined) {
    body['assignee_id'] = fields.assignee?.id ?? null
  }
  return body as PatchTaskBody
}

/**
 * The card fields that have a verb of their own, so nothing sends them twice.
 *
 * The row correctly reports the change *and* correctly tells the screen that a
 * completion happened, so without this list one press would log a completion
 * and an edit in the same millisecond. A change already spoken for by a
 * stronger verb is not also an edit.
 */
export const writtenElsewhere: readonly (keyof ConceptTask)[] = [
  'done',
  'abandoned',
  'pulled',
  'steps',
  'reminder',
  'repeatEvery',
  'repeatDays',
  'repeatEnds',
  'repeatUnit',
  'recurrence',
  'due',
  'dueTime',
  'reminderAt',
  'repeatMonthDay',
  'start',
]

/*
Where 7.0's task and the prototype's task meet, and the only place they do.

RFC 0004's S22 row names "the mapping between the prototype's task shape and
the shared TaskCard" as one of the six things the adapter seam is. This is it.
One direction turns a `TaskCard` or a `TaskDetail` into the `ConceptTask` a
lifted card and a lifted row read; the other turns the fields a card reports
back into the frozen 7.6 body that carries them. Every surface arriving at S23
and after asks this module rather than reading a wire shape, so the two
vocabularies cannot drift.

**Nothing here computes a date, an ordering or a label of its own.** The due
badge is `parts/presenters.ts`'s `dueDisplay`, which owns 4.11's today and
9.7's clock and is the only thing in this client that reads a calendar; the
folder's colour is `folderDisplay`'s, resolved against the `/folders` table
the chrome already holds; the initials are `initialsOf`'s. A second answer to
any of those questions is the fault DES-154 keeps naming, and it is why this
file composes rather than computes.

**Three fields are deliberately left undefined, and each names its row.**

- `steps` from a `TaskCard`. 7.0's card carries `steps_done` and `steps_total`
  and not the items, and the prototype's own header records what happens when
  a mapper fills the gap by inventing them: "toConceptTask therefore had to
  invent the steps from it, Step 1, Step 2, which meant a task could
  round-trip through the shell and come back with its steps renamed." So a
  card maps to no steps at all and a `TaskDetail` maps to the real ones. The
  row draws the count through its own `steps` prop, which is a separate prop
  on `TaskRowProps` precisely so the count and the items need not travel
  together.
- `attachments`. There is no storage, no permission model and no virus story
  behind one (DES-055), so there is nothing to map. The block is drawn and
  fed nothing.
- `comments`. 9.6's conversation is served, at `GET /folders/:id/thread`, and
  mounting it on a task is S26's row by RFC 0004's table. Filling it here
  would be a surface nobody can see doing work nobody asked for.

**And four are prose rather than fields.** `reminder`, `repeatEvery`,
`repeatDays` and `repeatEnds` are the words a chip says, not values a wire
carries: 4.11 stores an RRULE and 7.0 answers `is_recurring`. Writing those
words here would be copy no numbered section carries, which
`parts/presenters.ts` already refuses to do for the row's repeat glyph and
gives its reasons for at length. `repeatUnit` is the exception and crosses,
because a frequency is structure rather than wording. The rest belong with
the pickers that say them, at S23.
*/

import type { Folder } from '../../shared/folders.js'
import { parseRecurrenceRule } from '../../shared/recurrence.js'
import type { RecurrenceFrequency } from '../../shared/recurrence.js'
import type { PatchTaskBody, TaskCard, TaskDetail } from '../../shared/tasks.js'
import { dueDisplay, folderDisplay, initialsOf, personDisplay } from '../parts/presenters.js'
import type { ConceptTask } from './task-model.js'
import type { TimeFormat } from './time-format.js'

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
  it is assigned to is a fact of the task. The prototype states the same split
  from the other side, in `TaskRowProps.given`: a row says what its page does
  not, decided per list and never per row.
  */
  const assignee =
    task.assignee === null ? undefined : toConceptPerson(task.assignee)

  const parsed =
    detail === null || detail.recurrence_rule === null
      ? null
      : parseRecurrenceRule(detail.recurrence_rule)

  return {
    id: task.id,
    title: task.title,
    done: task.status === 'completed',
    abandoned: task.status === 'abandoned',
    folder: { name: folder.name, color: folder.color, id: task.folder.id },
    due: dueDisplay(task, today, clock),
    assignee,
    important: task.important,
    pulled: task.pulled,
    recurrence: task.is_recurring,
    ...(parsed !== null && parsed.ok
      ? { repeatUnit: REPEAT_UNITS[parsed.rule.freq] }
      : {}),
    ...(detail === null
      ? {}
      : {
          steps: detail.steps.map((step) => ({ title: step.title, done: step.done })),
          ...(detail.notes === null ? {} : { notes: detail.notes }),
        }),
  }
}

/**
 * A person, as a lifted surface takes one, from 7.0's person shape.
 *
 * Exported because the assignee picker and the roster of
 * `lib/people-library.ts` need the same three fields without a task in hand,
 * and a second spelling of "name, initials, face" is how a roster and a chip
 * come to disagree about one person. That is the fault `people-library` was
 * written to fix one axis over: its own header records a lab that said "Sara"
 * with initials SK while the People screen two clicks away said "Sara Khan"
 * with initials HA for her colleague.
 */
export function toConceptPerson(person: {
  readonly id: string
  readonly display_name: string | null
  readonly avatar_url: string | null
}): NonNullable<ConceptTask['assignee']> {
  const { name } = personDisplay(person)
  return {
    id: person.id,
    name,
    initials: initialsOf(name),
    ...(person.avatar_url === null ? {} : { image: person.avatar_url }),
  }
}

/**
 * The fields of a card's report that 7.6's PATCH can carry, and only those.
 *
 * **This function's refusals are the point of it.** A card reports every edit
 * through one path (`lib/task-writer.tsx`), and the fields it reports do not
 * all belong to one endpoint: completion is 7.6's transition, My Day is 7.8's
 * pull, a reminder is 7.9's PUT, and the steps are 7.7's own routes.
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
  /* A cleared assignee is `null` and not an absent key: 7.6 distinguishes the
     two, and "unassigned is a member of the set, not the absence of one"
     (ledger L-094) is the same rule read from the card's side. */
  if (fields.assignee !== undefined) body['assignee_id'] = fields.assignee.id ?? null
  return body as PatchTaskBody
}

/**
 * The card fields that have a verb of their own, so nothing sends them twice.
 *
 * The prototype keeps this list for a second reason worth carrying over: its
 * shell logged a completion and an edit in the same millisecond for one press,
 * because the row correctly reports the change *and* correctly tells the
 * screen that a completion happened. "A change already spoken for by a
 * stronger verb is not also an edit."
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
  'comments',
  'attachments',
]

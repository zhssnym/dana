/*
The 7.16 workflow-file contract (RFC 0005, DES-206), as RFC 0005 change
control item 44's B3 widened it: a folder's page blocks and each task's
title, notes, star, repeat, reminder and step titles, never ids, people, due
dates or states. The refusal is the schema's shape, not a scrubbing pass:
zod strips every key these objects do not name, so a hostile file's members,
statuses and ids are not rejected so much as never read, and what remains is
exactly what an empty folder plus typed work would have been.

**A step's tick is a state, so it does not travel either.** The prototype's
own workflow file carries each task's state and whether each step is ticked,
and item 44's list carries neither; ledger entry L-115 records the prototype
contradicting itself about this and the schema settling it by carrying no
completion. A step therefore arrives as a title, and `done` is one of the
keys stripped rather than read.

**A reminder arrives in its date-only mode and no other.** 4.8 admits two,
and an offset is computed from the task's due_time (8.6), which a file
carrying no dates never supplies. So `time_of_day` is the only mode this
schema names, and an offset key is stripped like any other.

**Every limit here is one 10.3 already carried.** An imported task is
refused by exactly the numbers a typed one is, which is why this file names
no cap of its own beyond the three the endpoint has always had: up to 50
folders, 500 blocks and 1000 tasks per file; the folder cap is the array's,
the block and task caps the whole file's, checked across folders. The task
cap was added by RFC 0005 change control item 18: until then the array's
only bound was the body parser's default, an accident a parser
configuration change would have widened silently.

----------------------------------------------------------------------

**One canonical shape, read from more than one arrangement.** Added after
the import was measured against the files people actually hold, which is a
different set from the files this schema was written against.

The canonical arrangement is `folders: [{ name, blocks, tasks }]` and it is
the only one the server, the domain and the acceptance suite ever see: the
normalisation below runs before validation, so what comes out is the object
the rest of the code already reads and every cap, every 422 and every
stripped key is exactly where it was.

Two other arrangements reach it, and both are honest files rather than
tolerance for slop:

- **A one-folder file with its page and its work at the top level**, which
  is `dana`, `version`, `name`, `items` and `tasks` and no `folders` key at
  all. That is what DES-206's own serialiser writes
  (`docs/design/prototype-v2/src/lib/workflow.ts`), so it is the shape of
  every workflow file the product has ever handed a person, and until this
  change the schema answered it with "folders: expected array, received
  undefined" and the Import control answered it with "this is not a Dana
  workflow file". A file the product wrote and cannot read is the defect
  this half fixes.
- **A step given as its title**, `steps: ["Book the room"]`. DES-206's
  reader carries the same rule in as many words ("Older files carried bare
  step titles; a string is read as an unticked step, which is what it
  meant"), and a tick was never going to travel anyway.

**The normaliser translates and it drops; it never truncates and never
invents.** It drops only what cannot be a Dana object at all: a page item
that is neither a section nor a paragraph, a block or a step with no text in
it, and a value in a vocabulary this schema does not speak, which is what a
free-text reminder label like "1 hour before" is. Everything else reaches
the canonical schema and is refused there by the numbers 10.3 already
carries, so a title over 300, a note over 10000, a malformed RRULE, 51
folders, 501 blocks or 1001 tasks are 422 naming the field exactly as
before. Dropping rather than refusing is AC-201's own rule, and its reason
is stated there: refusing would make honest exports from older versions
unimportable.

**A page image does not travel**, and that is 7.16 rather than an oversight:
it admits sections and paragraphs, and an image block is a `file_id` into
the exporting account, which is a row the importing account cannot read
(10.2) rather than a picture. Carrying the bytes instead would be 7.15's
upload path inside an import, which is a widening of a frozen section and is
escalated rather than decided here. So an image item is dropped, and the
sections and paragraphs around it keep their order.
*/
import { z } from 'zod'

import { recurrenceRule } from './tasks.js'
import type { TaskDetail } from './tasks.js'

const importStep = z.object({
  title: z.string().min(1).max(300),
})

const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

const importReminder = z.object({
  time_of_day: z
    .string()
    .regex(TIME_OF_DAY, 'reminder: a time of day as HH:MM'),
})

const importTask = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(10000).optional(),
  important: z.boolean().optional(),
  recurrence_rule: recurrenceRule.optional(),
  reminder: importReminder.optional(),
  steps: z.array(importStep).max(50).optional(),
})

const importBlock = z.object({
  kind: z.enum(['section', 'paragraph']),
  text: z.string().min(1).max(4000),
})

const importFolder = z.object({
  name: z.string().min(1).max(100),
  tasks: z.array(importTask).optional(),
  blocks: z.array(importBlock).optional(),
})

const canonicalWorkflowBody = z
  .object({
    dana: z.literal('workflow'),
    version: z.literal(1),
    name: z.string().max(100).optional(),
    folders: z
      .array(importFolder)
      .min(1, 'folders: a workflow file carries at least one')
      .max(50, 'folders: a workflow file carries at most 50'),
  })
  .superRefine((file, ctx) => {
    const blocks = file.folders.reduce(
      (sum, folder) => sum + (folder.blocks?.length ?? 0),
      0,
    )
    if (blocks > 500) {
      ctx.addIssue({
        code: 'custom',
        path: ['folders'],
        message: 'blocks: a workflow file carries at most 500 across folders',
      })
    }
    const tasks = file.folders.reduce(
      (sum, folder) => sum + (folder.tasks?.length ?? 0),
      0,
    )
    if (tasks > 1000) {
      ctx.addIssue({
        code: 'custom',
        path: ['folders'],
        message: 'tasks: a workflow file carries at most 1000 across folders',
      })
    }
  })

/* ------------------------------------------------------------------ *
 * Normalisation: the arrangements a real file arrives in, folded into
 * the one arrangement above. Nothing here validates; everything here is
 * validated afterwards.
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The name a page item carries, whichever of the two shapes it is in: the
 * canonical `{ kind, text }`, or DES-206's `{ kind, section: { name } }` and
 * `{ kind, paragraph: { text } }`. Null where the item is neither a section
 * nor a paragraph, or carries no text to be one with. */
function blockText(block: Record<string, unknown>, nested: string): string | null {
  if (typeof block.text === 'string') return block.text
  const inner = block[block.kind === 'section' ? 'section' : 'paragraph']
  if (!isRecord(inner)) return null
  const value = inner[nested]
  return typeof value === 'string' ? value : null
}

interface NormalBlock {
  kind: 'section' | 'paragraph'
  text: string
}

function normalizeBlock(block: unknown): NormalBlock | null {
  if (!isRecord(block)) return null
  if (block.kind !== 'section' && block.kind !== 'paragraph') return null
  const text = blockText(block, block.kind === 'section' ? 'name' : 'text')
  if (text === null || text.trim() === '') return null
  return { kind: block.kind, text }
}

function normalizeStep(step: unknown): Record<string, unknown> | null {
  if (typeof step === 'string') {
    return step.trim() === '' ? null : { title: step }
  }
  if (!isRecord(step)) return null
  if (typeof step.title === 'string' && step.title.trim() === '') return null
  return step
}

/** A key this schema names, carrying null, means the same as an absent one.
 * A file written by a serialiser that spells "no notes" as `null` is not a
 * malformed file, and 422 naming `notes` would be a strange thing to tell
 * the person who opened it. */
function dropNulls(task: Record<string, unknown>): void {
  for (const key of ['notes', 'important', 'recurrence_rule', 'reminder', 'steps']) {
    if (task[key] === null) delete task[key]
  }
}

function normalizeTask(task: unknown): unknown {
  if (!isRecord(task)) return task
  const next: Record<string, unknown> = { ...task }
  dropNulls(next)
  if (Array.isArray(next.steps)) {
    next.steps = next.steps
      .map(normalizeStep)
      .filter((step): step is Record<string, unknown> => step !== null)
  }
  /* DES-206 writes a reminder as the label the picker showed ("1 hour
     before", "10 Jun at 09:00"). 4.8 admits a time of day and 8.6 computes
     the other mode from a due_time no workflow file carries, so a bare HH:MM
     is read and every other label is dropped rather than guessed at. */
  if (typeof next.reminder === 'string') {
    if (TIME_OF_DAY.test(next.reminder)) next.reminder = { time_of_day: next.reminder }
    else delete next.reminder
  }
  return next
}

function normalizeFolder(folder: unknown): unknown {
  /* A folder given as its name alone, which is what a file listing the
     folders of an arrangement writes. */
  if (typeof folder === 'string') return { name: folder }
  if (!isRecord(folder)) return folder
  const next: Record<string, unknown> = { ...folder }
  const page = Array.isArray(next.blocks)
    ? next.blocks
    : Array.isArray(next.items)
      ? next.items
      : null
  if (page !== null) {
    next.blocks = page
      .map(normalizeBlock)
      .filter((block): block is NormalBlock => block !== null)
  }
  if (Array.isArray(next.tasks)) next.tasks = next.tasks.map(normalizeTask)
  return next
}

/** The name a one-folder file gives the folder it makes. The file's own name
 * where it has one, because that is what the person called the folder they
 * saved; a constant otherwise, since 10.3 gives a folder name no default and
 * an unnamed folder is not a thing the Library can draw. */
const UNNAMED_IMPORT = 'Imported workflow'

export function normalizeWorkflowFile(value: unknown): unknown {
  if (!isRecord(value)) return value
  const file: Record<string, unknown> = { ...value }
  let folders: unknown[]
  if (Array.isArray(file.folders)) folders = file.folders as unknown[]
  else {
    /* The one-folder file: its page and its work at the top level. Folded
       only where one of the two is actually there, so a file with no
       `folders` key and nothing to put in one is still refused by the
       canonical schema rather than turned into an empty folder. */
    if (!Array.isArray(file.tasks) && !Array.isArray(file.items)) return file
    const named = typeof file.name === 'string' && file.name.trim() !== ''
    folders = [
      {
        name: named ? file.name : UNNAMED_IMPORT,
        ...(Array.isArray(file.tasks) ? { tasks: file.tasks } : {}),
        ...(Array.isArray(file.items) ? { items: file.items } : {}),
      },
    ]
  }
  file.folders = folders.map(normalizeFolder)
  return file
}

export const importWorkflowBody = z.preprocess(
  normalizeWorkflowFile,
  canonicalWorkflowBody,
)
export type ImportWorkflowBody = z.infer<typeof canonicalWorkflowBody>

/** Whether the file asks the endpoint to evaluate a date, which is the
 * condition frozen 7.6's own tz ruling of 2026-08-10 puts a required
 * parameter behind: a repeat needs 4.5's anchor and a reminder needs 8.6's,
 * and a file carrying neither evaluates nothing and needs no zone. */
export function needsImportAnchor(file: ImportWorkflowBody): boolean {
  return file.folders.some((folder) =>
    (folder.tasks ?? []).some(
      (task) => task.recurrence_rule !== undefined || task.reminder !== undefined,
    ),
  )
}

/* ------------------------------------------------------------------ *
 * The write half: a folder, as the file 7.16 reads back.
 * ------------------------------------------------------------------ */

/** A page block as the export reads it, which is a subset of `PageBlock`
 * kept structural so this file never imports a read shape it does not own. */
export interface ExportableBlock {
  kind: string
  text: string | null
}

/*
"Save as workflow", as the same contract that reads one.

**It lives here because the two halves are one format**, and the half that
wrote the file used to live in the folder page as an object literal carrying
`{ title }` and nothing else. That is the whole of the reported data loss:
the file never held a note or a step title, so no importer could have put
one back, and the page it was written from reads 7.10 TaskCards, which carry
`steps_done` and `steps_total` and neither the notes nor the titles. The
caller therefore hands this function 7.6 details, and what it may hand over
is fixed here rather than at the call site, so a key added to the file
format is added once.

**What it writes is item 44's B3 list and nothing beside it.** The title,
the notes, the star, the repeat, the reminder in its date-only mode, and the
step titles; and of the page, its sections and its paragraphs in order. A
tick, a state, a due date, an assignee, a comment and an id are absent
because 7.16 excludes them, and they are absent from the file rather than
stripped on the way back in, so a file a person opens in an editor shows
them nothing about anybody.
*/
export function folderToWorkflowFile(
  name: string,
  tasks: readonly TaskDetail[],
  blocks: readonly ExportableBlock[] = [],
): ImportWorkflowBody {
  /* 10.3 caps a folder name at 100 and admits no empty one, and this is the
     one place the name is not already a row that satisfied both. */
  const folderName = name.trim() === '' ? UNNAMED_IMPORT : name.slice(0, 100)
  const page = blocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is NormalBlock => block !== null)
  const work = tasks.map((task) => ({
    title: task.title,
    ...(task.notes !== null && task.notes !== '' ? { notes: task.notes } : {}),
    ...(task.important ? { important: true } : {}),
    ...(task.recurrence_rule !== null
      ? { recurrence_rule: task.recurrence_rule }
      : {}),
    /* 7.0 answers a reminder as a wall-clock time, which 4.11 reads
       tolerantly and the row may spell with seconds; the file's mode is
       4.8's HH:MM and nothing finer, so the seconds are not carried. */
    ...(task.reminder !== null && task.reminder.time_of_day !== null
      ? { reminder: { time_of_day: task.reminder.time_of_day.slice(0, 5) } }
      : {}),
    ...(task.steps.length > 0
      ? { steps: task.steps.map((step) => ({ title: step.title })) }
      : {}),
  }))
  return {
    dana: 'workflow',
    version: 1,
    name: folderName,
    folders: [
      {
        name: folderName,
        ...(work.length > 0 ? { tasks: work } : {}),
        ...(page.length > 0 ? { blocks: page } : {}),
      },
    ],
  }
}

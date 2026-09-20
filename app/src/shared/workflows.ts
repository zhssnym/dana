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
  all. That is what DES-206's own serialiser wrote
  (`docs/design/prototype-v2/src/lib/workflow.ts`, deleted `a7886df` on
  2026-09-01 and in git history before that commit), so it is the shape of
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
import {
  FOLDER_LABEL_DEFINITION_CAP,
  TASK_FOLDER_LABEL_CAP,
  labelColor,
  labelDescription,
  labelName,
} from './labels.js'
import type { LabelDefinition } from './labels.js'
import { documentOperation, documentOutlineItem } from './page-document.js'
import type { PageView } from './pages.js'

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

/*
A Folder Label as a workflow file carries one (#227 area 4, version 3).

**`key` is file-local and is never a database id.** A workflow file is a
template that may be imported into any account any number of times, so an id
in it would either be a dangling reference or — far worse — a live id of
somebody else's Folder, read by an account that has no business resolving it.
The key exists only to join a Task's `labels` to this list inside the one
file, and the importer mints a fresh identity per import.

**The three value fields are the live ones, imported rather than restated.**
"Validate name/color/description using the same Label constraints as live
creation" is #227's own sentence, and the way to satisfy it that cannot drift
is to use the same zod primitives `POST /folders/:folderId/labels` uses. A file
whose Label name is 41 characters is therefore refused by the same rule and
with the same message a person typing one would meet.

A workflow file carries **no Personal Label**, definition or assignment. The
file is shared reusable classification: it is handed to other people, and a
Personal Label is the one thing in this model that is never handed to anybody.
There is no key for one, so nothing is stripped — there is nothing to strip.
*/
const importLabel = z.object({
  key: z
    .string()
    .min(1, 'labels: each label needs a file-local key')
    .max(64, 'labels: a label key is at most 64 characters'),
  name: labelName,
  color: labelColor,
  /* `.nullable().optional()`, which is `postFolderLabelBody`'s own spelling
     rather than a looser one chosen here: "the same Label constraints as live
     creation" is #227's phrase, and a serialiser that writes "no description"
     as `null` is not a malformed file — 422 naming `description` would be a
     strange thing to tell the person who opened it, which is the reason
     `dropNulls` above exists for the task keys. */
  description: labelDescription.nullable().optional(),
})

const importTask = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(10000).optional(),
  important: z.boolean().optional(),
  recurrence_rule: recurrenceRule.optional(),
  reminder: importReminder.optional(),
  steps: z.array(importStep).max(50).optional(),
  /** The keys of this file's own `folders[].labels`, never ids. Capped at
   * 10.3's per-Task Folder Label limit, so an imported Task is refused by
   * exactly the number a typed one is. */
  labels: z
    .array(z.string().min(1).max(64))
    .max(
      TASK_FOLDER_LABEL_CAP,
      `labels: a task carries at most ${String(TASK_FOLDER_LABEL_CAP)} labels`,
    )
    .optional(),
})

const importBlock = z.object({
  kind: z.enum(['section', 'paragraph']),
  text: z.string().min(1).max(4000),
})

const importFolder = z.object({
  document: z.object({blocks:z.array(documentOperation).max(500),outline:z.array(documentOutlineItem).max(1500),task_ids:z.array(z.uuid()).max(1000)}).optional(),
  name: z.string().min(1).max(100),
  tasks: z.array(importTask).optional(),
  blocks: z.array(importBlock).optional(),
  /** The Folder's reusable vocabulary. Capped at 10.3's per-Folder definition
   * limit for the reason every other cap here is the live one. */
  labels: z
    .array(importLabel)
    .max(
      FOLDER_LABEL_DEFINITION_CAP,
      `labels: a folder carries at most ${String(FOLDER_LABEL_DEFINITION_CAP)} labels`,
    )
    .optional(),
})

const canonicalWorkflowBody = z
  .object({
    dana: z.literal('workflow'),
    /*
    **1, 2 and now 3, and every one of them still imports.** The number says
    what a *reader* must understand, so it goes up when the writer starts
    emitting something an older reader would silently lose — which is exactly
    what a Folder Label vocabulary is to a version-2 reader, whose schema does
    not declare `labels` and would therefore strip it and import a folder with
    its classification quietly gone. 3 is #227's Folder Labels (area 4), 2 was
    the typed page document, 1 was the original. Older files are not
    deprecated: `folderToWorkflowFile` still writes 1 for a file with neither,
    and #227's own requirement is that they keep importing.
    */
    version: z.union([z.literal(1),z.literal(2),z.literal(3)]),
    name: z.string().max(100).optional(),
    folders: z
      .array(importFolder)
      .min(1, 'folders: a workflow file carries at least one')
      .max(50, 'folders: a workflow file carries at most 50'),
  })
  .superRefine((file, ctx) => {
    const blocks = file.folders.reduce(
      (sum, folder) => sum + (folder.document?.blocks.length ?? folder.blocks?.length ?? 0),
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
    /*
    The two things a folder's vocabulary must satisfy that no per-field rule
    can see — and the third that used to be here, which belongs to the
    database and to nothing else.

    **Keys are unique within their folder**, because a repeated one makes the
    join ambiguous and there is no honest way to resolve it: the importer would
    have to pick a Label, and picking is what "never merge by name" forbids one
    step later. This rule compares the file's own values to each other, by
    equality, and no other implementation of it exists anywhere in this
    system — which is exactly what makes it safe to state here.

    **And every key a task names is declared by its own folder.** An undeclared
    key is refused rather than dropped, which is the one place this file parts
    company with AC-201's "drop what cannot be a Dana object" rule, and it
    parts company deliberately: a dropped page item loses a paragraph, while a
    dropped Label key loses classification *silently* and leaves a file that
    looks imported and is not. The normaliser's rule is about arrangements
    older serialisers wrote; this is a file contradicting itself. It is the
    same kind of rule as the one above — file-local values compared to
    file-local values.

    ## Names are unique per folder too, and this is not where that is decided

    **There is one fold and it is the database's.** 0022's
    `labels_folder_name_idx` is on `(folder_id, lower(name))`, and
    `createWorkflowFolderLabels` maps its 23505 into a 422 carrying this
    block's own field path — `folders.<n>.labels` — and a sentence in the same
    voice as the two rules above. So a file naming one folder's Label twice is
    still told what is wrong with it rather than "Something went wrong"; what
    has gone is the *second* fold that used to stand in front of the index and
    answer first.

    **Deleted on 2026-09-20, because two folds that disagree is worse than one
    fold that is occasionally surprising**, and these two disagree. A previous
    pass folded with JavaScript `toLowerCase()` here and argued that every
    disagreement ran in the safe direction, this fold being the looser of the
    two. **A single-string fold has no direction.** `toLowerCase` is
    idempotent, so for any `x` whose two folds disagree, the pair
    `(x, x.toLowerCase())` is one name to JavaScript and two to Postgres — a
    false 422 built out of the very character offered as proof of the opposite.

    **Measured rather than argued**, 2026-09-20, and re-measured for this
    commit rather than carried over. Swept across all 63487 non-surrogate BMP
    code points against a database built with the test leg's own clause
    (`LC_COLLATE 'C' LC_CTYPE 'C.UTF-8'`, libc, the #235 fallback a server
    below 17 gets), **nine code points fold differently** — U+0130, U+1C89,
    U+A7CB, U+A7CC, U+A7CE, U+A7D2, U+A7D4, U+A7DA, U+A7DC — plus Greek final
    sigma, which is context-sensitive rather than per-character and is the one
    an ordinary file meets. Ten pairs in all, one per code point and one for
    the sigma, and **every single one of them is stricter here than at the
    index**; not one runs the other way.

    **And it cost the product its own export, which is the whole argument in
    one sentence.** `folderToWorkflowFile` reads a live vocabulary the index
    has already made unique — under *Postgres's* fold, which is not the same
    set as unique under JavaScript's. Two Folder Labels `ΦΩΣ` and `φως` are
    both accepted live and sit side by side in one folder, `lower()` giving
    `φωσ` and `φως`; exported and re-imported, they met `422
    folders.0.labels: labels: the name "ΦΩΣ" is declared twice in one folder`.
    Dana could not import its own export, which is the defect this branch's own
    commit 593b22e is named for. AC-780 now drives that pair through the
    endpoint and expects 201.

    ## Both rules only ever see a version 3 file

    That is what makes the sentences above true rather than merely stated.
    `readsLabels` strips every `labels` key from a file of any other version
    before this runs, so what is left here is a file that declared a
    vocabulary — which is the only kind of file that *can* contradict itself
    about one. A version 1 file carrying a foreign tag list reaches this loop
    with nothing to check, which is why it imports rather than meeting a 422
    about a vocabulary it never claimed to have. There is deliberately no
    `version === 3` test in this function: one mechanism, in the place whose
    job is folding arrangements, and AC-548 drives both sides of the line
    through the endpoint.

    Scoped per folder rather than across the file, because scope is part of
    identity: two folders in one file may each declare `l1` and they are two
    different Labels, exactly as two folders may each hold a "Research". The
    index agrees, being on `(folder_id, lower(name))` rather than on the name
    alone.
    */
    file.folders.forEach((folder, index) => {
      const declared = new Set<string>()
      for (const label of folder.labels ?? []) {
        if (declared.has(label.key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['folders', index, 'labels'],
            message: `labels: the key ${JSON.stringify(label.key)} is used twice in one folder`,
          })
        }
        declared.add(label.key)
      }
      ;(folder.tasks ?? []).forEach((task, taskIndex) => {
        for (const key of task.labels ?? []) {
          if (declared.has(key)) continue
          ctx.addIssue({
            code: 'custom',
            path: ['folders', index, 'tasks', taskIndex, 'labels'],
            message: `labels: the key ${JSON.stringify(key)} is not one of this folder's labels`,
          })
        }
      })
    })
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
  for (const key of ['notes', 'important', 'recurrence_rule', 'reminder', 'steps', 'labels']) {
    if (task[key] === null) delete task[key]
  }
}

/** The same rule one level up, and it was missing until an adversarial review
 * measured the asymmetry: a task's `labels: null` was tolerated while a
 * folder's was a 422, for no reason either half could state. Every optional
 * key `importFolder` names is here, because "null means absent" is a property
 * of the format rather than of any one key. */
function dropFolderNulls(folder: Record<string, unknown>): void {
  for (const key of ['tasks', 'blocks', 'document', 'labels']) {
    if (folder[key] === null) delete folder[key]
  }
}

/*
A `labels` key belongs to version 3, and to a file of any other version it is
a foreign arrangement to be dropped rather than a Dana one to be validated.

**This is the line between tolerance and refusal, and getting it wrong is a
regression rather than a nicety.** `labels` as an array of tag names per task
is what most to-do exports write — Todoist writes exactly that key — and
before #227 declared the key, every such file imported with it quietly
stripped by `z.object`. Once declared, the same file met `expected array`, a
per-task cap of 100 and the undeclared-key refusal below, none of which it has
any way to satisfy: a version 1 file declares no vocabulary, so it cannot
contradict itself, and there is nothing for its keys to join to.

So the version gates the key, which is what a version is for — it says what a
*reader* must understand, and a file that says 1 has said its reader needs to
understand no vocabulary. The refusals below are then exactly what they claim
to be: a file that declares a vocabulary and then contradicts it.

Folding a foreign tag list *into* a vocabulary is the thing deliberately not
done here. It would have to invent a colour and a key per name, which is a
product decision #227 did not take, and this file's rule everywhere else is
that an arrangement it cannot read is dropped rather than guessed at.
*/
function readsLabels(file: Record<string, unknown>): boolean {
  return file.version === 3
}

function normalizeTask(task: unknown, labels: boolean): unknown {
  if (!isRecord(task)) return task
  const next: Record<string, unknown> = { ...task }
  dropNulls(next)
  if (!labels) delete next.labels
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

function normalizeFolder(folder: unknown, labels: boolean): unknown {
  /* A folder given as its name alone, which is what a file listing the
     folders of an arrangement writes. */
  if (typeof folder === 'string') return { name: folder }
  if (!isRecord(folder)) return folder
  const next: Record<string, unknown> = { ...folder }
  dropFolderNulls(next)
  if (!labels) delete next.labels
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
  if (Array.isArray(next.tasks)) {
    next.tasks = next.tasks.map((task) => normalizeTask(task, labels))
  }
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
    /* The one-folder file: its page, its work and — since #227 — its
       vocabulary, at the top level. Folded only where the page or the work is
       actually there, so a file with no `folders` key and nothing to put in
       one is still refused by the canonical schema rather than turned into an
       empty folder.

       **`labels` is carried for the same reason `tasks` and `items` are, and
       leaving it out was a silent loss of exactly the thing #227 exists to
       stop being silent.** Until this line, a one-folder file declaring a
       vocabulary at the top level was rebuilt from `name`, `tasks` and
       `items` alone, so the vocabulary vanished before validation ever saw
       it: with task keys the file met `folders.0.tasks.0.labels: the key "l1"
       is not one of this folder's labels`, which names the task for the
       folder's missing declaration, and with no task keys it imported 201
       with the classification gone and nothing said about it.

       **The reporter would have seen it and never gets the chance**, which is
       worth stating because the obvious guess is the opposite one.
       `workflow-import.ts`'s `sourceFolders` falls back to `[source]` for
       exactly this arrangement, so a top-level `labels` is the folded
       folder's `labels` to it; what keeps a version 3 file away from it is
       `prepareWorkflowImport`'s envelope check, which answers "not a Dana
       workflow file" to anything but version 1 until issue #260 widens it.
       So the loss was silent by the route it took rather than by the
       reporter's reach, and once #260 lands this line is also what stops the
       reporter calling a carried vocabulary a dropped one.

       Carrying it rather than refusing the arrangement, because the
       arrangement is honest: this is the shape DES-206's own serialiser
       wrote, and every other key it wrote at the top level is folded rather
       than argued with. The version still gates it — `normalizeFolder` drops
       the key from a file below 3 exactly as it does a per-folder one — so a
       foreign top-level tag list is dropped and reported, not validated. */
    if (!Array.isArray(file.tasks) && !Array.isArray(file.items)) return file
    const named = typeof file.name === 'string' && file.name.trim() !== ''
    folders = [
      {
        name: named ? file.name : UNNAMED_IMPORT,
        ...(Array.isArray(file.labels) ? { labels: file.labels } : {}),
        ...(Array.isArray(file.tasks) ? { tasks: file.tasks } : {}),
        ...(Array.isArray(file.items) ? { items: file.items } : {}),
      },
    ]
  }
  const labels = readsLabels(file)
  file.folders = folders.map((folder) => normalizeFolder(folder, labels))
  return file
}

export const importWorkflowBody = z.preprocess(
  normalizeWorkflowFile,
  canonicalWorkflowBody,
)
export type ImportWorkflowBody = z.infer<typeof canonicalWorkflowBody>

/*
POST /workflows/import → 201: the folders the file created, id and name each,
which 9.13's starter offer places in the sidebar without a second read.

**This is the move `client/api/mutations.ts` asked for and did not make.** Its
comment there says the schema was declared in the client "rather than in
`src/shared/`" because this file "belongs to the API role, so this session
declares what it needs to parse and leaves the move to the Steward". The move
is this, at #39. The client copy is still the one the mutation parses with,
because `api/http.ts` and its neighbours are not a backend session's to edit;
the handoff is a one-line import swap and deletes eight lines there.
*/
export const importWorkflowResponse = z.object({
  folders: z.array(z.object({ id: z.uuid(), name: z.string() })),
})
export type ImportWorkflowResponse = z.infer<typeof importWorkflowResponse>

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

/**
 * One Task's Folder Labels as this file's own keys, in the order the
 * projection answered them. A Label with no key is one the vocabulary left
 * out — an archived one — and it drops rather than inventing a key for a
 * definition the file does not carry.
 *
 * **An empty vocabulary answers before the projection is read at all**, and
 * that is not a micro-optimisation: with no `labels` written into the file
 * there is no key any assignment could resolve to, so the task's own arrays
 * cannot change the answer. It also keeps this function's only requirement on
 * its caller honest — it needs a real 7.6 TaskDetail, and it asks for one only
 * in the case where it has something to do with it.
 */
function labelKeysOf(
  task: TaskDetail,
  keyOf: ReadonlyMap<string, string>,
): string[] {
  if (keyOf.size === 0) return []
  const keys: string[] = []
  for (const label of task.labels.folder) {
    const key = keyOf.get(label.id)
    if (key !== undefined) keys.push(key)
  }
  return keys
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
  pageView?: PageView,
  /*
  The Folder's own Label vocabulary, as `GET /labels?scope=folder&folder_id=`
  answers it (#227 area 4).

  **It is a parameter rather than something derived from `tasks`**, and that is
  the requirement rather than an implementation taste: #227 asks for the
  Folder's *reusable* vocabulary, "including definitions not currently assigned
  to a Task". A vocabulary read off the tasks would carry only what happens to
  be in use today, so the template would lose exactly the empty categories a
  template exists to set up.

  Archived definitions are filtered here rather than at the call site, so the
  caller may hand over whatever the endpoint answered.
  */
  folderLabels: readonly LabelDefinition[] = [],
): ImportWorkflowBody {
  /* 10.3 caps a folder name at 100 and admits no empty one, and this is the
     one place the name is not already a row that satisfied both. */
  const folderName = name.trim() === '' ? UNNAMED_IMPORT : name.slice(0, 100)
  /*
  The vocabulary, and the id-to-key table every task's assignments are written
  through. The keys are positional (`l1`, `l2`, …) rather than the Label's
  name, because a key is a join inside one file and a name is a person's word
  for something: two files merged by hand, or one folder renamed after the
  other was written, must not make two Labels one.

  #227 excludes archived Folder Labels from the file. An archived Label may not
  be newly applied, and every Label in an imported folder is applied to work
  created in the same transaction, so a file carrying one would be asking for
  a row the live rules refuse.
  */
  const vocabulary = folderLabels.filter((label) => !label.archived)
  const keyOf = new Map(
    vocabulary.map((label, index) => [label.id, `l${String(index + 1)}`]),
  )
  const exportedLabels = vocabulary.map((label) => ({
    key: keyOf.get(label.id) as string,
    name: label.name,
    color: label.color,
    ...(label.description !== null && label.description !== ''
      ? { description: label.description }
      : {}),
  }))
  const page = blocks
    .map((block) => normalizeBlock(block))
    .filter((block): block is NormalBlock => block !== null)
  const work = tasks.map((task) => {
  const labelKeys = labelKeysOf(task, keyOf)
  return {
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
    /* The Task's Folder Labels by key, and **only** its Folder Labels:
       `task.labels.personal` is the viewer's own private classification and is
       not written at any version. An archived assignment finds no key, having
       been filtered out of the vocabulary above, and drops out here. */
    ...(labelKeys.length > 0 ? { labels: labelKeys } : {}),
  }
  })
  return {
    dana: 'workflow',
    /* What a reader must understand to read this file, and no more: 3 once it
       carries a Label vocabulary, 2 for the typed page document, 1 for
       neither. A folder with no Folder Labels writes exactly the file it wrote
       before #227, which is what keeps every older reader honest about the
       files it can still read. */
    version: exportedLabels.length > 0 ? 3 : pageView === undefined ? 1 : 2,
    name: folderName,
    folders: [
      {
        name: folderName,
        ...(exportedLabels.length > 0 ? { labels: exportedLabels } : {}),
        ...(pageView===undefined?{}:{document:{
          blocks:pageView.blocks.map(b=>({op:'put_block' as const,id:b.id,block_kind:b.kind,text:b.text,rich_content:b.rich_content??null,file_id:b.file_id,ref_folder_id:b.ref_folder_id,width_pct:b.width_pct,checked:b.checked})),
          task_ids:tasks.map(t=>t.id),
          /* Both parents travel, and only a block can carry the second one
             (#219). A version 2 file written before #219 simply omits it and
             imports as a flat list, which is what the field's default is for. */
          outline:pageView.items.map(item=>({...item,section_block_id:item.kind==='block'?(pageView.blocks.find(b=>b.id===item.id)?.section_block_id??null):(pageView.task_placements?.find(t=>t.id===item.id)?.section_block_id??null),list_parent_block_id:item.kind==='block'?(pageView.blocks.find(b=>b.id===item.id)?.list_parent_block_id??null):null})),
        }}),
        ...(work.length > 0 ? { tasks: work } : {}),
        ...(page.length > 0 ? { blocks: page } : {}),
      },
    ],
  }
}

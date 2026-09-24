/*
The 7.16 workflow-file contract (DES-206): a folder's page blocks and each task's
title, notes, star, repeat, reminder and step titles, never ids, people, due
dates or states. The refusal is the schema's shape, not a scrubbing pass:
zod strips every key these objects do not name, so a hostile file's members,
statuses and ids are not rejected so much as never read, and what remains is
exactly what an empty folder plus typed work would have been.

**A step's tick is a state, so it does not travel either.** 7.16's list
carries no completion. A step therefore arrives as a title, and `done` is one of the
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
cap is explicit so that the array's bound is not the body parser's default,
which a parser configuration change would widen silently.

----------------------------------------------------------------------

**One canonical shape, read from more than one arrangement**, because the
files people actually hold are not all in the canonical one.

The canonical arrangement is `folders: [{ name, blocks, tasks }]` and it is
the only one the server, the domain and the acceptance suite ever see: the
normalisation below runs before validation, so what comes out is the object
the rest of the code already reads and every cap, every 422 and every
stripped key is exactly where it was.

Two other arrangements reach it, and both are honest files rather than
tolerance for slop:

- **A one-folder file with its page and its work at the top level**, which
  is `dana`, `version`, `name`, `items` and `tasks` and no `folders` key at
  all. That is what the original design serialiser wrote, so it is the
  shape of the earliest workflow files the product handed people, and a file
  the product wrote must stay readable.
- **A step given as its title**, `steps: ["Book the room"]`. Older files
  carried bare step titles; a string is read as an unticked step, which is
  what it meant, and a tick does not travel anyway.

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
an image block is a `file_id` into the exporting account, which is a row the
importing account cannot read (10.2) rather than a picture. Carrying the
bytes instead would be 7.15's upload path inside an import, which would be a
contract change to 7.16 and 7.15 rather than a decision for this file. So an
image item creates nothing, and the writing around it keeps its order.

**The file says so (#185).** At version 4 the gap is an explicit `{ kind: 'omitted', was }` placeholder and
the writer answers a count of them, so the loss is recorded in the bytes and
said at the export surface. Versions 1 to 3 still drop, because a file of
those versions has no way to say anything else.
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
import {
  MAX_SECTION_DEPTH,
  PRESENTATION_HEADING_KINDS,
  RICH_TEXT_BLOCK_KINDS,
  documentOperation,
  documentOutlineItem,
  isListKind,
  richContent,
} from './page-document.js'
import type { PageView, PageBlock } from './pages.js'

import { recurrenceRule } from './tasks.js'
import type { TaskDetail } from './tasks.js'

/** Blockers one Task of a workflow file may name (#207). */
export const WORKFLOW_DEPENDS_ON_CAP = 100
/** `depends_on` entries across a whole workflow file (#207): the bound on the
 * edges one import writes in its transaction. */
export const WORKFLOW_DEPENDENCY_CAP = 5000

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
  /*
  Internal Task dependencies (#207: "preserve internal Task dependencies when
  both Tasks are part of the workflow").

  **`key` is file-local and is never a database id**, for the reason a Label's
  key is not: a file is imported into any account any number of times. It is
  unique across the whole file, not one folder, because a dependency may cross
  Folders and a file may carry up to 50 of them. `depends_on` names the keys of
  the Tasks this one waits on.

  **A key the file does not declare is skipped rather than refused**: it is by
  definition a Task outside the workflow, and #207 excludes external
  dependencies in M1 rather than binding the copy to anything. A duplicated
  key, a Task waiting on itself and a cycle of any length are refused, 422,
  because the live endpoint refuses each of them and an import is not a way
  around it. Both keys are optional and absent from every file written before
  this, which therefore imports exactly as it did.

  **Bounded twice**: at most `WORKFLOW_DEPENDS_ON_CAP` blockers per Task and
  `WORKFLOW_DEPENDENCY_CAP` entries across the whole file, so the one
  transaction that writes them never holds a connection for a quarter-million
  edges a 1000-Task file could otherwise name.
  */
  key: z.string().min(1).max(64).optional(),
  depends_on: z.array(z.string().min(1).max(64)).max(WORKFLOW_DEPENDS_ON_CAP).optional(),
})

/** One Task's portable keys, wherever the file writes it: a member of a
 * folder's `tasks` at versions 1 to 3, a block of its `page` at 4. */
export type ImportWorkflowTask = z.infer<typeof importTask>

const importBlock = z.object({
  kind: z.enum(['section', 'paragraph']),
  text: z.string().min(1).max(4000),
})

/* ------------------------------------------------------------------ *
 * Format 4: the page, as the page (issue #185)
 * ------------------------------------------------------------------ */

/*
**One ordered page, and it is the model the folder actually persists.**

Formats 1 to 3 carry a folder as two collections — `blocks` for its writing and
`tasks` for its work — plus, since #204, a `document` whose every identity is a
`uuid` of the exporting account. Both are lossy in the way issue #185 reports:
the collections cannot say that a Task sits *under* a Section, and the document
says it with ids an importing account has no business resolving. Format 4 has
one array, in page order, and says everything positionally.

- **A Section's nesting is its `level`**, 1 to `MAX_SECTION_DEPTH`, exactly as a
  heading level reads in prose. The parent of a level-2 heading is the open
  level-1 heading above it, which is what 4.17's `section_block_id` holds and
  what 7.16's contiguity rule already guarantees can be read off the order.
- **Everything else belongs to the innermost Section still open**, which is the
  rule "a task block after a `section` block is under it". That covers every
  page the composer draws.
- **`section` is the escape and it is written only where the default is wrong.**
  7.16 admits content at the page root *after* a Section, and a purely
  positional file could not say so — it would claim a Section the page does not
  have, which is the very class of silent wrongness #185 is about. So a block
  may name the open Section it belongs to by index, or `null` for the page root,
  and `folderToWorkflowFile` emits the key only when it has to. A Section block
  never carries one: its `level` already says which Section it is under.
- **`list_parent` is #219's second parent**, by index into this same array, and
  it is independent of the first exactly as the column is.
- **A Task is a block of `kind: 'task'`** carrying the portable fields 7.16 has
  always allowed it — title, notes, star, repeat, reminder, step titles and its
  Folder Label keys — inline, at its position.
- **Files and media do not travel, and the file says which ones did not.** An
  `image`, `file`, `audio`, `video` or `folder_ref` block names a row of the
  exporting account (a `files` id, a `folders` id) rather than a portable thing,
  and carrying the bytes would be 7.15's upload path inside an import. So each
  one is written as `{ kind: 'omitted', was, name? }`, which imports as nothing.
  The placeholder is the point: the file **records what it dropped** instead of
  quietly claiming structure the importer discards, and `folderToWorkflowFile`
  answers a count of them so the export surface can say so before anybody saves.

**No index is a database id and there is nothing in a format 4 file to remap.**
That is the property #185 asks for in as many words: "the implementation does
not need to copy private account ids".
*/

/** The kinds a format 4 file carries whole. Every one is text and structure. */
export const WORKFLOW_PAGE_BLOCK_KINDS = [
  'section',
  'paragraph',
  'bullet',
  'numbered',
  'checklist',
  'quote',
  'callout',
  'code',
] as const
export type WorkflowPageBlockKind = (typeof WORKFLOW_PAGE_BLOCK_KINDS)[number]

/*
The kinds a format 4 file records as dropped rather than carries.

**`file`, `audio` and `video` are named here before this tree has them**, and
that is deliberate rather than speculative: they are media by the same
argument `image` is (#220), and a list written to be completed later is
silently incomplete on the day the kinds arrive. Every kind a page may hold
must be either carried above or omitted here; nothing currently checks that,
so a kind added to `DOCUMENT_BLOCK_KINDS` needs a line in one of the two.
*/
export const WORKFLOW_OMITTED_BLOCK_KINDS = [
  'image',
  'file',
  'audio',
  'video',
  'folder_ref',
] as const
export type WorkflowOmittedBlockKind = (typeof WORKFLOW_OMITTED_BLOCK_KINDS)[number]

/** 7.16's own ceiling on one outline, which is what this array becomes. */
const WORKFLOW_PAGE_ITEM_CAP = 1500

/** A reference to another block of the same page, by its position in this
 * array. Never a database id; see the header above. */
const pageBlockIndex = z.number().int().min(0).max(WORKFLOW_PAGE_ITEM_CAP - 1)

/*
The text rules, restated over the constants `page-document.ts` owns rather than
over literals of this file's own.

**Why restated at all, when `applyDocument` is the validator this import
reuses.** `applyDocument` judges *structure* — the outline, the nesting, the
caps, the identities — and it judges it after the block payloads have already
been parsed by `documentOperation`. A format 4 block is not a `put_block`: it
carries no id, no `file_id` and no `width_pct`, and it is turned into one only
after this schema has accepted it. So the three rules that are properties of a
block's own payload are stated here, each reading the same exported constant the
document schema reads, and the guard beside this file drives a format 4 block
and the `put_block` it becomes through both to prove the two never disagree.
*/
const pageContentBlock = z
  .object({
    kind: z.enum(WORKFLOW_PAGE_BLOCK_KINDS),
    /** 4.17's plain-text projection. Nullable because the column is, and
     * absent means null: an empty heading is a heading 4.17 admits. */
    text: z.string().max(4000).nullable().optional(),
    rich_content: richContent.nullable().optional(),
    /** #219's tick, and authored content rather than any Task's status. */
    checked: z.boolean().optional(),
    /** A Section's heading level, and the whole of how Sections nest here. */
    level: z.number().int().min(1).max(MAX_SECTION_DEPTH).optional(),
    list_parent: pageBlockIndex.optional(),
    section: pageBlockIndex.nullable().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.kind === 'section' && (block.text?.length ?? 0) > 120) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A heading has at most 120 characters.',
      })
    }
    if (
      block.rich_content !== null &&
      block.rich_content !== undefined &&
      (!(RICH_TEXT_BLOCK_KINDS as readonly string[]).includes(block.kind) ||
        block.rich_content.runs.map((run) => run.text).join('') !== (block.text ?? null))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rich_content'],
        message: 'Rich content must match its text projection.',
      })
    }
    if (block.checked !== undefined && block.kind !== 'checklist') {
      ctx.addIssue({
        code: 'custom',
        path: ['checked'],
        message: 'Only a checklist item is checked or unchecked.',
      })
    }
    if (block.level !== undefined && block.kind !== 'section') {
      ctx.addIssue({
        code: 'custom',
        path: ['level'],
        message: 'Only a heading carries a level.',
      })
    }
    if (block.section !== undefined && block.kind === 'section') {
      ctx.addIssue({
        code: 'custom',
        path: ['section'],
        message: "A heading's Section is its level, so it names none.",
      })
    }
    if (block.list_parent !== undefined && !isListKind(block.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: ['list_parent'],
        message: 'Only a bullet, numbered or checklist item is a nested list item.',
      })
    }
  })

/**
 * A Task at its place on the page: 7.16's portable keys, inline.
 *
 * **`list_parent` is declared in order to be refused**, which is 11.14's house
 * spelling (`shelves.ts` carries the same idiom) and is here for #185's own
 * rule rather than for tidiness. #219 says a Task is never a nested list item,
 * and an undeclared key is *stripped*: a file nesting a Task under a bullet
 * would import with the nesting silently gone, which is the one thing this
 * format is not allowed to do. The content block above refuses the same thing
 * for the kinds that cannot nest; this is the Task's half of it, and AC-824
 * drives it.
 */
const pageTaskBlock = importTask.extend({
  kind: z.literal('task'),
  section: pageBlockIndex.nullable().optional(),
  list_parent: z
    .never({ error: 'A Task is never a nested list item.' })
    .optional(),
})

/*
What the page held that the file does not.

**It imports as nothing, and that is the whole of its contract.** It exists so
that a person reading the JSON, and the export surface that wrote it, can both
say what was left behind. `name` is whatever the exporter knew to call the
thing — a picture's caption where the block carried one — and it is read by
nobody: the block creates no row, so there is no field for it to arrive in.
*/
const pageOmittedBlock = z.object({
  kind: z.literal('omitted'),
  was: z.enum(WORKFLOW_OMITTED_BLOCK_KINDS),
  name: z.string().max(300).optional(),
})

export const workflowPageBlock = z.discriminatedUnion('kind', [
  pageContentBlock,
  pageTaskBlock,
  pageOmittedBlock,
])
export type WorkflowPageBlock = z.infer<typeof workflowPageBlock>
export type WorkflowTaskBlock = z.infer<typeof pageTaskBlock>

const workflowPage = z.object({
  blocks: z
    .array(workflowPageBlock)
    .max(
      WORKFLOW_PAGE_ITEM_CAP,
      `page: a page carries at most ${String(WORKFLOW_PAGE_ITEM_CAP)} items`,
    ),
})

/* ------------------------------------------------------------------ *
 * Format 5: the native Purpose facet (#211)
 * ------------------------------------------------------------------ */

export const WORKFLOW_PURPOSE_BLOCK_KINDS = [
  'paragraph',
  ...PRESENTATION_HEADING_KINDS,
  'bullet',
  'numbered',
  'checklist',
  'quote',
  'callout',
  'code',
] as const
export type WorkflowPurposeBlockKind =
  (typeof WORKFLOW_PURPOSE_BLOCK_KINDS)[number]

const purposeContentBlock = z
  .object({
    kind: z.enum(WORKFLOW_PURPOSE_BLOCK_KINDS),
    text: z.string().max(4000).nullable().optional(),
    rich_content: richContent.nullable().optional(),
    checked: z.boolean().optional(),
    list_parent: pageBlockIndex.optional(),
  })
  .superRefine((block, ctx) => {
    if (
      (PRESENTATION_HEADING_KINDS as readonly string[]).includes(block.kind) &&
      (block.text?.length ?? 0) > 120
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A heading has at most 120 characters.',
      })
    }
    if (
      block.rich_content !== null &&
      block.rich_content !== undefined &&
      (!(RICH_TEXT_BLOCK_KINDS as readonly string[]).includes(block.kind) ||
        block.rich_content.runs.map((run) => run.text).join('') !==
          (block.text ?? null))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['rich_content'],
        message: 'Rich content must match its text projection.',
      })
    }
    if (block.checked !== undefined && block.kind !== 'checklist') {
      ctx.addIssue({
        code: 'custom',
        path: ['checked'],
        message: 'Only a checklist item is checked or unchecked.',
      })
    }
    if (block.list_parent !== undefined && !isListKind(block.kind)) {
      ctx.addIssue({
        code: 'custom',
        path: ['list_parent'],
        message: 'Only a bullet, numbered or checklist item is a nested list item.',
      })
    }
  })

export const workflowPurposeBlock = z.discriminatedUnion('kind', [
  purposeContentBlock,
  pageOmittedBlock,
])
export type WorkflowPurposeBlock = z.infer<typeof workflowPurposeBlock>

export const workflowPurpose = z
  .object({
    display_name: z.string().min(1).max(120).nullable().optional(),
    blocks: z
      .array(workflowPurposeBlock)
      .max(
        WORKFLOW_PAGE_ITEM_CAP,
        `purpose: a document carries at most ${String(WORKFLOW_PAGE_ITEM_CAP)} items`,
      ),
  })
  .superRefine((purpose, ctx) => {
    purpose.blocks.forEach((block, index) => {
      if (block.kind === 'omitted' || block.list_parent === undefined) return
      const parent = purpose.blocks[block.list_parent]
      if (
        block.list_parent >= index ||
        parent === undefined ||
        parent.kind === 'omitted' ||
        !isListKind(parent.kind)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'list_parent'],
          message: 'A list item nests under an earlier list item of this Purpose document.',
        })
      }
    })
  })
export type WorkflowPurpose = z.infer<typeof workflowPurpose>

/*
The one reading of a format 4 page, used by the schema and by the import.

**Two readers of one positional format would be two formats.** The schema has
to refuse a file whose indices do not resolve, and the import has to build an
outline out of the same indices; if each worked it out for itself, a file could
be accepted by one reading and written by the other. So there is one walk, it
answers both questions at once, and `importWorkflow` asserts that the issues it
returns are empty rather than re-deriving them.

The walk keeps the stack of Sections open at this point in the page, which is
`applyDocument`'s own `active` under another name: a parent must precede its
content and content forms a contiguous run, so the ancestry of the next item is
entirely determined by the items before it. `folderToWorkflowFile` runs the
**same** stack while it writes, which is what makes the default right by
construction and the `section` escape necessary only where the truth differs
from it.

What is deliberately *not* checked here: that a nested list item shares its list
parent's Section, that a heading is not four deep once the escapes are applied,
that nothing is repeated. Those are structure rather than index arithmetic,
`applyDocument` already refuses every one of them, and a second implementation
of a rule is the thing this module exists to avoid.
*/
export interface WorkflowPageItem {
  /** Where this item sits in the file's own `page.blocks`. */
  index: number
  kind: 'block' | 'task'
  /** The `page.blocks` index of the Section it belongs to, or null for the
   * page root. */
  sectionIndex: number | null
  /** The `page.blocks` index of the list item it is nested under, or null. */
  listParentIndex: number | null
}

export interface WorkflowPageIssue {
  path: (string | number)[]
  message: string
}

export interface WorkflowPageReading {
  /** Every block that becomes a row, in page order. Placeholders are absent. */
  items: WorkflowPageItem[]
  /** How many placeholders the file carried. */
  omitted: number
  /** Empty when the page reads; otherwise what is wrong and where. */
  issues: WorkflowPageIssue[]
}

export function readWorkflowPage(
  blocks: readonly WorkflowPageBlock[],
): WorkflowPageReading {
  const items: WorkflowPageItem[] = []
  const issues: WorkflowPageIssue[] = []
  let omitted = 0
  /** The Sections open at this point, outermost first. */
  const open: number[] = []
  blocks.forEach((block, index) => {
    if (block.kind === 'omitted') {
      omitted += 1
      return
    }
    let parent: number | null = null
    if (block.kind === 'section') {
      const level = block.level ?? 1
      if (level > open.length + 1) {
        issues.push({
          path: [index, 'level'],
          message: `A level ${String(level)} heading needs a level ${String(level - 1)} heading above it`,
        })
        return
      }
      parent = level === 1 ? null : (open[level - 2] ?? null)
    } else if (block.section === undefined) {
      parent = open.length === 0 ? null : (open[open.length - 1] ?? null)
    } else if (block.section !== null) {
      if (!open.includes(block.section)) {
        issues.push({
          path: [index, 'section'],
          message:
            'A block names the Section it is in by the position of a heading that is still open above it',
        })
        return
      }
      parent = block.section
    }
    let listParent: number | null = null
    if (block.kind !== 'task' && block.list_parent !== undefined) {
      const target = blocks[block.list_parent]
      if (
        block.list_parent >= index ||
        target === undefined ||
        target.kind === 'task' ||
        target.kind === 'omitted' ||
        !isListKind(target.kind)
      ) {
        issues.push({
          path: [index, 'list_parent'],
          message:
            'A list item nests under a bullet, numbered or checklist item written above it',
        })
        return
      }
      listParent = block.list_parent
    }
    /* The stack, moved to this item's ancestry: leaving a Section closes it and
       every Section inside it, which is 7.16's contiguity read forwards. */
    open.length = parent === null ? 0 : open.indexOf(parent) + 1
    if (block.kind === 'section') open.push(index)
    items.push({
      index,
      kind: block.kind === 'task' ? 'task' : 'block',
      sectionIndex: parent,
      listParentIndex: listParent,
    })
  })
  return { items, omitted, issues }
}

const importFolder = z.object({
  document: z.object({blocks:z.array(documentOperation).max(500),outline:z.array(documentOutlineItem).max(1500),task_ids:z.array(z.uuid()).max(1000)}).optional(),
  name: z.string().min(1).max(100),
  tasks: z.array(importTask).optional(),
  blocks: z.array(importBlock).optional(),
  /** Format 4's one ordered page (#185). Gated on the version by
   * `readsPage` below, exactly as `labels` is gated on 3. */
  page: workflowPage.optional(),
  /** Format 5's reusable native Purpose document (#211). */
  purpose: workflowPurpose.optional(),
  /*
  DES-206's own name for `blocks`, declared for one reason: to refuse it
  **beside a page**, which is the same contradiction the rule below refuses for
  `tasks`, `blocks` and `document`.

  **Nothing legitimate reaches this line.** `normalizeFolder` folds `items` into
  `blocks` for a folder with no page and *deletes the key as it folds*, so an
  `items` that survives normalisation is one the normaliser deliberately left
  alone — and it leaves it alone in exactly one case, a folder that also carries
  a page, because folding it there would invent the contradiction rather than
  report it. So `z.never()` here is precise rather than blunt: a version 1 file
  full of `items` still imports, and a version 4 folder with `items` and no page
  is still read from the older keys.

  It is this spelling and not a line in the refinement below because the key has
  to *survive* to be seen at all, and a key an object schema does not declare is
  stripped before any refinement runs — which is exactly how this shipped
  broken: a version 4 folder carrying a page and an `items` imported **201**
  with the `items` gone and nothing said, the one behaviour format 4 exists to
  end, reached by spelling the key the way the older serialiser did. 11.14 names
  `z.never({ error })` as the house answer for a field an endpoint means to
  refuse, and `shelves.ts` already uses it.

  The message is worded as the refinement's is, and the path zod gives it is
  `folders.<n>.items`, so a caller cannot tell which of the two refused them.
  AC-824 is the criterion that proves the value arrives.
  */
  items: z
    .never({
      error:
        'items: a folder that carries a page carries its work and its writing in that page, and nowhere else',
    })
    .optional(),
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

/*
**Every version of the file format this contract reads, and the only place
any of them is written down.** #260, extended to 4 by #185.

There were two places. The endpoint's schema widened from `z.literal(1)` to
both at #204 on 2026-09-17, and the client's file picker
(`client/shell/workflow-import.ts`) kept a hand-written `value.version !== 1`
of its own, so from that day until this one "Save as workflow" wrote version
2 for every folder with a page and Dana's own Import answered those files
with "that file isn't a workflow Dana can read". The bump walked past the
second copy because nothing tied it to the first and nothing tested the
picker's envelope above version 1, and a second bump to 3 was in flight on
`backend/227-label-lifecycle` when this was written. That bump has since
landed as #227's Folder Labels, and 3 joining this array is the whole of what
it cost the picker — which is the claim this file was changed to make.

So the number is a list here, `workflowFileVersion` is derived from it, and
the picker is derived from the list rather than repeating it. **Adding a
version is this array and nothing else**; anything that needs to know which
versions are readable imports one of these two rather than writing a
literal.

**4 joined it the same way, and it is the claim's first repayment.** #185's
ordered page is what `folderToWorkflowFile` now writes, and the whole of what
that cost the picker was this array — one line, in one file, exactly as the
paragraph above promised. 1, 2 and 3 are read as they always were, so a file
written before that change imports with the same rows it always made.
*/
export const WORKFLOW_FILE_VERSIONS = [1, 2, 3, 4, 5] as const

/** The array as the body schema reads it. A union of literals rather than
 * `z.literal([...])` so the issue a bad version produces keeps the shape it
 * has had since #204, this being a derivation and not a contract change. */
export const workflowFileVersion = z.union(
  WORKFLOW_FILE_VERSIONS.map((version) => z.literal(version)),
)

const canonicalWorkflowBody = z
  .object({
    dana: z.literal('workflow'),
    /*
    **1, 2, 3 and now 4, and every one of them still imports.** The numbers
    themselves are `WORKFLOW_FILE_VERSIONS` above and this field is derived
    from it (#260); what follows is what the number *means*. It says what a
    *reader* must understand, so it goes up when the writer starts
    emitting something an older reader would silently lose — which is exactly
    what a Folder Label vocabulary is to a version-2 reader, whose schema does
    not declare `labels` and would therefore strip it and import a folder with
    its classification quietly gone. 4 is #185's ordered page, 3 is #227's
    Folder Labels (area 4), 2 was the typed page document, 1 was the original.
    Older files are not deprecated and #227's own requirement is that they keep
    importing; what changed at 4 is only what the *writer* emits.
    */
    version: workflowFileVersion,
    name: z.string().max(100).optional(),
    folders: z
      .array(importFolder)
      .min(1, 'folders: a workflow file carries at least one')
      .max(50, 'folders: a workflow file carries at most 50'),
  })
  .superRefine((file, ctx) => {
    /*
    Format 4's page is counted against the same two ceilings 10.3 has always
    carried, and it is counted by what each entry *becomes*: a content block is
    a block, a task block is a task, and an omitted placeholder is neither,
    because it creates nothing. The array's own cap above bounds a file made
    entirely of placeholders.
    */
    const pageBlocks = (folder: z.infer<typeof importFolder>): number =>
      (folder.page?.blocks ?? []).filter(
        (block) => block.kind !== 'task' && block.kind !== 'omitted',
      ).length
    const pageTasks = (folder: z.infer<typeof importFolder>): number =>
      (folder.page?.blocks ?? []).filter((block) => block.kind === 'task').length
    const blocks = file.folders.reduce(
      (sum, folder) =>
        sum +
        (folder.page !== undefined
          ? pageBlocks(folder)
          : (folder.document?.blocks.length ?? folder.blocks?.length ?? 0)) +
        (folder.purpose?.blocks ?? []).filter((block) => block.kind !== 'omitted')
          .length,
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
      (sum, folder) => sum + (folder.tasks?.length ?? 0) + pageTasks(folder),
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
    /*
    Format 4's two file-local rules, and they are the same kind of rule as the
    Label ones below: a file's own values compared to a file's own values.

    **A page and a collection in one folder is a file claiming structure the
    importer discards**, which is #185's acceptance in as many words. A format 4
    folder says everything in `page`, so a `tasks`, `blocks`, `document` or
    `items` key beside it is work the import would not create, sitting in a file
    that looks complete. It is refused rather than dropped for the reason an
    undeclared Label key is: dropping loses the thing silently and leaves a file
    that looks imported and is not.

    **`items` is the fourth key and it is refused one layer up**, by
    `z.never({ error })` on the folder schema above, because an undeclared key
    is stripped before this loop can see it and a declared-then-stripped one
    would still have to be erased from the parsed body by hand. The message and
    the field path are the same shape as these three on purpose; the reason it
    can be a flat refusal rather than a conditional one is that the normaliser
    deletes `items` wherever it folds it, so the only `items` that survives to
    be refused is one sitting beside a page. A version 4 folder with **no** page is still read from
    the older keys, so a hand-written file that says 4 and arranges itself the
    old way imports rather than being told it is wrong about itself.

    **And the page's own indices have to resolve**, which is `readWorkflowPage`
    above and nothing this loop knows itself.
    */
    file.folders.forEach((folder, index) => {
      if (folder.page === undefined) return
      for (const key of ['tasks', 'blocks', 'document'] as const) {
        if (folder[key] === undefined) continue
        ctx.addIssue({
          code: 'custom',
          path: ['folders', index, key],
          message: `${key}: a folder that carries a page carries its work and its writing in that page, and nowhere else`,
        })
      }
      for (const issue of readWorkflowPage(folder.page.blocks).issues) {
        ctx.addIssue({
          code: 'custom',
          path: ['folders', index, 'page', 'blocks', ...issue.path],
          message: issue.message,
        })
      }
    })
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
      /* Wherever the Task is written. A format 4 Task is a block of the page
         and carries the same `labels` key in the same vocabulary, so the rule
         that an undeclared key is refused rather than dropped has to reach it
         — the alternative is the one loss #227 exists to stop, a file that
         looks imported with its classification quietly gone. */
      const tasksOf: [(string | number)[], { labels?: string[] }][] = [
        ...(folder.tasks ?? []).map(
          (task, taskIndex): [(string | number)[], { labels?: string[] }] => [
            ['tasks', taskIndex, 'labels'],
            task,
          ],
        ),
        ...(folder.page?.blocks ?? []).flatMap(
          (block, blockIndex): [(string | number)[], { labels?: string[] }][] =>
            block.kind === 'task'
              ? [[['page', 'blocks', blockIndex, 'labels'], block]]
              : [],
        ),
      ]
      for (const [path, task] of tasksOf) {
        for (const key of task.labels ?? []) {
          if (declared.has(key)) continue
          ctx.addIssue({
            code: 'custom',
            path: ['folders', index, ...path],
            message: `labels: the key ${JSON.stringify(key)} is not one of this folder's labels`,
          })
        }
      }
    })
    for (const issue of workflowDependencyIssues(file.folders)) {
      ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
    }
  })

/** The two dependency keys a Task of the file may carry (#207). */
interface DependencyKeys {
  key?: string
  depends_on?: string[]
}

/** A Task of the file with the path its keys are refused at. */
interface KeyedTask {
  path: (string | number)[]
  task: DependencyKeys
}

function keyedTasksOf(
  folders: readonly {
    tasks?: readonly DependencyKeys[]
    page?: { blocks: readonly (DependencyKeys & { kind: string })[] }
  }[],
): KeyedTask[] {
  return folders.flatMap((folder, index) => [
    ...(folder.tasks ?? []).map((task, taskIndex) => ({
      path: ['folders', index, 'tasks', taskIndex],
      task,
    })),
    ...(folder.page?.blocks ?? []).flatMap((block, blockIndex) =>
      block.kind === 'task'
        ? [{ path: ['folders', index, 'page', 'blocks', blockIndex], task: block }]
        : [],
    ),
  ])
}

/**
 * The file's internal dependency edges as `[dependent key, blocker key]`,
 * keeping only those whose both ends the file declares (#207). The importer
 * reads this and nothing else, so the rule "external dependencies are
 * excluded" is stated once.
 */
export function workflowDependencyEdges(
  folders: Parameters<typeof keyedTasksOf>[0],
): [string, string][] {
  const tasks = keyedTasksOf(folders)
  const declared = new Set(
    tasks.flatMap(({ task }) => (task.key === undefined ? [] : [task.key])),
  )
  const edges: [string, string][] = []
  const seen = new Set<string>()
  for (const { task } of tasks) {
    if (task.key === undefined) continue
    for (const blocker of task.depends_on ?? []) {
      if (!declared.has(blocker)) continue
      const pair = JSON.stringify([task.key, blocker])
      if (seen.has(pair)) continue
      seen.add(pair)
      edges.push([task.key, blocker])
    }
  }
  return edges
}

/** Duplicate keys, self-dependencies and cycles, each refused where the live
 * endpoint refuses the same edge. The cycle walk is the file-local form of
 * `createTaskDependency`'s: every Task an import creates is new, so no edge
 * outside the file can reach one and the file's own graph is the whole graph. */
function workflowDependencyIssues(
  folders: Parameters<typeof keyedTasksOf>[0],
): { path: (string | number)[]; message: string }[] {
  const tasks = keyedTasksOf(folders)
  const issues: { path: (string | number)[]; message: string }[] = []
  const named = tasks.reduce((sum, { task }) => sum + (task.depends_on?.length ?? 0), 0)
  if (named > WORKFLOW_DEPENDENCY_CAP) {
    return [
      {
        path: ['folders'],
        message: `depends_on: a file names at most ${String(WORKFLOW_DEPENDENCY_CAP)} dependencies`,
      },
    ]
  }
  const pathOf = new Map<string, (string | number)[]>()
  for (const { path, task } of tasks) {
    if (task.key === undefined) continue
    if (pathOf.has(task.key)) {
      issues.push({
        path: [...path, 'key'],
        message: `key: the task key ${JSON.stringify(task.key)} is used twice in one file`,
      })
      continue
    }
    pathOf.set(task.key, path)
  }
  if (issues.length > 0) return issues
  const waitsOn = new Map<string, string[]>()
  for (const [dependent, blocker] of workflowDependencyEdges(folders)) {
    if (dependent === blocker) {
      issues.push({
        path: [...(pathOf.get(dependent) ?? []), 'depends_on'],
        message: 'depends_on: a task cannot depend on itself',
      })
      continue
    }
    waitsOn.set(dependent, [...(waitsOn.get(dependent) ?? []), blocker])
  }
  // Depth-first, colouring each key: 1 on the current path, 2 finished.
  const colour = new Map<string, 1 | 2>()
  const visit = (key: string): boolean => {
    colour.set(key, 1)
    for (const next of waitsOn.get(key) ?? []) {
      const seen = colour.get(next)
      if (seen === 1) return true
      if (seen === undefined && visit(next)) return true
    }
    colour.set(key, 2)
    return false
  }
  for (const key of waitsOn.keys()) {
    if (colour.has(key)) continue
    if (visit(key)) {
      issues.push({
        path: [...(pathOf.get(key) ?? []), 'depends_on'],
        message: 'depends_on: these dependencies would form a cycle',
      })
      break
    }
  }
  return issues
}

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
  for (const key of ['notes', 'important', 'recurrence_rule', 'reminder', 'steps', 'labels', 'key', 'depends_on']) {
    if (task[key] === null) delete task[key]
  }
}

/** The same rule one level up, and it was missing until an adversarial review
 * measured the asymmetry: a task's `labels: null` was tolerated while a
 * folder's was a 422, for no reason either half could state. Every optional
 * key `importFolder` names is here, because "null means absent" is a property
 * of the format rather than of any one key. */
function dropFolderNulls(folder: Record<string, unknown>): void {
  for (const key of ['tasks', 'blocks', 'document', 'labels', 'page', 'purpose']) {
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
  return file.version === 3 || file.version === 4 || file.version === 5
}

/*
A `page` key belongs to version 4, on exactly the rule above.

**It is the stricter half of the same line and that is why it is gated.** A
version 4 page is *refused* where it cannot be read — an unknown block kind is a
422 rather than a dropped item — because a file that says 4 has said its reader
understands this page, so a kind it does not define is the file contradicting
itself. A version 1 file has said no such thing, and `page` there is a foreign
arrangement like any other: dropped, reported by the client's own reporter, and
never measured against rules it never claimed to satisfy.
*/
function readsPage(file: Record<string, unknown>): boolean {
  return file.version === 4 || file.version === 5
}

function readsPurpose(file: Record<string, unknown>): boolean {
  return file.version === 5
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

function normalizeFolder(
  folder: unknown,
  labels: boolean,
  carriesPage: boolean,
  carriesPurpose: boolean,
): unknown {
  /* A folder given as its name alone, which is what a file listing the
     folders of an arrangement writes. */
  if (typeof folder === 'string') return { name: folder }
  if (!isRecord(folder)) return folder
  const next: Record<string, unknown> = { ...folder }
  dropFolderNulls(next)
  if (!labels) delete next.labels
  if (!carriesPage) delete next.page
  if (!carriesPurpose) delete next.purpose
  /* A format 4 folder says everything in its page, so the older arrangements
     are left exactly as the file wrote them: a `blocks` key beside a page is
     the contradiction the body refuses, and folding `items` into one here
     would invent that contradiction out of a key the file merely carried. */
  if (carriesPage && isRecord(next.page)) return next
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
  /*
  **Every path that reaches this line is a folder with no format 4 page**, the
  one that has one having returned above — so `items` has either become
  `blocks` or is a key of a shape no arrangement reads, and either way the
  folder is done with it.

  It used to be left sitting here, harmlessly, because the schema declared no
  `items` and stripped it. The schema declares one now, to refuse an `items`
  **beside a page**, and that declaration is a flat `z.never()` rather than a
  conditional rule precisely because of this line: after normalisation the only
  surviving `items` in the world is the one the early return above kept. Leave
  it here and a version 1 file would be refused for a key the fold had already
  honoured.
  */
  delete next.items
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
    if (
      !Array.isArray(file.tasks) &&
      !Array.isArray(file.items) &&
      !isRecord(file.page) &&
      !isRecord(file.purpose)
    ) {
      return file
    }
    const named = typeof file.name === 'string' && file.name.trim() !== ''
    folders = [
      {
        name: named ? file.name : UNNAMED_IMPORT,
        ...(Array.isArray(file.labels) ? { labels: file.labels } : {}),
        /* Format 4's page folds like every other top-level key this
           arrangement writes, and for the same reason: `folderToWorkflowFile`
           always writes a `folders` array, so only a hand-written or
           hand-merged file arrives this way, and one that carried a page at
           the top level would otherwise meet "folders: expected array" about
           a file it got right in every other respect. */
        ...(isRecord(file.page) ? { page: file.page } : {}),
        ...(isRecord(file.purpose) ? { purpose: file.purpose } : {}),
        ...(Array.isArray(file.tasks) ? { tasks: file.tasks } : {}),
        ...(Array.isArray(file.items) ? { items: file.items } : {}),
      },
    ]
  }
  const labels = readsLabels(file)
  const page = readsPage(file)
  const purpose = readsPurpose(file)
  file.folders = folders.map((folder) =>
    normalizeFolder(folder, labels, page, purpose),
  )
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

The client's `api/mutations.ts` parses with this schema.
*/
export const importWorkflowResponse = z.object({
  folders: z.array(z.object({ id: z.uuid(), name: z.string() })),
})
export type ImportWorkflowResponse = z.infer<typeof importWorkflowResponse>

/** Whether the file asks the endpoint to evaluate a date, which is the
 * condition under which 7.6 requires the tz parameter: a repeat needs 4.5's anchor and a reminder needs 8.6's,
 * and a file carrying neither evaluates nothing and needs no zone. */
export function needsImportAnchor(file: ImportWorkflowBody): boolean {
  const dated = (task: {
    recurrence_rule?: string
    reminder?: { time_of_day: string }
  }): boolean => task.recurrence_rule !== undefined || task.reminder !== undefined
  return file.folders.some(
    (folder) =>
      (folder.tasks ?? []).some(dated) ||
      /* Wherever the Task is written: a format 4 Task carries the same repeat
         and the same reminder, and 4.5 and 8.6 admit neither without a date. */
      (folder.page?.blocks ?? []).some(
        (block) => block.kind === 'task' && dated(block),
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

/** One dependency edge as the exporter reads it: the dependent waits on the
 * blocker. Structural, so the caller hands over the `dependencies` of
 * `GET /folders/:id/dependencies` (`getFolderDependenciesResponse` in
 * `shared/task-dependencies.ts`) as they arrive — one read for the whole
 * Folder, never one per Task. */
export interface WorkflowDependencyEdge {
  dependent_task_id: string
  blocking_task_id: string
}

/**
 * What "Save as workflow" produces: the file, and a count of what the page held
 * that a file does not.
 *
 * **The count is a return value rather than a comment in this module**, because
 * the only place it can honestly be said is the screen the person is standing
 * in front of when they press the control. #185's acceptance asks for exactly
 * that — "if images are intentionally excluded, the UI/export action clearly
 * communicates that limitation" — and a number nobody has to compute is a
 * number that cannot drift out of step with what the writer actually dropped.
 */
export interface WorkflowExport {
  file: ImportWorkflowBody
  /** Pictures, files, audio, video and folder references written as
   * placeholders. Zero for a page that held none. */
  omitted: number
  /**
   * Tasks the page carried that the caller handed over no detail for, and so
   * that are not in the file at all (#185, and the adversarial review of it).
   *
   * **In the product these are the completed ones**, because `FolderPage.tsx`
   * hands this function the folder's *pending* work: 7.16 carries no state and
   * a template of finished work is not a template. That is a decision and it
   * stands; what was wrong is that it happened in silence, which is the one
   * thing this format exists to end. It is counted rather than written as a
   * placeholder because a placeholder says "a block of this page could not
   * travel", and a finished Task is content the format excludes by rule at
   * every version, exactly as a due date and an assignee are.
   *
   * Zero for the flat call, which has no page and therefore no Task on it that
   * the caller did not also hand over.
   */
  withheldTasks: number
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

**What it writes is 7.16's portable list and nothing beside it.** The title,
the notes, the star, the repeat, the reminder in its date-only mode, and the
step titles; and of the page, every block of writing it holds, in order, each
Task among them at its own position. A
tick, a state, a due date, an assignee, a comment and an id are absent
because 7.16 excludes them, and they are absent from the file rather than
stripped on the way back in, so a file a person opens in an editor shows
them nothing about anybody.

**It writes the current ordered-page format.** Without Purpose this remains
format 4 (#185). When the caller supplies the native Purpose document, #211
raises the file to format 5 and adds only that portable Purpose payload. The
legacy `blocks` and `tasks` collections, and #204's `document` with its
account-local uuids, are still *read* but are never written.
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
  /** #211: when supplied, the writer emits workflow format 5 and carries the
   * native Purpose facet. Existing callers that have not loaded Purpose keep
   * emitting format 4 until the frontend handoff wires this parameter. */
  purpose?: { display_name: string | null; page: PageView },
  /** #207: the dependency edges among `tasks`, by live id. Only an edge whose
   * both ends are handed over is written, as file-local `key`/`depends_on`;
   * an edge to a Task outside the file is excluded, and a Folder with no
   * dependencies writes the file byte-for-byte as before. */
  dependencies: readonly WorkflowDependencyEdge[] = [],
): WorkflowExport {
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
  const exportedIds = new Set(tasks.map((task) => task.id))
  const internal = dependencies.filter(
    (edge) =>
      edge.dependent_task_id !== edge.blocking_task_id &&
      exportedIds.has(edge.dependent_task_id) &&
      exportedIds.has(edge.blocking_task_id),
  )
  const taskKeyOf = new Map<string, string>()
  for (const task of tasks) {
    if (
      internal.some(
        (edge) =>
          edge.dependent_task_id === task.id ||
          edge.blocking_task_id === task.id,
      )
    ) {
      taskKeyOf.set(task.id, `t${String(taskKeyOf.size + 1)}`)
    }
  }
  const portable = (task: TaskDetail): Omit<WorkflowTaskBlock, 'kind'> => {
  const labelKeys = labelKeysOf(task, keyOf)
  const taskKey = taskKeyOf.get(task.id)
  const dependsOn = internal
    .filter((edge) => edge.dependent_task_id === task.id)
    .map((edge) => taskKeyOf.get(edge.blocking_task_id) as string)
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
    ...(taskKey === undefined ? {} : { key: taskKey }),
    ...(dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
  }
  }
  /*
  The page, in three passes, and the middle one is the whole of the positional
  format.

  1. **What is written**, in page order, each entry remembering the ids its
     structure is expressed in.
  2. **What each entry has to say about its structure**, computed by walking the
     same stack of open Sections `readWorkflowPage` walks. That is what makes
     the positional default right by construction: the encoder asks the decoder's
     own question at every position and writes a key only where the answer
     differs from the truth.
  3. **The objects**, in one fixed key order, so that a file exported twice from
     the same page is the same bytes.

  **A Task with no detail is not written at all.** The folder page hands over
  the *pending* work, so a completed Task is absent from `tasks` while its
  reference is still in `items`; 7.16 has never carried a state and a template
  of finished work is not a template. It is skipped rather than placed empty,
  and skipping changes nothing about anybody's Section, because a Task is never
  a parent of anything.

  **It is skipped and counted, since 2026-09-21.** The decision above is
  unchanged; what changed is that it used to happen with nothing said, which is
  #185's own defect wearing a different coat. `withheldTasks` is that count and
  the export surface says it. Why it is a count rather than an `omitted`
  placeholder is on `WorkflowExport` above and in 7.16.
  */
  interface Entry {
    /** Null for a placeholder, which nothing can refer to. */
    id: string | null
    section: string | null
    listParent: string | null
    isSection: boolean
    write: (structure: PageStructure) => WorkflowPageBlock
  }
  interface PageStructure {
    level?: number
    section?: number | null
    list_parent?: number
  }
  const entries: Entry[] = []
  let withheldTasks = 0
  const omittedKind = (kind: string): kind is WorkflowOmittedBlockKind =>
    (WORKFLOW_OMITTED_BLOCK_KINDS as readonly string[]).includes(kind)
  const carriedKind = (kind: string): kind is WorkflowPageBlockKind =>
    (WORKFLOW_PAGE_BLOCK_KINDS as readonly string[]).includes(kind)
  const placeholder = (kind: WorkflowOmittedBlockKind, text: string | null): Entry => ({
    id: null,
    section: null,
    listParent: null,
    isSection: false,
    write: () => ({
      kind: 'omitted' as const,
      was: kind,
      /* Whatever the exporter knew to call it. A picture's caption is the only
         thing a page read carries about the file it names — 7.16's block read
         has a `file_id`, dimensions and a width, and no filename — so the
         caption is what a person opening the JSON is given. */
      ...(text !== null && text.trim() !== '' ? { name: text.slice(0, 300) } : {}),
    }),
  })
  const contentEntry = (block: PageBlock, kind: WorkflowPageBlockKind): Entry => ({
    id: block.id,
    section: block.section_block_id,
    listParent: block.list_parent_block_id,
    isSection: kind === 'section',
    write: (structure) => ({
      kind,
      ...(structure.level === undefined ? {} : { level: structure.level }),
      ...(block.text === null ? {} : { text: block.text }),
      ...(block.rich_content === null || block.rich_content === undefined
        ? {}
        : { rich_content: block.rich_content }),
      /* A tick is written only when it is one. 7.16 stores `false` for every
         checklist item that is not ticked, and an omitted key means exactly
         that on the way back in, so writing it would be noise that round trips
         to the same row. */
      ...(kind === 'checklist' && block.checked === true ? { checked: true } : {}),
      ...(structure.section === undefined ? {} : { section: structure.section }),
      ...(structure.list_parent === undefined
        ? {}
        : { list_parent: structure.list_parent }),
    }),
  })
  const taskEntry = (task: TaskDetail, section: string | null): Entry => ({
    id: task.id,
    section,
    listParent: null,
    isSection: false,
    write: (structure) => ({
      kind: 'task' as const,
      ...portable(task),
      ...(structure.section === undefined ? {} : { section: structure.section }),
    }),
  })
  if (pageView === undefined) {
    /*
    The flat call, which is what a caller with no page read hands over:
    `ExportableBlock` carries a kind and a text and no membership at all, and
    the import it was written for created every block at the page root. So the
    truth here is "everything is at the page root", and the pass below writes
    the `section: null` that says so wherever the positional default would have
    claimed otherwise. A blank section or paragraph is dropped exactly as
    `normalizeBlock` dropped it, this being the arrangement that rule was
    written for.
    */
    for (const block of blocks) {
      if (omittedKind(block.kind)) {
        entries.push(placeholder(block.kind, block.text))
      } else if (carriedKind(block.kind) && (block.text ?? '').trim() !== '') {
        entries.push(
          contentEntry(
            {
              id: '',
              kind: block.kind,
              text: block.text,
              rich_content: null,
              checked: null,
              section_block_id: null,
              list_parent_block_id: null,
            } as unknown as PageBlock,
            block.kind,
          ),
        )
      }
    }
    for (const task of tasks) entries.push(taskEntry(task, null))
  } else {
    const detailOf = new Map(tasks.map((task) => [task.id, task]))
    const blockOf = new Map(pageView.blocks.map((block) => [block.id, block]))
    const placedAt = new Map(
      (pageView.task_placements ?? []).map((place) => [place.id, place.section_block_id]),
    )
    for (const item of pageView.items) {
      if (item.kind === 'block') {
        const block = blockOf.get(item.id)
        if (block === undefined) continue
        if (omittedKind(block.kind)) {
          entries.push(placeholder(block.kind, block.text))
        } else if (carriedKind(block.kind)) {
          entries.push(contentEntry(block, block.kind))
        }
        continue
      }
      const task = detailOf.get(item.id)
      /* A Task on the page the caller handed no detail for — in the product,
         a completed one. Counted so that the export surface can say it rather
         than the person finding out on the other side. */
      if (task === undefined) {
        withheldTasks += 1
        continue
      }
      entries.push(
        taskEntry(
          task,
          placedAt.has(task.id)
            ? (placedAt.get(task.id) ?? null)
            : task.section_block_id,
        ),
      )
    }
  }
  const indexOf = new Map<string, number>()
  entries.forEach((entry, index) => {
    if (entry.id !== null && entry.id !== '') indexOf.set(entry.id, index)
  })
  /** The Sections open at this point, exactly as `readWorkflowPage` keeps them. */
  const open: number[] = []
  const pageBlocks = entries.map((entry, index) => {
    if (entry.id === null) return entry.write({})
    const named = entry.section === null ? null : (indexOf.get(entry.section) ?? null)
    /*
    A Section that is not open here cannot be named: 7.16 makes a page's
    Sections contiguous, so there is no position at which a closed one can be
    re-entered, and `readWorkflowPage` refuses an index that names one. The
    page this could come from is one the document contract cannot produce; the
    entry is written at the page root, which is the nearest legal placement and
    is said out loud rather than smuggled into whichever Section happens to be
    open.
    */
    const parent = named !== null && !open.includes(named) ? null : named
    const structure: PageStructure = {}
    if (entry.isSection) {
      const level = parent === null ? 1 : open.indexOf(parent) + 2
      if (level > 1) structure.level = level
    } else {
      const positional = open.length === 0 ? null : (open[open.length - 1] ?? null)
      if (parent !== positional) structure.section = parent
    }
    if (entry.listParent !== null) {
      const at = indexOf.get(entry.listParent)
      if (at !== undefined && at < index) structure.list_parent = at
    }
    open.length = parent === null ? 0 : open.indexOf(parent) + 1
    if (entry.isSection) open.push(index)
    return entry.write(structure)
  })
  let purposeDocument: WorkflowPurpose | undefined
  let purposeOmitted = 0
  if (purpose !== undefined) {
    const blockOf = new Map(purpose.page.blocks.map((block) => [block.id, block]))
    const ordered = purpose.page.items.flatMap((item) => {
      if (item.kind !== 'block') return []
      const block = blockOf.get(item.id)
      return block === undefined ? [] : [block]
    })
    const indexOfPurpose = new Map(
      ordered.map((block, index) => [block.id, index]),
    )
    const purposeCarriedKind = (
      kind: string,
    ): kind is WorkflowPurposeBlockKind =>
      (WORKFLOW_PURPOSE_BLOCK_KINDS as readonly string[]).includes(kind)
    const purposeBlocks: WorkflowPurposeBlock[] = []
    for (const block of ordered) {
      if (omittedKind(block.kind)) {
        purposeOmitted += 1
        purposeBlocks.push({
          kind: 'omitted',
          was: block.kind,
          ...(block.text !== null && block.text.trim() !== ''
            ? { name: block.text.slice(0, 300) }
            : {}),
        })
        continue
      }
      if (!purposeCarriedKind(block.kind)) continue
      const parent =
        block.list_parent_block_id === null
          ? undefined
          : indexOfPurpose.get(block.list_parent_block_id)
      purposeBlocks.push({
        kind: block.kind,
        ...(block.text === null ? {} : { text: block.text }),
        ...(block.rich_content === null || block.rich_content === undefined
          ? {}
          : { rich_content: block.rich_content }),
        ...(block.kind === 'checklist' && block.checked === true
          ? { checked: true }
          : {}),
        ...(parent === undefined ? {} : { list_parent: parent }),
      })
    }
    purposeDocument = {
      display_name: purpose.display_name,
      blocks: purposeBlocks,
    }
  }

  return {
    file: {
      dana: 'workflow',
      /* One current version out of *this* function. It always writes #185's
         ordered Main page; when Purpose is absent that is format 4, and when
         Purpose is present #211 adds the portable Purpose document and emits
         format 5. Formats 1 through 4 remain readable.

         **Scoped to this writer, corrected 2026-09-21.** The sentence here
         read "every file this product hands a person", which is false and was
         false when it was written: `client/pages/ShelfPage.tsx` writes a
         version 1 file of folder names for "Save shelf as workflow", and
         `client/onboarding/starters.ts` carries three version 1 starters. Both
         are right to — neither has a page to serialise, a shelf export being a
         list of folder names and a starter being a hand-written template — and
         both are read by the endpoint unchanged, which is the point of formats
         1 to 3 staying readable. What is true is the claim this function can
         make about itself. */
      version: purposeDocument === undefined ? 4 : 5,
      name: folderName,
      folders: [
        {
          name: folderName,
          ...(exportedLabels.length > 0 ? { labels: exportedLabels } : {}),
          page: { blocks: pageBlocks },
          ...(purposeDocument === undefined ? {} : { purpose: purposeDocument }),
        },
      ],
    },
    omitted:
      pageBlocks.filter((block) => block.kind === 'omitted').length +
      purposeOmitted,
    withheldTasks,
  }
}

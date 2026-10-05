/*
The 7.16 workflow-file contract. A file carries page blocks and task content,
never ids, people, due dates or states: zod strips every key not named here.
Normalisation (older arrangements, bare step strings) runs before validation.
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
  mayNest,
  mayNestUnder,
  richContent,
} from './page-document.js'
import type { PageView, PageBlock } from './pages.js'

import { recurrenceRule } from './tasks.js'
import type { TaskDetail } from './tasks.js'

export const WORKFLOW_DEPENDS_ON_CAP = 100
/** `depends_on` entries across a whole file: bounds one import's transaction. */
export const WORKFLOW_DEPENDENCY_CAP = 5000

/* Matches the task body's checklist limits: folderToWorkflowFile writes every
   item, so a tighter limit here would make a saved folder unimportable. */
const importStep = z.object({
  title: z.string().min(1).max(4000),
})

const TIME_OF_DAY = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

const importReminder = z.object({
  time_of_day: z
    .string()
    .regex(TIME_OF_DAY, 'reminder: a time of day as HH:MM'),
})

/*
A Folder Label in a file. `key` is file-local, never a database id. Values use
the live label primitives, so a file is refused by the same rules as typing.
Personal Labels never travel.
*/
const importLabel = z.object({
  key: z
    .string()
    .min(1, 'labels: each label needs a file-local key')
    .max(64, 'labels: a label key is at most 64 characters'),
  name: labelName,
  color: labelColor,
  description: labelDescription.nullable().optional(),
})

const importTask = z.object({
  title: z.string().min(1).max(300),
  notes: z.string().max(10000).optional(),
  important: z.boolean().optional(),
  recurrence_rule: recurrenceRule.optional(),
  reminder: importReminder.optional(),
  steps: z.array(importStep).max(500).optional(),
  /** Keys of this file's own `folders[].labels`, never ids. */
  labels: z
    .array(z.string().min(1).max(64))
    .max(
      TASK_FOLDER_LABEL_CAP,
      `labels: a task carries at most ${String(TASK_FOLDER_LABEL_CAP)} labels`,
    )
    .optional(),
  /*
  File-local keys for internal dependencies, unique across the whole file.
  An undeclared key is skipped (external); a duplicate, self-wait or cycle is 422.
  */
  key: z.string().min(1).max(64).optional(),
  depends_on: z.array(z.string().min(1).max(64)).max(WORKFLOW_DEPENDS_ON_CAP).optional(),
})

export type ImportWorkflowTask = z.infer<typeof importTask>

const importBlock = z.object({
  kind: z.enum(['section', 'paragraph']),
  text: z.string().min(1).max(4000),
})

/* Format 4: the page, as the page */

/*
Format 4 is one ordered array in page order. A Section nests by `level`; other
blocks belong to the innermost open Section unless `section` names one (index,
or null for root). `list_parent` is an index into the same array. Media blocks
are written as `{ kind: 'omitted', was }` placeholders. No index is a database id.
*/

export const WORKFLOW_PAGE_BLOCK_KINDS = [
  'section',
  'paragraph',
  // Writing, never a Section. Its fold is not carried.
  ...PRESENTATION_HEADING_KINDS,
  'bullet',
  'numbered',
  'checklist',
  'toggle',
  'quote',
  'callout',
  'code',
  'diagram',
  'divider',
] as const
export type WorkflowPageBlockKind = (typeof WORKFLOW_PAGE_BLOCK_KINDS)[number]

/*
Kinds a format 4 file records as dropped. Every page block kind must be in this
list or the one above; nothing checks that.
*/
export const WORKFLOW_OMITTED_BLOCK_KINDS = [
  'image',
  'file',
  'audio',
  'video',
  'folder_ref',
  // A sub-page link would carry an id of the exporting account.
  'page',
  'result',
] as const
export type WorkflowOmittedBlockKind = (typeof WORKFLOW_OMITTED_BLOCK_KINDS)[number]

const WORKFLOW_PAGE_ITEM_CAP = 1500

/** Position in this array, never a database id. */
const pageBlockIndex = z.number().int().min(0).max(WORKFLOW_PAGE_ITEM_CAP - 1)

/*
Payload rules for a format 4 block. applyDocument checks structure later; these
read the same constants as the document schema.
*/
const pageContentBlock = z
  .object({
    kind: z.enum(WORKFLOW_PAGE_BLOCK_KINDS),
    text: z.string().max(4000).nullable().optional(),
    rich_content: richContent.nullable().optional(),
    checked: z.boolean().optional(),
    level: z.number().int().min(1).max(MAX_SECTION_DEPTH).optional(),
    list_parent: pageBlockIndex.optional(),
    section: pageBlockIndex.nullable().optional(),
  })
  .superRefine((block, ctx) => {
    if ((block.kind === 'section' || (PRESENTATION_HEADING_KINDS as readonly string[]).includes(block.kind)) && (block.text?.length ?? 0) > 120) {
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
    if (
      block.list_parent !== undefined &&
      !mayNest(block.kind)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['list_parent'],
        message: 'A Section never nests under a block.',
      })
    }
    if (
      block.kind === 'divider' &&
      ((block.text !== null && block.text !== undefined && block.text !== '') ||
        (block.rich_content !== null && block.rich_content !== undefined))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A divider carries no text.',
      })
    }
  })

/**
 * A Task block. `list_parent` is declared so it is refused: an undeclared key
 * would be stripped and the nesting silently lost.
 */
const pageTaskBlock = importTask.extend({
  kind: z.literal('task'),
  section: pageBlockIndex.nullable().optional(),
  list_parent: z
    .never({ error: 'A Task is never a nested list item.' })
    .optional(),
})

/* What the page held that the file does not. Imports as nothing. */
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

/* Format 5: the native Purpose facet */

export const WORKFLOW_PURPOSE_BLOCK_KINDS = [
  'paragraph',
  ...PRESENTATION_HEADING_KINDS,
  'bullet',
  'numbered',
  'checklist',
  'toggle',
  'quote',
  'callout',
  'code',
  'diagram',
  'divider',
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
    if (
      block.list_parent !== undefined &&
      !mayNest(block.kind)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['list_parent'],
        message: 'A Section never nests under a block.',
      })
    }
    if (
      block.kind === 'divider' &&
      ((block.text !== null && block.text !== undefined && block.text !== '') ||
        (block.rich_content !== null && block.rich_content !== undefined))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A divider carries no text.',
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
        !mayNestUnder(block.kind, parent.kind)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'list_parent'],
          message: 'A block nests under an earlier writing block of this Purpose document.',
        })
      }
    })
  })
export type WorkflowPurpose = z.infer<typeof workflowPurpose>

/*
The one reading of a format 4 page, shared by the schema and the import so
both read the indices the same way. folderToWorkflowFile writes with the same
stack of open Sections. Structural rules are left to applyDocument.
*/
export interface WorkflowPageItem {
  index: number
  kind: 'block' | 'task'
  sectionIndex: number | null
  listParentIndex: number | null
}

export interface WorkflowPageIssue {
  path: (string | number)[]
  message: string
}

export interface WorkflowPageReading {
  items: WorkflowPageItem[]
  omitted: number
  issues: WorkflowPageIssue[]
}

export function readWorkflowPage(
  blocks: readonly WorkflowPageBlock[],
): WorkflowPageReading {
  const items: WorkflowPageItem[] = []
  const issues: WorkflowPageIssue[] = []
  let omitted = 0
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
        !mayNestUnder(block.kind, target.kind)
      ) {
        issues.push({
          path: [index, 'list_parent'],
          message:
            'A block nests under a writing block written above it',
        })
        return
      }
      listParent = block.list_parent
    }
    // Leaving a Section closes it and every Section inside it.
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
  /** Gated on version 4 by `readsPage`. */
  page: workflowPage.optional(),
  purpose: workflowPurpose.optional(),
  /*
  Declared so it can be refused beside a page; an undeclared key would be
  stripped silently. normalizeFolder deletes `items` wherever it folds it, so
  only an `items` next to a page reaches this.
  */
  items: z
    .never({
      error:
        'items: a folder that carries a page carries its work and its writing in that page, and nowhere else',
    })
    .optional(),
  labels: z
    .array(importLabel)
    .max(
      FOLDER_LABEL_DEFINITION_CAP,
      `labels: a folder carries at most ${String(FOLDER_LABEL_DEFINITION_CAP)} labels`,
    )
    .optional(),
})

/*
Every readable file version. workflowFileVersion and the client's file picker
derive from this array, so adding a version is this array and nothing else.
*/
export const WORKFLOW_FILE_VERSIONS = [1, 2, 3, 4, 5] as const

/** A union of literals, not z.literal([...]), to keep the issue shape for a bad version. */
export const workflowFileVersion = z.union(
  WORKFLOW_FILE_VERSIONS.map((version) => z.literal(version)),
)

const canonicalWorkflowBody = z
  .object({
    dana: z.literal('workflow'),
    /*
    Bump when the writer emits something an older reader would silently lose.
    5 adds Purpose, 4 the ordered page, 3 Folder Labels, 2 the typed page document.
    */
    version: workflowFileVersion,
    name: z.string().max(100).optional(),
    folders: z
      .array(importFolder)
      .min(1, 'folders: a workflow file carries at least one')
      .max(50, 'folders: a workflow file carries at most 50'),
  })
  .superRefine((file, ctx) => {
    // Page entries count by what they become; placeholders create nothing.
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
    File-local rules, compared within the file:
    - A format 4 folder with a page may not also carry tasks/blocks/document
      (`items` is refused on the folder schema), and its indices must resolve.
    - Label keys are unique per folder, and every task label key is declared.
      An undeclared key is refused, not dropped, so classification is never lost
      silently. Name uniqueness is left to the database index (23505 maps to 422):
      a JS case fold disagrees with Postgres lower() and broke re-imports.
    readsLabels drops `labels` from other versions before this runs.
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
      // A format 4 Task is a page block and carries the same `labels` key.
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

interface DependencyKeys {
  key?: string
  depends_on?: string[]
}

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

/** Internal edges as `[dependent key, blocker key]`; edges to undeclared keys are excluded. */
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

/** Duplicate keys, self-dependencies and cycles. Every imported Task is new, so
 * the file's own graph is the whole graph. */
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

/* Normalisation: fold the arrangements real files use into the one above.
   Nothing here validates. */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A page item's text, in canonical `{ kind, text }` or DES-206's nested shape. */
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

/** A named key carrying null means the same as an absent one. */
function dropNulls(task: Record<string, unknown>): void {
  for (const key of ['notes', 'important', 'recurrence_rule', 'reminder', 'steps', 'labels', 'key', 'depends_on']) {
    if (task[key] === null) delete task[key]
  }
}

function dropFolderNulls(folder: Record<string, unknown>): void {
  for (const key of ['tasks', 'blocks', 'document', 'labels', 'page', 'purpose']) {
    if (folder[key] === null) delete folder[key]
  }
}

/*
`labels` is read only from version 3 and later. Other files' `labels` (for
example Todoist tag lists) are foreign and dropped, not validated.
*/
function readsLabels(file: Record<string, unknown>): boolean {
  return file.version === 3 || file.version === 4 || file.version === 5
}

/* `page` is read only from version 4 and later; earlier files drop it. */
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
  /* DES-206 wrote a reminder as a picker label. Only a bare HH:MM is read;
     other labels are dropped rather than guessed at. */
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
  if (typeof folder === 'string') return { name: folder }
  if (!isRecord(folder)) return folder
  const next: Record<string, unknown> = { ...folder }
  dropFolderNulls(next)
  if (!labels) delete next.labels
  if (!carriesPage) delete next.page
  if (!carriesPurpose) delete next.purpose
  /* A folder with a page keeps its older keys as written, so the body can
     refuse the contradiction instead of this fold inventing one. */
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
  // Only folders without a page get here. The schema refuses any surviving
  // `items`, so it must be deleted once folded.
  delete next.items
  if (Array.isArray(next.tasks)) {
    next.tasks = next.tasks.map((task) => normalizeTask(task, labels))
  }
  return next
}

/** 10.3 gives a folder name no default, so an unnamed one-folder file gets this. */
const UNNAMED_IMPORT = 'Imported workflow'

export function normalizeWorkflowFile(value: unknown): unknown {
  if (!isRecord(value)) return value
  const file: Record<string, unknown> = { ...value }
  let folders: unknown[]
  if (Array.isArray(file.folders)) folders = file.folders as unknown[]
  else {
    /* A one-folder file: page, work and labels at the top level. Folded only
       when there is something to put in the folder. `labels` must be carried
       too, or the vocabulary is lost before validation. */
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

// POST /workflows/import → 201: the folders the file created.
export const importWorkflowResponse = z.object({
  folders: z.array(z.object({ id: z.uuid(), name: z.string() })),
})
export type ImportWorkflowResponse = z.infer<typeof importWorkflowResponse>

/** Whether a tz is required (7.6): a repeat or a reminder needs a date anchor. */
export function needsImportAnchor(file: ImportWorkflowBody): boolean {
  const dated = (task: {
    recurrence_rule?: string
    reminder?: { time_of_day: string }
  }): boolean => task.recurrence_rule !== undefined || task.reminder !== undefined
  return file.folders.some(
    (folder) =>
      (folder.tasks ?? []).some(dated) ||
      (folder.page?.blocks ?? []).some(
        (block) => block.kind === 'task' && dated(block),
      ),
  )
}

/* The write half: a folder, as the file 7.16 reads back. */

export interface ExportableBlock {
  kind: string
  text: string | null
}

/** A Task's Folder Labels as file keys. Archived labels have no key and drop out. */
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

/** One dependency edge: the dependent waits on the blocker. */
export interface WorkflowDependencyEdge {
  dependent_task_id: string
  blocking_task_id: string
}

/** What "Save as workflow" produces: the file and counts of what it left out. */
export interface WorkflowExport {
  file: ImportWorkflowBody
  /** Media and folder references written as placeholders. */
  omitted: number
  /**
   * Page tasks with no detail handed over, so not in the file. In the product
   * these are completed tasks; the export surface reports the count.
   */
  withheldTasks: number
}

/*
"Save as workflow". Writes 7.16's portable fields only: no state, due date,
assignee, comment or id. Writes format 4, or 5 when Purpose is supplied; the
legacy `blocks`/`tasks`/`document` arrangements are read but never written.
*/
export function folderToWorkflowFile(
  name: string,
  tasks: readonly TaskDetail[],
  blocks: readonly ExportableBlock[] = [],
  pageView?: PageView,
  /* The Folder's whole vocabulary, including unused labels; archived ones are
     filtered here. */
  folderLabels: readonly LabelDefinition[] = [],
  /** When supplied, the file is format 5 and carries Purpose. */
  purpose?: { display_name: string | null; page: PageView },
  /** Edges among `tasks` by live id; only edges with both ends exported are written. */
  dependencies: readonly WorkflowDependencyEdge[] = [],
): WorkflowExport {
  const folderName = name.trim() === '' ? UNNAMED_IMPORT : name.slice(0, 100)
  /* Positional keys (l1, l2…), not names, so a renamed or merged file never
     makes two Labels one. Archived labels are left out: they may not be applied. */
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
    // The file's mode is HH:MM; drop any seconds.
    ...(task.reminder !== null && task.reminder.time_of_day !== null
      ? { reminder: { time_of_day: task.reminder.time_of_day.slice(0, 5) } }
      : {}),
    ...(task.steps.length > 0
      ? { steps: task.steps.map((step) => ({ title: step.title })) }
      : {}),
    // Folder Labels only: personal labels are private and never written.
    ...(labelKeys.length > 0 ? { labels: labelKeys } : {}),
    ...(taskKey === undefined ? {} : { key: taskKey }),
    ...(dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
  }
  }
  /*
  Three passes: collect entries in page order; compute each entry's structure
  with the same open-Section stack readWorkflowPage uses, writing a key only
  where the positional default is wrong; then write in a fixed key order so
  exports are byte-stable. A Task with no detail (completed) is skipped and
  counted in withheldTasks.
  */
  interface Entry {
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
      // A picture's caption is the only name a page read carries for it.
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
      // Unticked is the default on import, so only `true` is written.
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
    The flat call: no membership, so everything is at the page root. Blank
    sections and paragraphs drop, as normalizeBlock does.
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
  const open: number[] = []
  const pageBlocks = entries.map((entry, index) => {
    if (entry.id === null) return entry.write({})
    const named = entry.section === null ? null : (indexOf.get(entry.section) ?? null)
    /*
    A Section that is not open here cannot be named (Sections are contiguous).
    The entry goes to the page root instead of into whichever Section is open.
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
      // Other writers (shelf export, starters) still emit version 1.
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

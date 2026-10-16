/*
The 7.16 page contract: a folder's or shelf's page is one list of blocks.
Last write wins per block, with 409 on a stale `updated_at` (4.17).
*/
import { z } from 'zod'

import { DOCUMENT_BLOCK_KINDS, documentTransaction, pageRichContent } from './page-document.js'
import type { PageRichContent } from './page-document.js'
export type { RichContent, PageRichContent, DocumentTransaction, DocumentOperation, DocumentOutlineItem } from './page-document.js'
export { DOCUMENT_BLOCK_KINDS, LIST_BLOCK_KINDS, STRUCTURED_BLOCK_KINDS, PRESENTATION_HEADING_KINDS, RICH_TEXT_BLOCK_KINDS, MEDIA_BLOCK_KINDS, WIDTH_BLOCK_KINDS, BLOCK_FILE_KINDS, isListKind, isPresentationHeadingKind, isMediaKind, blockMayOpen } from './page-document.js'
export type { ListBlockKind, PresentationHeadingKind, DocumentBlockKind, MediaBlockKind } from './page-document.js'
import { taskTitle } from './tasks.js'

/**
 * Kinds the legacy whole-page writer (`PUT /pages`, `insert_block`) may write.
 * Other kinds are written only through `document_transaction`.
 */
export const LEGACY_PAGE_BLOCK_KINDS = [
  'section',
  'paragraph',
  'image',
  'folder_ref',
] as const
export type LegacyPageBlockKind = (typeof LEGACY_PAGE_BLOCK_KINDS)[number]

/** Every stored kind; reads accept all of them. */
export const PAGE_BLOCK_KINDS = DOCUMENT_BLOCK_KINDS
export type PageBlockKind = (typeof PAGE_BLOCK_KINDS)[number]

/** 10.3: blocks per page. */
export const MAX_BLOCKS_PER_PAGE = 500

const blockWrite = z
  .object({
    /** Absent inserts; an edit must carry the updated_at it read. */
    id: z.uuid().optional(),
    kind: z.enum(LEGACY_PAGE_BLOCK_KINDS),
    position: z.number().int().min(0),
    text: z.string().max(4000).nullable().optional(),
    file_id: z.uuid().nullable().optional(),
    ref_folder_id: z.uuid().nullable().optional(),
    /** Dragged width, 25 to 100. Null means never dragged, unlike a stored 100. */
    width_pct: z.number().int().min(25).max(100).nullable().optional(),
    updated_at: z.iso.datetime().optional(),
  })
  .superRefine((block, ctx) => {
    if (block.kind === 'section') {
      const length = block.text?.length ?? 0
      if (length < 1 || length > 120) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message: 'a section name is 1 to 120 characters',
        })
      }
    }
    if (
      block.width_pct !== undefined &&
      block.width_pct !== null &&
      block.kind !== 'image'
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['width_pct'],
        message: 'a width belongs to an image block',
      })
    }
    if (block.id !== undefined && block.updated_at === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['updated_at'],
        message: 'an edit must carry the updated_at it read',
      })
    }
  })

export const putPageBody = z.object({
  blocks: z
    .array(blockWrite)
    .max(MAX_BLOCKS_PER_PAGE, 'blocks: a page holds at most 500'),
})
export type PutPageBody = z.infer<typeof putPageBody>
export type PageBlockWrite = z.infer<typeof blockWrite>

export interface PageBlock {
  id: string
  kind: PageBlockKind
  position: number
  page_position: string | null
  section_block_id: string | null
  /**
   * The list item this one nests under: writing structure, independent of
   * `section_block_id` (Work grouping).
   */
  list_parent_block_id: string | null
  /** True on a heading that folds its children. Optional: older readers omit it. */
  toggleable?: boolean | null
  /** Checklist tick; null on other kinds. Never completes a Task. */
  checked: boolean | null
  rich_content?: PageRichContent | null
  text: string | null
  file_id: string | null
  /*
  The named file's dimensions: read-only facts about the file, never sent back.
  Null means unknown (files before migration 0009); clients must keep their
  16:9 fallback for it.
  */
  file_width: number | null
  file_height: number | null
  /**
   * When the server deleted this block's file, or null. Non-null only on a
   * media block with a null `file_id`, which separates "was deleted" from "never
   * filled". Read-only; optional for older servers.
   */
  file_reclaimed_at?: string | null
  /** `files.name`, read-only. Optional for older servers. */
  file_name?: string | null
  ref_folder_id: string | null
  width_pct: number | null
  updated_at: string
}

export interface PageView {
  revision?: string
  task_placements?: {id:string;section_block_id:string|null}[]
  mutation?: {mutation_id:string;committed_revision:string;replayed:boolean;created_task_ids:string[]}
  blocks: PageBlock[]
  /** Block id to the number of other documents that hold a synced copy the reader can open. */
  synced_copies?: Record<string, number>
  /** The folder page's order; shelf pages hold block refs only. */
  items: PageItemRef[]
}

export const pageItemRef = z.object({
  kind: z.enum(['block', 'task']),
  id: z.uuid(),
})
export type PageItemRef = z.infer<typeof pageItemRef>

const placement = {
  after: pageItemRef.nullable(),
  before: pageItemRef.nullable(),
}

const insertBlockAction = z
  .object({
    action: z.literal('insert_block'),
    block_kind: z.enum(['section', 'paragraph', 'image']),
    text: z.string().max(4000).nullable().optional(),
    file_id: z.uuid().nullable().optional(),
    width_pct: z.number().int().min(25).max(100).nullable().optional(),
    section_block_id: z.uuid().nullable(),
    ...placement,
  })
  .superRefine((body, ctx) => {
    if (body.block_kind === 'section') {
      const length = body.text?.length ?? 0
      if (length < 1 || length > 120) {
        ctx.addIssue({
          code: 'custom',
          path: ['text'],
          message: 'a section name is 1 to 120 characters',
        })
      }
    }
    if (body.width_pct != null && body.block_kind !== 'image') {
      ctx.addIssue({
        code: 'custom',
        path: ['width_pct'],
        message: 'a width belongs to an image block',
      })
    }
  })

const updateBlockAction = z
  .object({
    action: z.literal('update_block'),
    block_id: z.uuid(),
    updated_at: z.iso.datetime(),
    text: z.string().max(4000).nullable().optional(),
    file_id: z.uuid().nullable().optional(),
    width_pct: z.number().int().min(25).max(100).nullable().optional(),
  })
  .refine(
    (body) => body.text !== undefined || body.file_id !== undefined || body.width_pct !== undefined,
    { message: 'an update must name at least one field' },
  )

export const pageActionBody = z.discriminatedUnion('action', [
  documentTransaction,
  insertBlockAction,
  updateBlockAction,
  z.object({
    action: z.literal('delete_block'),
    block_id: z.uuid(),
    updated_at: z.iso.datetime(),
  }),
  z.object({
    action: z.literal('insert_task'),
    title: taskTitle,
    section_block_id: z.uuid().nullable(),
    ...placement,
  }),
  z.object({
    action: z.literal('move_item'),
    item: pageItemRef,
    section_block_id: z.uuid().nullable(),
    ...placement,
  }),
  z.object({
    action: z.literal('convert_paragraph_to_task'),
    block_id: z.uuid(),
    updated_at: z.iso.datetime(),
  }),
])
export type PageActionBody = z.infer<typeof pageActionBody>

/* The zod read half, written from domain/pages.ts's pageView. */
export const pageBlock = z.object({
  rich_content: pageRichContent.nullable().optional(),
  id: z.uuid(),
  kind: z.enum(PAGE_BLOCK_KINDS),
  position: z.number().int(),
  page_position: z.string().nullable(),
  section_block_id: z.uuid().nullable(),
  list_parent_block_id: z.uuid().nullable(),
  toggleable: z.boolean().nullable().optional(),
  checked: z.boolean().nullable(),
  text: z.string().nullable(),
  file_id: z.uuid().nullable(),
  file_width: z.number().int().nullable(),
  file_height: z.number().int().nullable(),
  file_reclaimed_at: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  ref_folder_id: z.uuid().nullable(),
  width_pct: z.number().int().nullable(),
  updated_at: z.string(),
})

export const getPageResponse = z.object({
  revision: z.string().optional(),
  task_placements: z.array(z.object({id:z.uuid(),section_block_id:z.uuid().nullable()})).optional(),
  mutation: z.object({mutation_id:z.uuid(),committed_revision:z.string(),replayed:z.boolean(),created_task_ids:z.array(z.uuid())}).optional(),
  blocks: z.array(pageBlock),
  synced_copies: z.record(z.uuid(), z.number().int().nonnegative()).optional(),
  items: z.array(pageItemRef),
})
export type GetPageResponse = z.infer<typeof getPageResponse>

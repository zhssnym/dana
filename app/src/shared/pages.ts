/*
The 7.16 page contract (RFC 0005): a folder's or shelf's page is one list of
blocks, PUT whole and read whole. Concurrency is last-write-wins per block
with 409 on stale evidence (4.17); there is no operational transform, so the
wire shape is the storage shape plus the updated_at each write must carry
back for the blocks it claims to be editing.
*/
import { z } from 'zod'

import { documentTransaction, richContent } from './page-document.js'
import type { RichContent } from './page-document.js'
export type { RichContent, DocumentTransaction, DocumentOperation, DocumentOutlineItem } from './page-document.js'
import { taskTitle } from './tasks.js'

export const PAGE_BLOCK_KINDS = [
  'section',
  'paragraph',
  'image',
  'folder_ref',
] as const
export type PageBlockKind = (typeof PAGE_BLOCK_KINDS)[number]

/** 10.3: blocks per page. */
export const MAX_BLOCKS_PER_PAGE = 500

const blockWrite = z
  .object({
    /** Absent inserts; present edits the named block and must carry the
     * updated_at it read (4.17's evidence). */
    id: z.uuid().optional(),
    kind: z.enum(PAGE_BLOCK_KINDS),
    position: z.number().int().min(0),
    text: z.string().max(4000).nullable().optional(),
    file_id: z.uuid().nullable().optional(),
    ref_folder_id: z.uuid().nullable().optional(),
    /** 4.17's width, as RFC 0005 change control item 44 B7 added it: the
     * person's dragged width as a percentage of the column, clamped at a
     * quarter and at full width (ledger L-194). Absent and null both mean
     * nobody has dragged it, which is a different fact from a stored 100. */
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
        message: 'a width belongs to an image block (4.17)',
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
  rich_content?: RichContent | null
  text: string | null
  file_id: string | null
  /*
  The shape of the picture `file_id` names, or null (4.16 as migration 0009
  left it, issue #27).

  **These are read-only and they are the file's, not the block's**, which is
  why they are absent from `blockWrite` above and why they carry the `file_`
  prefix that `width_pct` does not. `width_pct` is a decision the person made
  about this block, so a PUT carries it; the dimensions are a fact about the
  bytes, so they arrive with the block and are never sent back. One image
  placed on three pages is one shape reported three times rather than three
  numbers free to disagree.

  **Null means unknown and must draw exactly what today draws.** Every file
  stored before migration 0009 has null here and no backfill has been run, so
  a client that treats null as anything but "I do not know this picture's
  shape" would break pages that work now. `components/page-image.tsx`'s 16 by
  9 fallback is that behaviour and it stays; these fields let it be right
  instead, for a reader who did not upload the picture.
  */
  file_width: number | null
  file_height: number | null
  ref_folder_id: string | null
  width_pct: number | null
  updated_at: string
}

export interface PageView {
  revision?: string
  task_placements?: {id:string;section_block_id:string|null}[]
  mutation?: {mutation_id:string;committed_revision:string;replayed:boolean;created_task_ids:string[]}
  blocks: PageBlock[]
  /** One persisted folder-page sequence. Shelf pages contain block refs only. */
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
        message: 'a width belongs to an image block (4.17)',
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

/*
The read half, added by the S12 client arm on 2026-08-25, the same gap and
the same discipline as the ones `shelves.ts`, `events.ts` and `comments.ts`
record: S5 published `PageBlock` and `PageView` as interfaces only, and
`api/http.ts` parses every response through a zod schema. Written from
`domain/pages.ts`'s `pageView`; recorded with the family as one change
control item.
*/
export const pageBlock = z.object({
  rich_content: richContent.nullable().optional(),
  id: z.uuid(),
  kind: z.enum(PAGE_BLOCK_KINDS),
  position: z.number().int(),
  page_position: z.string().nullable(),
  section_block_id: z.uuid().nullable(),
  text: z.string().nullable(),
  file_id: z.uuid().nullable(),
  file_width: z.number().int().nullable(),
  file_height: z.number().int().nullable(),
  ref_folder_id: z.uuid().nullable(),
  width_pct: z.number().int().nullable(),
  updated_at: z.string(),
})

export const getPageResponse = z.object({
  revision: z.string().optional(),
  task_placements: z.array(z.object({id:z.uuid(),section_block_id:z.uuid().nullable()})).optional(),
  mutation: z.object({mutation_id:z.uuid(),committed_revision:z.string(),replayed:z.boolean(),created_task_ids:z.array(z.uuid())}).optional(),
  blocks: z.array(pageBlock),
  items: z.array(pageItemRef),
})
export type GetPageResponse = z.infer<typeof getPageResponse>

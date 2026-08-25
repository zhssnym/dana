/*
The 7.16 page contract (RFC 0005): a folder's or shelf's page is one list of
blocks, PUT whole and read whole. Concurrency is last-write-wins per block
with 409 on stale evidence (4.17); there is no operational transform, so the
wire shape is the storage shape plus the updated_at each write must carry
back for the blocks it claims to be editing.
*/
import { z } from 'zod'

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
  text: string | null
  file_id: string | null
  ref_folder_id: string | null
  updated_at: string
}

export interface PageView {
  blocks: PageBlock[]
}

/*
The read half, added by the S12 client arm on 2026-08-25, the same gap and
the same discipline as the ones `shelves.ts`, `events.ts` and `comments.ts`
record: S5 published `PageBlock` and `PageView` as interfaces only, and
`api/http.ts` parses every response through a zod schema. Written from
`domain/pages.ts`'s `pageView`; recorded with the family as one change
control item.
*/
export const pageBlock = z.object({
  id: z.uuid(),
  kind: z.enum(PAGE_BLOCK_KINDS),
  position: z.number().int(),
  text: z.string().nullable(),
  file_id: z.uuid().nullable(),
  ref_folder_id: z.uuid().nullable(),
  updated_at: z.string(),
})

export const getPageResponse = z.object({
  blocks: z.array(pageBlock),
})
export type GetPageResponse = z.infer<typeof getPageResponse>

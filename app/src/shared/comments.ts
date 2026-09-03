/*
The 7.14 contract (RFC 0005): a comment on a task or on the folder's own
thread, one level of replies (4.15), likes as one bit per person, files by
reference to 7.15's rows. The thread read returns whole and ordered; there
is no pagination, a conversation being read as a conversation.
*/
import { z } from 'zod'

export const postCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    parent_id: z.uuid().optional(),
    file_id: z.uuid().optional(),
  })
  .refine(
    (comment) => comment.body !== undefined || comment.file_id !== undefined,
    { message: 'body: a comment carries words or a file, at least one' },
  )
export type PostCommentBody = z.infer<typeof postCommentBody>

export const patchCommentBody = z.object({
  body: z.string().min(1).max(4000),
})
export type PatchCommentBody = z.infer<typeof patchCommentBody>

/** A comment's file as the thread answers it, 4.16's own columns and no
 * more (7.14, RFC 0005 change control item 57 B5): enough to draw the tile,
 * the name and the meta line without downloading the bytes. The pair added
 * by issue #27 keeps that sentence true rather than widening it: 4.16 gained
 * two columns and this shape is still all of them. */
export interface CommentFile {
  id: string
  name: string
  mime: string
  bytes: number
  /** 4.16's shape as migration 0009 added it (issue #27): the tile can be
   *  drawn at the picture's proportion before the bytes arrive, for every
   *  reader of the thread rather than only the person who attached it. Null
   *  for an attachment that is not an image and for anything stored before
   *  0009, and null means unknown: draw what was drawn before. */
  width: number | null
  height: number | null
}

export interface CommentLine {
  id: string
  folder_id: string
  task_id: string | null
  parent_id: string | null
  author_id: string
  body: string | null
  /** The whole reaction set is one count (DES-146). */
  likes: number
  /** Whether the viewer is inside that count. */
  liked: boolean
  files: CommentFile[]
  created_at: string
  edited_at: string | null
}

export interface ThreadView {
  comments: CommentLine[]
}

/*
The read half, added by the S12 client arm on 2026-08-25: S6 published
`CommentLine` and `ThreadView` as interfaces and no zod schema for what the
thread read answers, and `api/http.ts` parses every response through one.
Written from `domain/comments.ts`, the discipline `shelves.ts` and
`events.ts` record at their own read halves; recorded with those additions
as one change control item. Nothing existing is touched.
*/
export const commentLine = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  parent_id: z.uuid().nullable(),
  author_id: z.uuid(),
  body: z.string().nullable(),
  likes: z.number().int(),
  liked: z.boolean(),
  files: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      mime: z.string(),
      bytes: z.number().int(),
      width: z.number().int().nullable(),
      height: z.number().int().nullable(),
    }),
  ),
  created_at: z.string(),
  edited_at: z.string().nullable(),
})

export const getThreadResponse = z.object({
  comments: z.array(commentLine),
})
export type GetThreadResponse = z.infer<typeof getThreadResponse>

/** PATCH /comments/:id answers { edited: true } (`routes/conversation.ts`);
 * the deletes and the like pair answer 204 and carry no body to parse. */
export const patchCommentResponse = z.object({ edited: z.literal(true) })

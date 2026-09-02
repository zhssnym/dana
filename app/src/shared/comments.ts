/*
The 7.14 contract (RFC 0005): a comment on a task or on the folder's own
thread, one level of replies (4.15), likes as one bit per person, files by
reference to 7.15's rows. The thread read returns whole and ordered; there
is no pagination, a conversation being read as a conversation.

Files are referenced, never uploaded here: POST /api/v1/files (7.15) stores
each one first, under its own 25 MB cap and the account's 1 GB quota, and a
comment names the rows that already exist. So this body carries no bytes and
needs no size limit of its own; the only number it enforces is 10.3's count.
*/
import { z } from 'zod'

/**
 * 10.3's "Files per comment | 10". The number lives here so the schema, the
 * domain module and the criterion that measures the boundary all read one
 * constant rather than three literals that can drift apart.
 */
export const COMMENT_FILE_CAP = 10

/*
The write half, widened from one file to ten on 2026-09-03 (issue #22).

10.3 has said ten since it was written and this endpoint took one, so the
limit and the product disagreed. Imran ruled on the issue that the ten stands
and the endpoint moves: "People may need to add a few screenshots together,
and they should stay in one comment."

**Both spellings are accepted and `file_id` is not being removed.** It is
defined as exactly `file_ids: [that id]` and is folded into the list by
`attachedFileIds` below, which is the only thing in the codebase that knows
there are two spellings. The reason it stays is the failure mode this folder
is famous for: nothing here is `.strict()`, so a field the server does not
read is accepted, discarded, and answered 200. The shipping client posts
`file_id` (`components/task-editing.tsx`), and a change that replaced the
field rather than widening beside it would have made every existing
attachment vanish silently into a 201 with no file on it. That is the same
shape as the reminder field that was dropped for four packages, and it is
avoidable for the cost of one alias.

Sending both is refused rather than merged. Two spellings of the same thing
in one body have no order between them that the caller can predict, and a
server that guessed would be inventing the very thing this endpoint is now
being careful about.
*/
export const postCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    parent_id: z.uuid().optional(),
    /** The one-file spelling frozen 7.14 names. Equivalent to a `file_ids`
     * of one, and never sent beside it. */
    file_id: z.uuid().optional(),
    /** Up to 10.3's cap, in the order they are to be attached. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files (spec 10.3)`,
      })
      .optional(),
  })
  .refine(
    (comment) => comment.file_id === undefined || comment.file_ids === undefined,
    {
      error: 'cannot be sent beside file_id; file_id is one file and this is the list',
      path: ['file_ids'],
    },
  )
  /*
  The primary key of comment_files is (comment_id, file_id), so the same id
  twice is a constraint violation wearing a 500. It is refused here instead,
  and refused rather than deduplicated: dropping one of two ids a caller
  actually sent is the silent-loss failure again, in miniature.
  */
  .refine(
    (comment) =>
      comment.file_ids === undefined ||
      new Set(comment.file_ids).size === comment.file_ids.length,
    { error: 'must not name the same file twice', path: ['file_ids'] },
  )
  .refine(
    (comment) =>
      comment.body !== undefined ||
      comment.file_id !== undefined ||
      (comment.file_ids?.length ?? 0) > 0,
    { message: 'body: a comment carries words or a file, at least one' },
  )
export type PostCommentBody = z.infer<typeof postCommentBody>

/**
 * The two spellings folded into one ordered list, which is what the server
 * reads and what "ordered as attached" (7.14) means: the order the caller
 * wrote them in.
 *
 * Exported rather than inlined so that the alias exists in exactly one place.
 * A second reader of `file_id` is how the two spellings would one day
 * disagree about which files a comment carries.
 */
export function attachedFileIds(comment: PostCommentBody): string[] {
  if (comment.file_ids !== undefined) return [...comment.file_ids]
  return comment.file_id === undefined ? [] : [comment.file_id]
}

export const patchCommentBody = z.object({
  body: z.string().min(1).max(4000),
})
export type PatchCommentBody = z.infer<typeof patchCommentBody>

/** A comment's file as the thread answers it, 4.16's own columns and no
 * more (7.14, RFC 0005 change control item 57 B5): enough to draw the tile,
 * the name and the meta line without downloading the bytes. */
export interface CommentFile {
  id: string
  name: string
  mime: string
  bytes: number
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

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
  file_ids: string[]
  created_at: string
  edited_at: string | null
}

export interface ThreadView {
  comments: CommentLine[]
}

/*
The 7.14 comment contract. Files are uploaded first through POST /api/v1/files
and referenced here by id, so only 10.3's count applies. Threads are read whole.
*/
import { z } from 'zod'
import { richContent } from './rich-content.js'

/** 10.3's files-per-comment cap. */
export const COMMENT_FILE_CAP = 10

/*
A post's content: a small block tree in the page's vocabulary, without
pages-only kinds. The server derives `comments.body` (plain text, 4000 chars)
from it; it is never sent beside it. A media block may only name one of the
same comment's own `file_ids`, or a post could show a file its author cannot
read. `comments_content_check` (migration 0040) enforces the version and size.
*/
export const POST_CONTENT_VERSION = 1
export const MAX_POST_BLOCKS = 500
export const MAX_POST_DEPTH = 12
export const MAX_POST_BYTES = 256 * 1024
export const POST_RICH_KINDS = ['paragraph','heading1','heading2','heading3','bullet','numbered','checklist','toggle','quote','callout'] as const
export const POST_MEDIA_KINDS = ['image','file','audio','video'] as const
export const POST_BLOCK_KINDS = [...POST_RICH_KINDS,'code','divider',...POST_MEDIA_KINDS] as const
export type PostBlockKind = (typeof POST_BLOCK_KINDS)[number]

export interface PostBlock {
  kind: PostBlockKind
  /** Rich-text kinds only. */
  rich_content?: z.infer<typeof richContent>
  /** `code` only: the code, plain. */
  text?: string
  /** `checklist` only. */
  checked?: boolean
  /** Media kinds only: one of this comment's own `file_ids`. */
  file_id?: string
  /** Nested blocks (list items, toggles, quotes...). */
  children?: PostBlock[]
}

const isRichKind = (kind: string): boolean => (POST_RICH_KINDS as readonly string[]).includes(kind)
const isMediaPostKind = (kind: string): boolean => (POST_MEDIA_KINDS as readonly string[]).includes(kind)

export const postBlock: z.ZodType<PostBlock> = z.lazy(() =>
  z
    .object({
      kind: z.enum(POST_BLOCK_KINDS),
      rich_content: richContent.optional(),
      text: z.string().max(4000).optional(),
      checked: z.boolean().optional(),
      file_id: z.uuid().optional(),
      children: z.array(postBlock).max(MAX_POST_BLOCKS).optional(),
    })
    .catchall(z.never())
    .superRefine((block, ctx) => {
      if (block.rich_content !== undefined && !isRichKind(block.kind)) ctx.addIssue({ code: 'custom', message: `a ${block.kind} block carries no rich text`, path: ['rich_content'] })
      if (block.text !== undefined && block.kind !== 'code') ctx.addIssue({ code: 'custom', message: 'only a code block carries text', path: ['text'] })
      if (block.checked !== undefined && block.kind !== 'checklist') ctx.addIssue({ code: 'custom', message: 'only a checklist item is checked', path: ['checked'] })
      if (isMediaPostKind(block.kind) !== (block.file_id !== undefined)) ctx.addIssue({ code: 'custom', message: 'a media block names exactly one file, and nothing else does', path: ['file_id'] })
    })
    .transform(({ kind, rich_content, text, checked, file_id, children }) => ({
      kind,
      ...(rich_content === undefined ? {} : { rich_content }),
      ...(text === undefined ? {} : { text }),
      ...(checked === undefined ? {} : { checked }),
      ...(file_id === undefined ? {} : { file_id }),
      ...(children === undefined || children.length === 0 ? {} : { children }),
    })),
)

export function walkPostBlocks(blocks: readonly PostBlock[], visit: (block: PostBlock, depth: number) => void, depth = 0): void {
  for (const block of blocks) {
    visit(block, depth)
    if (block.children) walkPostBlocks(block.children, visit, depth + 1)
  }
}

export const postContent = z
  .object({
    version: z.literal(POST_CONTENT_VERSION, { error: `must be ${String(POST_CONTENT_VERSION)}` }),
    blocks: z.array(postBlock).max(MAX_POST_BLOCKS),
  })
  .catchall(z.never())
  .superRefine((value, ctx) => {
    let count = 0
    let deepest = 0
    walkPostBlocks(value.blocks, (_block, depth) => { count += 1; deepest = Math.max(deepest, depth) })
    if (count > MAX_POST_BLOCKS) ctx.addIssue({ code: 'custom', message: `a post holds at most ${String(MAX_POST_BLOCKS)} blocks`, path: ['blocks'] })
    if (deepest >= MAX_POST_DEPTH) ctx.addIssue({ code: 'custom', message: `blocks nest at most ${String(MAX_POST_DEPTH)} deep`, path: ['blocks'] })
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_POST_BYTES) ctx.addIssue({ code: 'custom', message: 'This post is too large.', path: ['blocks'] })
  })
  .transform(({ version, blocks }) => ({ version, blocks: [...blocks] }))
export type PostContent = z.infer<typeof postContent>

export function postFileIds(content: PostContent): string[] {
  const ids: string[] = []
  walkPostBlocks(content.blocks, (block) => { if (block.file_id !== undefined) ids.push(block.file_id) })
  return ids
}

/**
 * One line per block with words, clipped to 4000 (`comments_body_length_check`).
 * Empty for a words-free post, which the server stores as a NULL body.
 */
export function postPlainText(content: PostContent): string {
  const lines: string[] = []
  walkPostBlocks(content.blocks, (block) => {
    const words = block.rich_content ? block.rich_content.runs.map((run) => run.text).join('') : (block.text ?? '')
    if (words.trim().length > 0) lines.push(words)
  })
  const text = lines.join('\n').trim()
  return text.length > 4000 ? text.slice(0, 4000) : text
}

/*
`file_id` is an alias for `file_ids: [id]`, kept because a client still posts it
and an unread field would be dropped with a 200. attachedFileIds is the only
reader of both. Sending both is refused rather than merged.
*/
export const postCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    /** The server derives `body` from it; never sent with `body`. */
    content: postContent.optional(),
    parent_id: z.uuid().optional(),
    /** Same as `file_ids` of one; never sent with it. */
    file_id: z.uuid().optional(),
    /** In attachment order. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files`,
      })
      .optional(),
    /* A post's place is its URL, never its body: refuse these by name rather
       than drop them and answer 201 for the wrong place. */
    task_id: z.never({ error: 'is not read here: a task is discussed in its Discussion' }).optional(),
    discussion_id: z.never({ error: 'is not read here: a Discussion post goes to /discussions/:id/comments' }).optional(),
  })
  .refine(
    (comment) => comment.file_id === undefined || comment.file_ids === undefined,
    {
      error: 'cannot be sent beside file_id; file_id is one file and this is the list',
      path: ['file_ids'],
    },
  )
  /* Same id twice would violate comment_files' primary key (a 500). Refused,
     not deduplicated, so no id the caller sent is silently dropped. */
  .refine(
    (comment) =>
      comment.file_ids === undefined ||
      new Set(comment.file_ids).size === comment.file_ids.length,
    { error: 'must not name the same file twice', path: ['file_ids'] },
  )
  .refine(
    (comment) => comment.body === undefined || comment.content === undefined,
    { error: 'cannot be sent beside body; the server derives body from content', path: ['content'] },
  )
  .refine(
    (comment) =>
      comment.body !== undefined ||
      comment.content !== undefined ||
      comment.file_id !== undefined ||
      (comment.file_ids?.length ?? 0) > 0,
    { message: 'body: a comment carries words or a file, at least one' },
  )
export type PostCommentBody = z.infer<typeof postCommentBody>

/** Both spellings as one ordered list. The only reader of `file_id`. */
export function attachedFileIds(comment: PostCommentBody): string[] {
  if (comment.file_ids !== undefined) return [...comment.file_ids]
  return comment.file_id === undefined ? [] : [comment.file_id]
}

/*
Editing words and attachments (#94). `file_ids` is the full new set: omitted
leaves attachments alone, [] removes all. `file_id` is refused here by name so
a caller learns the right spelling instead of getting a 200 that changed
nothing. `body` is optional because a comment may carry files only; the route
refuses an edit that would leave neither words nor files.
*/
export const patchCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    /** Author only; the server derives `body` from it. */
    content: postContent.optional(),
    /** The full new set, in attachment order. Omitted leaves attachments alone. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files`,
      })
      .optional(),
    file_id: z
      .never({
        error:
          'is the create half’s spelling and has no meaning on an edit; send file_ids, which is the full new set of attachments',
      })
      .optional(),
  })
  /* Duplicates would violate the primary key; refused, not deduplicated. */
  .refine(
    (patch) =>
      patch.file_ids === undefined ||
      new Set(patch.file_ids).size === patch.file_ids.length,
    { error: 'must not name the same file twice', path: ['file_ids'] },
  )
  .refine(
    (patch) => patch.body === undefined || patch.content === undefined,
    { error: 'cannot be sent beside body; the server derives body from content', path: ['content'] },
  )
  .refine(
    (patch) => patch.body !== undefined || patch.content !== undefined || patch.file_ids !== undefined,
    { message: 'body: an edit changes the words, the attachments, or both' },
  )
export type PatchCommentBody = z.infer<typeof patchCommentBody>

/** A comment's file: enough to draw the tile without downloading the bytes. */
export interface CommentFile {
  id: string
  name: string
  mime: string
  bytes: number
  /** Null for non-images and files stored before 0009: unknown, draw as before. */
  width: number | null
  height: number | null
}

/** The fixed reaction set, keyed by name. A pre-reaction like is `thumbs_up`. */
export const REACTIONS = {
  thumbs_up: '👍',
  heart: '❤️',
  laugh: '😂',
  party: '🎉',
  surprised: '😮',
  thanks: '🙏',
} as const
export type ReactionKey = keyof typeof REACTIONS
export const REACTION_KEYS = Object.keys(REACTIONS) as [ReactionKey, ...ReactionKey[]]
export const reactionKey = z.enum(REACTION_KEYS)

export interface CommentReaction {
  reaction: ReactionKey
  /** User ids, earliest first; never empty. */
  by: string[]
}

export interface CommentLine {
  id: string
  folder_id: string
  task_id: string | null
  /** Null on a Task thread. Optional only for older fixtures; always sent. */
  discussion_id?: string | null
  parent_id: string | null
  author_id: string
  body: string | null
  /** Null for comments written before posts. Optional only for older fixtures. */
  content?: PostContent | null
  /** In first-left order; reactions nobody has left are absent. */
  reactions: CommentReaction[]
  files: CommentFile[]
  created_at: string
  edited_at: string | null
}

export interface ThreadView {
  comments: CommentLine[]
}

/* Zod schemas for the read half; the client parses every response. */
export const commentReaction = z.object({
  reaction: reactionKey,
  by: z.array(z.uuid()).min(1),
})

export const commentLine = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  discussion_id: z.uuid().nullable().optional(),
  parent_id: z.uuid().nullable(),
  author_id: z.uuid(),
  body: z.string().nullable(),
  content: postContent.nullable().optional(),
  reactions: z.array(commentReaction),
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

/*
PATCH /comments/:id answers `{ edited: true, comment }`. Keep `edited`: the
shipping client parses it and would fail without it.
*/
export const patchCommentResponse = z.object({
  edited: z.literal(true),
  comment: commentLine,
})
export type PatchCommentResponse = z.infer<typeof patchCommentResponse>

/** 409 code for writes to a resolved or trashed Discussion's conversation. */
export const DISCUSSION_FROZEN = 'discussion_frozen'

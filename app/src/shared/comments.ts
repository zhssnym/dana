/*
The 7.14 contract: a comment on a task or on the folder's own
thread, one level of replies (4.15), likes as one bit per person, files by
reference to 7.15's rows. The thread read returns whole and ordered; there
is no pagination, a conversation being read as a conversation.

Files are referenced, never uploaded here: POST /api/v1/files (7.15) stores
each one first, under its own 25 MB cap and the account's 1 GB quota, and a
comment names the rows that already exist. So this body carries no bytes and
needs no size limit of its own; the only number it enforces is 10.3's count.
*/
import { z } from 'zod'
import { richContent } from './rich-content.js'

/**
 * 10.3's "Files per comment | 10". The number lives here so the schema, the
 * domain module and the criterion that measures the boundary all read one
 * constant rather than three literals that can drift apart.
 */
export const COMMENT_FILE_CAP = 10

/*
A post's content (Wave 2, W-C: Discussion threads). A post is written in the
same editor as a page, so its content is a small block tree in the page's own
vocabulary: rich text is `richContent`, a code block is plain `text`, a
checklist item carries `checked`, a media block names one `file_id`. Pages-only
kinds are not here: no Section, no Task, no folder/page reference, no diagram.

**`body` is derived from this, never sent beside it.** The server writes the
plain text of every block (`postPlainText`), clipped to 4000 characters, into
`comments.body`, so search, notifications, snippets and every reader that
predates posts keep working. A comment written before posts has `content`
NULL and its `body` is the whole post, drawn as text.

**A media block may only name one of the same comment's own `file_ids`.** The
file is the comment's attachment row; the block only says where it sits in
the writing. A block naming any other file is refused (422) before a write,
because otherwise a post could display a file its author cannot read.

The database says the same thing in `comments_content_check` (migration 0040):
version 1, `blocks` an array, at most 256 KiB serialized.
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

/** Walks every block, depth first, in reading order. */
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

/** The file ids a post's media blocks name, in reading order. */
export function postFileIds(content: PostContent): string[] {
  const ids: string[] = []
  walkPostBlocks(content.blocks, (block) => { if (block.file_id !== undefined) ids.push(block.file_id) })
  return ids
}

/**
 * The plain text of a post: one line per block that has words, runs joined,
 * trimmed, clipped to 4000 characters (`comments_body_length_check`). Empty
 * string when the post has no words (pictures only), which the server stores
 * as a NULL body.
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
attachment vanish silently into a 201 with no file on it, which is avoidable
for the cost of one alias.

Sending both is refused rather than merged. Two spellings of the same thing
in one body have no order between them that the caller can predict, and a
server that guessed would be inventing the very thing this endpoint is now
being careful about.
*/
export const postCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    /** A post written in the editor (W-C). The server derives `body` from
     * it; the two are never sent together. */
    content: postContent.optional(),
    parent_id: z.uuid().optional(),
    /** The one-file spelling 7.14 names. Equivalent to a `file_ids`
     * of one, and never sent beside it. */
    file_id: z.uuid().optional(),
    /** Up to 10.3's cap, in the order they are to be attached. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files`,
      })
      .optional(),
    /* r5 discuss: where a post goes is its address, never its body -- a
       task's thread is `?task=` on the folder route, a Discussion's is
       `/discussions/:id/comments`. Sent here they were parsed and dropped,
       so the post landed somewhere the caller did not ask for with a 201;
       they are refused by name instead (11.14's `z.never`). */
    task_id: z.never({ error: 'is not read here: a task comment names its task as ?task= on the address' }).optional(),
    discussion_id: z.never({ error: 'is not read here: a Discussion post goes to /discussions/:id/comments' }).optional(),
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

/*
The edit half: the words and the attachments (issue #94). 7.14 lets a person
add or remove attachments on an existing comment without deleting and
reposting it, and `domain/comments.ts` does the work. This schema and that
module change together, because nothing in this folder is `.strict()`: a
declared field with no reader parses, is discarded, and answers 200.

**`file_ids` here is the full new set, not an addition.** Omitted means the
attachments are untouched, `[]` removes every one of them, and any other list
makes the set exactly those ids in that order. There is no add-one or
remove-one spelling, because a composer that holds the whole set and sends it
is the shape that cannot get out of step with what the person is looking at,
and a partial verb would need an ordering rule between two callers that this
endpoint has no way to give.

**Only one spelling, and that is deliberate rather than an oversight.** The
create half takes `file_id` as well, and the reason is written above
`attachedFileIds`: the shipping client posts it, so replacing it would have
made every attachment from that client vanish into a 201. No client has ever
sent anything but `body` here, so there is no second spelling to keep alive
and inventing one would only guarantee the two disagree one day. `file_id` is
declared and refused instead of being tolerated and dropped: 11.14 rules
`.strict()` out for this folder and names `z.never({ error })` as what an
endpoint uses when it means to refuse one field, which answers 422 naming it
without making the object strict. Somebody who knows the create half's alias
will try it here, and being told which spelling to use is the whole difference
between a caller who can fix their request and a 200 that changed nothing.

**`body` became optional and the object did not become emptier for it.** A
wordless comment is legal — 4.15 admits one carrying files alone, and the
create half's own rule is "words or a file, at least one" — so a required
`body` of at least one character would have made exactly those comments the
ones whose attachments could never be edited. The same at-least-one rule
applies here instead, and the resulting comment must still satisfy it: a `[]`
that would leave neither words nor files is refused by the route, which is the
only place that knows what the comment already holds.
*/
export const patchCommentBody = z
  .object({
    body: z.string().min(1).max(4000).optional(),
    /** The post's whole new content (W-C); only its author may send it. The
     * server derives `body` from it; never sent beside `body`. */
    content: postContent.optional(),
    /** The full new set, up to 10.3's cap, in the order they are to be
     * attached. Omitted leaves the attachments alone. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files`,
      })
      .optional(),
    /** Refused rather than dropped: the create half's one-file spelling has
     * no meaning here, and a silent 200 is what issue #94 was opened about. */
    file_id: z
      .never({
        error:
          'is the create half’s spelling and has no meaning on an edit; send file_ids, which is the full new set of attachments',
      })
      .optional(),
  })
  /* `comment_files` is keyed on (comment_id, file_id), so the same id twice is
     a constraint violation wearing a 500. Refused rather than deduplicated,
     for the create half's reason: dropping one of two ids a caller actually
     sent is the silent-loss failure again, in miniature. */
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

/** A comment's file as the thread answers it, 4.16's own columns and no
 * more (7.14): enough to draw the tile, the name and the meta line without
 * downloading the bytes. */
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
  /** The Discussion a Folder-level comment belongs to (issue #320, 4.31);
   * null on a Task thread. Optional in the type only so older fixtures
   * still compile: the server always answers it. */
  discussion_id?: string | null
  parent_id: string | null
  author_id: string
  body: string | null
  /** The post's editor content (W-C); null for a comment written before
   * posts, whose `body` is then the whole post. Optional in the type only
   * so older fixtures compile: the server always answers it. */
  content?: PostContent | null
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
The read half: `api/http.ts` parses every response through a zod schema, and
`CommentLine` and `ThreadView` above are interfaces only. Written from
`domain/comments.ts`, as the read halves in `shelves.ts` and `events.ts` are.
*/
export const commentLine = z.object({
  id: z.uuid(),
  folder_id: z.uuid(),
  task_id: z.uuid().nullable(),
  discussion_id: z.uuid().nullable().optional(),
  parent_id: z.uuid().nullable(),
  author_id: z.uuid(),
  body: z.string().nullable(),
  content: postContent.nullable().optional(),
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

/*
PATCH /comments/:id answers `{ edited: true }` (`routes/conversation.ts`); the
deletes and the like pair answer 204 and carry no body to parse.

**`comment` joined it on 2026-09-04 with attachment editing (issue #94), and
`edited` stayed.** The endpoint now changes something a caller cannot see from
the request it sent — the resolved file rows, with their names, types, sizes
and dimensions — so it answers the comment as the thread would read it, which
is the create half's answer and the fresh-read convention 7.1, 7.2 and 7.4
carry on their own mutations. `edited` is kept rather than replaced for the
reason `file_id` is kept on the create half: the shipping client parses this
response through this schema, and a key removed here fails that parse at the
moment somebody edits a comment. It is the same one-word answer it always was
and nothing has to stop reading it.
*/
export const patchCommentResponse = z.object({
  edited: z.literal(true),
  comment: commentLine,
})
export type PatchCommentResponse = z.infer<typeof patchCommentResponse>

/**
 * The stable refusal code for a write to a Discussion's conversation while
 * that Discussion is resolved or in Trash (issue #320): 409, because the
 * request is well formed and the caller may act once the Discussion is
 * reopened or restored. Covers new comments and replies, edits, deletes
 * (moderation included) and likes.
 */
export const DISCUSSION_FROZEN = 'discussion_frozen'

/**
 * PUT /tasks/:id/thread/read answers the viewer's previous read of the task's
 * thread: an ISO time, or null when they had never opened it. The caller can
 * then tell which posts arrived since.
 */
export const taskThreadReadResponse = z.object({
  read_at: z.string().nullable(),
})
export type TaskThreadReadResponse = z.infer<typeof taskThreadReadResponse>

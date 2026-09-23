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
    parent_id: z.uuid().optional(),
    /** The one-file spelling 7.14 names. Equivalent to a `file_ids`
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
    /** The full new set, up to 10.3's cap, in the order they are to be
     * attached. Omitted leaves the attachments alone. */
    file_ids: z
      .array(z.uuid())
      .max(COMMENT_FILE_CAP, {
        error: `must name at most ${String(COMMENT_FILE_CAP)} files (spec 10.3)`,
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
    (patch) => patch.body !== undefined || patch.file_ids !== undefined,
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
The read half: `api/http.ts` parses every response through a zod schema, and
`CommentLine` and `ThreadView` above are interfaces only. Written from
`domain/comments.ts`, as the read halves in `shelves.ts` and `events.ts` are.
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

/*
The adapter seam for a conversation: `CommentsThread` is a controlled component
over an array, and Dana's conversation is 7.14's four routes. This module is the
whole of what stands between them.

**The seam is the array, not the component**, which is why
`components/comments.tsx` has no write of its own. The thread announces every
change the same way, `onChange(next)` carrying the array it wants to exist; here
the page hands `applyThreadChange` that array, which compares it to the one the
query answered and issues the one mutation that explains the difference. Four
differences are expressible and each is one route: an id that appeared is a
`POST`, an id that vanished is a `DELETE`, a body that moved is a `PATCH`, and a
like that flipped is 7.14's like pair. A fifth kind of difference cannot be
produced by that component, and one that somehow were would be dropped rather
than guessed at.

**Why a diff rather than four callbacks.** The thread's own `onChange` is
threaded through `CommentRow`, the reply composer and `toggleReaction`, so a
component taking callbacks instead would have to be rewritten at every one of
those points. Diffing costs this module thirty lines and costs the component
nothing.

**What a comment is on the wire and what it is on the page.** 7.14 answers a
flat list with `parent_id`; the component draws one level of replies, which is
4.15's own limit, so the read half nests and the write half flattens back. Times
are `formatAgo`'s, the elapsed phrasing every other surface in this client uses.

**Files ride with their name, type and size.** 7.14 answers `files: { id, name,
mime, bytes }[]`, 4.16's own columns, so the tile-name-meta row is drawn for
every file. It answers `width` and `height` beside them (issue #27), which is
what `attachmentOf` turns into the reservation issue #108 asked for. The write
half is one file per comment, as 7.14 writes it.
*/

import type { CommentFile, CommentLine } from '../../shared/comments.js'
import { measuredRatio } from './page-images.js'
import { formatAgo } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'

import type { Attachment, ConceptComment } from '../tasks/task-model.js'

/** 7.15's serving path, which the browser sends the session cookie for, this
 *  being one origin (11.1). */
export function fileSrc(fileId: string): string {
  return `/api/v1/files/${fileId}`
}

/**
 * An attachment as 7.14 describes one: the tile, the name and the meta line,
 * from 4.16's columns rather than from a download. The two helpers restate
 * `components/comments.tsx`'s own, which that file keeps private.
 */
function attachmentOf(file: CommentFile): Attachment {
  const kind = fileKind(file.mime)
  return {
    name: file.name,
    meta: `${file.mime.split('/')[1]?.toUpperCase() ?? 'FILE'} · ${readableSize(file.bytes)}`,
    kind,
    preview: kind === 'image' ? fileSrc(file.id) : undefined,
    /*
    4.16's shape, so a surface can reserve the space a picture will take before
    it arrives (issue #108). Carried only where there is a picture: a document
    has no shape, and the fixed 32px tile beside every attachment has nothing
    to reserve, so this reaches the two places a comment's picture is drawn at
    a size the picture decides.

    `measuredRatio` and not `reservedRatio`, and the choice is the careful
    half of #108. A page block has always reserved 16 by 9 for every picture,
    so falling back to it there keeps that surface's behaviour; a comment's
    picture has never had a reservation and takes its own proportion once the
    bytes land. Nothing is backfilled, so every attachment posted before
    migration 0009 reports null for ever, and giving those 16 by 9 would
    reshape all of them. Undefined here means the surface draws what it draws
    today, which is the whole of what null is allowed to mean.
    */
    ratio: kind === 'image' ? measuredRatio(file.width, file.height) : undefined,
  }
}

/**
 * Every file hung on a task's conversation, as the card's Attachments block
 * draws one. 4.16 scopes a file to a folder and 4.15 hangs it on a comment, so
 * a task's attachments *are* its thread's files, replies included, in the order
 * they were said; feeding the block anything else would be a second store.
 */
export function threadAttachments(comments: readonly ConceptComment[]): Attachment[] {
  const files: Attachment[] = []
  for (const comment of comments) {
    files.push(...(comment.files ?? []))
    for (const reply of comment.replies ?? []) files.push(...(reply.files ?? []))
  }
  return files
}

/**
 * 7.15's declared kind for a file a comment attaches: an image is `image` and
 * anything else is `file`, the two kinds 4.16 gives a comment (`voice` is not
 * yet written).
 */
export function commentFileKind(file: File): 'image' | 'file' {
  return file.type.startsWith('image/') ? 'image' : 'file'
}

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKind(mime: string): 'image' | 'video' | 'document' | 'file' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf' || mime.startsWith('text/')) return 'document'
  return 'file'
}

/*
Who wrote a comment, as the thread's `Face` takes them.

7.14 carries an author's id and nothing else, so the resolver *is* the only
route a picture has onto this surface, and a resolver that could only answer a
name would make the tinted disc the only face a comment could ever wear. The
page resolves the id against the members and connections it has already read,
both of which carry `avatar_url`, so nothing new is fetched to draw a photograph
here.

The initials stay derived from the answered name rather than taken from the
caller, which is `parts/presenters.ts`'s standing rule: a name and its initials
that arrive separately are two facts that can disagree.
*/
export type PersonResolver = (authorId: string) => { name: string; image?: string }

/** One wire comment as the lifted thread reads one, replies excepted. */
/**
 * What this viewer's Access lets a conversation offer, per folder.
 *
 * Three answers rather than one, because the three controls a comment row
 * draws have three different rules (issue #268; #228's Full-control and
 * Can-comment lists and its authorship rule). Every one is
 * `folderGates(...)`'s, which is `shared/folder-actions.ts`'s, which is the
 * table the four 7.14 routes resolve against.
 *
 * **All three are per folder. The per-comment half is `mine`**, and the two
 * are multiplied below rather than anywhere a surface could forget one.
 */
export interface ThreadAuthority {
  /** `comment.moderate`: removing somebody **else's** comment. */
  readonly moderate: boolean
  /** `comment.mutate.own`'s standing half: editing and removing one's own. */
  readonly mutateOwnComment: boolean
  /** `comment.like`. */
  readonly likeComment: boolean
  /**
   * `comment.create`: writing into this conversation at all.
   *
   * Two surfaces read it and they read it differently (#268). **Reply is
   * hidden**, being a per-comment control like the three above, so it rides
   * `replyable` on each comment. **The composer is rendered and disabled**,
   * saying what standing commenting needs, which is why
   * `components/comments.tsx` also takes it as a prop of its own: a thread with
   * no comments in it still has a composer, and no per-comment field can carry
   * an answer for it.
   */
  readonly createComment: boolean
}

/**
 * The lab's own answers, for a surface that has not worked out the viewer's
 * Access: Edit and Delete on authorship alone and Like always, which is what
 * `components/comments.tsx`'s `?? mine` fallbacks already say. Both real
 * callers pass a real one.
 */
const AUTHORSHIP_ALONE: ThreadAuthority = {
  moderate: false,
  mutateOwnComment: true,
  likeComment: true,
  createComment: true,
}

function conceptOf(
  line: CommentLine,
  viewerId: string | null,
  personOf: PersonResolver,
  now: number,
  may: ThreadAuthority,
): ConceptComment {
  const mine = line.author_id === viewerId
  const author = personOf(line.author_id)
  return {
    id: line.id,
    author: {
      id: line.author_id,
      initials: initialsOf(author.name),
      name: author.name,
      ...(author.image === undefined ? {} : { image: author.image }),
    },
    at: formatAgo(line.created_at, now),
    ...(line.body === null ? {} : { body: line.body }),
    ...(line.edited_at === null ? {} : { edited: true }),
    ...(line.likes === 0
      ? {}
      : { reactions: [{ emoji: 'like', count: line.likes, mine: line.liked }] }),
    ...(line.files.length === 0 ? {} : { files: line.files.map(attachmentOf) }),
    mine,
    /*
    The three controls a comment row draws, and the three different rules behind
    them. Answered here, per comment, so that both mounts of the one thread
    agree and so that the per-comment fact and the per-folder bar are multiplied
    in one place rather than at every surface.

    **`deletable` is `comment.mutate.own` or `comment.moderate`**, as
    `routes/conversation.ts` resolves it (issue #268):

    - moderation is Full control's, which custody neither confers nor implies,
      so the second half is not `is_owner`;
    - and the **author's** own half is not `mine` either. Authorship is
      provenance rather than standing authority, so a member reduced to Can view
      keeps their words and loses the power to change them; `mine` alone would
      offer Edit and Delete on every comment they had ever left, each answered
    403. AC-518 pins those refusals from the server's side; this is the screen
         agreeing with them.

    `editable` and `likeable` exist for the same reason: authorship alone and
    "everyone" are not 7.14's rules.
    */
    deletable: (mine && may.mutateOwnComment) || may.moderate,
    editable: mine && may.mutateOwnComment,
    likeable: may.likeComment,
    /* Replying is `comment.create`, the same act as a first comment, so a
       member below Can comment is offered no Reply anywhere in the thread. Per
       comment because the control is (#268); the composer's own half is a prop
       on the component. */
    replyable: may.createComment,
  }
}

/**
 * 7.14's flat thread as the lifted component reads it: top-level comments in
 * the order the endpoint answered them, each carrying its own replies.
 *
 * A reply whose parent is not in the same response is dropped rather than
 * promoted to a top-level remark, which would put an answer where nobody asked
 * anything. 4.15 makes that impossible on the write side; this is the read
 * side declining to invent a shape it was not given.
 */
export function toConceptComments(
  lines: readonly CommentLine[],
  viewerId: string | null,
  personOf: PersonResolver,
  now: number,
  /**
   * What this viewer's Access lets this folder's conversation offer, from
   * `folderGates(...)` (7.14, issue #228; AC-790). Defaults to the lab's
   * answers, for a surface that has not worked out the viewer's Access.
   */
  may: ThreadAuthority = AUTHORSHIP_ALONE,
): ConceptComment[] {
  const tops: ConceptComment[] = []
  const byId = new Map<string, ConceptComment>()
  for (const line of lines) {
    if (line.parent_id !== null) continue
    const comment = conceptOf(line, viewerId, personOf, now, may)
    byId.set(line.id, comment)
    tops.push(comment)
  }
  for (const line of lines) {
    if (line.parent_id === null) continue
    const parent = byId.get(line.parent_id)
    if (parent === undefined) continue
    const replies = parent.replies ?? []
    replies.push(conceptOf(line, viewerId, personOf, now, may))
    parent.replies = replies
  }
  return tops
}

/** The four writes 7.14 offers, as the page has already bound them. */
export interface ThreadWriters {
  /** POST /folders/:id/comments, with the task where there is one. */
  readonly post: (body: {
    body?: string
    parent_id?: string
    file_id?: string
  }) => void
  /** PATCH /comments/:id, the author's own edit. */
  readonly edit: (commentId: string, body: string) => void
  /**
   * DELETE /comments/:id, the author's who still holds Can comment, or a
   * moderator's (7.14; moderation is Full control's and authorship is not
   * standing authority, issue #228).
   */
  readonly remove: (commentId: string) => void
  /** PUT and DELETE /comments/:id/like, one bit per person. */
  readonly like: (commentId: string, liked: boolean) => void
  /** POST /files, answering the id a comment then carries. */
  readonly upload: (file: File) => Promise<string>
}

/** Every comment in a thread, replies included, by id. */
function flatten(
  comments: readonly ConceptComment[],
): Map<string, { comment: ConceptComment; parentId: string | null }> {
  const all = new Map<string, { comment: ConceptComment; parentId: string | null }>()
  for (const comment of comments) {
    all.set(comment.id, { comment, parentId: null })
    for (const reply of comment.replies ?? []) {
      all.set(reply.id, { comment: reply, parentId: comment.id })
    }
  }
  return all
}

/** Whether the viewer's own like is set on a comment as the thread holds it. */
function likedByMe(comment: ConceptComment): boolean {
  return (comment.reactions ?? []).some((reaction) => reaction.mine === true)
}

/**
 * The array the lifted thread wants, turned into the writes that would produce
 * it.
 *
 * Order matters in one place and one only: a delete is issued before a post,
 * so that a session which removes a comment and writes another in the same
 * change does not race its own refetch. Everything else is independent.
 *
 * A new comment's attachment is uploaded first and the comment posted with the
 * id, which is why this returns a promise: 7.14 takes a `file_id` and 7.15
 * makes one, so the two are one act from the person's side and two from the
 * wire's.
 */
export function applyThreadChange(
  prev: readonly ConceptComment[],
  next: readonly ConceptComment[],
  writers: ThreadWriters,
): void {
  const before = flatten(prev)
  const after = flatten(next)

  for (const [id] of before) {
    if (!after.has(id)) writers.remove(id)
  }

  for (const [id, entry] of after) {
    const was = before.get(id)
    if (was === undefined) {
      /* A comment made in this session. Its id is the component's own and is
         never sent: the row the server makes carries the id, and the refetch
         replaces this one. */
      const pending = entry.comment.files?.[0]?.file
      const body = entry.comment.body
      const parentId = entry.parentId
      if (pending === undefined) {
        writers.post({
          ...(body === undefined ? {} : { body }),
          ...(parentId === null ? {} : { parent_id: parentId }),
        })
        continue
      }
      void writers.upload(pending).then((fileId) => {
        writers.post({
          ...(body === undefined ? {} : { body }),
          ...(parentId === null ? {} : { parent_id: parentId }),
          file_id: fileId,
        })
      })
      continue
    }
    const bodyNow = entry.comment.body ?? ''
    const bodyWas = was.comment.body ?? ''
    if (bodyNow !== bodyWas && bodyNow !== '') writers.edit(id, bodyNow)
    const likeNow = likedByMe(entry.comment)
    if (likeNow !== likedByMe(was.comment)) writers.like(id, likeNow)
  }
}

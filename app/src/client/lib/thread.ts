/*
The adapter seam for a conversation: `prototype-v2`'s `CommentsThread` is a
controlled component over an array, and Dana's conversation is 7.14's four
routes. This module is the whole of what stands between them, lifted by RFC
0004's S26.

**The seam is the array, not the component**, which is why
`components/comments.tsx` crosses with no write of its own. The prototype's
thread announces every change the same way, `onChange(next)` carrying the
array it wants to exist; here the page hands `applyThreadChange` that array,
which compares it to the one the query answered and issues the one mutation
that explains the difference. Four differences are expressible and each is one
route: an id that appeared is a `POST`, an id that vanished is a `DELETE`, a
body that moved is a `PATCH`, and a like that flipped is 7.14's like pair. A
fifth kind of difference cannot be produced by that component, and one that
somehow were would be dropped rather than guessed at.

**Why a diff rather than four callbacks.** Four callbacks is what
`components/page/ConversationThread.tsx` took, and it is what made that file a
second conversation surface: the prototype's own `onChange` is threaded through
`CommentRow`, the reply composer and `toggleReaction`, so a component taking
callbacks instead has to be rewritten at every one of those points, which is
the rewriting the lift discipline forbids. Diffing costs this module thirty
lines and costs the lifted file nothing.

**What a comment is on the wire and what it is on the page.** 7.14 answers a
flat list with `parent_id`; the component draws one level of replies, which is
4.15's own limit, so the read half nests and the write half flattens back.
Times are `formatAgo`'s, the elapsed phrasing every other surface in this
client uses, because the prototype's `at` is a written string and a fixture's
written string is the one thing that must not cross.

**Files ride as the picture and nothing else, and the reason is a measurement
rather than a preference.** `CommentLine.file_ids` is an array of bare uuids
(7.14), and `GET /files/:id` answers the bytes; nothing on the wire carries a
file's name, its type or its size. So the tile-name-meta row the prototype
draws cannot be drawn for a file this client did not itself just choose, and
what is left that is honest is the bytes, which describe themselves when they
are a picture and not otherwise. The composer therefore offers images, and
`components/comments.tsx` draws an attachment carrying a preview and no name as
the picture. **The widening that would close it is recorded at section 13 item
54** and is frozen section 7's, so it is not taken here.
*/
import { useMemo } from 'react'

import type { CommentLine } from '../../shared/comments.js'
import { useMe } from '../api/queries.js'
import { formatAgo } from '../parts/format-dates.js'
import { initialsOf } from '../parts/presenters.js'

import type { Attachment, ConceptComment } from './task-model.js'

/** The prototype's `Person`, which is what a `Face` takes. */
export interface ThreadPerson {
  readonly initials: string
  readonly name: string
  readonly image?: string
}

/**
 * Who is writing, for the composer's own face and for a comment made in this
 * session.
 *
 * The prototype reads `PEOPLE[0]`, three names written for the row lab, and
 * RFC 0004's close forbids a fixture crossing in any form. The session is the
 * honest answer and is already in the cache on every page.
 */
export function useViewerPerson(): ThreadPerson {
  const me = useMe()
  const name = me.data?.user.display_name ?? 'You'
  return { initials: initialsOf(name), name }
}

/** 7.15's serving path, which the browser sends the session cookie for, this
 *  being one origin (11.1). */
export function fileSrc(fileId: string): string {
  return `/api/v1/files/${fileId}`
}

/**
 * An attachment as this client can honestly describe one: the picture and no
 * words, per the module header.
 */
function attachmentOf(fileId: string): Attachment {
  return { name: '', meta: '', kind: 'image', preview: fileSrc(fileId) }
}

/** One wire comment as the lifted thread reads one, replies excepted. */
function conceptOf(
  line: CommentLine,
  viewerId: string | null,
  nameOf: (authorId: string) => string,
  now: number,
  ownerDeletes: boolean,
): ConceptComment {
  const mine = line.author_id === viewerId
  return {
    id: line.id,
    author: { initials: initialsOf(nameOf(line.author_id)), name: nameOf(line.author_id) },
    at: formatAgo(line.created_at, now),
    ...(line.body === null ? {} : { body: line.body }),
    ...(line.edited_at === null ? {} : { edited: true }),
    ...(line.likes === 0
      ? {}
      : { reactions: [{ emoji: 'like', count: line.likes, mine: line.liked }] }),
    ...(line.file_ids.length === 0
      ? {}
      : { files: line.file_ids.map(attachmentOf) }),
    mine,
    /* 4.15: the author or the folder's owner. Answered here so that both
       mounts of the one thread agree. */
    deletable: mine || ownerDeletes,
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
  nameOf: (authorId: string) => string,
  now: number,
  /** Whether this viewer owns the folder the thread belongs to (4.15). */
  ownerDeletes = false,
): ConceptComment[] {
  const tops: ConceptComment[] = []
  const byId = new Map<string, ConceptComment>()
  for (const line of lines) {
    if (line.parent_id !== null) continue
    const comment = conceptOf(line, viewerId, nameOf, now, ownerDeletes)
    byId.set(line.id, comment)
    tops.push(comment)
  }
  for (const line of lines) {
    if (line.parent_id === null) continue
    const parent = byId.get(line.parent_id)
    if (parent === undefined) continue
    const replies = parent.replies ?? []
    replies.push(conceptOf(line, viewerId, nameOf, now, ownerDeletes))
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
  /** DELETE /comments/:id, the author's or the folder owner's (4.15). */
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

/**
 * The thread a surface draws, memoised on what it is built from.
 *
 * `now` is read once per render of the page rather than per comment, so every
 * elapsed phrase on one screen is measured from the same instant.
 */
export function useConceptThread(
  lines: readonly CommentLine[] | undefined,
  viewerId: string | null,
  nameOf: (authorId: string) => string,
  ownerDeletes = false,
): ConceptComment[] {
  return useMemo(
    () => toConceptComments(lines ?? [], viewerId, nameOf, Date.now(), ownerDeletes),
    [lines, viewerId, nameOf, ownerDeletes],
  )
}

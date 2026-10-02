/*
How a thread's posts sit on screen (chat feed): one flat timeline, pure.

Every post is drawn in the order it was written (`created_at`, then id). A
reply stays a reply on the server (7.14 keeps one level) but is not moved
under the post it answers: it is drawn where it falls in time and quotes
that post at its top instead.

A post **starts a run** (the author's name is drawn over it, and its corner
on the author's side is tighter) unless the post before it is by the same
author (by id, never by name: every unknown author answers "Someone"), on
the same local day, and less than ten minutes earlier. A run **ends** where
the next post starts one. A new local day is marked between posts.

Days and clock times are the browser's local ones: the thread is read where
the reader is.
*/
import type { CommentLine } from '../../../shared/comments.js'

/** A follow-up within ten minutes joins its author's run. */
export const RUN_WINDOW_MS = 10 * 60 * 1000

export interface PlacedPost {
  readonly line: CommentLine
  /** The first post of a run: the name is drawn over it. */
  readonly head: boolean
  /** The last post of a run: the gap after it is wider. */
  readonly tail: boolean
  /** The first post of a local day: a day line is drawn above it. */
  readonly newDay: boolean
}

/** An instant's civil date on the reader's clock: "2026-09-24". */
export function localDay(instant: string): string {
  const at = new Date(instant)
  const month = String(at.getMonth() + 1).padStart(2, '0')
  const day = String(at.getDate()).padStart(2, '0')
  return `${String(at.getFullYear())}-${month}-${day}`
}

/** An instant's wall-clock time on the reader's clock: "14:05". */
export function localClock(instant: string): string {
  const at = new Date(instant)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

function joins(previous: CommentLine | undefined, line: CommentLine): boolean {
  return (
    previous !== undefined &&
    previous.author_id === line.author_id &&
    localDay(previous.created_at) === localDay(line.created_at) &&
    Date.parse(line.created_at) - Date.parse(previous.created_at) < RUN_WINDOW_MS
  )
}

/** Posts in order (oldest first), each marked with where its run and day start and end. */
export function placePosts(posts: readonly CommentLine[]): PlacedPost[] {
  return posts.map((line, index) => {
    const previous = posts[index - 1]
    const next = posts[index + 1]
    return {
      line,
      head: !joins(previous, line),
      tail: next === undefined || !joins(line, next),
      newDay: previous === undefined || localDay(previous.created_at) !== localDay(line.created_at),
    }
  })
}

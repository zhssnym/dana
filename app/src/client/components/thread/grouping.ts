/*
How a thread's posts sit on screen (r3 discuss): Slack's grouping, pure.

A post **starts a group** — face, name and time drawn — unless the post
before it is by the same author (by id, never by name: every unknown author
answers "Someone"), on the same local day, less than five minutes earlier, and the
post is not itself a reply (a reply carries its own reference line).
Anything else draws only the text, under the
group's head. A new local day always starts a group, and draws a divider first only when
the thread spans more than one day (r4: a one-day thread needs no dates).

Days and clock times are the browser's local ones: the thread is read where
the reader is.
*/
import type { CommentLine } from '../../../shared/comments.js'

/** Slack's convention: a follow-up within five minutes joins its author's group. */
export const GROUP_WINDOW_MS = 5 * 60 * 1000

export interface PlacedPost {
  readonly line: CommentLine
  /** Draw the face, the name and the time. */
  readonly head: boolean
  /** A local day ("2026-09-24") when a divider goes above this post. */
  readonly day: string | null
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

/** Posts in order (oldest first), each told whether it heads a group and whether a day divider precedes it. */
export function placePosts(posts: readonly CommentLine[]): PlacedPost[] {
  const placed: PlacedPost[] = []
  const days = new Set(posts.map((line) => localDay(line.created_at)))
  const dated = days.size > 1
  let previous: CommentLine | null = null
  let previousDay: string | null = null
  for (const line of posts) {
    const day = localDay(line.created_at)
    const newDay = day !== previousDay
    const joins =
      previous !== null &&
      !newDay &&
      previous.author_id === line.author_id &&
      line.parent_id === null &&
      Date.parse(line.created_at) - Date.parse(previous.created_at) < GROUP_WINDOW_MS
    placed.push({ line, head: !joins, day: newDay && dated ? day : null })
    previous = line
    previousDay = day
  }
  return placed
}

/*
How a thread's posts sit on screen (r3 discuss, m12): Slack's grouping, pure.

A thread keeps one level of replies (7.14). The posts that answer nothing are
the thread's spine, oldest first; each carries its replies under it, oldest
first, as an indented run. A reply whose parent is not in the thread (deleted,
0047 clears the link, or not loaded) reads as a post of the spine. A reply to
a reply is filed under that reply's own parent.

A post **starts a group** — face, name and time drawn — unless the post
before it in the same run is by the same author (by id, never by name: every
unknown author answers "Someone"), on the same local day, and less than five
minutes earlier. On the spine, a post that has replies ends its group, since
its replies sit between it and the next. Anything else draws only its text,
its time shown in the gutter on hover.

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
}

export interface PlacedRoot extends PlacedPost {
  /** Its replies, oldest first. */
  readonly replies: readonly PlacedPost[]
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
    Date.parse(line.created_at) - Date.parse(previous.created_at) < GROUP_WINDOW_MS
  )
}

/** Posts in order (oldest first), arranged as the spine with each post's replies under it. */
export function placePosts(posts: readonly CommentLine[]): PlacedRoot[] {
  const byId = new Map(posts.map((line) => [line.id, line]))
  const rootOf = (line: CommentLine): string | null => {
    let parent = line.parent_id === null ? undefined : byId.get(line.parent_id)
    const seen = new Set<string>([line.id])
    while (parent !== undefined && parent.parent_id !== null && !seen.has(parent.id)) {
      seen.add(parent.id)
      const up = byId.get(parent.parent_id)
      if (up === undefined) break
      parent = up
    }
    return parent?.id ?? null
  }
  const roots: CommentLine[] = []
  const replies = new Map<string, CommentLine[]>()
  for (const line of posts) {
    const root = rootOf(line)
    if (root === null) {
      roots.push(line)
    } else {
      const run = replies.get(root) ?? []
      run.push(line)
      replies.set(root, run)
    }
  }
  const placed: PlacedRoot[] = []
  let previous: CommentLine | undefined
  for (const line of roots) {
    const run = replies.get(line.id) ?? []
    placed.push({
      line,
      head: !joins(previous, line),
      replies: run.map((reply, index) => ({ line: reply, head: !joins(run[index - 1], reply) })),
    })
    /* Replies stand between this post and the next: the next starts a group. */
    previous = run.length > 0 ? undefined : line
  }
  return placed
}

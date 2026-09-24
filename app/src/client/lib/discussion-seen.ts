/*
Which discussion threads the viewer has seen, kept in this browser only.
A thread is new when it moved after the viewer last opened it (or, never
opened, after the first time this browser checked) and someone else moved it.
*/
import type { Discussion } from '../../shared/consultation.js'

const SEEN_KEY = 'dana.discussionSeen'
const SINCE_KEY = 'dana.discussionSeenSince'

function readSeen(): Record<string, string> {
  const raw = localStorage.getItem(SEEN_KEY)
  if (raw === null) return {}
  const parsed: unknown = JSON.parse(raw)
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {}
}

function since(): string {
  const stored = localStorage.getItem(SINCE_KEY)
  if (stored !== null) return stored
  const now = new Date().toISOString()
  localStorage.setItem(SINCE_KEY, now)
  return now
}

export function markDiscussionSeen(id: string): void {
  try {
    since()
    const seen = readSeen()
    seen[id] = new Date().toISOString()
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
  } catch {
    // Storage unavailable: nothing is remembered, nothing shows as new.
  }
}

export function isDiscussionNew(d: Discussion, viewerId: string | null): boolean {
  try {
    if (d.last_post?.author_id !== undefined && d.last_post.author_id === viewerId) return false
    const last = Date.parse(d.last_post?.created_at ?? d.last_activity_at)
    const mark = Date.parse(readSeen()[d.id] ?? since())
    return Number.isFinite(last) && Number.isFinite(mark) && last > mark
  } catch {
    return false
  }
}

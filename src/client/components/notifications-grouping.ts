// Posts in one thread fold into one bell row. A group is one thread and one read
// state; mentions and other acts stay one row each.
import type { NotificationLine } from '../../shared/events.js'

export interface BellGroup {
  readonly key: string
  /** Newest first; `rows[0]` is the one the group opens and whose face it shows. */
  readonly rows: readonly NotificationLine[]
  readonly read: boolean
}

/** A post in a thread, not a mention of someone in one. */
export function isPost(row: NotificationLine): boolean {
  return row.event.subject_kind === 'comment' && row.event.verb === 'created'
}

function threadOf(row: NotificationLine): string | null {
  if (row.discussion_id !== undefined && row.discussion_id !== null) return `discussion:${row.discussion_id}`
  if (row.event.folder_id !== null) return `folder:${row.event.folder_id}`
  return null
}

export function groupNotifications(rows: readonly NotificationLine[]): BellGroup[] {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const groups: { key: string; rows: NotificationLine[]; read: boolean }[] = []
  const byKey = new Map<string, NotificationLine[]>()
  for (const row of sorted) {
    const read = row.read_at !== null
    const thread = isPost(row) ? threadOf(row) : null
    if (thread === null) {
      groups.push({ key: row.id, rows: [row], read })
      continue
    }
    const key = `${thread}|${read ? 'read' : 'unread'}`
    const held = byKey.get(key)
    if (held !== undefined) {
      held.push(row)
      continue
    }
    const fresh = [row]
    byKey.set(key, fresh)
    groups.push({ key, rows: fresh, read })
  }
  return groups
}

/** Older events say `commented on "X"`, newer `posted in "X"`; both give `"X"`. */
export function placeOf(detail: string | null): string | null {
  if (detail === null) return null
  const match = /^(?:commented on|posted in)\s+(.+)$/.exec(detail.trim())
  return match?.[1] ?? null
}

export function actorsPhrase(names: readonly string[]): string {
  const [first = 'Someone', second] = names
  if (names.length <= 1) return first
  if (names.length === 2) return `${first} and ${second ?? 'Someone'}`
  return `${first} and ${names.length - 1} others`
}

/*
Notifications: the events that happened *to you*, waiting where you are
(DES-226, drawing DES-223 for RFC 0005's section 9.12).

The model mirrors the RFC's backend split exactly: an event is a fact about
an object; a notification is that fact fanned out to a recipient with a read
bit. The prototype's fixtures stand in for the fan-out — an assignment, an
answer, a like, a share, and a deletion, which are the five kinds the v2
systems produce for somebody else.

Three rules the surface below holds, recorded here because they are the
design rather than the wiring:

- **A notification is a pointer, not a task.** A row is one sentence — who,
  did what, to which thing — and pressing it goes to the thing and marks the
  row read. There are no per-row actions beyond that; accept/decline flows
  (invites) have their own gate and never appear here.
- **Unread is told by tone, never by hue** — DES-143's rule for messages,
  generalized: the unread sentence sits at reading strength with a graphite
  dot, the read one recedes. The accent stays interaction's.
- **Nothing here is deleted by hand.** Rows age out with the event
  retention; the only verbs are read and read-all. A surface that needs
  tidying has failed at being quiet.

Lane 2 travels with it: the real rows come from 4.14 through 7.12, the badge
count is the partial index's, and the read bit is server state. This store
is fixtures plus a localStorage read-set, exactly as deep as a drawing needs.
*/

import { useSyncExternalStore } from "react"

export interface PrototypeNotification {
  id: string
  actor: { name: string; initials: string }
  /* The sentence's tail — the actor renders emphasised ahead of it. */
  sentence: string
  target:
    | { kind: "task"; id: string }
    | { kind: "folder"; name: string }
  when: string
}

export const NOTIFICATION_FIXTURES: PrototypeNotification[] = [
  {
    id: "ntf-1",
    actor: { name: "Sara Khan", initials: "SK" },
    sentence: "assigned you “Send the venue deposit”",
    target: { kind: "task", id: "task-4" },
    when: "9:41 AM",
  },
  {
    id: "ntf-2",
    actor: { name: "Hassan Ali", initials: "HA" },
    sentence: "replied to you on “Review community grant application”",
    target: { kind: "task", id: "task-5" },
    when: "9:12 AM",
  },
  {
    id: "ntf-3",
    actor: { name: "Sara Khan", initials: "SK" },
    sentence: "liked your comment on “Review community grant application”",
    target: { kind: "task", id: "task-5" },
    when: "Yesterday",
  },
  {
    id: "ntf-4",
    actor: { name: "Hassan Ali", initials: "HA" },
    sentence: "shared “Office” with you",
    target: { kind: "folder", name: "Office" },
    when: "Monday",
  },
  {
    id: "ntf-5",
    actor: { name: "Sara Khan", initials: "SK" },
    sentence: "completed “Send the final guest count”",
    target: { kind: "task", id: "task-18" },
    when: "Monday",
  },
]

/* The two newest arrive unread, so the badge has something true to say on a
   fresh visit without pretending everything is news. */
const SEED_UNREAD = new Set(["ntf-1", "ntf-2"])

const READ_KEY = "dana:prototype-notifications-read"
const listeners = new Set<() => void>()
let cache: Set<string> | null = null

function readSet(): Set<string> {
  if (cache) return cache
  try {
    const raw = JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]")
    cache = new Set(Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [])
  } catch {
    cache = new Set()
  }
  return cache
}

function write(next: Set<string>) {
  cache = next
  window.localStorage.setItem(READ_KEY, JSON.stringify([...next]))
  listeners.forEach((notify) => notify())
}

export function isRead(id: string): boolean {
  if (readSet().has(id)) return true
  return !SEED_UNREAD.has(id)
}

export function markRead(id: string) {
  const next = new Set(readSet())
  next.add(id)
  /* Reading one seeds the rest as already-read history, so "mark all read"
     and per-row reads converge on the same stored shape. */
  NOTIFICATION_FIXTURES.forEach((n) => {
    if (!SEED_UNREAD.has(n.id)) next.add(n.id)
  })
  write(next)
}

export function markAllRead() {
  write(new Set(NOTIFICATION_FIXTURES.map((n) => n.id)))
}

export function useUnreadCount(): number {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => NOTIFICATION_FIXTURES.filter((n) => !isRead(n.id)).length,
    () => 0,
  )
}

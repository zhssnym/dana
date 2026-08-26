/*
What happened to a thing, and who did it.

Imran, 2026-08-23: "Task and folder edit history: record the actor and time for
creation, modification, completion, reopening a checked task, and deletion. We
already included this but needs consistency and proper planning."

**What "already included" was.** The window bar's Activity control showed
"Edited just now" over two hardcoded lines — a drawing of a history rather than
one — and the task card's History button was one of the six dead controls F5
removed. So there was no record at all: two places had a shape for it and
neither had a fact.

**The record is written by the act, never by the screen.** That is the whole
design and it is [[DES-158]]'s lesson repeated: undo works because the shell's
mutators register the inverse as they run, so every page gets it without
knowing. History has exactly the same requirement and the same failure mode —
a screen that has to remember to log is a screen that will forget on one path,
and the missing line is invisible until somebody asks what happened.

**So an act writes both at once.** `record()` puts the event in the log and,
when the act is reversible, pushes the undo entry too — and the bar's sentence
is *derived from the event*, so what the bar said and what the history says can
never disagree. Two calls would have been two chances to word one fact
differently.

**It survives a reload**, which undo deliberately does not. Undo is about the
last few seconds; history is the answer to "what happened to this last week",
and one that emptied when you refreshed would be a worse lie than none.

Fixtures-and-presentation: a ported version is an append-only table written
inside the same transaction as the mutation it describes, and read through
section 7. The *shape* ports — subject, verb, actor, time, detail — even though
this storage does not.
*/

import { useMemo, useSyncExternalStore } from "react"

import { pushUndo } from "@/lib/undo"

export const HISTORY_STORAGE_KEY = "dana:prototype-history"
const HISTORY_EVENT = "dana:prototype-history-change"

/* The things a history can be about. Same three the object contract knows,
   because a history is a record of the acts that contract declares. */
export type HistorySubjectKind = "task" | "folder" | "shelf"

/*
The verbs, and why this list is short.

Each is a distinct thing that happened to the object, in a person's words
rather than the mutation's. "Edited" covers every change to a thing's contents
deliberately — a history that logged every keystroke as its own line would be a
diff, and nobody reads a diff to find out what happened.
*/
export type HistoryVerb =
  | "created"
  | "renamed"
  | "edited"
  | "moved"
  | "completed"
  | "reopened"
  | "abandoned"
  | "restored"
  | "duplicated"
  | "removed"
  | "deleted"
  /* Leaving is its own verb because it is neither of its neighbours: the
     thing is not deleted (it lives on for everyone else) and the person was
     not removed (they chose to go). One word, DES-225. */
  | "left"

export interface HistoryEvent {
  id: string
  kind: HistorySubjectKind
  /* The object's own key: a task's id, a folder's or shelf's name. */
  subject: string
  /* What it was called when this happened, so a line still reads after a
     rename — "Travel renamed to Trip" must not become "Trip renamed to Trip"
     the moment you look at it. */
  name: string
  verb: HistoryVerb
  actor: string
  at: number
  /* The half a verb cannot carry: what it was renamed to, which shelf it
     moved to. */
  detail?: string
}

/* Deep enough to answer "what happened", shallow enough that a browser store
   never becomes the reason a prototype is slow. */
const DEPTH = 400

/* How long one stretch of the same change counts as one act. See `record`. */
const COALESCE_WINDOW = 2 * 60 * 1000

let cached: HistoryEvent[] | null = null

function read(): HistoryEvent[] {
  if (typeof window === "undefined") return []
  try {
    const value = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]")
    return Array.isArray(value) ? (value as HistoryEvent[]) : []
  } catch {
    return []
  }
}

function snapshot(): HistoryEvent[] {
  if (!cached) cached = read()
  return cached
}

function write(next: HistoryEvent[]) {
  cached = next
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* A full store costs the record, not the act. */
  }
  window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: next }))
}

/*
The sentence, from the event.

One wording for the undo bar and one for the history line, both built from the
same fact rather than written twice. The bar names the thing, because it appears
over a page where you have just done something to one of many; the history line
does not, because you are looking at that thing's own past and repeating its
name on every row is noise.
*/
const VERB_LABEL: Record<HistoryVerb, string> = {
  created: "Created",
  renamed: "Renamed",
  edited: "Edited",
  moved: "Moved",
  completed: "Completed",
  reopened: "Reopened",
  abandoned: "Abandoned",
  restored: "Restored",
  duplicated: "Duplicated",
  removed: "Removed",
  deleted: "Deleted",
  left: "Left",
}

export function sentenceFor(event: Pick<HistoryEvent, "name" | "verb" | "detail">) {
  const tail = event.detail ? ` ${event.detail}` : ""
  return `${VERB_LABEL[event.verb]} “${event.name}”${tail}`
}

/* Just the verb — the resting line of the Activity control, which has a time
   beside it already. */
export function verbFor(event: Pick<HistoryEvent, "verb">) {
  return VERB_LABEL[event.verb]
}

/* The same act with the subject left out, for a panel that is already about
   one object. */
export function lineFor(event: Pick<HistoryEvent, "verb" | "detail">) {
  return `${VERB_LABEL[event.verb]}${event.detail ? ` ${event.detail}` : ""}`
}

/* Who is doing this. One person in a fixtures prototype; the ported version
   reads it from the session, which is why no caller passes it. */
const VIEWER = "Imran Wafa"

/*
Something happened.

Pass `undo` when it can be taken back and the bar appears with the same
sentence the history will carry. Leave it off and the act is recorded and not
offered back — which is right for creating something, where the inverse is
deleting it and nobody means that by "undo".
*/
export function record(event: {
  kind: HistorySubjectKind
  subject: string
  name: string
  verb: HistoryVerb
  detail?: string
  actor?: string
  undo?: () => void
}) {
  const entry: HistoryEvent = {
    id: `${event.kind}-${event.subject}-${Date.now()}-${snapshot().length}`,
    kind: event.kind,
    subject: event.subject,
    name: event.name,
    verb: event.verb,
    actor: event.actor ?? VIEWER,
    at: Date.now(),
    detail: event.detail,
  }
  /*
  One session of one kind of change is one line.

  Typing a title fires a change per keystroke, and a log that wrote each of
  them would be a keylogger with a nicer name — twelve lines saying "Renamed"
  where a person did one thing. So a new event of the same verb on the same
  object, within a few minutes of the last, **replaces** it rather than
  stacking on top: the line keeps the newest wording and the newest time,
  which is what "renamed to X" should say when X is what you finally typed.

  This is how every edit history a person has used already behaves, and the
  window is the only number in it. Two minutes is long enough to cover typing
  a sentence and short enough that coming back after lunch starts a new line.

  It coalesces on every verb rather than a chosen few. Completing and
  reopening are different verbs and never merge; moving twice inside a minute
  merges to where the task actually ended up, which is the honest summary.
  */
  const previous = snapshot()[0]
  const merges =
    previous &&
    previous.kind === entry.kind &&
    previous.subject === entry.subject &&
    previous.verb === entry.verb &&
    entry.at - previous.at < COALESCE_WINDOW
  write([entry, ...snapshot().slice(merges ? 1 : 0)].slice(0, DEPTH))
  if (event.undo) pushUndo(sentenceFor(entry), event.undo)
}

export function historyFor(kind: HistorySubjectKind, subject: string) {
  return snapshot().filter(
    (event) => event.kind === kind && event.subject === subject,
  )
}

export function useAllHistory(): HistoryEvent[] {
  return useSyncExternalStore(
    (notify) => {
      function onChange(changed: Event) {
        cached = (changed as CustomEvent<HistoryEvent[]>).detail ?? read()
        notify()
      }
      function onStorage() {
        cached = null
        notify()
      }
      window.addEventListener(HISTORY_EVENT, onChange)
      window.addEventListener("storage", onStorage)
      return () => {
        window.removeEventListener(HISTORY_EVENT, onChange)
        window.removeEventListener("storage", onStorage)
      }
    },
    snapshot,
    () => EMPTY,
  )
}

/* Stable, because `useSyncExternalStore` compares the server snapshot by
   identity and a fresh `[]` each call is an infinite render. */
const EMPTY: HistoryEvent[] = []

export function useHistory(
  kind: HistorySubjectKind,
  subject: string,
): HistoryEvent[] {
  const all = useAllHistory()
  return useMemo(
    () =>
      all.filter((event) => event.kind === kind && event.subject === subject),
    [all, kind, subject],
  )
}

/*
"Just now", "4 minutes ago", "Yesterday", "6 Aug".

A history is read by scanning, so the near past is relative — that is the part
a person is placing against their own memory — and anything older than a week
takes a date, because "23 days ago" is arithmetic nobody wants to do.
*/
/*
The same moment, worded to follow a verb.

"Completed just now", "Renamed 4 minutes ago", "Created 5 Aug" — so the
relative forms lower-case and the date does not, because a month is a proper
noun and "5 aug" is a typo rather than a style. The Activity control used to
lower-case the whole string, which read correctly for every form except the one
a fixture actually shows.
*/
export function agoFor(at: number, now = Date.now()) {
  const said = whenFor(at, now)
  return /^[0-9]+ [A-Z]/.test(said) ? said : said.toLocaleLowerCase()
}

export function whenFor(at: number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return "Just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  const date = new Date(at)
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ]
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/*
The line every thing starts with.

Imran, 2026-08-23: the "edited just now" indicator "can't be found anywhere".
It could not, and the cause was a decision that was right in the small and wrong
in the whole: the control draws nothing when there is nothing to say, because a
control that opens onto an empty popover is a promise the page cannot keep
(DES-144). On a browser that has never been used, *nothing* has a history — so
the control was correct and invisible on every page at once, which is the same
as not existing.

**A thing that exists was created**, and that is a fact rather than a fiction.
The fixtures carry `createdAt` and `createdBy` already; the folders do not, so
they take the same date the fixture tasks were written for. Seeding those makes
every object's history one line long instead of zero, which is what a real
account looks like five seconds after it is made — and the indicator is visible
from the first load, where a person can find it.

Written once, only into an empty store, so it can never overwrite a real
history and never re-appear after somebody clears one deliberately.
*/
export function seedHistory(
  entries: Array<{
    kind: HistorySubjectKind
    subject: string
    name: string
    at: number
    actor?: string
  }>,
) {
  if (typeof window === "undefined") return
  if (window.localStorage.getItem(HISTORY_STORAGE_KEY) !== null) return
  write(
    entries
      .map((entry, index) => ({
        id: `seed-${entry.kind}-${entry.subject}-${index}`,
        kind: entry.kind,
        subject: entry.subject,
        name: entry.name,
        verb: "created" as const,
        actor: entry.actor ?? VIEWER,
        at: entry.at,
      }))
      .sort((a, b) => b.at - a.at)
      .slice(0, DEPTH),
  )
}

/*
A thing's own past, as the lifted surfaces read one.

`docs/design/prototype-v2/src/lib/history.ts`, read at `b316785`, over this
client's query layer. Its own header states what a history is for and the
statement survives the port whole: the verbs are "a distinct thing that
happened to the object, in a person's words rather than the mutation's", and
"Edited" covers every change to a thing's contents deliberately, because "a
history that logged every keystroke as its own line would be a diff, and
nobody reads a diff to find out what happened."

**The seam, and it is the whole of the difference.** The prototype writes its
own log into `localStorage` and reads it back: `record`, `seedHistory`, the
coalescing window and the 400-entry depth are all machinery for having a
history at all when there is no server. Dana's history is 4.13's `events`
table, written server-side inside each mutation's own transaction and served
by 7.12's `GET /events?subject=kind:id`. So this module reads that endpoint
through `api/queries.ts` and writes nothing at all. Every writer is gone with
its store, and that is deliberate: change control item 44's B6 ruled the two
apart, "undo is a short-lived client affordance about the act just taken, an
audit log is a permanent server record about what happened to the data", and
a client-side recorder here would be the coupling that ruling declined.

**What crosses verbatim is the wording**, `sentenceFor`, `verbFor`, `lineFor`,
`agoFor` and `whenFor` with their `VERB_LABEL` table, because those turn an
event into the words a control says and the words are the design's. `verbFor`
carries its own measured reason: the resting line "names the act that actually
happened, rather than saying Edited over everything", because a fixed word
"made the control lie in the common case: tick one thing off a folder and the
bar said the folder had been edited, while the line one press below it said
Completed."

**Two field seams, and each is a shape rather than a value.** 4.13 stores an
`actor_id` where the prototype stores a name, so an actor is resolved against
the rosters this client can already read, which is what
`components/task-form/TaskHistory.tsx` has done since AC-178 and for its
reasons: an id none of them carries renders "Deleted user", which is 4.1's own
note and is unresolvable by construction because 8.10 removes the memberships
and 7.3 excludes the account. And `created_at` is an ISO instant where the
prototype holds an epoch millisecond, so it is parsed once here rather than at
each of `agoFor`'s and `whenFor`'s call sites.

**The verb sets are the same twelve and are declared rather than restated.**
4.13's CHECK constraint and the prototype's `HistoryVerb` union carry the
identical list, which is not a coincidence: both were written from the same
object contract. `HistoryVerb` is therefore `EventVerb`, so the two cannot
drift. What 4.13 has and the prototype does not is the `comment` subject kind,
which is not a thing a history sheet is opened on.
*/

import { useMemo } from 'react'

import { useConnections, useMe, useSubjectEvents } from '../api/queries.js'
import type { EventLine, EventVerb } from '../../shared/events.js'
import { personDisplay } from '../parts/presenters.js'

/** The things a history can be about: 4.13's subject kinds a surface opens. */
export type HistorySubjectKind = 'task' | 'folder' | 'shelf'

/** 4.13's verb set, which is the prototype's `HistoryVerb` exactly. */
export type HistoryVerb = EventVerb

export interface HistoryEvent {
  id: string
  kind: HistorySubjectKind
  /** The object's own key. 4.13's `subject_id`, which is a uuid here. */
  subject: string
  /**
   * What it was called when this happened, so a line still reads after a
   * rename: "Travel renamed to Trip" must not become "Trip renamed to Trip"
   * the moment you look at it.
   */
  name: string
  verb: HistoryVerb
  actor: string
  at: number
  /**
   * The half a verb cannot carry: what it was renamed to, which shelf it
   * moved to.
   */
  detail?: string
}

const VERB_LABEL: Record<HistoryVerb, string> = {
  created: 'Created',
  renamed: 'Renamed',
  edited: 'Edited',
  moved: 'Moved',
  completed: 'Completed',
  reopened: 'Reopened',
  abandoned: 'Abandoned',
  restored: 'Restored',
  duplicated: 'Duplicated',
  removed: 'Removed',
  deleted: 'Deleted',
  left: 'Left',
}

/**
 * The sentence, from the event.
 *
 * One wording for the undo bar and one for the history line, both built from
 * the same fact rather than written twice. The bar names the thing, because it
 * appears over a page where you have just done something to one of many; the
 * history line does not, because you are looking at that thing's own past and
 * repeating its name on every row is noise.
 */
export function sentenceFor(
  event: Pick<HistoryEvent, 'name' | 'verb' | 'detail'>,
): string {
  const tail = event.detail ? ` ${event.detail}` : ''
  return `${VERB_LABEL[event.verb]} “${event.name}”${tail}`
}

/**
 * Just the verb: the resting line of the Activity control, which has a time
 * beside it already.
 */
export function verbFor(event: Pick<HistoryEvent, 'verb'>): string {
  return VERB_LABEL[event.verb]
}

/**
 * The same act with the subject left out, for a panel already about one
 * object.
 */
export function lineFor(event: Pick<HistoryEvent, 'verb' | 'detail'>): string {
  return `${VERB_LABEL[event.verb]}${event.detail ? ` ${event.detail}` : ''}`
}

/**
 * The same moment, worded to follow a verb.
 *
 * "Completed just now", "Renamed 4 minutes ago", "Created 5 Aug", so the
 * relative forms lower-case and the date does not, because a month is a proper
 * noun and "5 aug" is a typo rather than a style.
 */
export function agoFor(at: number, now = Date.now()): string {
  const said = whenFor(at, now)
  return /^[0-9]+ [A-Z]/.test(said) ? said : said.toLocaleLowerCase()
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * "Just now", "4 minutes ago", "Yesterday", "6 Aug".
 *
 * A history is read by scanning, so the near past is relative, that being the
 * part a person is placing against their own memory, and anything older than a
 * week takes a date, because "23 days ago" is arithmetic nobody wants to do.
 */
export function whenFor(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 45) return 'Just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const date = new Date(at)
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`
}

/** 4.1's own note, and 8.10's: an actor no roster carries has been scrubbed. */
const DELETED_USER = 'Deleted user'

function toHistoryEvent(
  line: EventLine,
  actors: ReadonlyMap<string, string>,
): HistoryEvent {
  return {
    id: line.id,
    kind: line.subject_kind === 'comment' ? 'task' : line.subject_kind,
    subject: line.subject_id,
    name: line.subject_name,
    verb: line.verb,
    actor: actors.get(line.actor_id) ?? DELETED_USER,
    at: Date.parse(line.created_at),
    ...(line.detail === null ? {} : { detail: line.detail }),
  }
}

/* Stable identity, because a fresh `[]` on every render is an infinite one. */
const EMPTY: HistoryEvent[] = []

/**
 * One thing's history, newest first, which is the order 7.12 answers in.
 *
 * An empty `subject` disables the read rather than sending a placeholder: a
 * card drawn without a task id, which the surface does while a detail is in
 * flight, has no history to ask for and asking would be a 404 the control then
 * has to ignore.
 */
export function useHistory(kind: HistorySubjectKind, subject: string): HistoryEvent[] {
  const events = useSubjectEvents(subject === '' ? null : `${kind}:${subject}`)
  const me = useMe()
  const connections = useConnections()

  const lines = events.data?.events
  const viewer = me.data?.user
  const roster = connections.data

  return useMemo(() => {
    if (lines === undefined || lines.length === 0) return EMPTY
    const actors = new Map<string, string>()
    for (const { user } of roster ?? []) {
      actors.set(user.id, personDisplay(user).name)
    }
    if (viewer !== undefined) actors.set(viewer.id, personDisplay(viewer).name)
    return lines.map((line) => toHistoryEvent(line, actors))
  }, [lines, roster, viewer])
}

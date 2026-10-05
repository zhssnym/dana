// A subject's history as the surfaces read it, from `GET /events`. This module only
// words events; the server writes them. An actor no roster knows reads "Deleted user".

import { useMemo } from 'react'

import { useConnections, useFolderEvents, useMe, useSubjectEvents } from '../api/queries.js'
import type { EventLine, EventVerb } from '../../shared/events.js'
import { personDisplay } from '../parts/presenters.js'

/** The things a history can be about. */
export type HistorySubjectKind = 'task' | 'folder' | 'shelf'

export type HistoryVerb = EventVerb

export interface HistoryEvent {
  id: string
  kind: HistorySubjectKind
  /** The object's own id. */
  subject: string
  /** Its name when this happened, so a line still reads after a rename. */
  name: string
  verb: HistoryVerb
  actor: string
  at: number
  /** What a verb cannot carry: the new name, the shelf it moved to. */
  detail?: string
}

const VERB_LABEL: Record<HistoryVerb, string> = {
  created: 'Created',
  renamed: 'Renamed',
  edited: 'Edited',
  moved: 'Moved',
  completed: 'Marked done',
  reopened: 'Reopened',
  abandoned: 'Dropped',
  restored: 'Restored',
  duplicated: 'Duplicated',
  removed: 'Removed',
  deleted: 'Deleted',
  left: 'Left',
  mentioned: 'Mentioned',
}

/** The undo bar's wording names the thing; the history line does not. */
export function sentenceFor(
  event: Pick<HistoryEvent, 'name' | 'verb' | 'detail'>,
): string {
  const tail = event.detail ? ` ${tabWords(event.detail)}` : ''
  return `${VERB_LABEL[event.verb]} “${event.name}”${tail}`
}

/** Just the verb: the Activity control's resting line, beside a time. */
export function verbFor(event: Pick<HistoryEvent, 'verb'>): string {
  return VERB_LABEL[event.verb]
}

/** The act without its subject, for a panel already about one object. */
export function lineFor(event: Pick<HistoryEvent, 'verb' | 'detail'>): string {
  return `${VERB_LABEL[event.verb]}${event.detail ? ` ${tabWords(event.detail)}` : ''}`
}

// The server's detail is a lowercase predicate ("edited the page") or a trailing phrase
// ("to Work"); a sentence is the actor followed by it.
const VERB_PAST: Record<HistoryVerb, string> = {
  created: 'created',
  renamed: 'renamed',
  edited: 'edited',
  moved: 'moved',
  completed: 'completed',
  reopened: 'reopened',
  abandoned: 'dropped',
  restored: 'restored',
  duplicated: 'duplicated',
  removed: 'removed',
  deleted: 'deleted',
  left: 'left',
  // Never listed; here for the Record's sake.
  mentioned: 'mentioned',
}

const THING: Record<HistorySubjectKind, string> = {
  task: 'the task',
  folder: 'the page',
  shelf: 'the collection',
}

// The server's words differ from the screen's in places: a facet is a tab and a Folder
// is a page.
function screenWords(detail: string): string {
  if (detail === 'part of the sample workspace') {
    return 'created the page as part of the sample workspace'
  }
  return tabWords(detail)
}

function tabWords(detail: string): string {
  return detail.replace(/\bfacets?\b/g, (word) => (word === 'facet' ? 'tab' : 'tabs'))
    .replace(/\bthe Folder\b/g, 'the page')
}

/**
 * One event as a sentence. An event on `about` itself names it by kind; one on something
 * inside it names that thing, and "created" reads "added".
 */
export function sentenceOf(
  event: Pick<HistoryEvent, 'kind' | 'subject' | 'name' | 'verb' | 'actor' | 'detail'>,
  about: { readonly kind: HistorySubjectKind; readonly subject: string },
): string {
  const own = event.kind === about.kind && event.subject === about.subject
  const detail = screenWords(event.detail ?? '')
  const trailing = /^(from|to|dates) /.test(detail)
  const predicate = detail !== '' && !trailing && /^[a-z]/.test(detail)
  if (own) {
    if (predicate) return `${event.actor} ${detail}`
    const base = `${event.actor} ${VERB_PAST[event.verb]} ${THING[event.kind]}`
    return trailing ? `${base} ${detail}` : base
  }
  const verb = event.verb === 'created' ? 'added' : VERB_PAST[event.verb]
  const base = `${event.actor} ${verb} “${event.name}”`
  return trailing ? `${base} ${detail}` : base
}

/** "Completed just now", "Created 5 Aug": relative forms lower-case, a date does not. */
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

/** Relative within a week, then a date. */
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

/** An actor no roster carries has been deleted. */
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

// A stable empty array: a fresh `[]` each render would loop.
const EMPTY: HistoryEvent[] = []

/** The server refuses a subject that is not `kind:uuid` (422), so such reads are skipped. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * Newest first, as the server answers. Pass `enabled` false while a sheet is closed, so
 * closed sheets cost no request.
 */
export function useHistory(
  kind: HistorySubjectKind,
  subject: string,
  enabled = true,
  // A folder's history includes everything in it (the folder read); every other caller
  // keeps the subject read.
  scope: 'subject' | 'folder' = 'subject',
): HistoryEvent[] {
  const wanted = enabled && UUID.test(subject)
  const events = useSubjectEvents(
    wanted && scope === 'subject' ? `${kind}:${subject}` : null,
  )
  const folderEvents = useFolderEvents(wanted && scope === 'folder' ? subject : null)
  const me = useMe()
  const connections = useConnections()

  const lines = scope === 'folder' ? folderEvents.data?.events : events.data?.events
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

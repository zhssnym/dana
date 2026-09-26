/*
The issue page's timeline as data (m3 issue; scratchpad m3/RESEARCH-ISSUE.md
3.2 and 3.5): the task's comments, its history events and its dependency
edges, merged oldest first. Each history line becomes one GitHub-shaped act
("Maya closed this as completed", "Maya added the step Plates"), matched on
the event's verb and the server's detail wording.

- `created` is the body box's own "opened", so it is not a row; an "assigned
  to" riding on it becomes the row right after.
- `edited the description` is the body's "edited" mark, not a row: GitHub
  keeps description edits out of the timeline. An undetailed `edited` is a
  PATCH the server does not describe, and shows nothing.
- Reordering steps and permanent deletion are left out: noise, and a task
  nobody can open.
- A run of the same step act by one person within ten minutes is one row.
*/
import type { CommentLine } from '../../../../shared/comments.js'
import type { EventLine } from '../../../../shared/events.js'
import type { TaskDependencyEdge } from '../../../../shared/task-dependencies.js'
import type { IssueState } from '../issues.js'

export type StepAction = 'added' | 'renamed' | 'completed' | 'reopened' | 'removed'

export type Act =
  | { readonly t: 'assigned'; readonly who: string }
  | { readonly t: 'self-assigned' }
  | { readonly t: 'unassigned'; readonly who: string }
  | { readonly t: 'date'; readonly field: 'due' | 'start'; readonly to: string | null }
  | { readonly t: 'from-step'; readonly parent: string }
  | { readonly t: 'duplicated'; readonly source: string }
  | { readonly t: 'renamed'; readonly from: string | null; readonly to: string }
  | { readonly t: 'moved' }
  | { readonly t: 'reminder'; readonly set: boolean }
  | { readonly t: 'state'; readonly state: IssueState; readonly reopened: boolean }
  | { readonly t: 'restored-trash' }
  | { readonly t: 'trashed' }
  | { readonly t: 'step'; readonly action: StepAction; readonly names: readonly string[] }
  | { readonly t: 'promoted' }
  | { readonly t: 'blocked-by'; readonly edges: readonly TaskDependencyEdge[] }
  | { readonly t: 'blocking'; readonly edges: readonly TaskDependencyEdge[] }
  | { readonly t: 'other'; readonly text: string }

export interface EventEntry {
  readonly kind: 'event'
  readonly key: string
  readonly at: number
  /** Null for a dependency whose maker the server does not say. */
  readonly actorId: string | null
  readonly act: Act
}

export interface CommentEntry {
  readonly kind: 'comment'
  readonly key: string
  readonly at: number
  readonly comment: CommentLine
  /** Its replies, oldest first: GitHub has none, so they hang under it. */
  readonly replies: readonly CommentLine[]
}

export type Entry = EventEntry | CommentEntry

const GROUP_MS = 10 * 60 * 1000

const ASSIGNED = /^assigned to (.+)$/
const UNASSIGNED = /^unassigned (.+)$/
const DATE_SET = /^set the (due|start) date to (\d{4}-\d{2}-\d{2})$/
const DATE_REMOVED = /^removed the (due|start) date$/
export const DESCRIPTION_EDITED = 'edited the description'
const STEP = /^(added|renamed|completed|reopened|moved|removed) (?:a |the )?step (?:to )?'(.+)'$/

/** The acts one history line says, in order (a rename that also assigned is two). */
function actsOf(line: EventLine, previousName: string | null, actorName: string): Act[] {
  const detail = line.detail ?? ''
  const assigned = ASSIGNED.exec(detail)
  const assign: Act[] =
    assigned === null ? [] : [assigned[1] === actorName ? { t: 'self-assigned' } : { t: 'assigned', who: assigned[1] ?? '' }]
  switch (line.verb) {
    case 'created': {
      const from = /^from a step of (.+)$/.exec(detail)
      return from === null ? assign : [{ t: 'from-step', parent: from[1] ?? '' }]
    }
    case 'duplicated': {
      const from = /^from (.+)$/.exec(detail)
      return [{ t: 'duplicated', source: from?.[1] ?? '' }]
    }
    case 'renamed':
      return [
        { t: 'renamed', from: previousName !== null && previousName !== line.subject_name ? previousName : null, to: line.subject_name },
        ...assign,
      ]
    case 'moved':
      return [{ t: 'moved' }, ...assign]
    case 'completed':
      return [{ t: 'state', state: 'completed', reopened: false }]
    case 'abandoned':
      return [{ t: 'state', state: 'not-planned', reopened: false }]
    case 'reopened':
      return [{ t: 'state', state: 'open', reopened: true }]
    case 'restored':
      return detail === 'restored from Trash' ? [{ t: 'restored-trash' }] : [{ t: 'state', state: 'open', reopened: true }]
    case 'deleted':
      return /^moved to Trash/.test(detail) ? [{ t: 'trashed' }] : []
    case 'edited': {
      if (assign.length > 0) return assign
      if (detail === '' || detail === DESCRIPTION_EDITED) return []
      const unassigned = UNASSIGNED.exec(detail)
      if (unassigned !== null) return [{ t: 'unassigned', who: unassigned[1] ?? '' }]
      const dateSet = DATE_SET.exec(detail)
      if (dateSet !== null) return [{ t: 'date', field: dateSet[1] === 'start' ? 'start' : 'due', to: dateSet[2] ?? null }]
      const dateRemoved = DATE_REMOVED.exec(detail)
      if (dateRemoved !== null) return [{ t: 'date', field: dateRemoved[1] === 'start' ? 'start' : 'due', to: null }]
      if (detail === 'set a reminder') return [{ t: 'reminder', set: true }]
      if (detail === 'removed the reminder') return [{ t: 'reminder', set: false }]
      if (detail === 'promoted a step to a task') return [{ t: 'promoted' }]
      const step = STEP.exec(detail)
      if (step !== null) {
        const action = step[1] as StepAction | 'moved'
        return action === 'moved' ? [] : [{ t: 'step', action, names: [step[2] ?? ''] }]
      }
      return [{ t: 'other', text: detail }]
    }
    default:
      return detail === '' ? [] : [{ t: 'other', text: detail }]
  }
}

/** Whether the body was edited after it was opened, and when last: only the
 * server's document write says so, never an undescribed PATCH. */
export function bodyEditedAt(events: readonly EventLine[]): number | null {
  let latest: number | null = null
  for (const line of events) {
    if (line.subject_kind !== 'task' || line.verb !== 'edited' || line.detail !== DESCRIPTION_EDITED) continue
    const at = Date.parse(line.created_at)
    if (latest === null || at > latest) latest = at
  }
  return latest
}

function sameAct(a: Act, b: Act): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Consecutive edges of one direction by one person within ten minutes: one row. */
function dependencyEntries(edges: readonly TaskDependencyEdge[], t: 'blocked-by' | 'blocking'): EventEntry[] {
  const out: EventEntry[] = []
  let run: TaskDependencyEdge[] = []
  const flush = (): void => {
    const first = run[0]
    const last = run.at(-1)
    if (first === undefined || last === undefined) return
    out.push({ kind: 'event', key: `${t}-${first.id}`, at: Date.parse(last.created_at), actorId: first.created_by, act: { t, edges: run } })
    run = []
  }
  for (const edge of [...edges].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const last = run.at(-1)
    if (last !== undefined && (last.created_by !== edge.created_by || Date.parse(edge.created_at) - Date.parse(last.created_at) > GROUP_MS)) flush()
    run.push(edge)
  }
  flush()
  return out
}

export function buildTimeline(input: {
  readonly events: readonly EventLine[]
  readonly comments: readonly CommentLine[]
  readonly dependsOn: readonly TaskDependencyEdge[]
  readonly blocks: readonly TaskDependencyEdge[]
  readonly nameOf: (id: string) => string
}): Entry[] {
  const entries: Entry[] = []

  /* Comments: a reply joins its parent; a reply whose parent is gone reads as a comment. */
  const ids = new Set(input.comments.map((comment) => comment.id))
  const replies = new Map<string, CommentLine[]>()
  for (const comment of input.comments) {
    if (comment.parent_id === null || !ids.has(comment.parent_id)) continue
    const list = replies.get(comment.parent_id) ?? []
    list.push(comment)
    replies.set(comment.parent_id, list)
  }
  for (const comment of input.comments) {
    if (comment.parent_id !== null && ids.has(comment.parent_id)) continue
    entries.push({
      kind: 'comment',
      key: comment.id,
      at: Date.parse(comment.created_at),
      comment,
      replies: (replies.get(comment.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })
  }

  /* History, oldest first; the title before each line is the line before's name. */
  const history = input.events
    .filter((line) => line.subject_kind === 'task')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  let previousName: string | null = null
  for (const line of history) {
    const acts = actsOf(line, previousName, input.nameOf(line.actor_id))
    previousName = line.subject_name
    acts.forEach((act, index) => {
      entries.push({ kind: 'event', key: `${line.id}-${String(index)}`, at: Date.parse(line.created_at), actorId: line.actor_id, act })
    })
  }

  entries.push(...dependencyEntries(input.dependsOn, 'blocked-by'), ...dependencyEntries(input.blocks, 'blocking'))
  entries.sort((a, b) => a.at - b.at)

  /* Collapse: the same line twice in a row is one, at its latest time; a
     person's run of one step act is one line naming every step. */
  const merged: Entry[] = []
  for (const entry of entries) {
    const last = merged.at(-1)
    if (entry.kind === 'event' && last?.kind === 'event' && last.actorId === entry.actorId) {
      if (sameAct(last.act, entry.act)) {
        merged[merged.length - 1] = { ...entry, key: last.key }
        continue
      }
      if (
        last.act.t === 'step' &&
        entry.act.t === 'step' &&
        last.act.action === entry.act.action &&
        entry.at - last.at <= GROUP_MS
      ) {
        const before = last.act.names
        const names = [...before, ...entry.act.names.filter((name) => !before.includes(name))]
        merged[merged.length - 1] = { ...entry, key: last.key, act: { ...entry.act, names } }
        continue
      }
    }
    merged.push(entry)
  }
  return merged
}

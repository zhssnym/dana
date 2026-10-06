// A task's timeline as data: history events and dependency edges, oldest first, each
// history line matched to one act by verb and the server's detail wording. Description
// edits, step reorders, permanent deletion and label events draw no row.
import type { EventLine } from '../../../../shared/events.js'
import type { TaskDependencyEdge } from '../../../../shared/task-dependencies.js'
import type { TaskState } from './state.js'

export type StepAction = 'added' | 'renamed' | 'completed' | 'reopened' | 'removed'

export type Act =
  | { readonly t: 'created' }
  | { readonly t: 'assigned'; readonly who: string }
  | { readonly t: 'self-assigned' }
  | { readonly t: 'unassigned'; readonly who: string }
  | { readonly t: 'date'; readonly field: 'due' | 'start'; readonly to: string | null }
  | { readonly t: 'from-step'; readonly parent: string }
  | { readonly t: 'duplicated'; readonly source: string }
  | { readonly t: 'renamed'; readonly from: string | null; readonly to: string }
  | { readonly t: 'moved' }
  | { readonly t: 'reminder'; readonly set: boolean }
  | { readonly t: 'state'; readonly state: TaskState; readonly reopened: boolean }
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

export type Entry = EventEntry

const GROUP_MS = 10 * 60 * 1000

const ASSIGNED = /^assigned to (.+)$/
const UNASSIGNED = /^unassigned (.+)$/
const DATE_SET = /^set the (due|start) date to (\d{4}-\d{2}-\d{2})$/
const DATE_REMOVED = /^removed the (due|start) date$/
const LABEL = /^(added|removed) the label '(.+)'$/
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
      return from === null ? [{ t: 'created' }, ...assign] : [{ t: 'from-step', parent: from[1] ?? '' }]
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
      return [{ t: 'state', state: 'done', reopened: false }]
    case 'abandoned':
      return [{ t: 'state', state: 'dropped', reopened: false }]
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
      if (LABEL.test(detail)) return []
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
  readonly dependsOn: readonly TaskDependencyEdge[]
  readonly blocks: readonly TaskDependencyEdge[]
  readonly nameOf: (id: string) => string
}): Entry[] {
  const entries: Entry[] = []

  // The title before each line is the previous line's name.
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

  // Collapse repeats into one line at the latest time, and a person's run of one step
  // act into one line naming every step.
  const merged: Entry[] = []
  for (const entry of entries) {
    const last = merged.at(-1)
    if (last !== undefined && last.actorId === entry.actorId) {
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

/*
One event in a task's timeline (M4, copied from the retired Linear issue
page): a small round badge holding the event's icon, then the person in ink,
the phrase muted, the object in ink, and when. A dependency lists its tasks
on the lines under it. Badges stay grey: nothing here takes the accent.
*/
import type { TaskDependencyEdge } from '../../../../shared/task-dependencies.js'
import { formatDate } from '../../../lib/dates.js'
import { agoFor } from '../../../lib/history.js'
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  Copy,
  FolderInput,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from '../../../lib/icons.js'
import { StateMark, taskState } from './state.js'
import type { Act, EventEntry } from './timeline.js'

const ICON = 'size-3.5'

/** GitHub's "blocked" octicon, a ring with a bar; Lucide's CircleMinus, drawn here. */
function Blocked(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={ICON}>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.25 8h5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function badgeOf(act: Act): React.JSX.Element {
  const lucide = { className: ICON, strokeWidth: 1.75, 'aria-hidden': true } as const
  switch (act.t) {
    case 'created':
      return <Plus {...lucide} />
    case 'assigned':
    case 'self-assigned':
    case 'unassigned':
      return <UserRound {...lucide} />
    case 'date':
      return <CalendarDays {...lucide} />
    case 'from-step':
    case 'promoted':
      return <ArrowUpRight {...lucide} />
    case 'duplicated':
      return <Copy {...lucide} />
    case 'renamed':
    case 'other':
      return <Pencil {...lucide} />
    case 'moved':
      return <FolderInput {...lucide} />
    case 'reminder':
      return <Bell {...lucide} />
    case 'state':
      return <StateMark state={act.state} className={ICON} />
    case 'restored-trash':
      return <RotateCcw {...lucide} />
    case 'trashed':
      return <Trash2 {...lucide} />
    case 'step':
      return act.action === 'completed' ? <Check {...lucide} /> : <ListChecks {...lucide} />
    case 'blocked-by':
    case 'blocking':
      return <Blocked />
  }
}

const INK = 'font-section text-foreground [overflow-wrap:anywhere]'

function names(list: readonly string[]): React.ReactNode {
  const shown = list.slice(0, 3)
  const more = list.length - shown.length
  return (
    <>
      {shown.map((name, index) => (
        <span key={`${name}-${String(index)}`}>
          <span className={INK}>{name}</span>
          {index === shown.length - 1 ? '' : more === 0 && index === shown.length - 2 ? ' and ' : ', '}
        </span>
      ))}
      {more > 0 ? ` and ${String(more)} more` : null}
    </>
  )
}

/** The words after the person. */
function phraseOf(act: Act): React.ReactNode {
  switch (act.t) {
    case 'created':
      return 'created this'
    case 'assigned':
      return (
        <>
          assigned <span className={INK}>{act.who}</span>
        </>
      )
    case 'self-assigned':
      return 'self-assigned this'
    case 'unassigned':
      return (
        <>
          unassigned <span className={INK}>{act.who}</span>
        </>
      )
    case 'date':
      return act.to === null ? (
        `removed the ${act.field} date`
      ) : (
        <>
          set the {act.field} date to <span className={INK}>{formatDate(act.to, new Date().toISOString().slice(0, 10))}</span>
        </>
      )
    case 'from-step':
      return (
        <>
          made this from a subtask of <span className={INK}>{act.parent}</span>
        </>
      )
    case 'duplicated':
      return (
        <>
          duplicated this from <span className={INK}>{act.source}</span>
        </>
      )
    case 'renamed':
      return act.from === null ? (
        <>
          changed the title to <span className={INK}>{act.to}</span>
        </>
      ) : (
        <>
          changed the title <del className="[overflow-wrap:anywhere]">{act.from}</del> <span className={INK}>{act.to}</span>
        </>
      )
    case 'moved':
      return 'moved this to another page'
    case 'reminder':
      return act.set ? 'set a reminder' : 'removed the reminder'
    case 'state':
      return act.reopened ? 'reopened this' : act.state === 'done' ? 'marked this done' : 'dropped this'
    case 'restored-trash':
      return 'restored this from Trash'
    case 'trashed':
      return 'moved this to Trash'
    case 'step': {
      const one = act.names.length === 1
      const verb = act.action === 'renamed' ? 'renamed' : act.action
      if (act.action === 'renamed') {
        return one ? (
          <>
            renamed a subtask to <span className={INK}>{act.names[0]}</span>
          </>
        ) : (
          <>renamed {act.names.length} subtasks</>
        )
      }
      return (
        <>
          {verb} {one ? 'the subtask' : 'the subtasks'} {names(act.names)}
        </>
      )
    }
    case 'promoted':
      return 'turned a subtask into a task'
    case 'blocked-by':
      return 'marked this blocked by'
    case 'blocking':
      return (
        <>
          marked this as blocking{' '}
          {act.edges.length === 1 ? null : <span className={INK}>{act.edges.length} tasks</span>}
        </>
      )
    case 'other':
      return act.text
  }
}

function LinkedTask(props: {
  readonly edge: TaskDependencyEdge
  readonly folderId: string
  readonly onOpen: (taskId: string, folderId: string) => void
}): React.JSX.Element {
  const { edge } = props
  if (edge.task === null) {
    return <li className="flex items-center gap-1.5 text-xs text-muted-foreground">A task you can't see</li>
  }
  const task = edge.task
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-xs">
      <StateMark state={taskState(task)} className="size-3.5" />
      <button
        type="button"
        onClick={() => props.onOpen(task.id, task.folder.id)}
        className="min-w-0 truncate rounded-sm text-sm text-foreground underline-offset-2 hover:underline"
      >
        {task.title}
      </button>
      {task.folder.id === props.folderId ? null : <span className="shrink-0 text-muted-foreground">· {task.folder.name}</span>}
    </li>
  )
}

export function EventRow(props: {
  readonly entry: EventEntry
  readonly person: (id: string | null) => { readonly name: string }
  readonly folderId: string
  readonly onOpenTask: (taskId: string, folderId: string) => void
}): React.JSX.Element {
  const { entry } = props
  const { act } = entry
  const actor = props.person(entry.actorId)
  const edges = act.t === 'blocked-by' || act.t === 'blocking' ? act.edges : []
  const at = new Date(entry.at)
  return (
    <div data-event={act.t} className="flex min-w-0 flex-col gap-1 px-2 py-1.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="flex w-8 shrink-0 justify-center">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
          >
            {badgeOf(act)}
          </span>
        </span>
        {/* Inline flow, not flex: a long line wraps as a sentence does. */}
        <p className="min-w-0 pt-0.5 text-sm leading-5 text-muted-foreground">
          <span className="font-section text-foreground">{actor.name}</span> {phraseOf(act)}
          {' · '}
          <time dateTime={at.toISOString()} title={at.toLocaleString()} className="whitespace-nowrap">
            {agoFor(entry.at)}
          </time>
        </p>
      </div>
      {edges.length > 0 && (
        <ul role="list" className="flex flex-col gap-1 pl-10.5">
          {edges.map((edge) => (
            <LinkedTask key={edge.id} edge={edge} folderId={props.folderId} onOpen={props.onOpenTask} />
          ))}
        </ul>
      )}
    </div>
  )
}

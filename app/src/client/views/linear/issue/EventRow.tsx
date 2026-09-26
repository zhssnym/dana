/*
One timeline event, GitHub's shape (RESEARCH-ISSUE 3.2, 3.5): a round badge
on the line holding the event's icon, then the face, the person in ink, the
phrase muted, the object in ink, and when. A dependency lists its tasks on
the lines under it. Badges stay unfilled: only the open state mark takes the
accent.
*/
import type { TaskDependencyEdge } from '../../../../shared/task-dependencies.js'
import { Face } from '../../../components/person-face.js'
import type { Person } from '../../../components/person-face.js'
import { agoFor } from '../../../lib/history.js'
import {
  ArrowUpRight,
  Bell,
  Check,
  Copy,
  FolderInput,
  ListChecks,
  Pencil,
  RotateCcw,
  Trash2,
  UserRound,
} from '../../../lib/icons.js'
import { StateMark } from '../IssueParts.js'
import { issueState } from '../issues.js'
import type { Act, EventEntry } from './timeline.js'

const ICON = 'size-4'

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
    case 'assigned':
    case 'self-assigned':
      return <UserRound {...lucide} />
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
    case 'assigned':
      return (
        <>
          assigned <span className={INK}>{act.who}</span>
        </>
      )
    case 'self-assigned':
      return 'self-assigned this'
    case 'from-step':
      return (
        <>
          made this from a step of <span className={INK}>{act.parent}</span>
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
      return act.reopened ? 'reopened this' : act.state === 'completed' ? 'closed this as completed' : 'closed this as not planned'
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
            renamed a step to <span className={INK}>{act.names[0]}</span>
          </>
        ) : (
          <>renamed {act.names.length} steps</>
        )
      }
      return (
        <>
          {verb} {one ? 'the step' : 'the steps'} {names(act.names)}
        </>
      )
    }
    case 'promoted':
      return 'turned a step into a task'
    case 'blocked-by':
      return 'marked this as blocked by'
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
      <StateMark state={issueState(task)} className="size-3.5" />
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
  readonly person: (id: string | null | undefined) => Person
  readonly folderId: string
  readonly onOpenTask: (taskId: string, folderId: string) => void
}): React.JSX.Element {
  const { entry } = props
  const { act } = entry
  const actor = props.person(entry.actorId)
  const edges = act.t === 'blocked-by' || act.t === 'blocking' ? act.edges : []
  const at = new Date(entry.at)
  return (
    <li data-event={act.t} className="relative flex flex-col gap-1 py-2">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground"
        >
          {badgeOf(act)}
        </span>
        {/* Inline flow, not flex: a long line wraps as a sentence does. */}
        <p className="min-w-0 pt-1.5 text-xs leading-5 text-muted-foreground">
          <span className="mr-1 inline-block align-[-3px]">
            <Face person={actor} className="size-4 data-[size=sm]:size-4" />
          </span>
          <span className="font-section text-foreground">{actor.name}</span> {phraseOf(act)}{' '}
          <time dateTime={at.toISOString()} title={at.toLocaleString()} className="whitespace-nowrap">
            {agoFor(entry.at)}
          </time>
        </p>
      </div>
      {edges.length > 0 && (
        <ul role="list" className="flex flex-col gap-1 pl-10">
          {edges.map((edge) => (
            <LinkedTask key={edge.id} edge={edge} folderId={props.folderId} onOpen={props.onOpenTask} />
          ))}
        </ul>
      )}
    </li>
  )
}

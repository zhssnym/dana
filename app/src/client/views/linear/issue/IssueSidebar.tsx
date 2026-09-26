/*
The issue page's sidebar, GitHub's sections in Dana's words (RESEARCH-ISSUE
3.8): Assignee, Labels, Milestone, Dates, Relationships and Participants.
Each section's gear opens the task, where that field is edited; an empty
assignee offers "Assign yourself" to someone who may assign.
*/
import type { TaskDependencies, TaskDependencyEdge } from '../../../../shared/task-dependencies.js'
import type { TaskDetail } from '../../../../shared/tasks.js'
import { Face } from '../../../components/person-face.js'
import type { Person } from '../../../components/person-face.js'
import { cn } from '../../../components/ui/utils.js'
import { formatDay } from '../../../lib/dates.js'
import { Settings } from '../../../lib/icons.js'
import { LabelChip, StateMark } from '../IssueParts.js'
import { issueState, labelsOf } from '../issues.js'

function Section(props: {
  readonly label: string
  readonly onEdit: (() => void) | null
  readonly wide?: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  /* A phone reads the sidebar as a two-column grid above the thread, without rules. */
  return (
    <section
      aria-label={props.label}
      className={cn(
        'flex min-w-0 flex-col gap-1 py-1.5 text-sm md:gap-1.5 md:border-b md:border-border md:py-3 md:first:pt-0 md:last:border-b-0',
        props.wide === true && 'col-span-2',
      )}
    >
      <header className="flex h-6 items-center justify-between text-xs text-muted-foreground">
        <h3 className="font-section">{props.label}</h3>
        {props.onEdit !== null && (
          <button
            type="button"
            aria-label={`Edit ${props.label.toLocaleLowerCase()}`}
            title={`Edit ${props.label.toLocaleLowerCase()}`}
            onClick={props.onEdit}
            className="-mr-1 flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground"
          >
            <Settings className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </header>
      {props.children}
    </section>
  )
}

const MUTED = 'text-muted-foreground'

function Relation(props: {
  readonly label: string
  readonly edges: readonly TaskDependencyEdge[]
  readonly folderId: string
  readonly onOpen: (taskId: string, folderId: string) => void
}): React.JSX.Element | null {
  if (props.edges.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {props.label}
        <span className="rounded-full bg-muted px-1.5 tabular-nums text-foreground">{props.edges.length}</span>
      </p>
      <ul role="list" className="flex flex-col gap-1.5">
        {props.edges.map((edge) =>
          edge.task === null ? (
            <li key={edge.id} className="text-xs text-muted-foreground">
              A task you can't see
            </li>
          ) : (
            <li key={edge.id} className="flex min-w-0 items-start gap-1.5">
              <StateMark state={issueState(edge.task)} className="mt-0.5 size-3.5" />
              <span className="flex min-w-0 flex-col">
                <button
                  type="button"
                  onClick={() => {
                    if (edge.task !== null) props.onOpen(edge.task.id, edge.task.folder.id)
                  }}
                  className="text-left font-section text-foreground underline-offset-2 [overflow-wrap:anywhere] hover:underline"
                >
                  {edge.task.title}
                </button>
                {edge.task.folder.id === props.folderId ? null : (
                  <span className="text-xs text-muted-foreground">{edge.task.folder.name}</span>
                )}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

export function IssueSidebar(props: {
  readonly detail: TaskDetail
  readonly folderId: string
  readonly today: string
  readonly milestone: string | null
  readonly dependencies: TaskDependencies | undefined
  readonly participants: readonly Person[]
  readonly person: (id: string | null | undefined) => Person
  /** Null when the viewer may not assign. */
  readonly onAssignMe: (() => void) | null
  readonly onEdit: (() => void) | null
  readonly onOpenTask: (taskId: string, folderId: string) => void
}): React.JSX.Element {
  const { detail, today, onEdit } = props
  const labels = labelsOf(detail)
  const dependsOn = props.dependencies?.depends_on ?? []
  const blocks = props.dependencies?.blocks ?? []
  const assignee = detail.assignee === null ? null : props.person(detail.assignee.id)

  return (
    <div className="grid grid-cols-2 gap-x-4 md:flex md:flex-col">
      <Section label="Assignee" onEdit={onEdit}>
        {assignee === null ? (
          <p className={MUTED}>
            No one
            {props.onAssignMe !== null && (
              <>
                {' – '}
                <button
                  type="button"
                  onClick={props.onAssignMe}
                  className="rounded-sm text-foreground underline underline-offset-2 hover:text-primary"
                >
                  Assign yourself
                </button>
              </>
            )}
          </p>
        ) : (
          <p className="flex min-w-0 items-center gap-2">
            <Face person={assignee} className="size-5 data-[size=sm]:size-5" />
            <span className="min-w-0 truncate text-foreground">{assignee.name}</span>
          </p>
        )}
      </Section>
      <Section label="Labels" onEdit={onEdit}>
        {labels.length === 0 ? (
          <p className={MUTED}>None</p>
        ) : (
          <p className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <LabelChip key={label.id} name={label.name} color={label.color} />
            ))}
          </p>
        )}
      </Section>
      <Section label="Milestone" onEdit={onEdit}>
        <p className={cn('min-w-0 truncate', props.milestone === null ? MUTED : 'text-foreground')}>
          {props.milestone ?? 'No milestone'}
        </p>
      </Section>
      <Section label="Dates" onEdit={onEdit}>
        {detail.start_date === null && detail.due_date === null ? (
          <p className={MUTED}>No dates</p>
        ) : (
          <p className="flex flex-col text-foreground">
            {detail.start_date === null ? null : <span>Starts {formatDay(detail.start_date, today)}</span>}
            {detail.due_date === null ? null : <span>Due {formatDay(detail.due_date, today)}</span>}
          </p>
        )}
      </Section>
      {dependsOn.length + blocks.length > 0 && (
        <Section label="Relationships" onEdit={onEdit} wide>
          <Relation label="Blocked by" edges={dependsOn} folderId={props.folderId} onOpen={props.onOpenTask} />
          <Relation label="Blocking" edges={blocks} folderId={props.folderId} onOpen={props.onOpenTask} />
        </Section>
      )}
      <Section label="Participants" onEdit={null} wide>
        <p className="flex flex-wrap -space-x-1">
          {props.participants.map((person, index) => (
            <span key={`${person.name}-${String(index)}`} title={person.name} className="rounded-full ring-2 ring-background">
              <Face person={person} className="size-5 data-[size=sm]:size-5" />
            </span>
          ))}
        </p>
      </Section>
    </div>
  )
}

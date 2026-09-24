/*
The Linear view of a page's tasks: the list's order as one path you can write
in. Each step is a node on a thin thread down the left gutter; sections are
diamond milestones on the same thread with their "n of m" done.

**Writing.** A step's title is text you type in (Enter or leaving saves, Esc
reverts); "Open" opens it; the node completes or reopens it; "New step" at the
foot adds one at the end of the path, keeping the caret for the next.

**Linking.** Steps are not joined just because they are neighbours. Between two
steps the thread is a faint dotted line until someone links them with the
small button on the thread; a link means the lower step waits for the upper
one, and it is the existing task dependency (7.25), read for the whole page in
one request and written with the dependency endpoints. A linked stretch is a
solid line, in the accent once the upper step is done - the flow has passed
through it. A dependency between steps that are not neighbours is not drawn;
the step says "after <title>".

Nothing moves on its own: the link button and "Open" fade in on hover or when
the step has focus (on a touch screen, tapping a step shows them), and a
node that turns done draws its check in 150ms.
*/
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Unlink2 } from 'lucide-react'
import { cn } from '../components/ui/utils.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { Face } from '../components/person-face.js'
import { getPlain } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import {
  useAddTaskDependency,
  useCreateTask,
  useRemoveTaskDependency,
  useUpdateTask,
} from '../api/mutations.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { getFolderDependenciesResponse } from '../../shared/task-dependencies.js'
import { lastSectionId, sectionProgress, threadJoints, threadRows } from './linear/thread.js'
import { StepTitle } from './linear/StepTitle.js'
import { NewStep } from './linear/NewStep.js'
import styles from './LinearView.module.css'
import type { Joint, Segment } from './linear/thread.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

/*
Geometry. A task row is 40px with its node centred (20px down). A section row
is 56px: 16px of air, then a 40px line, so its node sits 36px down; the first
row of the list skips the air. The thread's two halves meet at those centres.
*/
const THREAD = 'pointer-events-none absolute left-3 w-0.5 -translate-x-1/2'
const MOTION = 'duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
const SEGMENT: Record<Segment, string> = {
  reached: 'bg-primary',
  linked: 'bg-quiet-foreground/70',
  loose: styles.loose ?? '',
}

function Half(props: { readonly segment: Segment | null; readonly place: string }): React.JSX.Element | null {
  if (props.segment === null) return null
  return (
    <span
      aria-hidden
      className={cn(THREAD, 'transition-colors', MOTION, props.place, SEGMENT[props.segment])}
    />
  )
}

export function LinearView(props: {
  readonly folderId: string
  readonly page: PageView
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const { folderId, page, tasks, completed, showCompleted, today, context, actions } = props
  const cache = useQueryClient()
  const create = useCreateTask()
  const update = useUpdateTask()
  const link = useAddTaskDependency()
  const unlink = useRemoveTaskDependency()

  const dependencies = useQuery({
    queryKey: queryKeys.folderDependencies(folderId),
    queryFn: () =>
      getPlain(getFolderDependenciesResponse, `/folders/${encodeURIComponent(folderId)}/dependencies`),
  })

  const rows = useMemo(
    () => threadRows(page, tasks, completed, showCompleted),
    [page, tasks, completed, showCompleted],
  )
  const progress = useMemo(() => sectionProgress(rows), [rows])
  const { byRow, after } = useMemo(
    () => threadJoints(rows, dependencies.data?.dependencies ?? []),
    [rows, dependencies.data],
  )
  /* A link click answers at once; the stored edge catches up behind it. */
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [refusal, setRefusal] = useState<string | null>(null)
  /* Tasks already done when the view opened keep a still check; only one
     that turns done here draws it, so the motion answers the click. */
  const [doneAtOpen] = useState(
    () => new Set([...tasks, ...completed].filter((t) => t.status === 'completed').map((t) => t.id)),
  )

  const isLinked = (joint: Joint): boolean => pending.get(joint.lower.id) ?? joint.edgeId !== null
  const segmentOf = (joint: Joint): Segment => {
    if (!isLinked(joint)) return 'loose'
    return joint.upper.status === 'completed' ? 'reached' : 'linked'
  }

  const settle = (lowerId: string): void => {
    void cache
      .refetchQueries({ queryKey: queryKeys.folderDependencies(folderId) })
      .finally(() => {
        setPending((map) => {
          const next = new Map(map)
          next.delete(lowerId)
          return next
        })
      })
  }

  const toggleLink = (joint: Joint): void => {
    const linked = isLinked(joint)
    setRefusal(null)
    setPending((map) => new Map(map).set(joint.lower.id, !linked))
    if (linked) {
      if (joint.edgeId === null) {
        settle(joint.lower.id)
        return
      }
      unlink.mutate(
        { taskId: joint.lower.id, dependencyId: joint.edgeId },
        { onSettled: () => settle(joint.lower.id) },
      )
      return
    }
    link.mutate(
      { dependentId: joint.lower.id, blockingId: joint.upper.id },
      {
        onError: () => {
          setRefusal(
            `Could not link “${joint.lower.title}” to “${joint.upper.title}”: one already waits for the other.`,
          )
        },
        onSettled: () => settle(joint.lower.id),
      },
    )
  }

  const rename = (task: TaskCard, title: string): void => {
    const before = task.title
    update.mutate({ id: task.id, body: { title } })
    pushUndo(undoLabel('Renamed', before), () => {
      update.mutate({ id: task.id, body: { title: before } })
    })
  }

  const section = lastSectionId(rows)
  const addStep = (title: string): void => {
    create.mutate({
      title,
      folder_id: folderId,
      ...(section === null ? {} : { section_block_id: section }),
    })
  }

  const currentIndex = rows.findIndex(
    (row) => row.kind === 'task' && row.task.status === 'pending',
  )
  const rowContext: RowContext = { ...context, today }
  /* The stretch above a row, and below it, as the thread draws them. */
  const above = (index: number): Segment | null => {
    const joint = byRow.get(index)
    return joint !== undefined ? segmentOf(joint) : index > 0 ? 'loose' : null
  }
  const below = (index: number): Segment => {
    const joint = byRow.get(index + 1)
    return joint !== undefined ? segmentOf(joint) : 'loose'
  }

  return (
    <div className="pb-2">
      <ol role="list" aria-label="Steps" className="flex flex-col">
        {rows.map((row, index) => {
          /* A section opening the list has no air above it. */
          const tall = row.kind === 'section' && index > 0
          const line = (
            <>
              <Half segment={above(index)} place={cn('top-0', tall ? 'h-9' : 'h-5')} />
              <Half segment={below(index)} place={cn('bottom-0', tall ? 'top-9' : 'top-5')} />
            </>
          )

          if (row.kind === 'section') {
            const counts = progress.get(row.id)
            const complete = counts !== undefined && counts.total > 0 && counts.done === counts.total
            return (
              <li key={`s:${row.id}`} role="listitem" className={cn('relative', tall && 'pt-4')}>
                {line}
                <div className="flex h-10 items-center gap-2">
                  <span className="relative flex w-6 shrink-0 justify-center" aria-hidden>
                    <span
                      className={cn(
                        'size-3 rotate-45 rounded-xs border-2 bg-background transition-colors',
                        MOTION,
                        complete ? 'border-primary bg-primary' : 'border-quiet-foreground',
                      )}
                    />
                  </span>
                  <h3 className="min-w-0 truncate px-1.5 text-base leading-6 font-semibold text-foreground">
                    {row.name}
                  </h3>
                  {counts !== undefined && counts.total > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {counts.done} of {counts.total}
                    </span>
                  )}
                </div>
              </li>
            )
          }

          const task = row.task
          const done = task.status === 'completed'
          const abandoned = task.status === 'abandoned'
          const current = index === currentIndex
          const upcoming = !done && !abandoned && !current
          const display = taskRowDisplay(task, rowContext)
          const reopen = done || abandoned
          const joint = byRow.get(index)
          const linked = joint !== undefined && isLinked(joint)
          const waits = after.get(task.id) ?? []

          return (
            <li
              key={`t:${row.id}`}
              role="listitem"
              aria-current={current ? 'step' : undefined}
              className={cn(
                'group/step relative flex h-10 items-center gap-2 rounded-md pr-1.5 transition-colors hover:bg-muted/60',
                MOTION,
              )}
            >
              {line}
              {joint !== undefined && (
                <button
                  type="button"
                  aria-pressed={linked}
                  aria-label={
                    linked
                      ? `Unlink “${task.title}” from “${joint.upper.title}”`
                      : `Link “${task.title}” to “${joint.upper.title}”`
                  }
                  title={linked ? 'Unlink: this step stops waiting for the one above' : 'Link: this step waits for the one above'}
                  onClick={() => toggleLink(joint)}
                  /* A 28px hit target around the 20px mark: easy to hit, no
                     bigger to look at. Hidden, it takes no clicks, so it never
                     steals the edge of a neighbouring node. */
                  className={cn(
                    'group/link absolute top-0 left-3 z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none',
                    'pointer-events-none opacity-0 transition-[opacity]',
                    MOTION,
                    'group-hover/step:pointer-events-auto group-hover/step:opacity-100 group-focus-within/step:pointer-events-auto group-focus-within/step:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 items-center justify-center rounded-full border bg-background transition-[color,border-color]',
                      MOTION,
                      linked
                        ? 'border-primary/50 text-primary group-hover/link:border-primary'
                        : 'border-border text-muted-foreground group-hover/link:border-quiet-foreground group-hover/link:text-foreground',
                    )}
                  >
                    {linked ? <Unlink2 className="size-3" aria-hidden /> : <Link2 className="size-3" aria-hidden />}
                  </span>
                </button>
              )}
              <button
                type="button"
                aria-label={`${reopen ? 'Reopen' : 'Complete'} ${task.title}`}
                onClick={() => (abandoned ? actions.onRestore(task) : actions.onToggleComplete(task))}
                className="group/node relative flex size-6 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex items-center justify-center rounded-full transition-[background-color,border-color,box-shadow]',
                    MOTION,
                    done && 'size-4 bg-primary',
                    current &&
                      'size-4 border-2 border-primary bg-background ring-4 ring-primary/15 group-hover/step:ring-primary/25',
                    upcoming && 'size-3 border-2 border-quiet-foreground bg-background group-hover/node:border-primary',
                    abandoned && 'size-2.5 bg-quiet-foreground/60',
                  )}
                >
                  {done && (
                    <svg viewBox="0 0 12 12" className="size-2.5 text-primary-foreground">
                      <path
                        d="M2.5 6.2 5 8.6 9.6 3.6"
                        pathLength={1}
                        className={cn(styles.check, !doneAtOpen.has(task.id) && styles.drawn)}
                      />
                    </svg>
                  )}
                </span>
              </button>
              <StepTitle
                title={task.title}
                onRename={(title) => rename(task, title)}
                className={cn(
                  current && 'font-medium text-foreground',
                  done && 'text-muted-foreground',
                  abandoned && 'text-muted-foreground line-through',
                  upcoming && 'text-foreground',
                )}
              />
              {waits.length > 0 && (
                <span className="max-w-40 shrink truncate text-xs text-muted-foreground">
                  after {waits.map((t) => t.title).join(', ')}
                </span>
              )}
              {display.due !== undefined && (
                /* Late reads as it does on Today and in the list: red, and
                   said, since colour alone is not. */
                <span
                  className={cn(
                    'shrink-0 text-xs tabular-nums',
                    display.due.overdue === true ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {display.due.overdue === true ? <span className="sr-only">Overdue, </span> : null}
                  {display.due.label}
                </span>
              )}
              {display.assignee !== undefined && (
                <span className="flex shrink-0 items-center" title={display.assignee.name}>
                  <Face person={display.assignee} className="size-5 data-[size=sm]:size-5" />
                </span>
              )}
              <button
                type="button"
                onClick={() => actions.onOpenTask(task)}
                aria-label={`Open ${task.title}`}
                className={cn(
                  'h-6 shrink-0 rounded-sm px-1.5 text-xs text-muted-foreground outline-none',
                  'opacity-0 transition-[opacity,background-color,color]',
                  MOTION,
                  'group-hover/step:opacity-100 group-focus-within/step:opacity-100 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                Open
              </button>
            </li>
          )
        })}
        <NewStep onCreate={addStep}>
          {rows.length > 0 && <Half segment={below(rows.length - 1)} place="top-0 h-5" />}
        </NewStep>
      </ol>
      {refusal !== null && (
        <p role="status" className="px-8 pt-1 text-xs text-muted-foreground">
          {refusal}
        </p>
      )}
    </div>
  )
}

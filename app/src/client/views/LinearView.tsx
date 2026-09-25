/*
The Linear view: the page's tasks as GitHub Issues (m2 ghissues; scratchpad
m2/ghissues/DESIGN.md). Open and Closed tabs; Open groups the tasks by
milestone (the page's sections) in page order, Closed lists finished and not
planned work newest first. A row is the issue line: state mark, title, labels,
"Opened … by …", comment count and the shared task meta (date, subtasks,
repeat, assignee, star). Choosing a row opens the task as an issue in place
(`?issue=<id>`, so Back returns here): `linear/IssuePage.tsx`.

Keys are the rows' shared contract (`row-keys.ts`): arrows move, Enter opens,
Space closes or reopens. Each milestone ends with a line that adds a task to
it; the last line adds one outside every milestone, or with "/" a milestone.
*/
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useFolderCompletedTasks, mergeCompletedDays } from '../api/queries.js'
import { Tabs } from '../components/ui/tabs.js'
import { cn } from '../components/ui/utils.js'
import { taskRowDisplay } from '../parts/presenters.js'
import { RowMeta } from '../components/task-meta.js'
import { formatDayInline } from '../lib/dates.js'
import { agoFor } from '../lib/history.js'
import { useRowKeys } from '../components/row-keys.js'
import { Composer } from './linear/Composer.js'
import { useLineWriter } from './linear/document.js'
import { IssuePage } from './linear/IssuePage.js'
import { CommentCount, LabelChip, StateMark } from './linear/IssueParts.js'
import { issueState, labelsOf, openGroups, STATE_WORD, useCommentCounts, usePeople } from './linear/issues.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'

const MOTION = 'duration-[var(--duration-base)] ease-[var(--ease-standard)] motion-reduce:transition-none'
const QUIET_ACTION =
  'h-6 shrink-0 rounded-sm px-1.5 text-xs text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground'

type Tab = 'open' | 'closed'

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
  const { folderId, page, tasks, today, context, actions } = props
  const [search, setSearch] = useSearchParams()
  const issueId = search.get('issue')
  const [tab, setTab] = useState<Tab>('open')
  const writer = useLineWriter(folderId)
  const done = useFolderCompletedTasks(folderId, true)
  const counts = useCommentCounts(folderId)
  const person = usePeople(folderId)
  const keys = useRowKeys<HTMLDivElement>()

  const openIssue = (task: Pick<TaskCard, 'id'>): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.set('issue', task.id)
      return next
    })
  }
  const closeIssue = (): void => {
    setSearch((current) => {
      const next = new URLSearchParams(current)
      next.delete('issue')
      return next
    })
  }

  /* Closed, newest first: finished work by the day it was finished, with not
     planned work (which has no finishing day) placed by its last change. */
  const closed = useMemo(() => {
    const rows: { task: TaskCard; day: string; date: string | null }[] = []
    const seen = new Set<string>()
    for (const day of mergeCompletedDays(done.data?.pages)) {
      for (const task of day.rows) {
        if (seen.has(task.id)) continue
        seen.add(task.id)
        rows.push({ task, day: day.date, date: day.date })
      }
    }
    for (const task of tasks) {
      if (task.status !== 'abandoned' || seen.has(task.id)) continue
      rows.push({ task, day: task.updated_at.slice(0, 10), date: null })
    }
    return rows.sort((a, b) => b.day.localeCompare(a.day) || b.task.updated_at.localeCompare(a.task.updated_at))
  }, [done.data, tasks])
  const closedTasks = useMemo(() => closed.map((row) => row.task), [closed])
  const groups = useMemo(() => openGroups(page, tasks, closedTasks), [page, tasks, closedTasks])

  if (issueId !== null) {
    return (
      <IssuePage
        key={issueId}
        taskId={issueId}
        folderId={folderId}
        page={page}
        today={today}
        actions={actions}
        onBack={closeIssue}
      />
    )
  }

  const rowContext: RowContext = { ...context, today }
  const toggle = (task: TaskCard): void =>
    task.status === 'abandoned' ? actions.onRestore(task) : actions.onToggleComplete(task)

  const byline = (task: TaskCard, date: string | null): string => {
    const state = issueState(task)
    if (state === 'completed') return date === null ? 'Closed' : `Closed ${formatDayInline(date, today)}`
    if (state === 'not-planned') return `Closed as not planned ${agoFor(Date.parse(task.updated_at))}`
    const who = task.created_by === null ? '' : ` by ${person(task.created_by.id).name}`
    return `Opened ${agoFor(Date.parse(task.created_at))}${who}`
  }

  const row = (task: TaskCard, date: string | null = null): React.JSX.Element => {
    const state = issueState(task)
    /* A closed row's dates are over; its byline says when it closed. */
    const { steps, due, starts, ...rest } = taskRowDisplay(task, rowContext)
    const display = state === 'open' ? { ...rest, ...(due === undefined ? {} : { due }), ...(starts === undefined ? {} : { starts }) } : rest
    const labels = labelsOf(task)
    return (
      <li key={task.id} className="group/row">
        <div
          data-row-key=""
          data-task-id={task.id}
          onClick={() => openIssue(task)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter') {
              event.preventDefault()
              openIssue(task)
            } else if (event.key === ' ') {
              event.preventDefault()
              toggle(task)
            }
          }}
          className={cn(
            'flex min-h-[var(--row-height)] cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/60',
            MOTION,
          )}
        >
          <span className="flex h-5 items-center" title={STATE_WORD[state]}>
            <StateMark state={state} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={(event) => {
                  event.stopPropagation()
                  openIssue(task)
                }}
                className={cn(
                  'min-w-0 truncate text-left text-sm font-section leading-5 hover:underline',
                  state === 'open' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {task.title}
              </button>
              {labels.map((label) => (
                <LabelChip key={label.id} name={label.name} color={label.color} />
              ))}
            </div>
            <p className="truncate text-xs leading-4 text-muted-foreground">{byline(task, date)}</p>
          </div>
          <div className="flex h-5 shrink-0 items-center gap-3">
            <CommentCount count={counts.get(task.id)} />
            <RowMeta
              className="shrink-0"
              source={{
                ...display,
                ...(steps === undefined ? {} : { steps: { done: steps.complete, total: steps.total } }),
              }}
              onToggleImportant={() => actions.onToggleImportant(task)}
            />
          </div>
        </div>
      </li>
    )
  }

  const addTo = (section: string | null) => (kind: string, text: string): void => {
    if (kind === 'milestone') void writer.write({ op: 'add_milestone', name: text })
    else void writer.write({ op: 'add_step', title: text, section })
  }

  return (
    <div ref={keys} className="pb-2">
      <Tabs
        label="Issues"
        value={tab}
        onValueChange={setTab}
        className="mb-2"
        items={[
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ]}
      />

      {tab === 'open' ? (
        <div role="tabpanel" aria-label="Open" className="flex flex-col">
          {groups.map((group) => (
            <section
              key={group.id ?? 'none'}
              aria-label={group.name ?? 'No milestone'}
              className="mb-[var(--space-group)]"
            >
              {group.name !== null && (
                <h3 className="flex h-[var(--row-height)] items-center gap-2 px-1.5 text-sm font-section text-foreground">
                  <span aria-hidden className="flex size-4 items-center justify-center">
                    <span className="size-2.5 rotate-45 rounded-xs border-[1.5px] border-muted-foreground" />
                  </span>
                  <span className="min-w-0 truncate">{group.name}</span>
                </h3>
              )}
              <ul role="list" className="flex flex-col gap-[var(--space-row)]">
                {group.tasks.map((task) => row(task))}
              </ul>
              {group.id === null ? null : (
                <Composer
                  variant="line"
                  kinds={['step']}
                  label={`New task in ${group.name ?? 'this milestone'}`}
                  placeholder="New task"
                  onSubmit={addTo(group.id)}
                  onImage={() => undefined}
                />
              )}
            </section>
          ))}
          {groups.length === 0 && <p className="px-1.5 py-1.5 text-sm text-muted-foreground">No open tasks</p>}
          <Composer
            variant="line"
            kinds={['step', 'milestone']}
            label="New task"
            placeholder="New task, or type / for a milestone"
            onSubmit={addTo(null)}
            onImage={() => undefined}
          />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Closed">
          {closed.length === 0 && !done.isPending ? (
            <p className="px-1.5 py-1.5 text-sm text-muted-foreground">Nothing closed yet</p>
          ) : (
            <ul role="list" className="flex flex-col gap-[var(--space-row)]">
              {closed.map(({ task, date }) => row(task, date))}
            </ul>
          )}
          {done.hasNextPage && (
            <button type="button" onClick={() => void done.fetchNextPage()} className={cn(QUIET_ACTION, 'mt-1 ml-1')}>
              Show more
            </button>
          )}
        </div>
      )}
    </div>
  )
}

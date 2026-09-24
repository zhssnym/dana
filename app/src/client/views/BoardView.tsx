/*
The page's Board view (round 2): the tasks inside a page, drawn as three
status columns — Not started · In progress · Done — rather than grouped by a
place's axis the way `views/TaskBoard.tsx` groups them.

**Geometry there, meaning here**, the same split `views/TaskBoard.tsx` keeps:
`components/task-board.tsx` owns the columns and reports which one a card was
released over, and this file says what landing there means. Here it means a
status, and every status write goes through the page's own acts
(`onToggleComplete`, `onRestore`, `onMoveToColumn`), so the series confirm and
the undo bar reach a drop exactly as they reach a row's box.

**One rule and one order with Linear** (round 5): a column is a stage
(`linear/stage.ts`: future, present, past), and each column lists its cards in
the order Linear lists the same steps — the queue by milestone and page order,
the present overdue first then by start, the past by when it was finished.
"Show completed" off empties Done, as it hides Linear's past; Done still takes
a drop.

**Not started and In progress end with "New task"** (hover, touch, and an
empty column show it), and a task added there lands in that column: Not
started is a plain create, In progress starts it today. Done has none: nobody
creates a task in order to finish it. The columns are the status, so cards
carry no completion box.
*/
import { useMemo } from 'react'
import { BoardQuickAdd, TaskBoard as PrototypeBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask, BoardTone } from '../components/task-board.js'
import { useCreateTask } from '../api/mutations.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { PageView } from '../../shared/pages.js'
import type { TaskCard } from '../../shared/tasks.js'
import { futureMilestones, pageRank, pastOrder, presentOrder, stageOf, startDay } from './linear/stage.js'
import type { Stage } from './linear/stage.js'

export type BoardStatus = 'not_started' | 'in_progress' | 'done'

const COLUMNS: readonly {
  readonly key: BoardStatus
  readonly label: string
  readonly tone: BoardTone
}[] = [
  { key: 'not_started', label: 'Not started', tone: 'grey' },
  { key: 'in_progress', label: 'In progress', tone: 'blue' },
  { key: 'done', label: 'Done', tone: 'green' },
]

const COLUMN_OF: Record<Stage, BoardStatus> = {
  future: 'not_started',
  present: 'in_progress',
  past: 'done',
}

/** Which column a task sits in: its stage (`linear/stage.ts`), by name. */
export function boardStatusOf(task: TaskCard, today: string): BoardStatus {
  return COLUMN_OF[stageOf(task, today)]
}

export function BoardView({
  folderId,
  page,
  tasks,
  completed,
  showCompleted,
  today,
  context,
  actions,
}: {
  /* The page new tasks are added to. */
  readonly folderId: string
  /* Its document, for the order Linear uses; absent while it loads. */
  readonly page: PageView | undefined
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const create = useCreateTask()

  const ordered = useMemo((): Record<BoardStatus, readonly TaskCard[]> => {
    const rank = page === undefined ? new Map<string, number>() : pageRank(page)
    const notStarted =
      page === undefined
        ? tasks.filter((task) => stageOf(task, today) === 'future')
        : futureMilestones(page, tasks, completed, today, rank).flatMap((group) => group.tasks)
    const done = showCompleted
      ? pastOrder(
          completed.map((task) => ({ task })),
          tasks.filter((task) => task.status === 'abandoned').map((task) => ({ task })),
        ).map((row) => row.task)
      : []
    return { not_started: notStarted, in_progress: presentOrder(tasks, today, rank), done }
  }, [page, tasks, completed, showCompleted, today])

  const byId = new Map([...tasks, ...completed].map((task) => [task.id, task]))

  function add(title: string, status: BoardStatus): void {
    create.mutate({
      title,
      folder_id: folderId,
      ...(status === 'in_progress' ? { start_date: today } : {}),
    })
  }

  const mapped: BoardColumn[] = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tone: column.tone,
    /* Finished cards strike through and drop their details: the board's own
       contract for its `done` flag, as `views/TaskBoard.tsx` sets it. */
    ...(column.key === 'done' ? { done: true, quiet: true } : {}),
    tasks: ordered[column.key].map(
      (task): BoardTask => ({
        ...taskRowDisplay(task, context),
        id: task.id,
      }),
    ),
  }))

  return (
    <PrototypeBoard
      columns={mapped}
      grid="grid-cols-1 sm:grid-cols-3"
      onOpenTask={(taskId) => {
        const task = byId.get(taskId)
        if (task !== undefined) actions.onOpenTask(task)
      }}
      onToggleComplete={(taskId) => {
        const task = byId.get(taskId)
        if (task === undefined) return
        /* An abandoned card's control restores it (9.5), as on the row. */
        if (task.status === 'abandoned') actions.onRestore(task)
        else actions.onToggleComplete(task)
      }}
      onToggleImportant={(taskId) => {
        const task = byId.get(taskId)
        if (task !== undefined) actions.onToggleImportant(task)
      }}
      onDropIn={(taskId, columnKey) => {
        const task = byId.get(taskId)
        if (task === undefined) return false
        const from = boardStatusOf(task, today)
        if (columnKey === from) return false

        if (columnKey === 'done') {
          if (task.status !== 'pending') return false
          actions.onToggleComplete(task)
          return true
        }
        if (columnKey !== 'not_started' && columnKey !== 'in_progress') return false

        /* Carrying a card out of Done reopens it first: an abandoned one is
           restored, a completed one uncompleted. */
        if (task.status === 'abandoned') actions.onRestore(task)
        else if (task.status === 'completed') actions.onToggleComplete(task)

        const started = stageOf({ status: 'pending', start_date: task.start_date }, today) === 'present'
        if (columnKey === 'in_progress') {
          if (!started) actions.onMoveToColumn(task, { start_date: startDay(task, today) })
          return true
        }
        if (started) actions.onMoveToColumn(task, { start_date: null })
        return true
      }}
      checkbox={false}
      quickAdd={(column) =>
        column.key === 'done' ? null : (
          <BoardQuickAdd
            label={`New task in ${column.label}`}
            onAdd={(title) => add(title, column.key as BoardStatus)}
          />
        )
      }
    />
  )
}

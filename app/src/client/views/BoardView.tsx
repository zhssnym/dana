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

**Done keeps its cards.** A board whose Done column is empty is a board that
looks like nothing was ever finished, so completed cards always show there;
abandoned ones join them only when the page shows completed work, which is
where 9.5 keeps them reachable.

**Every column ends with "New task"** (round 3; round 4 shows it on hover, on touch, and in an empty column), and a task added there lands
in that column: Not started is a plain create, In progress starts it today (the
board's own rule below), Done creates it and then completes it. The words are
"New task", not Notion's "New page": in Dana a page is a document and this row
makes a task. The columns are the status, so cards carry no completion box.
*/
import { BoardQuickAdd, TaskBoard as PrototypeBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask, BoardTone } from '../components/task-board.js'
import { useCreateTask, useTransitionTask } from '../api/mutations.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { TaskCard } from '../../shared/tasks.js'

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

/**
 * Which column a task sits in. Derived until e4's server In-progress field
 * lands; swap this one function: a pending task that has started (a start
 * date on or before today) is In progress, any other pending task is Not
 * started, and a finished one — completed or abandoned — is Done.
 */
export function boardStatusOf(task: TaskCard, today: string): BoardStatus {
  if (task.status !== 'pending') return 'done'
  if (task.start_date !== null && task.start_date <= today) return 'in_progress'
  return 'not_started'
}

export function BoardView({
  folderId,
  tasks,
  completed,
  showCompleted,
  today,
  context,
  actions,
}: {
  /* The page new tasks are added to. */
  readonly folderId: string
  readonly tasks: readonly TaskCard[]
  readonly completed: readonly TaskCard[]
  readonly showCompleted: boolean
  readonly today: string
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  const finished = completed.filter(
    (task) => task.status === 'completed' || (showCompleted && task.status === 'abandoned'),
  )
  const all: readonly TaskCard[] = [...tasks, ...finished]
  const byId = new Map(all.map((task) => [task.id, task]))
  const create = useCreateTask()
  const transition = useTransitionTask()

  function add(title: string, status: BoardStatus): void {
    create.mutate(
      {
        title,
        folder_id: folderId,
        ...(status === 'in_progress' ? { start_date: today } : {}),
      },
      {
        onSuccess: (made) => {
          if (status === 'done') transition.mutate({ id: made.id, event: 'complete' })
        },
      },
    )
  }

  const mapped: BoardColumn[] = COLUMNS.map((column) => ({
    key: column.key,
    label: column.label,
    tone: column.tone,
    /* Finished cards strike through and drop their details: the board's own
       contract for its `done` flag, as `views/TaskBoard.tsx` sets it. */
    ...(column.key === 'done' ? { done: true, quiet: true } : {}),
    tasks: all
      .filter((task) => boardStatusOf(task, today) === column.key)
      .map(
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

        const started = task.start_date !== null && task.start_date <= today
        if (columnKey === 'in_progress') {
          if (!started) {
            /* The server holds start_date <= due_date, so an overdue task
               starts on its due day rather than today. */
            const day =
              task.due_date !== null && task.due_date < today ? task.due_date : today
            actions.onMoveToColumn(task, { start_date: day })
          }
          return true
        }
        if (started) actions.onMoveToColumn(task, { start_date: null })
        return true
      }}
      checkbox={false}
      quickAdd={(column) => (
        <BoardQuickAdd
          label={`New task in ${column.label}`}
          onAdd={(title) => add(title, column.key as BoardStatus)}
        />
      )}
    />
  )
}

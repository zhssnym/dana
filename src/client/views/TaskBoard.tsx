/*
 * The board with this client's meaning: a drop writes the same `ColumnValue` the column's quick-add does. A
 * column with a null `capture` (Overdue, a week or month rung) takes no drop and no quick-add.
 */
import { BoardQuickAdd, TaskBoard as PrototypeBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask } from '../components/task-board.js'
import type { TaskRowProps } from '../components/task-row.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { TaskCard } from '../../shared/tasks.js'
import { groupHeadingMedia } from './group-mark.js'
import type { GroupBy } from './filter.js'
import type { TaskGroup } from './grouping.js'
import { scheduleLanding } from './place-pages.js'
import type { Place } from './usePlace.js'

type BoardGiven = TaskRowProps['given']

const GIVEN_BY_AXIS: Record<GroupBy, BoardGiven> = {
  none: undefined,
  folder: { folder: true },
  person: { assignee: true },
  date: { due: true },
  /* A section says nothing about folder, person or date, so a card keeps every chip. */
  section: undefined,
}

export function TaskBoard({
  place,
  columns,
  context,
  actions,
}: {
  readonly place: Place
  readonly columns: readonly TaskGroup[]
  readonly context: RowContext
  readonly actions: RowActions
}): React.JSX.Element {
  /*
   * A card in a folder column omits the folder, which the heading already says; set with `given` from one
   * condition.
   */
  const columnContext: RowContext =
    place.groupBy === 'folder' ? { ...context, showFolder: false } : context

  const byKey = new Map(columns.map((column) => [column.key, column]))

  const mapped: BoardColumn[] = columns.map((column) => ({
    key: column.key,
    /* A column is named by its value, written into its `aria-label`. */
    label: column.name,
    mark: groupHeadingMedia(column.mark, context.folders),
    /* Finished columns strike through and drop details. */
    ...(column.done === true ? { done: true, quiet: true } : {}),
    /* Asked before the drop (AC-228), so a column with nothing to write never shows a landing. */
    takes: column.done === true || (column.capture !== undefined && column.capture !== null),
    tasks: column.rows.map(
      (task: TaskCard): BoardTask => ({
        ...taskRowDisplay(task, columnContext),
        id: task.id,
      }),
    ),
  }))

  return (
    <PrototypeBoard
      columns={mapped}
      /* What the column already says, the card does not repeat. */
      given={GIVEN_BY_AXIS[place.groupBy]}
      onOpenTask={(taskId) => {
        const task = taskOf(columns, taskId)
        if (task !== undefined) actions.onOpenTask(task)
      }}
      onToggleComplete={(taskId) => {
        const task = taskOf(columns, taskId)
        if (task === undefined) return
        /* An abandoned card's control restores it, as the row's box does. */
        if (task.status === 'abandoned') actions.onRestore(task)
        else actions.onToggleComplete(task)
      }}
      onToggleImportant={(taskId) => {
        const task = taskOf(columns, taskId)
        if (task !== undefined) actions.onToggleImportant(task)
      }}
      onDropIn={(taskId, columnKey) => {
        const task = taskOf(columns, taskId)
        const column = byKey.get(columnKey)
        if (task === undefined || column === undefined) return false
        /* Done is a status: dropping completes, and dragging back out reopens and files it where it lands. */
        if (column.done === true) {
          if (task.status === 'completed') return false
          actions.onToggleComplete(task)
          return true
        }
        const landing = column.capture
        if (landing === undefined || landing === null) return false
        /*
         * A dropped task keeps its Schedule shape: Due-only moves due, Start-only moves start, a pair moves
         * whole. The column writes `due_date` only for a new capture.
         */
        const moved = scheduleLanding(task, landing)
        if (moved === null) return false
        if (task.status === 'completed') actions.onToggleComplete(task)
        actions.onMoveToColumn(task, moved)
        return true
      }}
      quickAdd={(column) => {
        const group = byKey.get(column.key)
        if (group === undefined || group.capture === null || group.done === true) return null
        if (place.spine.capture === 'none') return null
        return (
          /* The one board "New task", the same as a page's board. */
          <BoardQuickAdd
            label={`New task in ${column.label}`}
            onAdd={(title) => {
              place.capture(title, group.capture ?? undefined)
            }}
          />
        )
      }}
    />
  )
}

function taskOf(columns: readonly TaskGroup[], taskId: string): TaskCard | undefined {
  for (const column of columns) {
    const found = column.rows.find((task) => task.id === taskId)
    if (found !== undefined) return found
  }
  return undefined
}

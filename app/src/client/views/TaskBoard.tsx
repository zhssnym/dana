/*
The board of 9.1, as the place pages consume it: `components/task-board.tsx`
with this client's meaning attached.

**Geometry there, meaning here.** The board owns the columns' rectangles and
reports which one a card was released over; what landing there *means* is the
page's, and on these pages it is `actions.onMoveToColumn`, the same value the
column's quick-add writes through `place.capture`. One `ColumnValue` answers
both, so a drop and a capture in one column can never come to mean different
things.

**Two kinds of column refuse a drop rather than pretending**: Overdue is a
relation to today rather than a value, and a week or a month rung names a range
with no day in it. `grouping.ts` decides which by handing a group a `capture` of
null, and a column with nothing to write takes no drop and offers no quick-add.

The board runs its drag through `TaskList`, which hands each row its state
directly.
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
  /* A section says nothing about a task's folder, its person or its date, so
     a card in a section column keeps every chip it would carry in a list. */
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
  A card in a folder column does not repeat the folder, which is Q2's own rule
  applied one surface further on ("Q2 gives a row no folder label, the group
  heading above it being the folder"): a row says what its page does not. It is
  also what makes the card fit: a column is a fraction of a page's width, and
  the title is what gives way when a folder chip is drawn under a heading
  already saying the same word.

  The board spells the same idea as `given`, so both are set from one condition
  rather than left to agree by hand.
  */
  const columnContext: RowContext =
    place.groupBy === 'folder' ? { ...context, showFolder: false } : context

  const byKey = new Map(columns.map((column) => [column.key, column]))

  const mapped: BoardColumn[] = columns.map((column) => ({
    key: column.key,
    /* 9.1's regions rule: a column is named by its value, and the board writes
       that name into its `aria-label`. */
    label: column.name,
    mark: groupHeadingMedia(column.mark, context.folders),
    /* Finished columns strike through and drop their details, the board's own
       contract for its `done` flag. */
    ...(column.done === true ? { done: true, quiet: true } : {}),
    /* The same question `onDropIn` below answers, asked one moment earlier
       (AC-228), so a column with nothing to write — Overdue, a relation to
       today rather than a value — never promises a landing it will then refuse. */
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
      /*
      The `given` contract: what the column already says, the card does not
      repeat. The three axes `grouping.ts` produces map one to one, and a card
      in a date column drops its due chip for the same reason a card in a folder
      column drops its folder.
      */
      given={GIVEN_BY_AXIS[place.groupBy]}
      onOpenTask={(taskId) => {
        const task = taskOf(columns, taskId)
        if (task !== undefined) actions.onOpenTask(task)
      }}
      onToggleComplete={(taskId) => {
        const task = taskOf(columns, taskId)
        if (task === undefined) return
        /* An abandoned card's control restores it, which is 9.5's rule and
           the same reading `pages/task-rows.tsx` gives the row's own box. */
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
        /*
        The Done column is a status rather than a place: dropping on Done
        completes, and carrying a card back out reopens it and files it wherever
        it landed. Completion is the page's act so that 9.5's series confirm and
        the undo bar reach it exactly as they reach the row's box.
        */
        if (column.done === true) {
          if (task.status === 'completed') return false
          actions.onToggleComplete(task)
          return true
        }
        const landing = column.capture
        if (landing === undefined || landing === null) return false
        /*
        A date column's value is a day, and which field of the row expresses
        "this task is on that day" is the row's to say (issue #216): Q3C's
        sentence, "dragging moves a Due-only task's Due Date, a Start-only
        task's Start Date, and a Start+Due range whole". The column writes
        `due_date` because a task *captured* in it is new and has no Schedule to
        keep; a task *dropped* into it has one, and writing the due date onto a
        Start-only card would convert it into a Start+Due task with nothing
        saying so. A pair is refused rather than half-moved, which is the same
        answer the calendar's drag gives and for the same reason: the
        whole-range move is unbuilt.
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

/** The row behind a card's id, which is all the board reports. */
function taskOf(columns: readonly TaskGroup[], taskId: string): TaskCard | undefined {
  for (const column of columns) {
    const found = column.rows.find((task) => task.id === taskId)
    if (found !== undefined) return found
  }
  return undefined
}

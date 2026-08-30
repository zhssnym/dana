/*
The board of 9.1, as the place pages consume it: the lifted
`components/task-board.tsx` with this client's meaning attached.

**What this file used to be, and why it is not that any more.** It held a
board of its own, ported from the v1 prototype and reworked twice, while the
lifted board sat beside it with no consumer at all. That is the class RFC 0005
change control item 48(b) names and asks S25, S26 and S27 to open by looking
for: a component lifted ahead of its call site. This one was the honest kind,
the undo bar's rather than the window bar's, because neither copy carried a
module store and so neither half could break silently. What it cost instead
was fidelity, which item 48(j) put a number on: every file that was lifted
scored at or near 100 percent of the prototype's class strings and every file
that was ported did not. So the implementation retires and this becomes the
half the prototype's own header says belongs here.

**Geometry there, meaning here**, which is that header's sentence and the
whole of the split. The board owns the columns' rectangles and reports which
one a card was released over; what landing there *means* is the page's, and on
these eight pages it is `actions.onMoveToColumn`, the same value the column's
quick-add writes through `place.capture`. One `ColumnValue` answers both, so a
drop and a capture in one column can never come to mean different things.

**Two kinds of column refuse a drop rather than pretending**, unchanged from
what this file did before: Overdue is a relation to today rather than a value,
and a week or a month rung names a range with no day in it. `grouping.ts`
decides which by handing a group a `capture` of null, and a column with
nothing to write takes no drop and offers no quick-add. Ledger L-219 is that
decision and it stays closed.

**`pages/task-rows.tsx`'s `dragStateOf` went with this file**, which is what
its own comment said would happen: it read a pixel offset back out of a CSS
transform string to translate `RowDrag`, the interface this file used to
publish, into the v2 row's `dragState`. The lifted board runs its drag through
`TaskList`, which hands each row its state directly, so there is nothing left
to translate and no list in this client passes `RowDrag` any more.
*/
import { QuickAdd } from '../components/quick-add.js'
import { TaskBoard as PrototypeBoard } from '../components/task-board.js'
import type { BoardColumn, BoardTask } from '../components/task-board.js'
import type { TaskRowProps } from '../components/task-row.js'
import { taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { TaskCard } from '../../shared/tasks.js'
import { groupHeadingMedia } from './group-mark.js'
import type { GroupBy } from './filter.js'
import type { TaskGroup } from './grouping.js'
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
  heading above it being the folder") and DES-183's, that a row says what its
  page does not. It is also what makes the card fit: a column is a fraction of
  a page's width, and the title is what gives way when a folder chip is drawn
  under a heading already saying the same word.

  The lifted board spells the same idea as `given`, so both are set from one
  condition rather than left to agree by hand.
  */
  const columnContext: RowContext =
    place.groupBy === 'folder' ? { ...context, showFolder: false } : context

  const byKey = new Map(columns.map((column) => [column.key, column]))

  const mapped: BoardColumn[] = columns.map((column) => ({
    key: column.key,
    /* 9.1's regions rule: a column is named by its value, and the lifted
       board writes that name into the `aria-label` its S25 seam carries. */
    label: column.name,
    mark: groupHeadingMedia(column.mark, context.folders),
    /* Finished columns strike through and drop their details, the lifted
       board's own contract for its `done` flag (item 58, F and G). */
    ...(column.done === true ? { done: true, quiet: true } : {}),
    /* polish (AC-228): the same question `onDropIn` below answers, asked one
       moment earlier, so a column with nothing to write — Overdue, a relation
       to today rather than a value (DES-182) — never promises a landing it
       will then refuse. */
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
      DES-183's contract, which the lifted card reads and the ported one had
      no word for: what the column already says, the card does not repeat.
      The three axes `grouping.ts` produces map one to one, and a card in a
      date column drops its due chip for the same reason a card in a folder
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
        The Done column is a status rather than a place (ledger L-045, item
        58 G), the prototype's own sentence: "dropping on Done completes, and
        carrying a card back out reopens it and files it wherever it landed."
        Completion is the page's act so that 9.5's series confirm and the
        undo bar reach it exactly as they reach the row's box.
        */
        if (column.done === true) {
          if (task.status === 'completed') return false
          actions.onToggleComplete(task)
          return true
        }
        const landing = column.capture
        if (landing === undefined || landing === null) return false
        if (task.status === 'completed') actions.onToggleComplete(task)
        actions.onMoveToColumn(task, landing)
        return true
      }}
      quickAdd={(column) => {
        const group = byKey.get(column.key)
        if (group === undefined || group.capture === null) return null
        if (place.spine.capture === 'none') return null
        return (
          <QuickAdd
            folderName={column.label}
            onAdd={(title) => {
              place.capture(title, group.capture ?? undefined)
            }}
            onOpenFullForm={(title) => {
              place.openFull(group.capture ?? undefined, title)
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

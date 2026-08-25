/*
The board of 9.1: "a board column is a named region; its cards, list items or
rows", one column per value of the page's grouping.

**Every column captures, and with its own value.** DES-182: "capture in a
column means capture with that column's value. A task typed into the Home
column is in Home; into Sara's column, Sara's; into a date column, due that
day, and the page's own entry defaults ride underneath." That last clause is
why the capture goes through `place.capture`, which layers the column over the
page's spine rather than replacing it: a task typed into a column on Today is
in that column *and* on Today.

**So the floating button is absent here**, which 9.1 states and which the
shell reads off the same view mode this component is drawn in. It is Imran's
own observation and it is DES-133 arriving at its conclusion: the button is
the capture point that leaves wherever a capture row already exists, and a
column says where the task lands better than any row.

**Two kinds of column refuse capture rather than pretending.** Overdue is a
relation to today and not a value, and a month or a week names a range with no
day in it; `grouping.ts` and `ladder.ts` decide which, and a column with
nothing to write simply carries no quick-add. DES-182 again: "those boards do
not offer it at all rather than offering it and refusing."

**Dropping a card in a column writes that column's value**, which is 9.1's own
sentence for the view strip, and it is the same value the column captures
with: one `ColumnValue` answers both, so a drop and a quick-add in one column
can never come to mean different things. A column that refuses capture refuses
the drop for the reason it refuses the capture, having nothing to write.

Three things about how that is built, each of them the engine's rule rather
than this file's.

**One drag engine, and this is its third surface.** RFC 0004's acceptance
column says so, and the sidebar and the tab strip are the other two. What a
board asks that a single list does not is a release inside a container the
sorting list cannot see, which is exactly what `onOver` and `onDropAt` are for
(DES-171); the registry answering them is `lib/drop-zones.ts`, which is there
rather than here because the Library needed the same hit test first.

**The hit test is the document's, and the carried card stops catching the
point.** Rectangles lie during a drag, the carried card's transform inflating
its own column's bounding rect, so the pointer would never read as having left
the column it started in. That fault was measured at the sidebar and the fix
is the registry's; what this file owes it is the `pointer-events: none` the
carried card wears.

**A column does not reorder itself.** Section 6 fixes the order inside every
column and states that clients never re-sort, so `onReorder` here has nothing
to write and says so. What a within-column drag still gets is the lift and the
carry, and the card settles back where the server put it.
*/
import { QuickAdd } from '../components/quick-add.js'
import { useDropZones } from '../lib/drop-zones.js'
import type { DropZones } from '../lib/drop-zones.js'
import { swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import { TaskRows } from '../pages/task-rows.js'
import type { RowContext } from '../parts/presenters.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { TaskCard } from '../../shared/tasks.js'
import type { TaskGroup } from './grouping.js'
import type { ColumnValue } from './place-pages.js'
import type { Place } from './usePlace.js'

export function TaskBoard({
  place,
  columns,
  context,
  actions,
  onAsk,
}: {
  readonly place: Place
  readonly columns: readonly TaskGroup[]
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (message: string, run: () => void) => void
}): React.JSX.Element {
  /*
  A row in a folder column does not repeat the folder, which is Q2's own rule
  applied one surface further on ("Q2 gives a row no folder label, the group
  heading above it being the folder") and DES-183's, that a row says what its
  page does not. It is also what makes the row fit: a column is a fraction of
  a page's width, the row's metadata and controls take their own, and the
  title is what gives way when the folder chip is drawn beside a heading that
  already says the same word.
  */
  const columnContext: RowContext =
    place.groupBy === 'folder' ? { ...context, showFolder: false } : context

  /* One registry for the whole board, so a card lifted in any column can be
     released into any other. No outer key: a board's columns enclose nothing
     and the Library's enclosure rule has nothing to do here. */
  const zones = useDropZones()

  /** What a release in the column registered under `key` writes, or none. */
  const valueOf = (key: string): ColumnValue | null =>
    columns.find((column) => column.key === key)?.capture ?? null

  const nameOf = (key: string): string =>
    columns.find((column) => column.key === key)?.name ?? key

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2">
      {columns.map((column) => (
        <BoardColumn
          key={column.key}
          column={column}
          place={place}
          context={columnContext}
          actions={actions}
          onAsk={onAsk}
          zones={zones}
          valueOf={valueOf}
          nameOf={nameOf}
        />
      ))}
    </div>
  )
}

function BoardColumn({
  column,
  place,
  context,
  actions,
  onAsk,
  zones,
  valueOf,
  nameOf,
}: {
  readonly column: TaskGroup
  readonly place: Place
  readonly context: RowContext
  readonly actions: RowActions
  readonly onAsk: (message: string, run: () => void) => void
  readonly zones: DropZones
  readonly valueOf: (key: string) => ColumnValue | null
  readonly nameOf: (key: string) => string
}): React.JSX.Element {
  const rows: readonly TaskCard[] = column.rows

  const drag = useSortableList({
    count: rows.length,
    /*
    A board is the one surface whose containers are laid out across the axis
    its lists run on, so the engine follows the pointer on both. Without it
    the edge-follow scrolls the column the card is already in and never the
    board, and any column past the right edge is a destination the gesture
    cannot reach: measured in the whole browser leg, where the folders of a
    hundred and fifty specs made the board wider than the window and AC-228
    went red having passed focused. Three columns fit a 1120px page, so this
    bites a real person at four folders rather than at a hundred and fifty.
    */
    crossAxis: true,
    onLift: swallowNextClick,
    describe: (index) => rows[index]?.title ?? 'Task',
    /* What a release would do, asked while the drag is still in the air, so a
       card on its way into another column stops being drawn as a slot in this
       one (DES-171). A column with nothing to write is not an answer. */
    onOver: (_from, point) => {
      const key = zones.containerAt(point, column.key)
      if (key === null || valueOf(key) === null) return null
      return key
    },
    onDropAt: (from, point) => {
      const task = rows[from]
      if (task === undefined) return false
      const key = zones.containerAt(point, column.key)
      if (key === null) return false
      const value = valueOf(key)
      if (value === null) return false
      actions.onMoveToColumn(task, value)
      return true
    },
    onReorder: () => undefined,
  })

  return (
    <section
      // 9.1's roles table: a board column is a named region, named by its
      // value. AC-221 addresses the Groceries column by exactly this.
      aria-label={column.name}
      ref={zones.registerZone(column.key)}
      className="flex w-80 shrink-0 flex-col gap-1 rounded-lg bg-[var(--color-graphite-25)] p-2"
    >
      <h2 className="flex h-7 items-center gap-2 px-1 text-[13px] font-semibold text-[var(--color-graphite-700)]">
        <span className="truncate">{column.name}</span>
        <span aria-hidden="true" className="font-normal text-[var(--color-graphite-500)]">
          {rows.length}
        </span>
      </h2>
      <TaskRows
        tasks={rows}
        context={context}
        actions={actions}
        onAsk={onAsk}
        drag={{
          rowRef: (index) => drag.setItemRef(index),
          dragProps: (index) => drag.surfaceProps(index),
          dragStyle: (index) => {
            const state = drag.itemState(index)
            if (state.offset === 0 && !state.isActive) return undefined
            return {
              transform: `translateY(${String(state.offset)}px)`,
              transition:
                state.isActive && !state.isSettling
                  ? 'none'
                  : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
              position: 'relative',
              zIndex: state.isActive ? 30 : undefined,
              /* The carried card must not catch the point it follows: the
                 registry asks the document what is under the pointer. */
              pointerEvents: state.isActive ? 'none' : undefined,
            }
          },
          proposal: (index) =>
            drag.itemState(index).isActive && drag.overKey !== null
              ? `Into ${nameOf(drag.overKey)}`
              : undefined,
        }}
      />
      {column.capture === null || place.spine.capture === 'none' ? null : (
        <QuickAdd
          folderName={column.name}
          onAdd={(title) => {
            place.capture(title, column.capture ?? undefined)
          }}
          onOpenFullForm={() => {
            place.openFull(column.capture ?? undefined)
          }}
        />
      )}
      {/* A keyboard move is heard rather than only seen; the engine writes
          the sentence and this is the region that announces it. */}
      <span aria-live="polite" className="sr-only">
        {drag.announcement}
      </span>
    </section>
  )
}

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

**Dropping a card into a column is not here, and the omission is recorded
rather than silent.** 9.1 gives the board a drop that writes the column's
value, and RFC 0004 assigns every drag engine to S11 with the sentence that
matters: one drag engine total. Building a second one on this package's
schedule is exactly the shape the sidebar drag was moved out of S9 to avoid.
Nothing asserts the drop today; AC-221 reads the capture.
*/
import { QuickAdd } from '../components/quick-add.js'
import { TaskRows } from '../pages/task-rows.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { RowContext } from '../parts/presenters.js'
import type { TaskGroup } from './grouping.js'
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

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2">
      {columns.map((column) => (
        <section
          key={column.key}
          // 9.1's roles table: a board column is a named region, named by its
          // value. AC-221 addresses the Groceries column by exactly this.
          aria-label={column.name}
          className="flex w-80 shrink-0 flex-col gap-1 rounded-lg bg-[var(--color-graphite-25)] p-2"
        >
          <h2 className="flex h-7 items-center gap-2 px-1 text-[13px] font-semibold text-[var(--color-graphite-700)]">
            <span className="truncate">{column.name}</span>
            <span aria-hidden="true" className="font-normal text-[var(--color-graphite-500)]">
              {column.rows.length}
            </span>
          </h2>
          <TaskRows
            tasks={column.rows}
            context={columnContext}
            actions={actions}
            onAsk={onAsk}
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
        </section>
      ))}
    </div>
  )
}

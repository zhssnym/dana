/*
Q3C's cell order, as the custom comparator 11.4 names.

"Cell order: all-day banners first (status_rank, id), then timed rows
(due_time, status_rank, id), then ghosts (date order, task id)."

That is three ordered groups, and inside each a different key list, which is
why it is a comparator rather than a field-spec string: FullCalendar's
`eventOrder` also takes a comma-separated list of fields, and no list of
fields expresses "sort by A within one group and by B within another".

11.4 gives the fallback if this cannot express the order exactly, a per-cell
ghost overlay, and says which of the two is the contract: "the visible order
is the contract, the mechanism is not." The comparator expresses it, so the
overlay is not built.

Two things this file deliberately does not do.

**It does not decide which rows are in a cell.** The comparator sees two
events at a time and FullCalendar has already grouped them by day, so "date
order" inside the ghost group is a tie in every cell and is compared anyway:
the rule is Q3C's and a comparator that dropped a key because the caller
happens to make it constant is a comparator that breaks when the caller
changes.

**It does not re-sort the server's rows.** Section 6's preamble says every
view returns rows already ordered and clients never re-sort, and this is not
that: a calendar cell interleaves two arrays the response returns separately,
real rows and virtual instances, and no server order exists over the union.
Q3C states the cell order for exactly that reason.
*/

/** Section 6's preamble: pending 0, abandoned 1, completed 2. */
export const STATUS_RANK: Record<string, number> = {
  pending: 0,
  abandoned: 1,
  completed: 2,
}

/** What an event carries so this comparator can read it without a lookup. */
export interface CellEventProps {
  readonly kind: 'real' | 'ghost'
  readonly taskId: string
  readonly statusRank: number
  /** HH:MM:SS for a timed row, null for an all-day banner. */
  readonly dueTime: string | null
  /** The calendar date the event was placed on. */
  readonly date: string
  readonly allDay: boolean
}

/** The three groups Q3C names, in the order it names them. */
function groupOf(props: CellEventProps): number {
  if (props.kind === 'ghost') return 2
  return props.allDay ? 0 : 1
}

function compare(a: string | number, b: string | number): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * The comparator itself, over the two events FullCalendar hands it.
 *
 * The argument is typed structurally rather than as FullCalendar's EventApi:
 * what this function needs is an id and the extended props above, and a
 * comparator that named the library's class would be a comparator that could
 * not be reasoned about without one.
 */
export function compareCellEvents(
  a: { readonly id: string; readonly extendedProps: Record<string, unknown> },
  b: { readonly id: string; readonly extendedProps: Record<string, unknown> },
): number {
  const left = a.extendedProps as unknown as CellEventProps
  const right = b.extendedProps as unknown as CellEventProps

  const group = groupOf(left) - groupOf(right)
  if (group !== 0) return group

  if (groupOf(left) === 0) {
    // All-day banners: status_rank, id.
    return compare(left.statusRank, right.statusRank) || compare(left.taskId, right.taskId)
  }
  if (groupOf(left) === 1) {
    // Timed rows: due_time, status_rank, id. A timed row has a due_time by
    // construction, so the empty-string fallback is unreachable and is here
    // rather than a non-null assertion.
    return (
      compare(left.dueTime ?? '', right.dueTime ?? '') ||
      compare(left.statusRank, right.statusRank) ||
      compare(left.taskId, right.taskId)
    )
  }
  // Ghosts: date order, task id.
  return compare(left.date, right.date) || compare(left.taskId, right.taskId)
}

/**
 * The same comparator in the shape FullCalendar's `eventOrder` refiner takes.
 *
 * That option is typed over `unknown` because it also accepts field names, so
 * the narrowing happens once, here, rather than at the call site: the props
 * were put on the event by this package's own mapper, so an event reaching
 * this function without them is a defect in that mapper and sorts as equal
 * rather than throwing inside a layout pass.
 */
export function eventOrder(a: unknown, b: unknown): number {
  const left = a as { id?: string; extendedProps?: Record<string, unknown> }
  const right = b as { id?: string; extendedProps?: Record<string, unknown> }
  if (left.extendedProps === undefined || right.extendedProps === undefined) return 0
  return compareCellEvents(
    { id: left.id ?? '', extendedProps: left.extendedProps },
    { id: right.id ?? '', extendedProps: right.extendedProps },
  )
}

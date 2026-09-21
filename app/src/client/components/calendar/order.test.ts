/*
Unit tests for Q3C's cell order and for the mapping onto it.

"Cell order: all-day banners first (status_rank, id), then timed rows
(due_time, status_rank, id), then ghosts (date order, task id)."

No acceptance criterion reads this. AC-098 asserts that a ghost and a real row
are drawn differently and AC-177 asserts the grid's shape; the order inside a
cell is the one thing about the calendar that section 6 states exactly and
that nothing in `tests/` can see, which is why it is checked here.

The fixtures are the smallest cards the functions read, built through a helper
rather than by hand, so a field added to 7.0's card breaks one line instead of
twelve.
*/
import { describe, expect, it } from 'vitest'

import type { Folder } from '../../../shared/folders.js'
import type { TaskCard, TaskStatus } from '../../../shared/tasks.js'
import type { VirtualInstance } from '../../../shared/views.js'
import { STATUS_RANK, cellsByDate, compareCellEvents } from './order.js'
import type { CellEvent } from './order.js'

const DATE = '2026-09-10'

function card(over: {
  id: string
  status?: TaskStatus
  due_time?: string | null
  /* Both ends of the Schedule, and both nullable, because every factory in
     this client's tests hardcoded `start_date: null` until 2026-09-20 and
     that is exactly why issue #216's four client seams could read `due_date`
     alone with the whole suite green. `null` is a Start-only or undated row;
     absent is the ordinary due-dated one the cases above all want. */
  due_date?: string | null
  start_date?: string | null
  title?: string
}): TaskCard {
  return {
    id: over.id,
    title: over.title ?? `task ${over.id}`,
    status: over.status ?? 'pending',
    important: false,
    start_date: over.start_date ?? null,
    due_date: over.due_date === undefined ? DATE : over.due_date,
    due_time: over.due_time ?? null,
    folder: { id: 'folder-1', name: 'Groceries', is_default: false },
    assignee: null,
    is_recurring: false,
    steps_done: 0,
    steps_total: 0,
    pulled: false,
    pending_invite_email: null,
    // RFC 0005 unit 12a's two additions to 7.0's TaskCard; nothing here
    // reads either, so both take the value a task under no section and a
    // scrubbed creator would.
    section_block_id: null,
    created_by: null,
    labels: { personal: [], folder: [] },
    created_at: '2026-08-13T00:00:00.000Z',
    updated_at: '2026-08-13T00:00:00.000Z',
  }
}

function instance(over: {
  task_id: string
  date?: string
  due_time?: string | null
}): VirtualInstance {
  return {
    task_id: over.task_id,
    title: `series ${over.task_id}`,
    date: over.date ?? DATE,
    due_time: over.due_time ?? null,
    folder_id: 'folder-1',
  }
}

const FOLDERS: Folder[] = [
  {
    id: 'folder-1',
    name: 'Groceries',
    is_default: false,
    is_owner: true,
    member_count: 1,
    counts: { pending: 1, completed: 0 },
    my_shelf: 'Home',
    // Sole owner, so Full control (4.4 as widened by migration 0023).
    my_access: 'full_control',
    /* Both columns are set deliberately, and they differ. 9.6 retires 4.4's
       per-member colour from every v2 surface, so a chip that painted this one
       would be reading the column the contract moved off; the case below reads
       the identity and would go green on either if the two agreed. */
    my_color: '#33AA55',
    personal_labels: [],
    icon: null,
    color: '#4477CC',
    cover_file_id: null,
    cover_preset: null,
    cover_focal_y: 50,
    description: null,
  },
]

/*
The grid the cases below are drawing, and it has to be said out loud now.

`cellsByDate` takes the inclusive range of days the grid laid out, because a
task carries a span since issue #216 and which of its two ends a cell can hold
is a question about the grid rather than about the task. This one is the week
around DATE, wide enough that every case above is placed on the date it names
and narrow enough that the spanning cases below have an end outside it.
*/
const RANGE = { start: '2026-09-07', end: '2026-09-13' } as const

/** Ids in the order one cell drew them. */
function drawn(cells: Map<string, CellEvent[]>, date = DATE): string[] {
  return (cells.get(date) ?? []).map((event) => event.key)
}

describe('STATUS_RANK', () => {
  it("is section 6's preamble, all three ranks", () => {
    expect(STATUS_RANK.pending).toBe(0)
    expect(STATUS_RANK.abandoned).toBe(1)
    expect(STATUS_RANK.completed).toBe(2)
  })
})

describe('the three groups', () => {
  it('puts banners first, then timed rows, then ghosts', () => {
    const cells = cellsByDate(
      [card({ id: 'b', due_time: '09:00:00' }), card({ id: 'a' })],
      [instance({ task_id: 'g' })],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['real:a', 'real:b', 'ghost:g:2026-09-10'])
  })

  it('keeps a timed ghost behind an untimed real row, the group deciding first', () => {
    // A ghost carries its parent's due_time, so a timed ghost exists; Q3C
    // still orders every ghost after every real row of the cell.
    const cells = cellsByDate(
      [card({ id: 'a' })],
      [instance({ task_id: 'g', due_time: '06:00:00' })],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['real:a', 'ghost:g:2026-09-10'])
  })
})

describe('inside a group', () => {
  it('orders banners by status rank, then id', () => {
    const cells = cellsByDate(
      [
        card({ id: 'c', status: 'completed' }),
        card({ id: 'b', status: 'abandoned' }),
        card({ id: 'a2' }),
        card({ id: 'a1' }),
      ],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['real:a1', 'real:a2', 'real:b', 'real:c'])
  })

  it('orders timed rows by due time first, whatever their status', () => {
    const cells = cellsByDate(
      [
        card({ id: 'late', due_time: '18:00:00' }),
        card({ id: 'early', due_time: '06:00:00', status: 'completed' }),
      ],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['real:early', 'real:late'])
  })

  it('breaks a timed tie by status rank, then id', () => {
    const cells = cellsByDate(
      [
        card({ id: 'z', due_time: '09:00:00' }),
        card({ id: 'a', due_time: '09:00:00', status: 'abandoned' }),
        card({ id: 'm', due_time: '09:00:00' }),
      ],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['real:m', 'real:z', 'real:a'])
  })

  it('orders ghosts by task id inside one cell', () => {
    const cells = cellsByDate(
      [],
      [instance({ task_id: 'z' }), instance({ task_id: 'a' })],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells)).toEqual(['ghost:a:2026-09-10', 'ghost:z:2026-09-10'])
  })

  it('compares the ghost date even where the caller makes it constant', () => {
    const early: CellEvent = {
      key: 'ghost:z:2026-09-09',
      kind: 'ghost',
      taskId: 'z',
      title: 'z',
      date: '2026-09-09',
      dueTime: null,
      statusRank: 0,
      status: null,
      folderColor: null,
      moves: null,
    }
    const late: CellEvent = { ...early, key: 'ghost:a:2026-09-10', taskId: 'a', date: '2026-09-10' }
    expect(compareCellEvents(early, late)).toBeLessThan(0)
  })
})

describe('cellsByDate', () => {
  it('keys every row by the day it draws on', () => {
    const cells = cellsByDate(
      [card({ id: 'a' }), card({ id: 'b', due_date: '2026-09-11' })],
      [instance({ task_id: 'g', date: '2026-09-11' })],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells, '2026-09-10')).toEqual(['real:a'])
    expect(drawn(cells, '2026-09-11')).toEqual(['real:b', 'ghost:g:2026-09-11'])
  })

  it('draws one series once on one date, real row and projection apart', () => {
    // The hazard this role exists to prevent. Q3C projects strictly after the
    // task's own due_date, so the current occurrence's day holds the row and
    // no ghost of itself; the two carry different keys either way, so a cell
    // can never render one twice.
    const cells = cellsByDate(
      [card({ id: 'series' })],
      [instance({ task_id: 'series', date: '2026-09-11' })],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells, '2026-09-10')).toEqual(['real:series'])
    expect(drawn(cells, '2026-09-11')).toEqual(['ghost:series:2026-09-11'])
  })

  /*
  **Reworked at S17a**, where this read "takes the folder colour from the
  viewer's own membership" and expected 4.4's `my_color`. That was the v1
  reading and 9.6 retires it in terms: "4.4's per-member color column is no
  longer written by any v2 surface (existing values are simply unused)". So a
  chip wears the folder's own identity colour, the value its page's mark
  writes and every member sees, which is the same move AC-173 made on the
  sidebar row. Found by the whole vitest leg and by nothing smaller.
  */
  it("takes the folder colour from the folder's own identity (4.3)", () => {
    const cells = cellsByDate([card({ id: 'a' })], [], FOLDERS, RANGE)
    expect(cells.get(DATE)?.[0]?.folderColor).toBe('#4477CC')
  })

  it('gives a ghost no folder colour, the repeat glyph standing in its place', () => {
    const cells = cellsByDate([], [instance({ task_id: 'g' })], FOLDERS, RANGE)
    expect(cells.get(DATE)?.[0]?.folderColor).toBeNull()
    expect(cells.get(DATE)?.[0]?.status).toBeNull()
  })

  it('answers a day with nothing on it with no cell at all', () => {
    expect(cellsByDate([], [], FOLDERS, RANGE).get('2026-09-12')).toBeUndefined()
  })
})

/*
Where a Schedule draws, which is the whole of issue #216 on this grid.

Q3C returns every task whose Schedule *overlaps* the requested range, so a row
can arrive carrying a due date that is not on this grid at all. Placing it
there put it in a cell that does not exist, and a row in no cell is not drawn:
the server had finally started returning the row the issue is named for and
the screen dropped it. Every case here names a non-null start date, which no
factory in this client's tests produced before 2026-09-20.

None of this is the spanning bar. What it asserts is only that a row the
server returned is drawn somewhere on the grid it was returned for.
*/
describe('a Schedule that is a span', () => {
  it('draws a due-dated row on its due date, span or not', () => {
    const cells = cellsByDate(
      [card({ id: 'pair', start_date: '2026-09-08', due_date: '2026-09-11' })],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells, '2026-09-11')).toEqual(['real:pair'])
    expect(cells.get('2026-09-08')).toBeUndefined()
  })

  it('draws a start-only row on its start date', () => {
    const cells = cellsByDate(
      [card({ id: 'start', start_date: '2026-09-09', due_date: null })],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells, '2026-09-09')).toEqual(['real:start'])
  })

  /*
  The issue's own example, on the grid that loses it: a task starting 28
  September and due 3 October, drawn on a week grid around the 28th. The due
  date has no cell here, and the row the overlap predicate was written to
  deliver has to be drawn on the end this grid is actually showing.
  */
  it('draws on the end the grid holds when the deadline is off it', () => {
    const week = { start: '2026-09-28', end: '2026-10-04' } as const
    const day = { start: '2026-09-28', end: '2026-09-28' } as const
    const row = card({ id: 'span', start_date: '2026-09-28', due_date: '2026-10-03' })
    expect(drawn(cellsByDate([row], [], FOLDERS, week), '2026-10-03')).toEqual([
      'real:span',
    ])
    expect(drawn(cellsByDate([row], [], FOLDERS, day), '2026-09-28')).toEqual([
      'real:span',
    ])
    expect([...cellsByDate([row], [], FOLDERS, day).keys()]).toEqual(['2026-09-28'])
  })

  /*
  AC-452's last case seen from the client: a single-day range inside a long
  span. Neither end of the Schedule is on this grid and the server returns
  the row all the same, so it takes the first day rather than none.
  */
  it('draws a span that encloses the whole grid on the grid\'s first day', () => {
    const cells = cellsByDate(
      [card({ id: 'long', start_date: '2026-09-01', due_date: '2026-09-30' })],
      [],
      FOLDERS,
      RANGE,
    )
    expect(drawn(cells, RANGE.start)).toEqual(['real:long'])
  })

  /*
  And the other way: a row whose Schedule misses the range entirely is one
  Q3C does not return, so no cell is invented for it. This is the guard on
  the case above, and without it any stale row would be drawn on the first
  day of whatever grid the person opened.
  */
  it('invents no cell for a Schedule the grid does not touch', () => {
    const cells = cellsByDate(
      [card({ id: 'elsewhere', start_date: '2026-10-01', due_date: '2026-10-05' })],
      [],
      FOLDERS,
      RANGE,
    )
    expect(cells.get(RANGE.start)).toBeUndefined()
    expect([...cells.keys()]).toEqual(['2026-10-05'])
  })

  /*
  Which end a drop writes, from Q3C's own sentence: "Dragging moves a
  Due-only task's Due Date, a Start-only task's Start Date, and a Start+Due
  range whole." The third is unbuilt, so the pair reports no end and
  `PlannedCalendar` draws it undraggable rather than letting a drop write one
  end of a span nobody asked to resize.
  */
  it('reports which end of the Schedule a drop moves', () => {
    const ends = (task: TaskCard) =>
      cellsByDate([task], [], FOLDERS, RANGE).get(
        [...cellsByDate([task], [], FOLDERS, RANGE).keys()][0] ?? '',
      )?.[0]?.moves
    expect(ends(card({ id: 'due' }))).toBe('due_date')
    expect(ends(card({ id: 'start', start_date: '2026-09-09', due_date: null }))).toBe(
      'start_date',
    )
    expect(
      ends(card({ id: 'pair', start_date: '2026-09-08', due_date: '2026-09-11' })),
    ).toBeNull()
    expect(
      cellsByDate([], [instance({ task_id: 'g' })], FOLDERS, RANGE).get(DATE)?.[0]?.moves,
    ).toBeNull()
  })
})

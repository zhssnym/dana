/*
9.5's calendar mode for Planned, over Q3C.

"calendar per Q3C with day, week, month zooms, previous/next/today controls,
all-day banner lane, timed lane when due_time set, ghost styling for virtual
instances, click on empty cell opens the form with that date, click on any row
opens the task, click on a ghost opens the current occurrence with the banner
'Upcoming occurrence of a repeating task'; the month zoom requests the whole
weeks overlapping the month, six of them."

**The plugins come from the @fullcalendar/react subpaths and nowhere else.**
11.15 lists this first among the hazards agents get wrong: FullCalendar 7
consolidated its standard plugins into the framework package, and the
standalone @fullcalendar/daygrid package on npm is frozen at v6. Installing
the package training data suggests is the first defect available in this
directory, so the three imports below are the whole of it.

**The controls are this file's, not the library's toolbar.** `headerToolbar`
is off and previous, next, today and the three zooms are ordinary buttons,
because 9.1's addressing rule reaches a control by its accessible role and its
name: FullCalendar's own buttons announce themselves as "Next month", which is
a name that changes with the view, and a control whose name depends on what it
is showing is not addressable. The zoom buttons carry `aria-pressed`, which is
what makes the current zoom something a reader observes rather than infers
from a highlight.

**The range is reported by the grid and asked of the server.** Q3C answers
whatever inclusive range it receives and 9.5 fixes the month zoom's at the six
whole weeks overlapping the month, which is what `fixedWeekCount` already
gives: 42 days, which never approaches Q3C's 62-day refusal, and a grid that
keeps its height as the months change. So `datesSet` reports what was laid out
and the query follows it, rather than this file computing a month's boundaries
a second time and disagreeing with the grid on the weeks around them.

**A ghost is drawn with `<i>` and a real row with `<span>`.** The strike on an
abandoned row uses `<s>` for the same reason, recorded in
`components/ui/TaskRow.tsx`: the element computes its own style with no
stylesheet at all, so the distinction 9.5 requires survives a token file that
has not been transcribed yet. AC-098 reads the computed style off the title of
each and compares them, which is what "ghost styling" has to mean if it is to
mean anything a reader can check.
*/
import { useMemo, useState } from 'react'

import Calendar, { useCalendarController } from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import interactionPlugin from '@fullcalendar/react/interaction'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import '@fullcalendar/react/skeleton.css'

import { usePlannedCalendarView } from '../../api/queries.js'
import { openTaskForm } from '../../shell/overlays.js'
import { openTask } from '../task-form/index.js'
import { eventOrder, STATUS_RANK } from './order.js'
import type { CellEventProps } from './order.js'

type Zoom = 'day' | 'week' | 'month'

const VIEW_OF: Record<Zoom, string> = {
  day: 'timeGridDay',
  week: 'timeGridWeek',
  month: 'dayGridMonth',
}

/** The day before a half-open end, as a calendar date. Q3C's range is
 * inclusive at both ends and FullCalendar reports an exclusive end. */
function dayBefore(date: string): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() - 1)
  return at.toISOString().slice(0, 10)
}

interface Range {
  readonly start: string
  readonly end: string
}

export function PlannedCalendar(): React.JSX.Element {
  const controller = useCalendarController()
  const [zoom, setZoom] = useState<Zoom>('month')
  const [range, setRange] = useState<Range | null>(null)

  const view = usePlannedCalendarView(range?.start ?? null, range?.end ?? null)

  const events = useMemo(() => {
    const real = (view.data?.real ?? []).map((task) => {
      const props: CellEventProps = {
        kind: 'real',
        taskId: task.id,
        statusRank: STATUS_RANK[task.status] ?? 0,
        dueTime: task.due_time,
        date: task.due_date ?? '',
        allDay: task.due_time === null,
      }
      return {
        id: `real:${task.id}`,
        title: task.title,
        start:
          task.due_time === null
            ? (task.due_date ?? '')
            : `${task.due_date ?? ''}T${task.due_time}`,
        allDay: task.due_time === null,
        extendedProps: props,
      }
    })
    const ghosts = (view.data?.virtual ?? []).map((instance) => {
      const props: CellEventProps = {
        kind: 'ghost',
        taskId: instance.task_id,
        // A projection has no status of its own: 8.5 projects from a pending
        // task, and Q3C orders ghosts by date and task id rather than by rank.
        statusRank: STATUS_RANK.pending ?? 0,
        dueTime: instance.due_time,
        date: instance.date,
        allDay: instance.due_time === null,
      }
      return {
        id: `ghost:${instance.task_id}:${instance.date}`,
        title: instance.title,
        start:
          instance.due_time === null
            ? instance.date
            : `${instance.date}T${instance.due_time}`,
        allDay: instance.due_time === null,
        extendedProps: props,
      }
    })
    return [...real, ...ghosts]
  }, [view.data])

  return (
    <div>
      <div>
        <button type="button" className="button-base button-default" onClick={() => controller.prev()}>
          Previous
        </button>
        <button type="button" className="button-base button-default" onClick={() => controller.next()}>
          Next
        </button>
        <button type="button" className="button-base button-default" onClick={() => controller.today()}>
          Today
        </button>
        {(['day', 'week', 'month'] as const).map((level) => (
          <button
            key={level}
            type="button"
            className="button-base button-default"
            aria-pressed={zoom === level}
            onClick={() => {
              setZoom(level)
              controller.changeView(VIEW_OF[level])
            }}
          >
            {level === 'day' ? 'Day' : level === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>

      <Calendar
        controller={controller}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={VIEW_OF[zoom]}
        headerToolbar={false}
        height="auto"
        // 9.5 draws every row in the cell. A "+2 more" link would hide exactly
        // the rows Q3C's cell order is about, and a ghost behind one is a
        // projection the person never sees.
        dayMaxEvents={false}
        events={events}
        eventOrder={eventOrder}
        eventOrderStrict
        datesSet={(info) => {
          const start = info.startStr.slice(0, 10)
          const end = dayBefore(info.endStr.slice(0, 10))
          setRange((was) =>
            was !== null && was.start === start && was.end === end ? was : { start, end },
          )
        }}
        dateClick={(info) => {
          // 9.3's calendar row: that cell's date, important off, Inbox, which
          // the form resolves from the folder list as it does everywhere the
          // table writes "Inbox".
          openTaskForm({ due_date: info.dateStr.slice(0, 10), important: false })
        }}
        eventClick={(info) => {
          const props = info.event.extendedProps as unknown as CellEventProps
          // 9.5: a ghost opens the series' current occurrence, and the banner
          // rides that path alone because the opened row shows a date the
          // person did not click.
          openTask(props.taskId, { upcoming: props.kind === 'ghost' })
        }}
        eventContent={(info) => {
          const props = info.event.extendedProps as unknown as CellEventProps
          const title =
            props.kind === 'ghost' ? <i>{info.event.title}</i> : <span>{info.event.title}</span>
          /*
          The leading space is load-bearing and is measured rather than
          stylistic. A day cell's text is the concatenation of its
          descendants' text with no separator inserted anywhere, so a cell
          holding the fifth of the month and a row reads "5ac-098 daily
          series" as one string, and the day number stops being a word: any
          reader, a person's eye included once the cell is narrow enough,
          loses the boundary between the number and the first row. A space
          text node before the title restores it, costs nothing to render, and
          is what makes a cell addressable by the day it draws.
          */
          return (
            <>
              {' '}
              {title}
            </>
          )
        }}
      />
    </div>
  )
}

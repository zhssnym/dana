### Q3C: Scheduled, calendar mode (v1: Planned calendar)

Parameters: start and end dates, inclusive, with end minus start at most 62 days; zoom
levels day, week, month. start must not be after end: an inverted range answers 422 naming
the pair, because a malformed request would otherwise be indistinguishable from a
legitimately empty month. Year zoom is cut because projecting a daily rule at year scale
produces hundreds of markers with no designed density rendering. The zoom levels name
viewports rather than ranges: this query answers whatever inclusive range the request
carries, and what the month zoom asks for is 9.5's.

An optional `folder_id` scopes the result to one accessible Folder. Without it, Q3C
keeps its global accessible scope. With it, both the real-row read and the recurrence
projection-source read use that exact Folder, before virtual instances are generated.
An inaccessible or missing Folder answers 404.

Real rows: folder_id IN ACCESSIBLE(V) AND the task's Schedule overlaps [start, end], all
three statuses. The Schedule's span runs from activation_date = COALESCE(start_date,
due_date) to schedule_date = COALESCE(due_date, start_date), and the overlap is inclusive
at both ends: activation_date <= end AND schedule_date >= start. A task carrying neither
date has no span and is never a real row. The overlap is what lets a span reach every grid
it crosses. One row per task, whatever its span covers: the row carries both dates.

What the four Schedule states draw: a Due-only task is a one-day event on its Due Date; a
Start-only task a one-day start event on its Start Date; a Start+Due pair on one day a
one-day scheduled event; and a Start+Due pair on different days one continuous spanning
bar from Start through Due, rendered as connected weekly segments where the grid needs
them but semantically one task. The range is inclusive at the day level. Dragging moves a
Due-only task's Due Date, a Start-only task's Start Date, and a Start+Due range whole,
preserving its day span; there is no edge resizing.

Until the spanning bar is built, a Start+Due pair draws as one chip on its Due Date. A row
the query returned must be drawn somewhere: a row whose own day (its Due Date, or its
Start Date when it has no Due Date) is off the grid is listed once above the grid under
"Also running" rather than in a day cell, so a day cell holds the same rows at every zoom
and a phone's month count matches the day it opens. Dragging that
chip moves both dates by the days between the cell it left and the cell it landed on. A pair dropped where no day is (No date) is refused rather than losing a date.

Pending renders normal (overdue styled on past dates), completed faded and checked,
abandoned faded and struck: the calendar is a record. Virtual instances: for every
accessible pending task with a recurrence_rule, the rule instances strictly after that
task's due_date, intersected with [start, end] (section 8.5). Ghost style, click opens the
current occurrence. Cell order: all-day banners first (status_rank, id), then timed rows
(due_time, status_rank, id), then ghosts (date order, task id). The flat array this
endpoint answers leads on activation_date, the first day of the Schedule, the opposite of
Q3's choice: a list places a task under the day it is owed, and a bar is anchored where it
begins. Empty state (no rows in range): the bare grid; no message.

### Q3C: Scheduled, calendar mode (v1: Planned calendar)

Parameters: start and end dates, inclusive, with end minus start at most 62 days; zoom
levels day, week, month. start must not be after end: an inverted range answers 422 naming
the pair, ruled at P4 mid-package change control on 2026-08-07. The arithmetic above
admits an inverted range by accident, a negative difference being at most 62, and the
alternative reading answers it with the bare grid of the empty state. Refusing is chosen
because a malformed request would otherwise be indistinguishable from a legitimately empty
month, and because 7.0 already gives every endpoint 422 for a validation failure with the
field named, so this adds no status to the frozen surface and states which failure it is.
Year zoom is cut for v1 because projecting a daily rule at year scale produces hundreds of
markers with no designed density rendering. The zoom levels name viewports rather than
ranges: this query answers whatever inclusive range the request carries, and what the
month zoom asks for is 9.5's, recorded there at the P6 change control of 2026-08-10
because neither section had said it and AC-082 is asserted on the range its request names.
Real rows: folder_id IN ACCESSIBLE(V) AND the task's Schedule overlaps [start, end],
all three statuses. The Schedule's span runs from activation_date = COALESCE(start_date,
due_date) to schedule_date = COALESCE(due_date, start_date), and the overlap is
inclusive at both ends: activation_date <= end AND schedule_date >= start. A task
carrying neither date has no span and is never a real row.

**It read `due_date BETWEEN start AND end` until 2026-09-20 and issue #216 made it an
overlap**, because a task now has a span rather than a day and a span has to reach every
grid it crosses. A task starting 28 September and due 3 October was absent from both the
September and the October grid under the old reading, its bar disappearing on one screen
and reappearing on another. For the two one-date states the two readings are the same
statement, a span whose ends coincide overlapping a range exactly when its day is inside
it, so AC-126 stands unchanged. **One row per task, whatever its span covers**: the row
carries both dates and the grid draws one bar from them, and a row per day covered would
be the duplication issue #216 refuses.

What the four Schedule states draw: a Due-only task is a one-day event on its Due Date; a
Start-only task a one-day start event on its Start Date; a Start+Due pair on one day a
one-day scheduled event; and a Start+Due pair on different days one continuous spanning
bar from Start through Due, rendered as connected weekly segments where the grid needs
them but semantically one task. The range is inclusive at the day level. Dragging moves a
Due-only task's Due Date, a Start-only task's Start Date, and a Start+Due range whole,
preserving its day span; there is no edge resizing. Pending renders normal (overdue styled on past dates), completed faded and
checked, abandoned faded and struck: the calendar is a record. Virtual instances: for
every accessible pending task with a recurrence_rule, the rule instances strictly after
that task's due_date, intersected with [start, end] (section 8.5). Ghost style, click
opens the current occurrence. Cell order: all-day banners first (status_rank, id), then
timed rows (due_time, status_rank, id), then ghosts (date order, task id). The flat array
this endpoint answers leads on activation_date, the **first** day of the Schedule, which
is the opposite of Q3's choice and for the reason a grid differs from a list: a list
places a task under the day it is owed, and a bar is anchored where it begins. For the
two one-date states the two expressions name the same date. Empty state (no
rows in range): the bare grid; no message.

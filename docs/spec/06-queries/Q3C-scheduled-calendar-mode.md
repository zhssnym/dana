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
Real rows: folder_id IN ACCESSIBLE(V) AND due_date BETWEEN start AND end, all three
statuses. Pending renders normal (overdue styled on past dates), completed faded and
checked, abandoned faded and struck: the calendar is a record. Virtual instances: for
every accessible pending task with a recurrence_rule, the rule instances strictly after
that task's due_date, intersected with [start, end] (section 8.5). Ghost style, click
opens the current occurrence. Cell order: all-day banners first (status_rank, id), then
timed rows (due_time, status_rank, id), then ghosts (date order, task id). Empty state (no
rows in range): the bare grid; no message.

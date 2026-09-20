### Q3: Scheduled, list mode (v1: Planned)

Predicate: folder_id IN ACCESSIBLE(V) AND (start_date IS NOT NULL OR due_date IS NOT
NULL) AND status IN (pending, abandoned). Sort: schedule_date ascending, status_rank,
timed flag (all-day rows first: due_time IS NOT NULL sorts after IS NULL), due_time
ascending, created_at ascending, id, where schedule_date = COALESCE(due_date,
start_date). Overdue pending rows appear first naturally by date.

**Both the predicate and the leading key moved on 2026-09-20 with issue #216**, which is
where the reasoning is. Membership was `due_date IS NOT NULL`; a task belongs to
Scheduled now when it has either date. Placement keeps the list deadline-oriented: where
a Due Date exists the task is placed, grouped and ordered by it, and a Start-only task
takes its place by the one date it has rather than trailing every dated row as a null
would. So a task starting 20 September and due 30 September lives under the 30 September
rung while its row shows the whole Schedule. One task is one row: the expression picks
one of a task's dates, and a Start+Due pair is never listed twice. Overdue is unchanged
and stays derived from due_date alone (8.1), so a Start-only task can lead this list by
date and still never be late. due_time sits behind the leading key and is the deadline's
own time of day (4.5 makes it require a due_date), so a Start-only row sorts as the
all-day row it is. Completed rows never appear in list
mode; the look-back lives in calendar mode only. Row adornments: folder name label,
assignee chip (same default-folder exception), star, "unassigned" chip when assignee_id is
null and the folder has more than one member. Empty state: "Nothing scheduled. Give any
task a due date and it moves here." (A start date moves it here too since issue #216; the
copy is 9.5's and moves with the client slice rather than here.)

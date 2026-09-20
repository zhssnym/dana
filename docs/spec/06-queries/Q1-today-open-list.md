### Q1: Today, open list (v1: My Day)

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'pending' AND ((assignee_id = V AND
activation_date IS NOT NULL AND activation_date <= today) OR EXISTS
my_day_entries(task_id = t.id, user_id = V)), where activation_date =
COALESCE(start_date, due_date), the day a task's Schedule begins. qualify_date per row =
least of: activation_date when the automatic clause holds; added_on when the entry
exists. (At least one exists by the predicate.)

**The automatic clause read `due_date IS NOT NULL AND due_date <= today` until
2026-09-20, and issue #217 moved the date inside it rather than adding a second clause
beside it.** A Schedule is a span, and Start Date is when its work becomes active enough
to surface here, so an assigned open task auto-qualifies from its start date onward and
keeps qualifying while it is open. Three consequences, each intended. Nothing about a
due-only task moved: `tasks_start_before_due_check` makes a task whose due date has
arrived one whose start date has too, so the clause is a widening of the old one and
admits every row it used to admit, on the same day. The grouping stays one rule because
qualify_date reads whatever date the clause held on, which is why the clause moved
instead of being joined by a second: two clauses would give one row two qualify dates.
And a task that started earlier and is not yet due lands in Carried, on the same reading
of 8.2 that puts an overdue task there — Carried is work that began before today, not
work that is late, and overdue remains derived from due_date alone (8.1). A task
carrying neither date still never qualifies automatically: age is not a date a task
carries. Grouping: Carried
group where qualify_date < today; Today group where qualify_date = today. Carried renders
above Today. Sort inside each group: due_date ascending nulls last, due_time ascending
nulls first, created_at ascending, id. (created_at added at the polish round of
2026-08-30: id is a random uuid, so without it a task captured on Today landed anywhere in
its group; oldest first puts every capture at the group's foot.) The leading key is the
**due date** and deliberately not the schedule date Q3 leads on since issue #216: every
row on this page has an activation date of today or earlier by construction, so ordering
by it would put every started task ahead of the work actually due today, and a task with
a start date and no deadline sorts where every undated row on this page already sorts,
last. Abandoned tasks never
match (status filter). The important toggle is a client-side filter to important = true
within already-fetched groups; it changes no query. Empty state (both groups empty):
"Nothing on your day. Tasks assigned to you appear here on their due date, or pull
anything in yourself."

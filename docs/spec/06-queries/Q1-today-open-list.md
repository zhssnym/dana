### Q1: Today, open list (v1: My Day)

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'pending' AND ((assignee_id = V AND
activation_date IS NOT NULL AND activation_date <= today) OR EXISTS
my_day_entries(task_id = t.id, user_id = V)), where activation_date =
COALESCE(start_date, due_date), the day a task's Schedule begins. qualify_date per row =
least of: activation_date when the automatic clause holds; added_on when the entry
exists. (At least one exists by the predicate.)

An assigned open task auto-qualifies from its start date onward and keeps qualifying while
it is open; a task carrying neither date never qualifies automatically. The date sits
inside the one automatic clause rather than in a second clause beside it, so each row has
exactly one qualify_date. A task that started earlier and is not yet due lands in Carried:
Carried is work that began before today, not work that is late, and overdue remains
derived from due_date alone (8.1).

Grouping: Carried group where qualify_date < today; Today group where qualify_date =
today. Carried renders above Today. Sort inside each group: due_date ascending nulls last,
due_time ascending nulls first, created_at ascending, id. The leading key is the due date
and not Q3's schedule date: this page is the day's work in the order it is owed, so a task
with a start date and no deadline sorts last with the other undated rows. created_at
ascending puts a newly captured task at its group's foot.

Abandoned tasks never match (status filter). The important toggle is a client-side filter
to important = true within already-fetched groups; it changes no query. Empty state (both
groups empty): the copy in `app/src/client/pages/empty-states.ts`, which names both ways
onto the page.

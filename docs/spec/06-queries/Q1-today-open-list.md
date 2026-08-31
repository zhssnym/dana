### Q1: Today, open list (v1: My Day)

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'pending' AND ((assignee_id = V AND due_date IS NOT NULL AND due_date <= today) OR EXISTS my_day_entries(task_id = t.id, user_id = V)).
qualify_date per row = least of: due_date when the automatic clause holds; added_on when the entry exists. (At least one exists by the predicate.)
Grouping: Carried group where qualify_date < today; Today group where qualify_date = today. Carried renders above Today.
Sort inside each group: due_date ascending nulls last, due_time ascending nulls first, created_at ascending, id. (created_at added at the polish round of 2026-08-30: id is a random uuid, so without it a task captured on Today landed anywhere in its group; oldest first puts every capture at the group's foot.)
Abandoned tasks never match (status filter). The important toggle is a client-side filter to important = true within already-fetched groups; it changes no query.
Empty state (both groups empty): "Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."

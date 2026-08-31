### Q1R: Today, recap section (v1: My Day recap)

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed' AND completed_at falls on today in V's timezone AND (assignee_id = V OR completed_by = V OR EXISTS my_day_entries(t.id, V)).
Sort: completed_at descending, id descending. Rendered collapsed with a count; independent of the open list.
Empty state: section hidden entirely.

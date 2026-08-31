### Q3: Scheduled, list mode (v1: Planned)

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NOT NULL AND status IN (pending, abandoned).
Sort: due_date ascending, status_rank, timed flag (all-day rows first: due_time IS NOT NULL sorts after IS NULL), due_time ascending, created_at ascending, id. Overdue pending rows appear first naturally by date.
Completed rows never appear in list mode; the look-back lives in calendar mode only.
Row adornments: folder name label, assignee chip (same default-folder exception), star, "unassigned" chip when assignee_id is null and the folder has more than one member.
Empty state: "Nothing scheduled. Give any task a due date and it moves here."

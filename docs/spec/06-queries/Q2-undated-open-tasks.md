### Q2: Undated open tasks (v1: Tasks; serves Desk's grouping and the Anytime view)

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NULL AND status IN (pending, abandoned).
Grouping: rows from V's default folder first, ungrouped, no heading; then one group per remaining folder having at least one row, ordered by lower(folder name) ascending, folder id. (The only accessible default folder is V's own: defaults are never shared.)
Sort inside a group: status_rank, created_at ascending, id ascending. (Descending until the polish round of 2026-08-30: the owner ruled that a newly added task lands at the foot of the list it was typed into, so the newest row trails rather than leads.)
Row adornments: assignee chip except on rows in V's own default folder; star when important.
Empty state: "No undated tasks. Anything you capture without a date lands here."

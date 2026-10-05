### Q2: Undated open tasks (v1: Tasks; serves Desk's grouping and the Anytime view)

Predicate: folder_id IN ACCESSIBLE(V) AND start_date IS NULL AND due_date IS NULL AND
status IN (pending, abandoned), written as the negation of Q3's membership (6.1). A task
given only a Start Date leaves this page for Scheduled, exactly as one given a due date
does. Grouping: rows from V's default folder first, ungrouped, no heading; then one group
per remaining folder having at least one row, ordered by lower(folder name) ascending,
folder id. (The only accessible default folder is V's own: defaults are never shared.)
Sort inside a group: status_rank, created_at ascending, id ascending, so a newly added task
lands at the foot of the list it was typed into. Row adornments: assignee chip except on
rows in V's own default folder; star when important. Empty state: the copy in
`app/src/client/pages/empty-states.ts`.

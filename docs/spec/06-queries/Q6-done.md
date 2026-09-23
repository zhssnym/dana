### Q6: Done

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed'. Sort and pagination:
keyset on (completed_at descending, id descending), page size 50; cursor is the last row's
(completed_at, id). Grouped for display by the completed_at date in V's timezone, most
recent day first. Row adornments: folder name, due date if it had one, star when
important, "un-complete" affordance. Abandoned rows never appear here. Empty state: the
copy in `app/src/client/pages/empty-states.ts`.

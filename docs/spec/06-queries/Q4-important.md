### Q4: Important

Predicate: folder_id IN ACCESSIBLE(V) AND important = true AND status IN (pending,
abandoned). Sort: due_date ascending nulls last, then within dated rows the Q3 keys
(status_rank, timed flag, due_time, created_at, id), within undated rows the Q2 keys
(status_rank, created_at ascending, id ascending; descending until the polish round of
2026-08-30). Effect: dated block first, undated block after, exactly one list. Row
adornments: dated rows show due date and time like a Planned row; undated rows show their
folder like a Tasks row; assignee chip; the star tooltip here points outward ("Also in
Planned, due 2026-07-28" or "Also in Tasks, in Work") since every row here is important by
definition. Un-starring a row removes it from the result on the next fetch; nothing else
about the task changes. Empty state: "Nothing marked important. Star any task and it shows
up here."

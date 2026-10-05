### Q4: Important

Predicate: folder_id IN ACCESSIBLE(V) AND important = true AND status IN (pending,
abandoned). Sort: schedule_date ascending nulls last, then within Scheduled rows the Q3
keys (status_rank, timed flag, due_time, created_at, id), within Anytime rows the Q2 keys
(status_rank, created_at ascending, id ascending). Effect: Scheduled block first, Anytime
block after, exactly one list. The two blocks are Q3's and Q2's membership:
`schedule_date IS NULL` is Q2's predicate exactly.

Row adornments: Scheduled rows show due date and time like a Scheduled row; Anytime rows
show their folder like an Anytime row; assignee chip. Since every row here is important by
definition, the star tooltip points outward to the row's home and names the fact that home
would show: the due date, the Start Date for a Start-only row, or the folder for an Anytime
row. Tooltip wording: `app/src/client/parts/presenters.ts`. Un-starring a row removes it
from the result on the next fetch; nothing else about the task changes. Empty state: the
copy in `app/src/client/pages/empty-states.ts`.

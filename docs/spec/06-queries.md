## 6. Query specifications

Definitions used by every query:
- ACCESSIBLE(V) = set of folder_id from folder_members where user_id = V.
- open statuses = pending, abandoned. status_rank: pending = 0, abandoned = 1.
- today = today(V), from the request's tz parameter.
- All orders end in id (ascending unless stated) as the final tie-breaker, so any two agents produce byte-identical result sequences.
- Every view returns rows already ordered; clients never re-sort.
- List caps: My Day, Tasks, Planned list, Important, All, and folder open sections return at most 1000 rows and set truncated = true beyond it; the UI shows a notice. Done, folder completed sections, and search are keyset-paginated. Rationale: at v1 scale the caps are unreachable; cursors everywhere would be speculative complexity.

### Q1: My Day, open list

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'pending' AND ((assignee_id = V AND due_date IS NOT NULL AND due_date <= today) OR EXISTS my_day_entries(task_id = t.id, user_id = V)).
qualify_date per row = least of: due_date when the automatic clause holds; added_on when the entry exists. (At least one exists by the predicate.)
Grouping: Carried group where qualify_date < today; Today group where qualify_date = today. Carried renders above Today.
Sort inside each group: due_date ascending nulls last, due_time ascending nulls first, id.
Abandoned tasks never match (status filter). The important toggle is a client-side filter to important = true within already-fetched groups; it changes no query.
Empty state (both groups empty): "Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."

### Q1R: My Day, recap section

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed' AND completed_at falls on today in V's timezone AND (assignee_id = V OR completed_by = V OR EXISTS my_day_entries(t.id, V)).
Sort: completed_at descending, id descending. Rendered collapsed with a count; independent of the open list.
Empty state: section hidden entirely.

### Q2: Tasks

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NULL AND status IN (pending, abandoned).
Grouping: rows from V's default folder first, ungrouped, no heading; then one group per remaining folder having at least one row, ordered by lower(folder name) ascending, folder id. (The only accessible default folder is V's own: defaults are never shared.)
Sort inside a group: status_rank, created_at descending, id descending.
Row adornments: assignee chip except on rows in V's own default folder; star when important.
Empty state: "No undated tasks. Anything you capture without a date lands here."

### Q3: Planned, list mode

Predicate: folder_id IN ACCESSIBLE(V) AND due_date IS NOT NULL AND status IN (pending, abandoned).
Sort: due_date ascending, status_rank, timed flag (all-day rows first: due_time IS NOT NULL sorts after IS NULL), due_time ascending, created_at ascending, id. Overdue pending rows appear first naturally by date.
Completed rows never appear in list mode; the look-back lives in calendar mode only.
Row adornments: folder name label, assignee chip (same default-folder exception), star, "unassigned" chip when assignee_id is null and the folder has more than one member.
Empty state: "Nothing scheduled. Give any task a due date and it moves here."

### Q3C: Planned, calendar mode

Parameters: start and end dates, inclusive, with end minus start at most 62 days; zoom levels day, week, month. Year zoom is cut for v1 because projecting a daily rule at year scale produces hundreds of markers with no designed density rendering.
Real rows: folder_id IN ACCESSIBLE(V) AND due_date BETWEEN start AND end, all three statuses. Pending renders normal (overdue styled on past dates), completed faded and checked, abandoned faded and struck: the calendar is a record.
Virtual instances: for every accessible pending task with a recurrence_rule, the rule instances strictly after that task's due_date, intersected with [start, end] (section 8.5). Ghost style, click opens the current occurrence.
Cell order: all-day banners first (status_rank, id), then timed rows (due_time, status_rank, id), then ghosts (date order, task id).
Empty state (no rows in range): the bare grid; no message.

### Q4: Important

Predicate: folder_id IN ACCESSIBLE(V) AND important = true AND status IN (pending, abandoned).
Sort: due_date ascending nulls last, then within dated rows the Q3 keys (status_rank, timed flag, due_time, created_at, id), within undated rows the Q2 keys (status_rank, created_at descending, id descending). Effect: dated block first, undated block after, exactly one list.
Row adornments: dated rows show due date and time like a Planned row; undated rows show their folder like a Tasks row; assignee chip; the star tooltip here points outward ("Also in Planned, due 2026-07-28" or "Also in Tasks, in Work") since every row here is important by definition.
Un-starring a row removes it from the result on the next fetch; nothing else about the task changes.
Empty state: "Nothing marked important. Star any task and it shows up here."

### Q5: All

Predicate: folder_id IN ACCESSIBLE(V) AND status IN (pending, abandoned). No other condition.
Rendering: two stacked sections in one scroll: "Planned" rendered exactly as Q3 orders it, then "Tasks" rendered exactly as Q2 groups it. No third scheme exists.
Empty state: "Nothing here yet. Add your first task with the + button."

### Q6: Done

Predicate: folder_id IN ACCESSIBLE(V) AND status = 'completed'.
Sort and pagination: keyset on (completed_at descending, id descending), page size 50; cursor is the last row's (completed_at, id). Grouped for display by the completed_at date in V's timezone, most recent day first.
Row adornments: folder name, due date if it had one, star when important, "un-complete" affordance.
Abandoned rows never appear here.
Empty state: "Nothing completed yet. Finished tasks build your history here."

### Q7: Folder detail (member only, else 404)

Three sections over folder F:
1. Scheduled: Q3 predicate and order, folder_id = F.
2. Unscheduled: Q2 row order, folder_id = F (no folder grouping).
3. Completed: Q6 predicate, order, and pagination, folder_id = F, rendered collapsed.
Header: name, completion count per section 8.11, member avatars, share entry point.
Empty states: sections 1 and 2 absent when empty with a single line "No tasks yet. Add one below." when both are empty; section 3 hidden while empty.

### Q8: Search

Input: q, trimmed, 2 to 100 characters, else 422.
Predicate: folder_id IN ACCESSIBLE(V) AND (title ILIKE pattern OR notes ILIKE pattern), pattern = '%' q '%', backed by the trigram index. All three statuses.
Sort: status_rank with completed = 2 (pending, abandoned, completed), updated_at descending, id descending. Keyset pagination, page size 20.
Row: title, folder, status chip, due date if any.
Empty state: "No matches for that search."

### Q9 to Q12 (internal)

Q9 accessible folders and roster: folder_members by user_id; connections by either column. Q10 folder counts: section 8.11. Q11 scheduler poll: reminders where state = 'scheduled' and fire_at <= now(). Q12 login invites: invites where email = viewer's lowercased email and status = 'pending'.

### 6.1 Partition proof

Claim: Tasks (Q2) and Planned (Q3) partition All (Q5) with no gap and no overlap. Proof: all three share the identical scope predicate, folder_id IN ACCESSIBLE(V) AND status IN (pending, abandoned). Q2 adds due_date IS NULL; Q3 adds due_date IS NOT NULL. For any row in Q5's result, due_date is a single column that is either null or not null, exclusively and exhaustively; therefore the row satisfies exactly one of the two added conjuncts, so it appears in exactly one of Q2 and Q3. Conversely any row in Q2 or Q3 satisfies Q5's predicate by construction. Hence Q5 = Q2 union Q3 and Q2 intersect Q3 is empty. The proof depends only on the three scopes staying textually identical; acceptance test AC-070 pins that with a property check.

Coverage corollary: every task row is visible somewhere. Open rows (pending, abandoned) appear in Q5 and their home (Q2 or Q3); completed rows appear in Q6. No status escapes every page.

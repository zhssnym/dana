### Q7: Folder detail (member only, else 404)

Three sections over folder F: 1. Scheduled: Q3 predicate and order, folder_id = F. 2.
Unscheduled: Q2 row order, folder_id = F (no folder grouping), preceded by the hand order
of 4.5: `position` ascending with nulls last (nulls first until the polish round of
2026-08-30), then Q2's own keys. A folder nobody has arranged by hand carries no positions
and therefore reads exactly as Q2 orders it; once arranged, a task created since the last
arrangement carries no position and trails, which is where Q2's oldest-first order already
puts it and where the capture that made it drew it. Ties in `position` are possible by
design (two people may place into one gap at once) and are broken by Q2's keys and finally
by id, so the preamble's byte-identical guarantee holds unchanged. 3. Completed: Q6
predicate, order, and pagination, folder_id = F, rendered collapsed. Header: name,
completion count per section 8.11, member avatars, share entry point. Empty states:
sections 1 and 2 absent when empty with a single line "No tasks yet. Add one below." when
both are empty; section 3 hidden while empty.

### Q4: Important

Predicate: folder_id IN ACCESSIBLE(V) AND important = true AND status IN (pending,
abandoned). Sort: schedule_date ascending nulls last, then within Scheduled rows the Q3 keys
(status_rank, timed flag, due_time, created_at, id), within Anytime rows the Q2 keys
(status_rank, created_at ascending, id ascending; descending until the polish round of
2026-08-30). Effect: Scheduled block first, Anytime block after, exactly one list.
(schedule_date is Q3's leading key, COALESCE(due_date, start_date); this boundary read
`due_date IS NULL` until 2026-09-20. The two blocks are Q3's and Q2's membership rather
than a column of their own - this sentence's own row adornments say so - so they moved
with issue #216, and `schedule_date IS NULL` is Q2's predicate exactly.) Row
adornments: Scheduled rows show due date and time like a Scheduled row; Anytime rows show
their folder like an Anytime row; assignee chip; the star tooltip here points outward
("Also in Scheduled, due 2026-07-28" or "Also in Anytime, in Work") since every row here
is important by definition. (The two page names in this sentence read "Planned" and
"Tasks" until 2026-09-03, issue #146. RFC 0005 renamed the pages and 9.1's route table
fixes the v2 names; the client said the v1 words in this tooltip until issue #19 took it
to the v2 ones, and AC-099, which cites this sentence for the two strings, was amended
with it. The queries keep their v1 names in parentheses for the reason this section's
README gives; a page name inside an example string is not a query name.) Un-starring a
row removes it from the result on the next fetch; nothing else about the task changes.
Empty state: "Nothing marked important. Star any task and it shows up here."

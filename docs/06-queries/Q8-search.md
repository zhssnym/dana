### Q8: Search

Input: q, trimmed, 2 to 100 characters, else 422. Predicate: folder_id IN ACCESSIBLE(V)
AND (title ILIKE pattern OR notes ILIKE pattern), pattern = '%' q '%', backed by the
trigram index. All three statuses. The query's own wildcards are literal: a backslash,
percent, or underscore inside q is escaped before it is interpolated, so "50%" matches text
containing those three characters. Without the escape the pattern syntax leaks into the
search box, where nothing tells a user it is there. Sort: status_rank over all three
statuses, updated_at descending, id descending. Keyset pagination, page size 20. Row:
title, folder, status chip, due date if any. Empty state: the copy in
`app/src/client/pages/empty-states.ts`.

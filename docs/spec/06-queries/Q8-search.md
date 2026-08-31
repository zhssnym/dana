### Q8: Search

Input: q, trimmed, 2 to 100 characters, else 422.
Predicate: folder_id IN ACCESSIBLE(V) AND (title ILIKE pattern OR notes ILIKE pattern), pattern = '%' q '%', backed by the trigram index. All three statuses.
The query's own wildcards are literal, ruled at P4 mid-package change control on 2026-08-07: a backslash, percent, or underscore inside q is escaped before it is interpolated, so a search for "50%" matches text containing those three characters rather than everything containing "50", and "a_b" matches that literal underscore rather than any character between a and b. Without the escape the pattern syntax leaks into the search box, where nothing tells a user it is there; escaping costs nothing at the index, which sees trigrams either way.
Sort: status_rank over all three ranks the preamble defines (pending, abandoned, completed), updated_at descending, id descending. Keyset pagination, page size 20.
Row: title, folder, status chip, due date if any.
Empty state: "No matches for that search."

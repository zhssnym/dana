## 6. Query specifications

Definitions used by every query:

- ACCESSIBLE(V) = set of folder_id from folder_members where user_id = V.
- open statuses = pending, abandoned. status_rank: pending = 0, abandoned = 1,
  completed = 2; one scale serves every query, so a completed row's place is defined
  wherever a result admits it.
- today = today(V), from the request's tz parameter.
- All orders end in id (ascending unless stated) as the final tie-breaker, so any two
  agents produce byte-identical result sequences.
- Every view returns rows already ordered; clients never re-sort.
- List caps: Q1, Q2, Q3 in list mode, Q4, Q5, and folder open sections return at most 1000
  rows and set truncated = true beyond it; the UI shows a notice. Q6, folder completed
  sections, and search are keyset-paginated. At Dana's scale the caps are unreachable;
  cursors everywhere would be speculative complexity.
- The cap is per response, not per array. Where a response carries several row arrays
  (Q1's sections, Q5's two), the 1000 counts across all of them together, because each
  capped body of 7.10 carries exactly one truncated flag. The rows kept are the first 1000
  in the order 7.10 enumerates that response's sections, so a capped response is a prefix
  of one determined sequence.
- Rows with deleted_at set are excluded everywhere except the Trash surface of 7.13; the
  guard is implicit in each query rather than restated per query.

The Focus lists (Today, Upcoming, Assignments and the lists a viewer adds) read one
endpoint, GET /views/focus, which filters Q1 or Q5's pending rows before the cap. Assignments
is those open rows grouped by assignee on the client, the viewer first and the unassigned
last; it adds no predicate of its own, which is why it appears in section 9 and not here.

Query headings carry their v1 page name in parentheses because other sections and code
comments cite Q1 to Q3C by those titles.

| | File | Covers |
| - | - | - |
| Q1 | [`Q1-today-open-list.md`](Q1-today-open-list.md) | Q1: Today, open list (v1: My Day) |
| Q1R | [`Q1R-today-recap-section.md`](Q1R-today-recap-section.md) | Q1R: Today, recap section (v1: My Day recap) |
| Q2 | [`Q2-undated-open-tasks.md`](Q2-undated-open-tasks.md) | Q2: Undated open tasks (v1: Tasks; serves Desk's grouping and the Anytime view) |
| Q3 | [`Q3-scheduled-list-mode.md`](Q3-scheduled-list-mode.md) | Q3: Scheduled, list mode (v1: Planned) |
| Q3C | [`Q3C-scheduled-calendar-mode.md`](Q3C-scheduled-calendar-mode.md) | Q3C: Scheduled, calendar mode (v1: Planned calendar) |
| Q4 | [`Q4-important.md`](Q4-important.md) | Q4: Important |
| Q5 | [`Q5-all.md`](Q5-all.md) | Q5: All |
| Q6 | [`Q6-done.md`](Q6-done.md) | Q6: Done |
| Q7 | [`Q7-folder-detail.md`](Q7-folder-detail.md) | Q7: Folder detail (member only, else 404) |
| Q8 | [`Q8-search.md`](Q8-search.md) | Q8: Search |
| Q9 | [`Q9-Q12-internal.md`](Q9-Q12-internal.md) | Q9 to Q12 (internal) |
| 6.1 | [`06.1-partition-proof.md`](06.1-partition-proof.md) | 6.1 Partition proof |

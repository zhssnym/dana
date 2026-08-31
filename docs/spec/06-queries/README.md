## 6. Query specifications

Definitions used by every query:
- ACCESSIBLE(V) = set of folder_id from folder_members where user_id = V.
- open statuses = pending, abandoned. status_rank: pending = 0, abandoned = 1, completed = 2. Ruled at P4 mid-package change control on 2026-08-07: this list defined two ranks while Q8 extended the scale locally to three and Q3C used status_rank bare over a result admitting all three, which left a completed row's position inside a calendar cell undefined. The third number is Q8's own, lifted here so one definition serves every query instead of one query carrying a rank the others also need. Queries whose predicate admits only the open statuses never reach it.
- today = today(V), from the request's tz parameter.
- All orders end in id (ascending unless stated) as the final tie-breaker, so any two agents produce byte-identical result sequences.
- Every view returns rows already ordered; clients never re-sort.
- List caps: Q1, Q2, Q3 in list mode, Q4, Q5, and folder open sections return at most 1000 rows and set truncated = true beyond it; the UI shows a notice. Q6, folder completed sections, and search are keyset-paginated. Rationale: at Dana's scale the caps are unreachable; cursors everywhere would be speculative complexity. (This line named the pages by their v1 titles until the S29 fold of 2026-08-27. It names the queries instead, because RFC 0005 renamed the pages and did not rename the queries, and a cap list that has to be re-audited on every rename is a cap list that will one day be wrong.)
- The cap is per response, not per array, ruled at P4 mid-package change control on 2026-08-07. Where a response carries several row arrays, Q1's three sections or Q5's two, the 1000 counts across all of them together. Two grounds: the sentence above enumerates pages rather than arrays, and each capped body of 7.10 carries exactly one truncated flag, which a per-array cap has no way to report. The per-array reading would let All answer three thousand rows under a single flag, which is the notice's whole purpose defeated. The rows kept are the first 1000 taken in the order 7.10 enumerates that response's own sections, so a capped response is a prefix of one determined sequence and two agents still produce byte-identical results.

Two v2 notes that touch every query above. First, rows with deleted_at set are excluded everywhere except the Trash surface of 7.13; the guard is implicit in each query rather than restated per query. Second, Assignments is not a query of its own: it is a client-side composition over the open tasks the viewer can already read, grouped by assignee with the unassigned last, which is why it appears in section 9 and not here.

**The five query headings below carry their v1 page name in parentheses and that is deliberate.** RFC 0005 renamed the pages and renamed no query, because acceptance criteria, older RFCs and this section's own cross-references cite Q1 to Q3C by their original titles. A heading that dropped the old name would silently break every one of those citations; a heading that kept only the old name would go on telling a reader that Dana has a page called Planned. Both names, one heading.

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

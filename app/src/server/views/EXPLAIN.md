# EXPLAIN record: the eight queries of section 6

Produced by `npx tsx src/server/views/explain.ts`. Regenerate it rather
than editing it: every plan below is the plan of a statement this package
actually issues, because the tool hands a spy executor to the same view
functions the router calls and explains whatever SQL reaches it.

Volume: 48000 task rows on PGlite (embedded Postgres 18),
half of them in folders the viewer is not a member of, with steps, My Day
entries, and a needle matching one title in forty. ANALYZE was run before
the first statement. Costs and timings are off, so this file changes only
when a plan changes.

Two plans per statement. **Planner choice** is what the planner picked at
this volume. **enable_seqscan off** is the same statement with the
sequential option removed, which is the other option RFC 0001 names and
answers a different question: which index the statement can ride when the
planner has to choose one.

Neither is evidence about production, whose row counts and statistics are
not these. What this file is evidence of is which relation each statement
reaches and by which path, and that every predicate of section 6 can ride
the index 4.12 names for it. Read the findings first; they are what the
plans below were read for.

## Findings

1. **Every 4.12 index that section 6 names is reached by the predicate
   it was created for, and since issue #217 one of them is reached by
   fewer of its columns.** The probes at the end show each index chosen:
   the assignee index for Q1, the folder index for the folder-scoped
   predicates of Q3C, its projection, and Q7, the partial completed index
   for Q6, and the GIN trigram index for Q8. Finding 7 is the part that
   moved.
2. **At page scope the folder is not a constant, and the plan says so.**
   4.12 justifies `tasks_folder_status_due_idx` by "Q2, Q3, Q5, Q7 home
   and view scans within accessible folders", and Q7 is where that reads
   literally: one folder, one leading column, one index probe. Q2, Q3 and
   Q5 have no folder in their predicate at all, only the membership join,
   so the planner reaches tasks by the (status, due_date) part alone and
   picks whichever index carries it, which here is the assignee index
   scanned past its unbound leading column (Postgres 18 skip scan), then
   hash joins `folder_members`. The 4.12 entry is still the right index
   for the row it names; what the plan adds is that on the three page
   queries it is reached without its leading column, so the accessible
   folder set is applied as a join rather than as an index bound.
3. **Q4 has no index of its own, and 4.12 says so by omission**: there is
   none on `tasks.important`. Its probe below shows the star as a filter,
   over a sequential scan by choice and over the same skip-scanned index
   with the sequential option removed. That is adequate for v1, and the
   justification is the scale rather than the plan: the rows this page
   reads are already bounded by the accessible-folder scope and the two
   open statuses, and the response is capped at 1000. An index on
   (important) WHERE important would start to pay only once one account
   held tens of thousands of open starred rows, which is not a v1 shape,
   and it would cost a write on every star. Recorded rather than
   requested: this role never adds an index, and the route to
   the data-model question stays open with this query if the shape
   changes.
4. **Q8 is the one statement whose own plan does not reach its own
   index**, and the reason is the join rather than the predicate. With six
   relations joined the planner drives from `folder_members` and reaches
   tasks by the folder scope; with the predicate alone it takes the
   trigram index, which the last probe shows from both sides. At this
   volume a sequential scan of 48000 rows is genuinely cheaper than
   either. Nothing is owed here at v1; the thing to watch in production is
   this endpoint, which 10.4 already singles out as the one view with a
   rate limit.
5. **The card projection is per row, and it shows.** Every statement
   carries a lateral step count and a correlated invite lookup, one index
   lookup each per row the sort passes through. That is the cost of
   answering the frozen TaskCard from a list rather than one task at a
   time, and it is bounded by the same cap the list is. If it ever needs
   to shrink, the shape is a two-stage query, ids in order first and the
   projection joined onto the page, which is a change inside this
   directory and needs nobody.
6. **Q3C is the one endpoint that issues two statements, and the second
   is deliberately not bounded by the range.** Q3C scopes its ghosts by
   accessible, pending and rule-carrying and by nothing else, so the rows
   8.5 projects from are not the rows the calendar draws: a series whose
   current occurrence precedes the requested range still projects into
   it, which AC-143 pins. The second plan below reaches tasks by the
   status bound alone, the same skip scan finding 2 describes, and
   applies the rule as a filter. 4.12 names no index for a rule-carrying
   predicate and none is asked for: the fetch is already bounded by the
   accessible-folder scope and one status, and a partial index on
   (recurrence_rule) WHERE recurrence_rule IS NOT NULL would pay only
   once one account held tens of thousands of open series. Recorded
   rather than requested, like the star in finding 3, and the route to
   the data-model question stays open with this query.
7. **Issue #217 turned Q1s date from an index bound into a filter, and
   issue #216s Scheduled membership rides no index at all. Neither is
   asked to be fixed here, and this finding is the argument for that
   rather than a note that it was not noticed.** Q1s probe used to read
   `Index Cond: (assignee_id = .. AND status = .. AND due_date IS NOT
   NULL AND due_date <= CURRENT_DATE)`, three columns of
   `tasks_assignee_status_due_idx`. The clause now compares
   `coalesce(start_date, due_date)`, which no index carries, so the plan
   below bounds on the first two columns and rechecks the date as a
   Filter. What the two remaining columns bound to is one persons
   pending tasks, which is the set the third column was narrowing, and
   4.12s standing argument for Q4s star applies here with more force
   than it does there: the rows are already bounded, and the response is
   capped at 1000. Q3s membership is the second half. An OR over two
   nullable columns is no b-tree range, and the probe shows what that
   means: a sequential scan by the planners choice, and with the
   sequential option removed the status bound with the pair as a Filter.
   Finding 2 is why that costs nothing new - Q2, Q3 and Q5 carry no
   folder in their predicate and never rode this index by its leading
   column anyway - and Q3s ORDER BY was never answered from an index
   either, its second key being a CASE. An expression index on
   `coalesce(start_date, due_date)`, or a pair of partial ones under a
   BitmapOr, would restore what Q1 lost and give Q3 something to ride.
   Both are refused for now on the same two grounds every entry in this
   file refuses one: the cost is a write on every task whose dates move,
   and 4.12 is a frozen section, so an index belongs there before it
   belongs in a migration. Revisit with a real account whose Today or
   Scheduled page reads slowly, which is the same sentence 4.12 closes
   with.

## The statements the router issues

### Q1 and Q1R: GET /views/my-day

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at, (t.assignee_id = $1 AND coalesce(t.start_date, t.due_date) IS NOT NULL
              AND coalesce(t.start_date, t.due_date) <= $2::date) AS automatic,
               to_char(coalesce(t.start_date, t.due_date), 'YYYY-MM-DD') AS activation_date,
               to_char(e.added_on, 'YYYY-MM-DD') AS added_on
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $3
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $4
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status = 'pending' AND ((t.assignee_id = $5 AND coalesce(t.start_date, t.due_date) IS NOT NULL
              AND coalesce(t.start_date, t.due_date) <= $6::date) OR e.task_id IS NOT NULL)
        ORDER BY t.due_date ASC NULLS LAST, t.due_time ASC NULLS FIRST, t.created_at ASC, t.id ASC LIMIT $7
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.due_date, t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    Filter: (((t.assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (COALESCE(t.start_date, t.due_date) IS NOT NULL) AND (COALESCE(t.start_date, t.due_date) <= '2026-09-20'::date)) OR (e.task_id IS NOT NULL))
                    ->  Hash Left Join
                          Hash Cond: (t.created_by = cb.id)
                          ->  Hash Left Join
                                Hash Cond: (t.assignee_id = a.id)
                                ->  Hash Join
                                      Hash Cond: (m.folder_id = f.id)
                                      ->  Hash Join
                                            Hash Cond: (t.folder_id = m.folder_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: (status = 'pending'::text)
                                                  Filter: (deleted_at IS NULL)
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: (status = 'pending'::text)
                                            ->  Hash
                                                  ->  Seq Scan on folder_members m
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Hash
                                            ->  Seq Scan on folders f
                                                  Filter: (deleted_at IS NULL)
                                ->  Hash
                                      ->  Seq Scan on users a
                          ->  Hash
                                ->  Seq Scan on users cb
                                      Filter: (deleted_at IS NULL)
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: t.due_date, t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  Filter: (((t.assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (COALESCE(t.start_date, t.due_date) IS NOT NULL) AND (COALESCE(t.start_date, t.due_date) <= '2026-09-20'::date)) OR (e.task_id IS NOT NULL))
                                                  ->  Index Scan using tasks_assignee_status_due_idx on tasks t
                                                        Index Cond: (status = 'pending'::text)
                                                        Filter: (deleted_at IS NULL)
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q1 and Q1R: GET /views/my-day (statement 2)

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status = 'completed'
               AND t.completed_at >= $3::timestamptz
               AND t.completed_at < $4::timestamptz
               AND (t.assignee_id = $5 OR t.completed_by = $6
                    OR e.task_id IS NOT NULL)
        ORDER BY t.completed_at DESC, t.id DESC LIMIT $7
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.completed_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                Join Filter: (m.folder_id = t.folder_id)
                                ->  Nested Loop
                                      Join Filter: (m.folder_id = f.id)
                                      ->  Seq Scan on folders f
                                            Filter: (deleted_at IS NULL)
                                      ->  Materialize
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                ->  Materialize
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            Filter: ((t.assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) OR (t.completed_by = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) OR (e.task_id IS NOT NULL))
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((completed_at >= '2026-09-19 23:00:00+00'::timestamp with time zone) AND (completed_at < '2026-09-20 23:00:00+00'::timestamp with time zone) AND (status = 'completed'::text))
                                                  Filter: (deleted_at IS NULL)
                                                  ->  Bitmap Index Scan on tasks_done_pagination_idx
                                                        Index Cond: ((completed_at >= '2026-09-19 23:00:00+00'::timestamp with time zone) AND (completed_at < '2026-09-20 23:00:00+00'::timestamp with time zone))
                                            ->  Hash
                                                  ->  Seq Scan on my_day_entries e
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
                    ->  Memoize
                          Cache Key: t.created_by
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users cb
                                Index Cond: (id = t.created_by)
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: t.completed_at DESC, t.id DESC
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          Filter: ((t.assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) OR (t.completed_by = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) OR (e.task_id IS NOT NULL))
                          ->  Nested Loop Left Join
                                ->  Nested Loop Left Join
                                      ->  Nested Loop
                                            ->  Nested Loop
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: ((completed_at >= '2026-09-19 23:00:00+00'::timestamp with time zone) AND (completed_at < '2026-09-20 23:00:00+00'::timestamp with time zone) AND (status = 'completed'::text))
                                                        Filter: (deleted_at IS NULL)
                                                        ->  Bitmap Index Scan on tasks_done_pagination_idx
                                                              Index Cond: ((completed_at >= '2026-09-19 23:00:00+00'::timestamp with time zone) AND (completed_at < '2026-09-20 23:00:00+00'::timestamp with time zone))
                                                  ->  Memoize
                                                        Cache Key: t.folder_id
                                                        Cache Mode: logical
                                                        ->  Index Scan using folders_pkey on folders f
                                                              Index Cond: (id = t.folder_id)
                                                              Filter: (deleted_at IS NULL)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: t.assignee_id
                                            Cache Mode: logical
                                            ->  Index Scan using users_pkey on users a
                                                  Index Cond: (id = t.assignee_id)
                                ->  Memoize
                                      Cache Key: t.created_by
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users cb
                                            Index Cond: (id = t.created_by)
                                            Filter: (deleted_at IS NULL)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q2: GET /views/tasks

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND NOT (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
        ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.created_by = cb.id)
                          ->  Hash Left Join
                                Hash Cond: (t.assignee_id = a.id)
                                ->  Hash Join
                                      Hash Cond: (m.folder_id = f.id)
                                      ->  Hash Join
                                            Hash Cond: (t.folder_id = m.folder_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Hash
                                                  ->  Seq Scan on folder_members m
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Hash
                                            ->  Seq Scan on folders f
                                                  Filter: (deleted_at IS NULL)
                                ->  Hash
                                      ->  Seq Scan on users a
                          ->  Hash
                                ->  Seq Scan on users cb
                                      Filter: (deleted_at IS NULL)
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                        Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                                        ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                              Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q3: GET /views/planned

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
        ORDER BY coalesce(t.due_date, t.start_date) ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Seq Scan on tasks t
                                                  Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)) AND (status = ANY ('{pending,abandoned}'::text[])))
                                            ->  Hash
                                                  ->  Seq Scan on my_day_entries e
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                                            Filter: (deleted_at IS NULL)
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Materialize
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                        Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)))
                                                        ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                              Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q3C: GET /views/planned/calendar

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE coalesce(t.start_date, t.due_date) <= $3::date
               AND coalesce(t.due_date, t.start_date) >= $4::date
        ORDER BY coalesce(t.start_date, t.due_date) ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.id ASC
```

Planner choice:

```
Sort
  Sort Key: (COALESCE(t.start_date, t.due_date)), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.id
  ->  Nested Loop Left Join
        ->  Hash Left Join
              Hash Cond: (t.id = e.task_id)
              ->  Hash Left Join
                    Hash Cond: (t.created_by = cb.id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Hash Join
                                Hash Cond: (m.folder_id = f.id)
                                ->  Hash Join
                                      Hash Cond: (t.folder_id = m.folder_id)
                                      ->  Seq Scan on tasks t
                                            Filter: ((deleted_at IS NULL) AND (COALESCE(start_date, due_date) <= '2026-10-20'::date) AND (COALESCE(due_date, start_date) >= '2026-08-21'::date))
                                      ->  Hash
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                ->  Hash
                                      ->  Seq Scan on folders f
                                            Filter: (deleted_at IS NULL)
                          ->  Hash
                                ->  Seq Scan on users a
                    ->  Hash
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Hash
                    ->  Seq Scan on my_day_entries e
                          Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Seq Scan on invites i
                            Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Sort
  Sort Key: (COALESCE(t.start_date, t.due_date)), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.id
  ->  Nested Loop Left Join
        ->  Hash Left Join
              Hash Cond: (t.id = e.task_id)
              ->  Hash Left Join
                    Hash Cond: (t.created_by = cb.id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Nested Loop
                                Join Filter: (m.folder_id = t.folder_id)
                                ->  Merge Join
                                      Merge Cond: (m.folder_id = f.id)
                                      ->  Sort
                                            Sort Key: m.folder_id
                                            ->  Index Scan using folder_members_user_id_idx on folder_members m
                                                  Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Index Scan using folders_pkey on folders f
                                            Filter: (deleted_at IS NULL)
                                ->  Bitmap Heap Scan on tasks t
                                      Recheck Cond: (folder_id = f.id)
                                      Filter: ((deleted_at IS NULL) AND (COALESCE(start_date, due_date) <= '2026-10-20'::date) AND (COALESCE(due_date, start_date) >= '2026-08-21'::date))
                                      ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                            Index Cond: (folder_id = f.id)
                          ->  Hash
                                ->  Index Scan using users_pkey on users a
                    ->  Hash
                          ->  Index Scan using users_pkey on users cb
                                Filter: (deleted_at IS NULL)
              ->  Hash
                    ->  Bitmap Heap Scan on my_day_entries e
                          Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                          ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q3C: GET /views/planned/calendar (statement 2)

```sql
SELECT t.id, t.title, t.status, t.folder_id, t.recurrence_rule,
               to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
        WHERE t.status = 'pending'
       AND t.recurrence_rule IS NOT NULL
        ORDER BY t.id ASC
```

Planner choice:

```
Sort
  Sort Key: t.id
  ->  Hash Join
        Hash Cond: (m.folder_id = f.id)
        ->  Hash Join
              Hash Cond: (t.folder_id = m.folder_id)
              ->  Bitmap Heap Scan on tasks t
                    Recheck Cond: (status = 'pending'::text)
                    Filter: ((deleted_at IS NULL) AND (recurrence_rule IS NOT NULL))
                    ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                          Index Cond: (status = 'pending'::text)
              ->  Hash
                    ->  Seq Scan on folder_members m
                          Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
        ->  Hash
              ->  Seq Scan on folders f
                    Filter: (deleted_at IS NULL)
```

enable_seqscan off:

```
Sort
  Sort Key: t.id
  ->  Hash Join
        Hash Cond: (m.folder_id = f.id)
        ->  Hash Join
              Hash Cond: (t.folder_id = m.folder_id)
              ->  Bitmap Heap Scan on tasks t
                    Recheck Cond: (status = 'pending'::text)
                    Filter: ((deleted_at IS NULL) AND (recurrence_rule IS NOT NULL))
                    ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                          Index Cond: (status = 'pending'::text)
              ->  Hash
                    ->  Index Scan using folder_members_user_id_idx on folder_members m
                          Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
        ->  Hash
              ->  Index Scan using folders_pkey on folders f
                    Filter: (deleted_at IS NULL)
```

### Q4: GET /views/important

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.important = true
        ORDER BY (coalesce(t.due_date, t.start_date) IS NULL) ASC, coalesce(t.due_date, t.start_date) ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE WHEN coalesce(t.due_date, t.start_date) IS NULL THEN NULL ELSE t.created_at END ASC,
       CASE WHEN coalesce(t.due_date, t.start_date) IS NULL THEN NULL ELSE t.id END ASC,
       CASE WHEN coalesce(t.due_date, t.start_date) IS NULL THEN t.created_at END ASC,
       CASE WHEN coalesce(t.due_date, t.start_date) IS NULL THEN t.id END ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: ((COALESCE(t.due_date, t.start_date) IS NULL)), (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN NULL::timestamp with time zone ELSE t.created_at END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN NULL::uuid ELSE t.id END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN t.created_at ELSE NULL::timestamp with time zone END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN t.id ELSE NULL::uuid END)
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Seq Scan on tasks t
                                                  Filter: ((deleted_at IS NULL) AND important AND (status = ANY ('{pending,abandoned}'::text[])))
                                            ->  Hash
                                                  ->  Seq Scan on my_day_entries e
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                                            Filter: (deleted_at IS NULL)
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Materialize
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: ((COALESCE(t.due_date, t.start_date) IS NULL)), (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN NULL::timestamp with time zone ELSE t.created_at END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN NULL::uuid ELSE t.id END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN t.created_at ELSE NULL::timestamp with time zone END), (CASE WHEN (COALESCE(t.due_date, t.start_date) IS NULL) THEN t.id ELSE NULL::uuid END)
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                        Filter: ((deleted_at IS NULL) AND important)
                                                        ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                              Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q5: GET /views/all

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
        ORDER BY coalesce(t.due_date, t.start_date) ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Seq Scan on tasks t
                                                  Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)) AND (status = ANY ('{pending,abandoned}'::text[])))
                                            ->  Hash
                                                  ->  Seq Scan on my_day_entries e
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                                            Filter: (deleted_at IS NULL)
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Materialize
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                        Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)))
                                                        ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                              Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q5: GET /views/all (statement 2)

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND NOT (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
        ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.created_by = cb.id)
                          ->  Hash Left Join
                                Hash Cond: (t.assignee_id = a.id)
                                ->  Hash Join
                                      Hash Cond: (m.folder_id = f.id)
                                      ->  Hash Join
                                            Hash Cond: (t.folder_id = m.folder_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Hash
                                                  ->  Seq Scan on folder_members m
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Hash
                                            ->  Seq Scan on folders f
                                                  Filter: (deleted_at IS NULL)
                                ->  Hash
                                      ->  Seq Scan on users a
                          ->  Hash
                                ->  Seq Scan on users cb
                                      Filter: (deleted_at IS NULL)
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Hash Left Join
                                                  Hash Cond: (t.id = e.task_id)
                                                  ->  Bitmap Heap Scan on tasks t
                                                        Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                        Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                                        ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                              Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  ->  Hash
                                                        ->  Bitmap Heap Scan on my_day_entries e
                                                              Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                                              ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                      ->  Memoize
                                            Cache Key: m.folder_id
                                            Cache Mode: logical
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = m.folder_id)
                                                  Filter: (deleted_at IS NULL)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Memoize
                                Cache Key: t.created_by
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users cb
                                      Index Cond: (id = t.created_by)
                                      Filter: (deleted_at IS NULL)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q6: GET /views/done

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at, to_char(t.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status = 'completed'
        ORDER BY t.completed_at DESC, t.id DESC LIMIT $3
```

Planner choice:

```
Limit
  ->  Nested Loop Left Join
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Index Scan using tasks_done_pagination_idx on tasks t
                                            Filter: (deleted_at IS NULL)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                                            Filter: (deleted_at IS NULL)
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Materialize
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Seq Scan on invites i
                            Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Nested Loop Left Join
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Index Scan using tasks_done_pagination_idx on tasks t
                                            Filter: (deleted_at IS NULL)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                                            Filter: (deleted_at IS NULL)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
                    ->  Memoize
                          Cache Key: t.created_by
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users cb
                                Index Cond: (id = t.created_by)
                                Filter: (deleted_at IS NULL)
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q7: GET /folders/:id/tasks?section=open

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND (t.start_date IS NOT NULL OR t.due_date IS NOT NULL) AND t.folder_id = $3
        ORDER BY coalesce(t.due_date, t.start_date) ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Hash Left Join
                                Hash Cond: (t.id = e.task_id)
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Seq Scan on folder_members m
                                                  Filter: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                            ->  Seq Scan on folders f
                                                  Filter: ((deleted_at IS NULL) AND (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid))
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
                                            Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)))
                                            ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                  Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
                                ->  Hash
                                      ->  Seq Scan on my_day_entries e
                                            Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
                    ->  Memoize
                          Cache Key: t.created_by
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users cb
                                Index Cond: (id = t.created_by)
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: (COALESCE(t.due_date, t.start_date)), (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop Left Join
                                ->  Nested Loop Left Join
                                      ->  Nested Loop
                                            ->  Nested Loop
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                                  ->  Index Scan using folders_pkey on folders f
                                                        Index Cond: (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
                                                        Filter: (deleted_at IS NULL)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
                                                  Filter: ((deleted_at IS NULL) AND ((start_date IS NOT NULL) OR (due_date IS NOT NULL)))
                                                  ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
                                      ->  Memoize
                                            Cache Key: t.assignee_id
                                            Cache Mode: logical
                                            ->  Index Scan using users_pkey on users a
                                                  Index Cond: (id = t.assignee_id)
                                ->  Memoize
                                      Cache Key: t.created_by
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users cb
                                            Index Cond: (id = t.created_by)
                                            Filter: (deleted_at IS NULL)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q7: GET /folders/:id/tasks?section=open (statement 2)

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND NOT (t.start_date IS NOT NULL OR t.due_date IS NOT NULL) AND t.folder_id = $3
        ORDER BY t.position ASC NULLS LAST,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at ASC, t.id ASC LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t."position" COLLATE "C", (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Hash Left Join
                                Hash Cond: (t.id = e.task_id)
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Seq Scan on folder_members m
                                                  Filter: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                            ->  Seq Scan on folders f
                                                  Filter: ((deleted_at IS NULL) AND (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid))
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                            ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                  Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                ->  Hash
                                      ->  Seq Scan on my_day_entries e
                                            Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
                    ->  Memoize
                          Cache Key: t.created_by
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users cb
                                Index Cond: (id = t.created_by)
                                Filter: (deleted_at IS NULL)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: t."position" COLLATE "C", (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop Left Join
                                ->  Nested Loop Left Join
                                      ->  Nested Loop
                                            ->  Nested Loop
                                                  ->  Index Only Scan using folder_members_pkey on folder_members m
                                                        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                                  ->  Index Scan using folders_pkey on folders f
                                                        Index Cond: (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
                                                        Filter: (deleted_at IS NULL)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  Filter: ((deleted_at IS NULL) AND (start_date IS NULL))
                                                  ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                      ->  Memoize
                                            Cache Key: t.assignee_id
                                            Cache Mode: logical
                                            ->  Index Scan using users_pkey on users a
                                                  Index Cond: (id = t.assignee_id)
                                ->  Memoize
                                      Cache Key: t.created_by
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users cb
                                            Index Cond: (id = t.created_by)
                                            Filter: (deleted_at IS NULL)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q7 section 3: GET /folders/:id/tasks?section=completed

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at, to_char(t.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status = 'completed' AND t.folder_id = $3
        ORDER BY t.completed_at DESC, t.id DESC LIMIT $4
```

Planner choice:

```
Limit
  ->  Nested Loop Left Join
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Index Scan using tasks_done_pagination_idx on tasks t
                                      Filter: ((deleted_at IS NULL) AND (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid))
                                ->  Materialize
                                      ->  Nested Loop
                                            ->  Seq Scan on folder_members m
                                                  Filter: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                            ->  Seq Scan on folders f
                                                  Filter: ((deleted_at IS NULL) AND (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid))
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Materialize
                          ->  Seq Scan on users cb
                                Filter: (deleted_at IS NULL)
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Seq Scan on invites i
                            Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Nested Loop Left Join
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    Join Filter: (cb.id = t.created_by)
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                ->  Index Scan using tasks_done_pagination_idx on tasks t
                                      Filter: ((deleted_at IS NULL) AND (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid))
                                ->  Materialize
                                      ->  Nested Loop
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
                                                  Filter: (deleted_at IS NULL)
                          ->  Materialize
                                ->  Index Scan using users_pkey on users a
                    ->  Materialize
                          ->  Index Scan using users_pkey on users cb
                                Filter: (deleted_at IS NULL)
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid))
        ->  Aggregate
              ->  Index Scan using steps_task_id_idx on steps st
                    Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q8: GET /search

```sql
SELECT 
    t.id, t.title, t.status, t.important,
    to_char(t.start_date, 'YYYY-MM-DD') AS start_date,
    to_char(t.due_date, 'YYYY-MM-DD') AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (t.recurrence_rule IS NOT NULL) AS is_recurring,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at, to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE (t.title ILIKE $3 OR t.notes ILIKE $4
                OR EXISTS (SELECT 1 FROM steps s
                            WHERE s.task_id = t.id
                              AND s.title ILIKE $5))
        ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.updated_at DESC, t.id DESC LIMIT $6
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.updated_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Nested Loop Left Join
                          Join Filter: (cb.id = t.created_by)
                          ->  Nested Loop Left Join
                                Join Filter: (a.id = t.assignee_id)
                                ->  Nested Loop
                                      Join Filter: (m.folder_id = t.folder_id)
                                      ->  Nested Loop
                                            Join Filter: (m.folder_id = f.id)
                                            ->  Seq Scan on folders f
                                                  Filter: (deleted_at IS NULL)
                                            ->  Materialize
                                                  ->  Seq Scan on folder_members m
                                                        Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Index Scan using tasks_folder_status_due_idx on tasks t
                                            Index Cond: (folder_id = f.id)
                                            Filter: ((deleted_at IS NULL) AND ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text) OR (ANY (id = (hashed SubPlan 3).col1))))
                                            SubPlan 3
                                              ->  Seq Scan on steps s
                                                    Filter: (title ~~* '%quarterly needle%'::text)
                                ->  Materialize
                                      ->  Seq Scan on users a
                          ->  Materialize
                                ->  Seq Scan on users cb
                                      Filter: (deleted_at IS NULL)
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              ->  Aggregate
                    ->  Index Scan using steps_task_id_idx on steps st
                          Index Cond: (task_id = t.id)
              SubPlan 1
                ->  Limit
                      ->  Sort
                            Sort Key: i.created_at DESC, i.id DESC
                            ->  Seq Scan on invites i
                                  Filter: ((task_id = t.id) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Limit
  ->  Result
        ->  Sort
              Sort Key: (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.updated_at DESC, t.id DESC
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop Left Join
                                Join Filter: (cb.id = t.created_by)
                                ->  Nested Loop Left Join
                                      Join Filter: (a.id = t.assignee_id)
                                      ->  Nested Loop
                                            Join Filter: (m.folder_id = t.folder_id)
                                            ->  Nested Loop
                                                  Join Filter: (m.folder_id = f.id)
                                                  ->  Index Scan using folders_pkey on folders f
                                                        Filter: (deleted_at IS NULL)
                                                  ->  Materialize
                                                        ->  Index Scan using folder_members_user_id_idx on folder_members m
                                                              Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                            ->  Index Scan using tasks_folder_status_due_idx on tasks t
                                                  Index Cond: (folder_id = f.id)
                                                  Filter: ((deleted_at IS NULL) AND ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text) OR (ANY (id = (hashed SubPlan 3).col1))))
                                                  SubPlan 3
                                                    ->  Seq Scan on steps s
                                                          Disabled: true
                                                          Filter: (title ~~* '%quarterly needle%'::text)
                                      ->  Materialize
                                            ->  Index Scan using users_pkey on users a
                                ->  Materialize
                                      ->  Index Scan using users_pkey on users cb
                                            Filter: (deleted_at IS NULL)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
                    ->  Aggregate
                          ->  Index Scan using steps_task_id_idx on steps st
                                Index Cond: (task_id = t.id)
        SubPlan 1
          ->  Limit
                ->  Sort
                      Sort Key: i.created_at DESC, i.id DESC
                      ->  Index Scan using invites_pending_email_idx on invites i
                            Filter: (task_id = t.id)
```

### Q8: GET /search (statement 2)

```sql
SELECT f.id, f.name FROM folders f
        JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = $1
        WHERE f.deleted_at IS NULL
          AND (f.name ILIKE $2 OR f.description ILIKE $3)
        ORDER BY lower(f.name) ASC, f.id ASC
        LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (lower(f.name)), f.id
        ->  Hash Join
              Hash Cond: (m.folder_id = f.id)
              ->  Seq Scan on folder_members m
                    Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              ->  Hash
                    ->  Seq Scan on folders f
                          Filter: ((deleted_at IS NULL) AND ((name ~~* '%quarterly needle%'::text) OR (description ~~* '%quarterly needle%'::text)))
```

enable_seqscan off:

```
Limit
  ->  Sort
        Sort Key: (lower(f.name)), f.id
        ->  Nested Loop
              Join Filter: (m.folder_id = f.id)
              ->  Index Scan using folders_pkey on folders f
                    Filter: ((deleted_at IS NULL) AND ((name ~~* '%quarterly needle%'::text) OR (description ~~* '%quarterly needle%'::text)))
              ->  Index Scan using folder_members_user_id_idx on folder_members m
                    Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
```

### Q8: GET /search (statement 3)

```sql
SELECT s.id, s.name FROM shelves s
        WHERE s.user_id = $1
          AND (s.name ILIKE $2 OR s.description ILIKE $3)
        ORDER BY lower(s.name) ASC, s.id ASC
        LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (lower(name)), id
        ->  Seq Scan on shelves s
              Filter: ((user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND ((name ~~* '%quarterly needle%'::text) OR (description ~~* '%quarterly needle%'::text)))
```

enable_seqscan off:

```
Limit
  ->  Sort
        Sort Key: (lower(name)), id
        ->  Index Scan using shelves_user_id_name_key on shelves s
              Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
              Filter: ((name ~~* '%quarterly needle%'::text) OR (description ~~* '%quarterly needle%'::text))
```

### Q8: GET /search (statement 4)

```sql
SELECT b.id AS block_id, b.folder_id, b.shelf_id, b.text
        FROM page_blocks b
        LEFT JOIN folders f ON f.id = b.folder_id
        LEFT JOIN shelves sh ON sh.id = b.shelf_id
        WHERE b.text ILIKE $1
          AND b.kind IN ('section', 'paragraph')
          AND (
            (b.folder_id IS NOT NULL AND f.deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM folder_members m
              WHERE m.folder_id = b.folder_id AND m.user_id = $2))
            OR (b.shelf_id IS NOT NULL AND sh.user_id = $3)
          )
        ORDER BY b.id ASC
        LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: b.id
        ->  Hash Left Join
              Hash Cond: (b.shelf_id = sh.id)
              Filter: (((b.folder_id IS NOT NULL) AND (f.deleted_at IS NULL) AND (ANY (b.folder_id = (hashed SubPlan 2).col1))) OR ((b.shelf_id IS NOT NULL) AND (sh.user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)))
              ->  Hash Right Join
                    Hash Cond: (f.id = b.folder_id)
                    ->  Seq Scan on folders f
                    ->  Hash
                          ->  Seq Scan on page_blocks b
                                Filter: ((text ~~* '%quarterly needle%'::text) AND (kind = ANY ('{section,paragraph}'::text[])))
              ->  Hash
                    ->  Seq Scan on shelves sh
              SubPlan 2
                ->  Seq Scan on folder_members m
                      Filter: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
```

enable_seqscan off:

```
Limit
  ->  Sort
        Sort Key: b.id
        ->  Hash Left Join
              Hash Cond: (b.shelf_id = sh.id)
              Filter: (((b.folder_id IS NOT NULL) AND (f.deleted_at IS NULL) AND (ANY (b.folder_id = (hashed SubPlan 2).col1))) OR ((b.shelf_id IS NOT NULL) AND (sh.user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)))
              ->  Nested Loop Left Join
                    ->  Index Scan using page_blocks_pkey on page_blocks b
                          Filter: ((text ~~* '%quarterly needle%'::text) AND (kind = ANY ('{section,paragraph}'::text[])))
                    ->  Index Scan using folders_pkey on folders f
                          Index Cond: (id = b.folder_id)
              ->  Hash
                    ->  Index Scan using shelves_pkey on shelves sh
              SubPlan 2
                ->  Index Scan using folder_members_user_id_idx on folder_members m
                      Index Cond: (user_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid)
```

## The predicates on their own

### Q1: the automatic clause (assignee, status, activation date) (expected: tasks_assignee_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.assignee_id = $1::uuid AND t.status = 'pending'
                 AND coalesce(t.start_date, t.due_date) IS NOT NULL
                 AND coalesce(t.start_date, t.due_date) <= CURRENT_DATE
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (status = 'pending'::text))
  Filter: ((COALESCE(start_date, due_date) IS NOT NULL) AND (COALESCE(start_date, due_date) <= CURRENT_DATE))
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: ((assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (status = 'pending'::text))
  Filter: ((COALESCE(start_date, due_date) IS NOT NULL) AND (COALESCE(start_date, due_date) <= CURRENT_DATE))
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: ((assignee_id = '30049ff1-6e24-40e7-9599-238b3de8e790'::uuid) AND (status = 'pending'::text))
```

### Q2, Q3, Q5 and Q7: the folder scope with the open statuses (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid
                 AND t.status IN ('pending', 'abandoned')
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
```

### Q3: Scheduled membership, which since issue #216 is an OR over two nullable columns (expected: 4.12 names no index for this predicate, as for Q4s star)

```sql
SELECT t.id FROM tasks t WHERE t.status IN ('pending', 'abandoned')
                 AND (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
```

Planner choice:

```
Seq Scan on tasks t
  Filter: (((start_date IS NOT NULL) OR (due_date IS NOT NULL)) AND (status = ANY ('{pending,abandoned}'::text[])))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
  Filter: ((start_date IS NOT NULL) OR (due_date IS NOT NULL))
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
```

### Q3C: the folder scope with a Schedule overlapping a date range (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid
                 AND coalesce(t.start_date, t.due_date) <= CURRENT_DATE + 30
                 AND coalesce(t.due_date, t.start_date) >= CURRENT_DATE - 30
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
  Filter: ((COALESCE(start_date, due_date) <= (CURRENT_DATE + 30)) AND (COALESCE(due_date, start_date) >= (CURRENT_DATE - 30)))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
  Filter: ((COALESCE(start_date, due_date) <= (CURRENT_DATE + 30)) AND (COALESCE(due_date, start_date) >= (CURRENT_DATE - 30)))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: (folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid)
```

### Q3C's projection: the folder scope with pending and a rule, and no date at all (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid AND t.status = 'pending'
                 AND t.recurrence_rule IS NOT NULL
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = 'pending'::text))
  Filter: (recurrence_rule IS NOT NULL)
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = 'pending'::text))
  Filter: (recurrence_rule IS NOT NULL)
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = 'c2264e39-97c3-4c07-a4fb-a5d41068c6ab'::uuid) AND (status = 'pending'::text))
```

### Q4: the star, which 4.12 names no index for (expected: no index on tasks.important exists)

```sql
SELECT t.id FROM tasks t WHERE t.important = true AND t.status IN ('pending', 'abandoned')
```

Planner choice:

```
Seq Scan on tasks t
  Filter: (important AND (status = ANY ('{pending,abandoned}'::text[])))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
  Filter: important
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
```

### Q6: the keyset over completed rows (expected: tasks_done_pagination_idx)

```sql
SELECT t.id FROM tasks t WHERE t.status = 'completed'
                 AND (t.completed_at, t.id)
                     < (now(), '00000000-0000-0000-0000-000000000000'::uuid)
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((ROW(completed_at, id) < ROW(now(), '00000000-0000-0000-0000-000000000000'::uuid)) AND (status = 'completed'::text))
  ->  Bitmap Index Scan on tasks_done_pagination_idx
        Index Cond: (ROW(completed_at, id) < ROW(now(), '00000000-0000-0000-0000-000000000000'::uuid))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((ROW(completed_at, id) < ROW(now(), '00000000-0000-0000-0000-000000000000'::uuid)) AND (status = 'completed'::text))
  ->  Bitmap Index Scan on tasks_done_pagination_idx
        Index Cond: (ROW(completed_at, id) < ROW(now(), '00000000-0000-0000-0000-000000000000'::uuid))
```

### Q8: the trigram match over title and notes (expected: tasks_search_trgm_idx)

```sql
SELECT t.id FROM tasks t WHERE (t.title ILIKE '%quarterly needle%'
                  OR t.notes ILIKE '%quarterly needle%')
```

Planner choice:

```
Seq Scan on tasks t
  Filter: ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text))
  ->  BitmapOr
        ->  Bitmap Index Scan on tasks_search_trgm_idx
              Index Cond: (title ~~* '%quarterly needle%'::text)
        ->  Bitmap Index Scan on tasks_search_trgm_idx
              Index Cond: (notes ~~* '%quarterly needle%'::text)
```


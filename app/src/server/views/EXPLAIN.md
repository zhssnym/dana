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

1. **Every 4.12 index that section 6 names is reachable by the predicate
   it was created for.** The probes at the end show each one chosen: the
   assignee index for Q1, the folder index for the folder-scoped
   predicates of Q3C, its projection, and Q7, the partial completed index
   for Q6, and the GIN trigram index for Q8.
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
   `01-data-and-invariants.md` stays open with this query if the shape
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
   `01-data-and-invariants.md` stays open with this query.

## The statements the router issues

### Q1 and Q1R: GET /views/my-day

```sql
SELECT 
    t.id, t.title, t.status, t.important,
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
    t.created_at, t.updated_at, (t.assignee_id = $1 AND t.due_date IS NOT NULL
              AND t.due_date <= $2::date) AS automatic,
               to_char(e.added_on, 'YYYY-MM-DD') AS added_on
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $3
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $4
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status = 'pending' AND ((t.assignee_id = $5 AND t.due_date IS NOT NULL
              AND t.due_date <= $6::date) OR e.task_id IS NOT NULL)
        ORDER BY t.due_date ASC NULLS LAST, t.due_time ASC NULLS FIRST, t.id ASC LIMIT $7
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.due_date, t.due_time NULLS FIRST, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop
                          ->  Nested Loop
                                ->  Hash Left Join
                                      Hash Cond: (t.id = e.task_id)
                                      Filter: (((t.assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (t.due_date IS NOT NULL) AND (t.due_date <= '2026-08-10'::date)) OR (e.task_id IS NOT NULL))
                                      ->  Seq Scan on tasks t
                                            Filter: (status = 'pending'::text)
                                      ->  Hash
                                            ->  Seq Scan on my_day_entries e
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Memoize
                                      Cache Key: t.folder_id
                                      Cache Mode: logical
                                      ->  Index Only Scan using folder_members_pkey on folder_members m
                                            Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                          ->  Memoize
                                Cache Key: m.folder_id
                                Cache Mode: logical
                                ->  Index Scan using folders_pkey on folders f
                                      Index Cond: (id = m.folder_id)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
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
              Sort Key: t.due_date, t.due_time NULLS FIRST, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            Filter: (((t.assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (t.due_date IS NOT NULL) AND (t.due_date <= '2026-08-10'::date)) OR (e.task_id IS NOT NULL))
                                            ->  Index Scan using tasks_assignee_status_due_idx on tasks t
                                                  Index Cond: (status = 'pending'::text)
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
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
                    ->  Nested Loop
                          Join Filter: (m.folder_id = t.folder_id)
                          ->  Nested Loop
                                Join Filter: (m.folder_id = f.id)
                                ->  Seq Scan on folders f
                                ->  Materialize
                                      ->  Seq Scan on folder_members m
                                            Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                          ->  Materialize
                                ->  Hash Left Join
                                      Hash Cond: (t.id = e.task_id)
                                      Filter: ((t.assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) OR (t.completed_by = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) OR (e.task_id IS NOT NULL))
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((completed_at >= '2026-08-10 00:00:00+01'::timestamp with time zone) AND (completed_at < '2026-08-11 00:00:00+01'::timestamp with time zone) AND (status = 'completed'::text))
                                            ->  Bitmap Index Scan on tasks_done_pagination_idx
                                                  Index Cond: ((completed_at >= '2026-08-10 00:00:00+01'::timestamp with time zone) AND (completed_at < '2026-08-11 00:00:00+01'::timestamp with time zone))
                                      ->  Hash
                                            ->  Seq Scan on my_day_entries e
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
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
                          Filter: ((t.assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) OR (t.completed_by = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) OR (e.task_id IS NOT NULL))
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((completed_at >= '2026-08-10 00:00:00+01'::timestamp with time zone) AND (completed_at < '2026-08-11 00:00:00+01'::timestamp with time zone) AND (status = 'completed'::text))
                                                  ->  Bitmap Index Scan on tasks_done_pagination_idx
                                                        Index Cond: ((completed_at >= '2026-08-10 00:00:00+01'::timestamp with time zone) AND (completed_at < '2026-08-11 00:00:00+01'::timestamp with time zone))
                                            ->  Memoize
                                                  Cache Key: t.folder_id
                                                  Cache Mode: logical
                                                  ->  Index Scan using folders_pkey on folders f
                                                        Index Cond: (id = t.folder_id)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NULL
        ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at DESC, t.id DESC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Hash Join
                                Hash Cond: (m.folder_id = f.id)
                                ->  Hash Join
                                      Hash Cond: (t.folder_id = m.folder_id)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                  Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                      ->  Hash
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Hash
                                      ->  Seq Scan on folders f
                          ->  Hash
                                ->  Seq Scan on users a
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
              Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NOT NULL
        ORDER BY t.due_date ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Hash Join
                                Hash Cond: (m.folder_id = f.id)
                                ->  Hash Join
                                      Hash Cond: (t.folder_id = m.folder_id)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                            ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                  Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                      ->  Hash
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Hash
                                      ->  Seq Scan on folders f
                          ->  Hash
                                ->  Seq Scan on users a
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
              Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.due_date BETWEEN $3::date AND $4::date
        ORDER BY t.due_date ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.id ASC
```

Planner choice:

```
Sort
  Sort Key: t.due_date, ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.id
  ->  Nested Loop Left Join
        ->  Hash Left Join
              Hash Cond: (t.id = e.task_id)
              ->  Hash Left Join
                    Hash Cond: (t.assignee_id = a.id)
                    ->  Hash Join
                          Hash Cond: (m.folder_id = f.id)
                          ->  Hash Join
                                Hash Cond: (t.folder_id = m.folder_id)
                                ->  Bitmap Heap Scan on tasks t
                                      Recheck Cond: ((due_date >= '2026-07-11'::date) AND (due_date <= '2026-09-09'::date))
                                      ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                            Index Cond: ((due_date >= '2026-07-11'::date) AND (due_date <= '2026-09-09'::date))
                                ->  Hash
                                      ->  Seq Scan on folder_members m
                                            Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                          ->  Hash
                                ->  Seq Scan on folders f
                    ->  Hash
                          ->  Seq Scan on users a
              ->  Hash
                    ->  Seq Scan on my_day_entries e
                          Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
  Sort Key: t.due_date, ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.id
  ->  Nested Loop Left Join
        ->  Hash Left Join
              Hash Cond: (t.id = e.task_id)
              ->  Hash Left Join
                    Hash Cond: (t.assignee_id = a.id)
                    ->  Hash Join
                          Hash Cond: (m.folder_id = f.id)
                          ->  Hash Join
                                Hash Cond: (t.folder_id = m.folder_id)
                                ->  Bitmap Heap Scan on tasks t
                                      Recheck Cond: ((due_date >= '2026-07-11'::date) AND (due_date <= '2026-09-09'::date))
                                      ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                            Index Cond: ((due_date >= '2026-07-11'::date) AND (due_date <= '2026-09-09'::date))
                                ->  Hash
                                      ->  Index Scan using folder_members_user_id_idx on folder_members m
                                            Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                          ->  Hash
                                ->  Index Scan using folders_pkey on folders f
                    ->  Hash
                          ->  Index Scan using users_pkey on users a
              ->  Hash
                    ->  Bitmap Heap Scan on my_day_entries e
                          Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                          ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
        WHERE t.status = 'pending'
       AND t.recurrence_rule IS NOT NULL
        ORDER BY t.id ASC
```

Planner choice:

```
Sort
  Sort Key: t.id
  ->  Hash Join
        Hash Cond: (t.folder_id = m.folder_id)
        ->  Bitmap Heap Scan on tasks t
              Recheck Cond: (status = 'pending'::text)
              Filter: (recurrence_rule IS NOT NULL)
              ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                    Index Cond: (status = 'pending'::text)
        ->  Hash
              ->  Seq Scan on folder_members m
                    Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
```

enable_seqscan off:

```
Sort
  Sort Key: t.id
  ->  Hash Join
        Hash Cond: (t.folder_id = m.folder_id)
        ->  Bitmap Heap Scan on tasks t
              Recheck Cond: (status = 'pending'::text)
              Filter: (recurrence_rule IS NOT NULL)
              ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                    Index Cond: (status = 'pending'::text)
        ->  Hash
              ->  Index Scan using folder_members_user_id_idx on folder_members m
                    Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
```

### Q4: GET /views/important

```sql
SELECT 
    t.id, t.title, t.status, t.important,
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.important = true
        ORDER BY (t.due_date IS NULL) ASC, t.due_date ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       CASE WHEN t.due_date IS NULL THEN NULL ELSE t.created_at END ASC,
       CASE WHEN t.due_date IS NULL THEN NULL ELSE t.id END ASC,
       CASE WHEN t.due_date IS NULL THEN t.created_at END DESC,
       CASE WHEN t.due_date IS NULL THEN t.id END DESC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: ((t.due_date IS NULL)), t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE WHEN (t.due_date IS NULL) THEN NULL::timestamp with time zone ELSE t.created_at END), (CASE WHEN (t.due_date IS NULL) THEN NULL::uuid ELSE t.id END), (CASE WHEN (t.due_date IS NULL) THEN t.created_at ELSE NULL::timestamp with time zone END) DESC, (CASE WHEN (t.due_date IS NULL) THEN t.id ELSE NULL::uuid END) DESC
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop
                          ->  Nested Loop
                                ->  Hash Left Join
                                      Hash Cond: (t.id = e.task_id)
                                      ->  Seq Scan on tasks t
                                            Filter: (important AND (status = ANY ('{pending,abandoned}'::text[])))
                                      ->  Hash
                                            ->  Seq Scan on my_day_entries e
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Memoize
                                      Cache Key: t.folder_id
                                      Cache Mode: logical
                                      ->  Index Only Scan using folder_members_pkey on folder_members m
                                            Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                          ->  Memoize
                                Cache Key: m.folder_id
                                Cache Mode: logical
                                ->  Index Scan using folders_pkey on folders f
                                      Index Cond: (id = m.folder_id)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
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
              Sort Key: ((t.due_date IS NULL)), t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, (CASE WHEN (t.due_date IS NULL) THEN NULL::timestamp with time zone ELSE t.created_at END), (CASE WHEN (t.due_date IS NULL) THEN NULL::uuid ELSE t.id END), (CASE WHEN (t.due_date IS NULL) THEN t.created_at ELSE NULL::timestamp with time zone END) DESC, (CASE WHEN (t.due_date IS NULL) THEN t.id ELSE NULL::uuid END) DESC
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                                  Filter: important
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: (status = ANY ('{pending,abandoned}'::text[]))
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NOT NULL
        ORDER BY t.due_date ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Hash Join
                                Hash Cond: (m.folder_id = f.id)
                                ->  Hash Join
                                      Hash Cond: (t.folder_id = m.folder_id)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                            ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                  Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                      ->  Hash
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Hash
                                      ->  Seq Scan on folders f
                          ->  Hash
                                ->  Seq Scan on users a
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
              Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NULL
        ORDER BY f.is_default DESC, lower(f.name) ASC, f.id ASC,
       CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at DESC, t.id DESC LIMIT $3
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Hash Left Join
                    Hash Cond: (t.id = e.task_id)
                    ->  Hash Left Join
                          Hash Cond: (t.assignee_id = a.id)
                          ->  Hash Join
                                Hash Cond: (m.folder_id = f.id)
                                ->  Hash Join
                                      Hash Cond: (t.folder_id = m.folder_id)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                  Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                      ->  Hash
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Hash
                                      ->  Seq Scan on folders f
                          ->  Hash
                                ->  Seq Scan on users a
                    ->  Hash
                          ->  Seq Scan on my_day_entries e
                                Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
              Sort Key: f.is_default DESC, (lower(f.name)), f.id, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Hash Left Join
                                            Hash Cond: (t.id = e.task_id)
                                            ->  Bitmap Heap Scan on tasks t
                                                  Recheck Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                                  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
                                                        Index Cond: ((status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Hash
                                                  ->  Bitmap Heap Scan on my_day_entries e
                                                        Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                                        ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                                              Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Memoize
                                            Cache Key: t.folder_id
                                            Cache Mode: logical
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                ->  Memoize
                                      Cache Key: m.folder_id
                                      Cache Mode: logical
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = m.folder_id)
                          ->  Memoize
                                Cache Key: t.assignee_id
                                Cache Mode: logical
                                ->  Index Scan using users_pkey on users a
                                      Index Cond: (id = t.assignee_id)
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
    t.created_at, t.updated_at, to_char(t.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
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
                    Join Filter: (a.id = t.assignee_id)
                    ->  Nested Loop
                          ->  Nested Loop
                                ->  Index Scan using tasks_done_pagination_idx on tasks t
                                ->  Memoize
                                      Cache Key: t.folder_id
                                      Cache Mode: logical
                                      ->  Index Only Scan using folder_members_pkey on folder_members m
                                            Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                          ->  Memoize
                                Cache Key: m.folder_id
                                Cache Mode: logical
                                ->  Index Scan using folders_pkey on folders f
                                      Index Cond: (id = m.folder_id)
                    ->  Materialize
                          ->  Seq Scan on users a
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
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
                    ->  Nested Loop
                          ->  Nested Loop
                                ->  Index Scan using tasks_done_pagination_idx on tasks t
                                ->  Memoize
                                      Cache Key: t.folder_id
                                      Cache Mode: logical
                                      ->  Index Only Scan using folder_members_pkey on folder_members m
                                            Index Cond: ((folder_id = t.folder_id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                          ->  Memoize
                                Cache Key: m.folder_id
                                Cache Mode: logical
                                ->  Index Scan using folders_pkey on folders f
                                      Index Cond: (id = m.folder_id)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NOT NULL AND t.folder_id = $3
        ORDER BY t.due_date ASC, CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC,
       (t.due_time IS NOT NULL) ASC, t.due_time ASC NULLS FIRST,
       t.created_at ASC, t.id ASC LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Seq Scan on folder_members m
                                            Filter: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                      ->  Seq Scan on folders f
                                            Filter: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                                ->  Bitmap Heap Scan on tasks t
                                      Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                      ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                            Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                          ->  Hash
                                ->  Seq Scan on my_day_entries e
                                      Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
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
              Sort Key: t.due_date, (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), ((t.due_time IS NOT NULL)), t.due_time NULLS FIRST, t.created_at, t.id
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                            ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                  Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NOT NULL))
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
    t.created_at, t.updated_at
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE t.status IN ('pending', 'abandoned') AND t.due_date IS NULL AND t.folder_id = $3
        ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.created_at DESC, t.id DESC LIMIT $4
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop
                                ->  Nested Loop
                                      ->  Seq Scan on folder_members m
                                            Filter: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                      ->  Seq Scan on folders f
                                            Filter: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                                ->  Bitmap Heap Scan on tasks t
                                      Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                      ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                            Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                          ->  Hash
                                ->  Seq Scan on my_day_entries e
                                      Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                    ->  Memoize
                          Cache Key: t.assignee_id
                          Cache Mode: logical
                          ->  Index Scan using users_pkey on users a
                                Index Cond: (id = t.assignee_id)
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
              Sort Key: (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.created_at DESC, t.id DESC
              ->  Nested Loop Left Join
                    ->  Hash Left Join
                          Hash Cond: (t.id = e.task_id)
                          ->  Nested Loop Left Join
                                ->  Nested Loop
                                      ->  Nested Loop
                                            ->  Index Only Scan using folder_members_pkey on folder_members m
                                                  Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                            ->  Index Scan using folders_pkey on folders f
                                                  Index Cond: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                            ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                  Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])) AND (due_date IS NULL))
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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
    t.created_at, t.updated_at, to_char(t.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
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
                    Join Filter: (a.id = t.assignee_id)
                    ->  Nested Loop
                          ->  Index Scan using tasks_done_pagination_idx on tasks t
                                Filter: (folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                          ->  Materialize
                                ->  Nested Loop
                                      ->  Seq Scan on folder_members m
                                            Filter: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                      ->  Seq Scan on folders f
                                            Filter: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                    ->  Materialize
                          ->  Seq Scan on users a
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
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
                    Join Filter: (a.id = t.assignee_id)
                    ->  Nested Loop
                          ->  Index Scan using tasks_done_pagination_idx on tasks t
                                Filter: (folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                          ->  Materialize
                                ->  Nested Loop
                                      ->  Index Only Scan using folder_members_pkey on folder_members m
                                            Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
                                      ->  Index Scan using folders_pkey on folders f
                                            Index Cond: (id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid)
                    ->  Materialize
                          ->  Index Scan using users_pkey on users a
              ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                    Index Cond: ((task_id = t.id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
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
    t.created_at, t.updated_at, to_char(t.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_cursor
        
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = $1
    JOIN folders f ON f.id = t.folder_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = $2
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
    ) c ON true
        WHERE (t.title ILIKE $3 OR t.notes ILIKE $4)
        ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END ASC, t.updated_at DESC, t.id DESC LIMIT $5
```

Planner choice:

```
Limit
  ->  Sort
        Sort Key: (CASE t.status WHEN 'pending'::text THEN 0 WHEN 'abandoned'::text THEN 1 ELSE 2 END), t.updated_at DESC, t.id DESC
        ->  Nested Loop Left Join
              ->  Nested Loop Left Join
                    ->  Nested Loop Left Join
                          Join Filter: (a.id = t.assignee_id)
                          ->  Nested Loop
                                Join Filter: (m.folder_id = t.folder_id)
                                ->  Nested Loop
                                      Join Filter: (m.folder_id = f.id)
                                      ->  Seq Scan on folders f
                                      ->  Materialize
                                            ->  Seq Scan on folder_members m
                                                  Filter: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                ->  Materialize
                                      ->  Seq Scan on tasks t
                                            Filter: ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text))
                          ->  Materialize
                                ->  Seq Scan on users a
                    ->  Index Only Scan using my_day_entries_pkey on my_day_entries e
                          Index Cond: ((task_id = t.id) AND (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid))
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
                                ->  Nested Loop
                                      Join Filter: (m.folder_id = t.folder_id)
                                      ->  Nested Loop
                                            Join Filter: (m.folder_id = f.id)
                                            ->  Index Scan using folders_pkey on folders f
                                            ->  Materialize
                                                  ->  Index Scan using folder_members_user_id_idx on folder_members m
                                                        Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Bitmap Heap Scan on tasks t
                                            Recheck Cond: (folder_id = f.id)
                                            Filter: ((title ~~* '%quarterly needle%'::text) OR (notes ~~* '%quarterly needle%'::text))
                                            ->  Bitmap Index Scan on tasks_folder_status_due_idx
                                                  Index Cond: (folder_id = f.id)
                                ->  Memoize
                                      Cache Key: t.assignee_id
                                      Cache Mode: logical
                                      ->  Index Scan using users_pkey on users a
                                            Index Cond: (id = t.assignee_id)
                          ->  Hash
                                ->  Bitmap Heap Scan on my_day_entries e
                                      Recheck Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
                                      ->  Bitmap Index Scan on my_day_entries_user_id_idx
                                            Index Cond: (user_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid)
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

## The predicates on their own

### Q1: the automatic clause (assignee, status, due_date) (expected: tasks_assignee_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.assignee_id = $1::uuid AND t.status = 'pending'
                 AND t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (status = 'pending'::text) AND (due_date IS NOT NULL) AND (due_date <= CURRENT_DATE))
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: ((assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (status = 'pending'::text) AND (due_date IS NOT NULL) AND (due_date <= CURRENT_DATE))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (status = 'pending'::text) AND (due_date IS NOT NULL) AND (due_date <= CURRENT_DATE))
  ->  Bitmap Index Scan on tasks_assignee_status_due_idx
        Index Cond: ((assignee_id = '186b88e8-9f36-466b-9c95-ced9d9a8abf0'::uuid) AND (status = 'pending'::text) AND (due_date IS NOT NULL) AND (due_date <= CURRENT_DATE))
```

### Q2, Q3, Q5 and Q7: the folder scope with the open statuses (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid
                 AND t.status IN ('pending', 'abandoned')
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = ANY ('{pending,abandoned}'::text[])))
```

### Q3C: the folder scope with a date range over all three statuses (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid
                 AND t.due_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + 30
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (due_date >= (CURRENT_DATE - 30)) AND (due_date <= (CURRENT_DATE + 30)))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (due_date >= (CURRENT_DATE - 30)) AND (due_date <= (CURRENT_DATE + 30)))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (due_date >= (CURRENT_DATE - 30)) AND (due_date <= (CURRENT_DATE + 30)))
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (due_date >= (CURRENT_DATE - 30)) AND (due_date <= (CURRENT_DATE + 30)))
```

### Q3C's projection: the folder scope with pending and a rule, and no date at all (expected: tasks_folder_status_due_idx)

```sql
SELECT t.id FROM tasks t WHERE t.folder_id = $1::uuid AND t.status = 'pending'
                 AND t.recurrence_rule IS NOT NULL
```

Planner choice:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = 'pending'::text))
  Filter: (recurrence_rule IS NOT NULL)
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = 'pending'::text))
```

enable_seqscan off:

```
Bitmap Heap Scan on tasks t
  Recheck Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = 'pending'::text))
  Filter: (recurrence_rule IS NOT NULL)
  ->  Bitmap Index Scan on tasks_folder_status_due_idx
        Index Cond: ((folder_id = '67fb0469-d506-44c8-a936-607c56160b44'::uuid) AND (status = 'pending'::text))
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


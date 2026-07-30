## 8. Business logic specifications

### 8.1 Timezone anchors and today

Model: floating dates and times everywhere a human plans; UTC instants everywhere the system records an event.

- Every request that evaluates dates carries tz, the client's current IANA zone. today(V) = the current date in tz at the moment of evaluation. The server computes it; the client never filters by date itself.
- users.timezone exists for one consumer only: reminder fire-instant computation for that user as assignee. It auto-syncs at login and whenever a session reports a different zone; there is no manual lock in v1. Traveling therefore moves both today and future reminder instants to the new zone.
- The day boundary is local midnight in tz. DST changes move that instant but never break date arithmetic, because comparisons are date against date, never instant against instant.
- Boundary statement, exact: a task with due_date D is due today when D = today(V), overdue when D < today(V), future when D > today(V). My Day's automatic clause admits D <= today(V).

### 8.2 My Day evaluation

```
def my_day(V, tz):
    today = current_date(tz)
    open_rows = tasks where folder_id in ACCESSIBLE(V)
                and status = 'pending'
                and ( (assignee_id = V and due_date is not null and due_date <= today)
                      or exists my_day_entry(task, V) )
    for t in open_rows:
        auto_q  = t.due_date  if (t.assignee_id = V and t.due_date <= today) else None
        pull_q  = entry.added_on if entry exists else None
        t.qualify_date = min(x for x in [auto_q, pull_q] if x is not None)
    carried = rows where qualify_date < today   # ordered per Q1
    today_g = rows where qualify_date = today
    recap   = Q1R rows
    return carried, today_g, recap
```

Consequences, each intended: nothing ever leaves this page by time passing (snowball); a pull is one decision, not a daily ritual; pulling a future or someone else's task shows it with its assignee chip; completing from anywhere surfaces it in the recap; abandoning removes it from the open groups instantly and keeps it out of the recap.

### 8.3 Concurrency policy

- Reads: no realtime channel in v1. Clients refetch the active view on window focus and after each own mutation. Staleness between those points is accepted.
- Field writes: PATCH sends only changed fields. Two members editing different fields both win; the same field is last write wins, and the lost update is accepted and documented. No version columns, no ETags in v1.
- Status writes: only through the four transition endpoints, implemented as guarded updates:

```
rows = execute("update tasks set status='completed', completed_at=now(), completed_by=:actor,
                updated_at=now() where id=:id and status='pending'")
if rows == 1: run_generation_if_recurring(); return task
state = reload(id)                       # lost a race or repeat call
if state.status == 'completed': return task            # idempotent no-op
if state is missing: return 404
return 409                                              # cross-state conflict per 5.1
```

The guard makes recurrence generation exactly-once under any race: only the single winning transition executes it, inside the same transaction. Operations on deleted rows return 404 and the client drops the row.

### 8.4 Clearing a due date

```
def clear_due_date(task):                 # inside PATCH when due_date := null
    assert_member(V, task.folder_id)
    task.due_date = null
    task.due_time = null                  # INV-6
    if task.recurrence_rule is not null:
        task.recurrence_rule = null       # the series ends; series_id stays for history
    delete reminder where task_id = task.id
```

One transaction with the PATCH itself. The client shows a warning first when a rule or reminder exists: "Clearing the date also ends the repeat and removes the reminder." The database checks of 4.5 make the ordering unskippable.

### 8.5 Recurrence

**Evaluation.** A rule string is always evaluated with DTSTART = the current occurrence's due_date (at due_time or 00:00). nextInstance(rule, anchor, after) returns the earliest rule instance whose date is strictly after the date "after", or null when UNTIL bounds it out. UNTIL is inclusive per RFC 5545: an instance equal to UNTIL is valid; the next one is not.

**Generation**, run inside the same transaction as a pending-to-completed or pending-to-abandoned transition when recurrence_rule is set:

```
def generate_successor(t, actor):
    cutoff = max(t.due_date, current_date(actor.tz))
    next_due = nextInstance(t.recurrence_rule, anchor=t.due_date, after=cutoff)
    if next_due is null:                          # UNTIL exhausted
        return null                               # rule stays on t; series may resume via restore
    s = insert task(title=t.title, notes=t.notes, folder_id=t.folder_id,
                    assignee_id=t.assignee_id, important=t.important,
                    due_date=next_due, due_time=t.due_time,
                    recurrence_rule=t.recurrence_rule, series_id=t.series_id,
                    status='pending', created_by=t.created_by)
    copy steps of t onto s with done=false, same order
    if reminder exists on t: insert reminder on s with same mode and value,
                             fire_at recomputed per 8.6, state='scheduled'
    # My Day entries are never copied
    t.recurrence_rule = null                      # the rule lives only on the current occurrence
    return s
```

Worked consequences, with a weekly Monday rule:
- On time: due 2026-07-20, completed 2026-07-20. cutoff 07-20, next 2026-07-27.
- Late, slots skipped: due 2026-07-20, completed 2026-07-28. cutoff 07-28, next 2026-08-03; the 07-27 slot is skipped and the calendar shows an honest gap.
- Early, alignment kept: due 2026-07-27, completed 2026-07-25. cutoff 07-27, next 2026-08-03.
- Daily late, no pile-up: daily due 2026-07-20, completed 2026-07-24. cutoff 07-24, next 2026-07-25.
Nothing is ever generated by the passage of time; a missed occurrence just snowballs in My Day until acted on. There is no recurrence background job.

**Un-complete and restore** apply the G-SERIES guard of 5.1: delete the pending successor and reclaim the rule, or, when this row is the newest of its series, reopen it as the current occurrence; otherwise 409.

**Editing mid-series.** The rule exists only on the current occurrence, so editing recurrence_rule there changes the series from now on; completed and abandoned rows are historical and untouched. Changing the current occurrence's due_date re-anchors the series (the next generation evaluates from the new date). Setting the rule to null ends the series; the row remains a normal dated task. Setting a rule on a task that never had one requires a due_date and mints a fresh series_id.

**Calendar projection**:

```
def virtual_instances(t, range_start, range_end):
    if t.status != 'pending' or t.recurrence_rule is null: return []
    lo = max(range_start, t.due_date + 1 day)     # strictly after the real row
    return [d for d in instances(t.recurrence_rule, anchor=t.due_date)
            if lo <= d <= range_end]
```

Real rows draw on their own dates in any status; ghosts appear only after the current occurrence's date; therefore no date can ever show the same series twice, and no past date shows an occurrence that never existed. Clicking a ghost opens the current occurrence.

### 8.6 Reminders

**Computation**:

```
def compute_fire_at(task, reminder):
    zone = users.timezone of task.assignee_id, else of reminder.created_by when unassigned
    if reminder.offset_minutes is not null:        # requires task.due_time
        local = datetime(task.due_date, task.due_time) minus offset_minutes
    else:                                          # date-only task
        local = datetime(task.due_date, reminder.time_of_day)
    return to_utc_instant(local, zone)
    # IANA rules absorb DST. A nonexistent local time in a spring-forward gap
    # resolves to the first valid instant after the gap. An ambiguous time in a
    # fall-back overlap resolves to the earlier instant.
```

**Recompute triggers.** fire_at is recomputed, and state reset to scheduled when the new instant is in the future, whenever any of these change: due_date, due_time, the reminder's own value or mode, assignee_id, or the assignee's users.timezone. When the recomputed instant is already past, the row is set state = skipped, never fired retroactively. The reminder row is deleted by: reminder removal, the clear-date cascade, task deletion. It survives completion and abandonment untouched, but delivery requires a pending task, so it silently never fires; un-completing before the instant lets it fire normally.

**Delivery loop**, the only background execution in v1, an operational burden named plainly: a scheduler ticks every minute.

```
every 60 seconds:
    due = select reminders where state='scheduled' and fire_at <= now()
    for r in due:
        t = task(r.task_id)
        if t.status != 'pending' or t.assignee_id is null: r.state='skipped'; r.fired_at=now(); continue
        if now() minus r.fire_at > 6 hours:          # stale catch-up after an outage
            r.state='skipped'; r.fired_at=now(); continue
        send email to assignee (template REMINDER); r.state='sent'; r.fired_at=now()
```

Delivery is at-least-once: a crash between send and the state write can duplicate one email; accepted for v1. The unassigned-at-fire-time skip is deliberate: reminders are never broadcast to a whole folder.

### 8.7 Invites and sharing

**V-INV validations on create**, in order: email syntactically valid and lowercased; not the inviter's own email; folder, when given, accessible to the inviter and not a default folder; task, when given, inside that folder; if the email belongs (case-insensitively) to an active user already connected to the inviter, convert to an instant share: create the membership immediately, send the share-grant email, create no invite row; if a pending invite by this inviter to this email for this folder exists, 409 pointing at it; rate limits per 10.4.

**Three entry paths, one mechanism**:
1. Direct: enter an email in the sharing panel (folder attached) or in the People screen (bare).
2. Roster pick: choose a connected person in the sharing panel; no invite, immediate membership, share-grant email.
3. Indirect via assignment: assigning a task to someone outside the folder. Connected target: membership created instantly, then the assignment applies, one transaction. Unconnected target: an invite is created with folder_id and task_id set; the task's assignee stays unchanged, and the UI shows the "invite pending" chip derived from that row.

**Acceptance transaction**, in order, all or nothing:

```
def accept(invite, acceptor):
    assert lower(acceptor.email) == invite.email and invite.status == 'pending'
    upsert connection(minmax(invite.inviter_id, acceptor.id))          # INV-9, idempotent
    if invite.folder_id is not null and acceptor not member:
        insert folder_members(invite.folder_id, acceptor.id)           # INV-10
    if invite.task_id is not null:
        t = task(invite.task_id)
        if t exists and t.folder_id == invite.folder_id and t.assignee_id is null:
            t.assignee_id = acceptor.id                                # else skip silently
    invite.status='accepted'; invite.accepted_by=acceptor.id; invite.responded_at=now()
```

Matching is case-insensitive equality and nothing more; no Gmail dot or plus normalization. A stranded invite (address variant mismatch) is repaired by the inviter through the visible pending list with cancel and resend. Multiple pending invites to one email are all surfaced at login; each acceptance grants only its own folder; the connection is created once. Creating a new assignment-invite for a task clears task_id on any earlier pending invite for that task.

### 8.8 Folder deletion and member removal

Folder deletion (owner only, never the default folder), one transaction: count open, completed, abandoned tasks for the confirmation response; delete the folder row; the database cascades memberships, tasks, and through tasks the steps, my_day_entries, and reminders; pending invites carrying the folder cascade away. Nothing is recoverable; the dialog said so with counts.

Member removal and leave both run R-CLEAN of 5.3: unassign the leaver's tasks in the folder, delete the leaver's My Day entries for the folder's tasks, and, when exactly one member remains, assign every unassigned task in the folder to that member (INV-5). Removal never deletes a task [quoting the confirmed rule: removal only unassigns].

### 8.9 Ownership transfer

One deterministic rule, two callers (owner leave; account deletion): the new owner is the remaining member with the earliest folder_members.created_at, ties broken by lower user id. Update folders.owner_id, keep the new owner's membership row unchanged (role stays 'member'; ownership is the folder column, one source of truth). Default folders never transfer (INV-2).

### 8.10 Account deletion

One transaction, ordered so the RESTRICT tripwire on folders.owner_id can never fire:

```
1  set status='invalidated' on the user's pending sent invites
2  for each owned non-default folder with other members: transfer ownership (8.9)
3  for each owned folder now without other members, plus the default folder:
       delete folder (cascades per 8.8)
4  for each remaining membership in others' folders: run R-CLEAN, delete membership
5  delete all connection rows containing the user
6  delete remaining my_day_entries of the user
7  scrub the user row: google_sub, email, display_name, avatar_url set null; deleted_at = now()
8  destroy all sessions of the user
```

Surviving references (tasks.created_by, tasks.completed_by, invites.accepted_by) keep pointing at the scrubbed row and render as "Deleted user". Google requires apps offering account creation to offer deletion; verify the current policy text before launch (section 13).

### 8.11 Completion count

Per folder, identical for every member:

```
completed = count(tasks where folder_id=F and status='completed')
pending   = count(tasks where folder_id=F and status='pending')
display: none when completed + pending = 0, else "completed / (pending + completed)"
```

Abandoned rows count on neither side. Each completed occurrence of a recurring series adds one to both sides over time; accepted as honest history. The sidebar badge shows the pending number alone; the folder header shows the full ratio.

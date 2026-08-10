## 8. Business logic specifications

### 8.1 Timezone anchors and today

Model: floating dates and times everywhere a human plans; UTC instants everywhere the system records an event.

- Every request that evaluates dates carries tz, the client's current IANA zone. today(V) = the current date in tz at the moment of evaluation. The server computes it; the client never filters by date itself. Recorded at the P4 merge review of 2026-08-08, because the one endpoint that broke this rule broke it by omission rather than by choice: "every request" is a requirement on section 7 as much as on the code, so an endpoint that stores or filters by a date and takes no tz is an incomplete surface, not an invitation to substitute the stored zone below. 7.8's pull was that endpoint and now carries tz.
- users.timezone exists for one consumer only: reminder fire-instant computation for that user as assignee. It auto-syncs at every successful login that carries the 7.1 tz parameter, and whenever a session reports a different zone through PATCH /me; a login carrying no tz syncs nothing, and a reported zone that is a tzdb alias of the stored one is not a different zone: no write, and no 8.6 recompute. There is no manual lock in v1. Traveling therefore moves both today and future reminder instants to the new zone.
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

actor.tz is the tz of the request that made the transition, per 8.1, never the actor's stored users.timezone, which 8.1 reserves for reminder fire instants; frozen 7.6 carries the parameter on complete and abandon by owner ruling of 2026-08-10 and requires it exactly when this function runs. The name is bound here rather than left to 8.1's general rule because this is the only pseudocode in this section that reaches a zone through a record instead of taking one as a parameter, the way 8.2's my_day(V, tz) does, and the one wrong answer within reach is a column on the actor's row named timezone. Nothing else in this section needs it: G-SERIES below reads the shape of a series, and the projection reads stored dates against a requested range, so neither computes a current date at all.

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

A reminder already delivered is not revived by a timezone change, ruled at the P7 mid-package change control on 2026-08-10 on the tester session's escalation. The two texts answered differently: frozen 7.1 scopes PATCH /me's recompute to "scheduled reminders on tasks assigned to V" and AC-086 says "scheduled fire_at values recompute", while the trigger sentence above names no state it resets from, so read literally it returns a delivered row to scheduled and the loop sends the same email a second time. The timezone trigger takes the narrow reading, recomputing rows in state scheduled and no others, and no frozen text moves, 7.1 having said so all along where this section merely did not restate it. What settles it is not that sent is terminal in general, which would be wrong, but what this one trigger changes. The other four change the occasion the reminder is about: its deadline through due_date or due_time, its lead time through the reminder's own value or mode, or the person owed it through assignee_id. A new occasion deserves a delivery of its own, which is why the reset above names no starting state and why frozen 7.7 scopes its due_date recompute to no state either; a user who pushes a deadline out by a week and then hears nothing has lost the reminder they can still see configured on the task. A zone change alters neither the deadline nor the recipient. It re-expresses an unchanged occasion on a different wall clock, so reviving a row for it sends one person the same reminder about the same deadline twice, which the at-least-once tolerance below covers as a crash artifact and never licenses as a designed outcome. Two consequences are recorded rather than left to be re-derived three times. A skipped row is outside the timezone trigger too, that being 7.1's scope taken at its word, and the loss is narrow: a skipped instant is already past, only a large westward move inside the fire window could carry the same local time back into the future, and the row is recomputed anyway by the next change to the task's own dates. And where one of the other four triggers does return a sent row to scheduled, fired_at is cleared with it, so frozen 4.8's note that fired_at is set when state leaves scheduled stays true of every row rather than of most of them.

The creator's zone is a fallback for the computation and not a sixth trigger, and the asymmetry is deliberate rather than an omission from the list above. A reminder on an unassigned task is computed from its creator's zone because 4.8's NOT NULL fire_at admits no row without an instant, not because that instant is ever delivered: the loop below skips an unassigned task at fire time, and assignee_id is itself a trigger, so such a row either never fires or is recomputed in the new assignee's zone before it does. A creator who travels therefore moves nothing any user can observe, and following them would add a write path with no reachable effect. Recorded at the P7 kickoff on 2026-08-10, because the computation's two arms and the trigger list's one are read by three separate sessions of that package and could be reconciled three ways.

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

**V-INV validations on create**, in order: email syntactically valid and lowercased; not the inviter's own email; folder, when given, accessible to the inviter and not a default folder; when a folder is given, the email must not belong to a member of it (409 "already a member"); task, when given, inside that folder; if the email belongs (case-insensitively) to an active user already connected to the inviter and a folder is attached, convert to an instant share, subject to the 10.3 member cap (a full folder refuses 422 and creates nothing, neither membership nor invite row): create the membership immediately, send the share-grant email, create no invite row; if it belongs to such a user and no folder is attached, 409 "already connected", the connection the bare invite exists to create already holding; if a pending invite by this inviter to this email for this folder exists, 409 pointing at it; rate limits per 10.4.

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
        lock folder; refuse 422 if it already holds 25 members         # 10.3 cap, whole transaction rolls back
        insert folder_members(invite.folder_id, acceptor.id)           # INV-10
    if invite.task_id is not null:
        t = task(invite.task_id)
        if t exists and t.folder_id == invite.folder_id and t.assignee_id is null:
            t.assignee_id = acceptor.id                                # else skip silently
    invite.status='accepted'; invite.accepted_by=acceptor.id; invite.responded_at=now()
```

The 10.3 member cap binds every membership this section grants, ruled at the P5 kickoff on 2026-08-09. The instant-share conversion, with or without a task attached, and the acceptance transaction each check it the way POST /members does: lock the folder before counting, so the count and the insert are one decision, and refuse with 422 naming the cap when the folder already holds 25. Section 5.3 always wrote the guard on its direct-add row, and the acceptance row's silence was the fourth instance of the defect AC-124 names rather than an exemption: 10.3 calls the number server-enforced, a cap one path bypasses is not enforced, and the P3 repair of addMember was accepted partly on the recorded ground that this package's paths would read its corrected shape. A refused acceptance rolls back whole, per the all-or-nothing above, so the invite stays pending and can be accepted once the folder has room, which is also why refusal beats the silent skip the assignment arm uses: a skipped assignment loses a convenience, while a silently skipped membership would consume the invite and grant nothing. A refused conversion tells the inviter the folder is full now, rather than parking an invite whose acceptance the same cap would refuse.

The already-a-member clause above was added to V-INV at the P5 merge, closing a documentation asymmetry the Adversarial Test role observed while repairing AC-060 and recorded rather than escalated. Frozen 7.5's bullet has always enumerated that 409, and 5.3's add row and AC-060 both fix the behavior, but this expansion of the same rule omitted it, so the list read as though a folder invite to a current member fell through to the conversion arm. Nothing behaves differently and no criterion is invalidated: the clause is transcribed from the frozen text, in the position frozen 7.5 gives it and the implementation already checks it, between the folder guards and the task guard. 8.7 is not frozen and 7.5 is, which is why the fix goes here and why it is one clause rather than a rewording of either.

The bare invite to an existing connection is refused, ruled by the human owner on 2026-08-09 and entered on frozen 7.5 with its full grounds. The conversion arm above had named its connected-email condition without naming a folder, while the instant share it describes creates a membership and only a folder defines one, so a bare invite to a connected person had no specified outcome. It answers 409 rather than a silent success because a create on this endpoint either parks an invite with one email sent or is refused, per 5.2's create row, and because such an invite could only ever accept into an idempotent no-op: the connection it would create already holds under INV-9. This is the cap paragraph's principle turned the other way. There an invite against a full folder still parks, because a member may leave and make it acceptable; here nothing the request could accomplish is left to accomplish.

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

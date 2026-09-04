## 12. Acceptance criteria

Given/when/then, one behavior each. Each criterion is asserted by an automated test under
`app/tests/` named for its number, and this section is the definition of done. Who added a
criterion and when is git's: `git log -S 'AC-268' -- docs/spec/` finds the commit that
introduced one, with its date and its message.

The criteria are grouped by what they are about. A criterion that could honestly sit in two
groups has exactly one home rather than a copy in each, and each file opens by naming the
groups next to it.

## Numbers

`AC-NNN` numbers are append-only: never renumbered, never reused, and a retired criterion is
marked rather than removed. A gap in the run is ordinary, and it is not a free number by
default, so read this list before spending one.

- **370 criteria carry their text in the files below.** Every number from AC-001 to AC-400
  not named below is one of them. Re-derived on 2026-09-04 by the last merge of that night,
  the authorization-sweep branch (#74), by **counting the `- AC-` bullets across the files**
  rather than by adding up what eight branches each believed: 370, with no number appearing
  twice, which the arithmetic then agrees with — 400 numbers in the run, less AC-229 and the
  twenty-nine free ones named below, is 370.

  **Only one per-file row moved with it and that is the point of counting rather than
  adding.** Twenty-two of the twenty-three rows in the table below already matched their
  files, because each night's branches had left the arithmetic alone as this bullet asks;
  12.23 was two behind, having gained AC-399 and AC-400 from issue #104 in the last merge
  before this one. A count derived once at the end is one number to check. A count carried
  forward is twenty-three.
- **AC-229 is spent and its text is not here.** It was written into its own test file,
  `app/tests/e2e/ac-229-done-row-drops-the-due-echo.spec.ts`, which is built, named for the
  number and running. The number is taken; do not spend it again.
- **Never spent, and free to take: 286 to 289, 304 to 309, 316 to 329, 347 to 349, 358 to 359.** Twenty-nine numbers. Each gap is a range
  that was allocated ahead of the work and only partly used, which is the ordinary cost of
  allocating a range before writing it.

  **Nothing from 375 upward is free, and this sentence is the answer AC-377's bullet below
  asks the last merge for.** 375 to 396 were all spent on 2026-09-04 by the six branches of
  the wave-1 batch and by 7.22's export before them, 375 and 376 included — they were taken
  by issues #107 and #76, which is what the sibling branches could not know while they were
  open. **397 to 400 are all spent**, and this sentence is the four of them reconciled by the
  merge that came last, which is what the AC-361 bullet asks for. 397 was reserved for the
  authorization sweep and 398 taken beside it (issue #74); 399 was handed to issue #104 and
  400 taken unassigned beside it. Neither branch could see the other's, which is why each
  wrote a different "next number" and why this list, rather than either bullet, is where the
  answer is. **The next number to take from the tail is 401**, and the twenty-nine gaps above
  are the only free numbers below it. The reservation language is left standing in the
  bullets below rather than tidied away, because it is the only record of why 397 sat unspent
  for a day and of why #104 deliberately stepped over 398.

  **229 was in this list until 2026-09-03 and contradicted the bullet directly above it**,
  which says the number is spent and must not be taken again. The count said thirty because
  it counted 229; the five ranges are twenty-nine numbers. Corrected on the branch for issues
  #20 and #100, which read this list to choose AC-368, rather than left for whoever spent 229
  a second time and found out from a duplicate test filename.
- **AC-411 was taken from the tail on 2026-09-04** (issue #108), on the rule the AC-361 to
  AC-365 bullet below states. It is 12.9's, beside AC-363, which is the server half of the
  same sentence: that criterion pins that a member who did not upload a picture reads its
  width and height on the block, and this one pins that the client reserves the space with
  them, on a folder page and on a shelf page alike. The two halves were written a week apart
  and the gap between them is where the defect lived, both page surfaces having drawn a
  literal 16 by 9 for every picture and thrown the measured pair away.

  **401 to 410 are deliberately not claimed here and are not added to the free list above.**
  The bullet below says the next number from the tail is 401; this branch took 411 because
  several branches of the same night were choosing from that tail while it was open, and
  stepping over a range is the cheaper mistake, a gap being ordinary where a collision is a
  duplicate test filename. Whether any of the ten is spent is not this branch's to say and
  the last merge is where the answer is, which is what this list already records of 375, 376
  and 398. **The count at the top and the per-file row in the table below are likewise not
  re-derived here**, on the AC-394 bullet's precedent: the arithmetic belongs to the last
  merge rather than to any one of several branches open at once, so 370 stands as the last
  derivation rather than as a number this branch moved by one.
- **AC-406 to AC-408 were taken from the tail on 2026-09-04** (issues #118, #117 and #79),
  on the rule the AC-361 to AC-365 bullet below states, and with the numbers **assigned
  rather than chosen**: several branches were open that night and 401 to 405 belong to
  siblings, so this one was handed three rather than reading "the next free number" off the
  bullet above, which is the only way the tail is collision-proof while more than one party
  is spending it. They are the client half of the cover work whose API half spent AC-368 to
  AC-373 and AC-384 to AC-389. AC-406 and AC-408 are 12.9's — the cover picker's Upload tab
  reaching a shelf and a built-in place page and the picture surviving a reload, and the
  page image that could not be uploaded in Desk or a folder — and AC-407 is 12.10's, the
  shelf duplicate carrying a picture the two shelves then hold independently. **The count,
  the range sentence at the top of this list and the per-file rows in the table below are
  deliberately not moved**, on the AC-390 to AC-393 bullet's precedent: several branches are
  open on these files at once and the arithmetic is the last merge's to re-derive rather
  than any one branch's to carry forward.
- **AC-404 was taken from the tail on 2026-09-04** (issue #162), on the rule the AC-361 to
  AC-365 bullet below states, and **with the number assigned rather than chosen**: three
  frontend branches were open on one worktree set that night and the tail is only
  collision-proof when one party hands out the ranges, which is what the AC-394 bullet
  records. So 401 to 403 are **not** added to the free list above and are not free here:
  whether a sibling branch spent them is not known from this one, and listing a number free
  that a sibling has just spent is the collision this rule exists to prevent, made by the fix
  rather than by the mistake. It is 12.3's, and the reason it is not 12.22's is written beside
  it: the Settings control that downloads 7.22's export and the Privacy sentence promising it
  are one criterion, because 9.2 admits the sentence only while the control ships. **The count
  in the table below is not re-derived here**, on the AC-394 bullet's precedent, several
  branches being open on these files at once; whoever merges last re-derives it and says what
  became of 401 to 403.
- **AC-405 was taken from the tail on 2026-09-04** (issue #140), beside AC-404 and on the same
  assignment. It is the client half of the calendar zoom that AC-378 and AC-379 made a durable
  account preference: the zoom chosen in the browser surviving a reload and reaching a second
  browser context on the same account, which is what "follow the person rather than the
  browser" means from the outside. It is 12.8's rather than 12.3's, the two beside it in that
  pair notwithstanding: what it asserts is the Scheduled calendar drawing the stored zoom, and
  9.5's calendar is that group's subject. AC-379 already holds the account half over the wire.
- **AC-402 was taken from the tail on 2026-09-04** (issue #96), on the rule the AC-361 to
  AC-365 bullet below states and one past the number in the bullet under this one, both
  having been taken by the same branch on the same night. It is 12.23's, beside AC-238,
  whose inline-script arm it completes: that one recomputes the digests from the shell
  document and in CI always reads the source, both vitest legs running before the build
  step, so a script that only the build produces was invisible to the whole suite. This
  reads the document the browser leg's own server serves, which `npm run e2e:app` built
  moments earlier. **The next number to take from the tail is 403 unless a sibling branch
  says otherwise**, and no gap above is claimed or freed here for the reason the bullet
  below gives.

- **AC-401 was taken from the tail on 2026-09-04** (issue #57), on the rule the AC-361 to
  AC-365 bullet below states and at the tail the AC-399 bullet below leaves: it is the icon
  rail's
  alignment, which nothing guarded while the glyphs sat at three different x positions for
  months. It is 12.18's, beside AC-182, which collapses the same rail and asserts what it
  still reaches where this asserts how it is drawn. **The numbers above 401 are not claimed
  or freed here.** AC-402 is the same branch's, in the bullet above; whether anything past
  it is spent is not known from here, three other branches having been open the same night,
  and listing a number free that a sibling has just spent is the collision this rule exists
  to prevent, made by the fix rather than by the mistake. The count in the table below and
  the total at the top are the last merge's to re-derive from the files, as the AC-394
  bullet says, and this branch moved neither.

- **AC-399 was assigned and AC-400 taken from the tail beside it on 2026-09-04** (issue
  #104), on the rule the AC-361 to AC-365 bullet below states. 399 was handed to this
  branch by the session that opened several at once, which is the backend README's rule for
  parallel branches; 400 was **taken unassigned**, that README's other half, because the
  work turned out to need a behavioural criterion beside the structural one and nobody was
  awake to hand out a second number. 398 is left alone rather than taken: this branch has
  no way to know whether it belongs to a sibling, and the bullet above says 397 was already
  reserved when it was written, so **the next number to take from the tail is 401** unless a
  branch holding 398 says otherwise. Both criteria are 12.23's. They are issue #104's
  `parseBody`: the structural sweep that no route parses a body without it, and the line it
  writes when a body carries a key nobody declared — what is in that line, and its silence
  for a body that carries none. **The count in the table below is not re-derived here**, on
  the AC-394 bullet's precedent: several branches were open the same night and the
  arithmetic belongs to the last merge rather than to any one of them.
- **AC-397 and AC-398 were taken from the tail on 2026-09-04** (issue #74), on the rule four
  bullets below. AC-397 is the authorization sweep: every route on the mounted router whose
  path carries a parameter, driven as a person with no relationship to the row that id names.
  It is 12.23's, beside AC-236, which made the *session* half of 10.2 structural and left this
  half resting on people remembering. **AC-398 is the one defect that sweep found**, and it is
  12.15's because it is about files: `DELETE /api/v1/files/:id` answered 404 to a member who
  reads the same bytes at 200, where 10.2 asks for 403. The two are adjacent because the
  second was written the night the first found the thing it asserts. 397 is the number the
  wave-1 merge held open for this branch — the bullet above records it as reserved rather
  than free — and 398 is the tail as that merge left it.

  **This branch merged after wave 1 and so it is the one that re-derives**, which the AC-361
  bullet makes the last merge's job rather than either side's. It did that twice, and the
  second time is why the first is recorded rather than corrected: at the wave-1 merge it took
  the count to 368 with the run ending at AC-398, and an hour later #104 landed with AC-399
  and AC-400 and this branch merged again, so **the number that stands is 370 and it is the
  top bullet's**. Nothing was wrong with the first derivation; it was simply not last. That is
  the ordinary shape of this rule rather than a failure of it, and it is the argument for
  deriving from the files every time instead of adding to whatever the previous merge wrote.
- **AC-394 to AC-396 were taken from the tail on 2026-09-04** (issue #99), on the rule the
  AC-361 to AC-365 bullet below states, and with the number assigned rather than chosen —
  several branches were open that night and the tail is only collision-proof when one party
  hands out the ranges. They are the CSP reporting endpoint: the policy naming somewhere to
  report a refusal to, what a report from Dana's own origin writes and what it must never
  write, and what the endpoint drops before it writes anything. The criteria are 12.23's.
  That clause read "moves from 9 to 12 with them" when this branch was open and it is 13 in
  the table below: AC-392 landed in the same file from 7.22's export while this was in
  flight, which is the arithmetic the last merge re-derives rather than either branch.
- **AC-390 to AC-393 were taken from the tail on 2026-09-04** (issue #77), on the rule the
  AC-361 bullet below states, and they are 7.22's data export: the whole shape of the document and the
  task and the addresses that must not be in it, the session gate with two-account
  non-leakage measured over the raw bytes, the five-per-hour limiter driven against the
  mounted route rather than against the limiter alone, and the attachment headers with
  10.3's cap planted as a real thousand-and-first row. **The numbers were assigned by the
  session that opened this branch beside several others**, which is the backend README's
  rule for parallel branches, so 375 to 389 belong to those and are not free here. Three of
  the four are 12.3's and AC-392 is 12.23's; the reasons are written beside them in each
  file. The count, the range sentence at the top of this list and the
  per-file counts in the table below are the last merge's to re-derive, as the AC-361
  bullet already says of the total; this branch deliberately moved none of them, several
  branches being open on the same files at once.
- **AC-384 to AC-389 were taken from the tail on 2026-09-04** (issues #116, #117 and #128),
  on the rule the AC-361 to AC-365 bullet below states, and deliberately above the numbers a
  sibling branch was holding rather than at the first free one: they are the life of a cover
  file, which Dana had no story for. AC-384 to AC-386 and AC-389 are 12.9's — the copy that
  makes a page's cover its owner's, the 11.7 reclaim of a cover nothing wears, the reference
  count that spares one two pages share, and the quota a copy spends — and AC-387 and AC-388
  are 12.10's, the shelf duplicate that carries an independent picture and the failure that
  leaves neither half of one behind.
- **AC-381 to AC-383 were taken from the tail on 2026-09-04** (issue #94), on the same branch
  and the same rule as the bullet below: attachment editing on an existing comment, which
  Imran ruled into existence and which until that day was a `file_ids` accepted, dropped and
  answered 200. The three are 12.14's — the set replaced, the set emptied, and what the edit
  refuses, the gate included, because a `file_ids` branch placed ahead of the authorship check
  would have passed AC-205 unchanged.
- **AC-378 to AC-380 were taken from the tail on 2026-09-04** (issues #140 and #142), on the
  rule the AC-361 to AC-365 bullet below states rather than out of the gaps above, several
  branches being open that night: the calendar's zoom becoming a durable account
  preference. AC-378 and AC-379 are
  12.3's, the default a fresh account reads and the preference following the person between
  sessions rather than the browser; AC-380 is 12.1's, migration 0013's CHECK tried against the
  database beside the 422 the endpoint answers, because AC-001 sees a constraint's name and
  never what its expression does. AC-375 to AC-377 were not spent by this branch and are not
  claimed here.
- **AC-377 was taken from the tail on 2026-09-04** (issues #21 and #70), on the tail rule
  the AC-361 to AC-365 bullet below states rather than out of the gaps above, several
  branches of one batch being open that night. It is 12.4's, and it is the sentence a new
  folder starts with, which `POST /folders` now takes in its body. **375 and 376 are
  deliberately not added to the free list above.** The branches beside this one were
  choosing from the same tail while this was written, so whether either is spent is not
  known here, and listing a number free that a sibling branch has just spent is the
  collision this rule exists to prevent, made by the fix rather than by the mistake.
  Whoever merges last re-derives the total and says what became of the two.
- **AC-376 was taken from the tail on 2026-09-04** (issue #76), on the same branch: both
  duplicate endpoints re-anchored a spent due date on the database session's day, which 8.1
  forbids by name, and they now take `tz` on 7.8's precedent. The criterion is the refusal
  shape — absent when a date would move, and present but not an IANA name — for both
  endpoints at once, because neither AC-277 nor AC-200 could carry it without becoming two
  criteria in one file. It is 12.16's. AC-277 and AC-200 were rewritten in the same change
  rather than renumbered: their oracle stopped depending on the database's clock, which is
  what the interim fix of issue #46 had tied it to.
- **AC-375 was taken from the tail on 2026-09-04** (issue #107), on the tail rule the AC-361 to AC-365
  bullet below states: `putPage` stored whatever `file_id` it was handed, so a member of one folder could
  plant another folder's id and everyone learned that a file with it exists. The gate is two
  clauses because the block has two homes, and the criterion asserts both. It is 12.9's.
- **AC-374 was taken from the tail on 2026-09-03**, on the same branch and after review of
  it: of the three gates that decide what a page may wear, the place-cover one was the only
  one with no `kind` clause, so another person's avatar could be worn on a person's own Today
  page and a voice note could be stored as a picture. The criterion is 12.9's.
- **AC-368 to AC-373 were taken from the tail on 2026-09-03** (issues #20 and #100), on the
  rule the AC-361 to AC-365 bullet below states, and they are the cover work: a shelf that
  can wear one at all, the gate on the file it names, the folder-less upload, who may read a
  picture that belongs to a person rather than to a folder, migration 0012's CHECKs tried
  against the database, and the rule that a cover's scope matches its page's.
- **AC-366 and AC-367 were taken from the tail on 2026-09-03** (issue #65), on the rule the
  next bullet states, and they are the shelf half of that night's second batch.
- **AC-361 to AC-365 were taken from the tail on 2026-09-03** (issues #27 and #30) rather
  than out of the gaps above, because several branches were open at once and **a gap is the
  one place two of them silently collide**. A branch that spends a gap and a branch that
  spends the tail cannot pick the same number; two branches both picking "the next free
  gap" can. AC-314 and AC-315 (issue #68) and AC-343 to AC-346 (issues #17, #22, #28) were
  spent out of the gaps on the same night, which is why those ranges have moved.
  **Whoever merges last re-derives the total** rather than taking either side of the
  conflict: it is arithmetic over the files, not a preference between two diffs.

The subsection numbers obey the same rule. 12.1 to 12.23 are addresses rather than an
ordering: a group that dies becomes a tombstone row in the table below, and a new topic takes
12.24.

## The files

| | File | Covers |
| - | - | - |
| 12.1 | [`12.1-schema-and-migrations.md`](12.1-schema-and-migrations.md) | 12.1 Schema and migrations, 7 criteria |
| 12.2 | [`12.2-sign-in-and-sessions.md`](12.2-sign-in-and-sessions.md) | 12.2 Sign-in and sessions, 18 criteria |
| 12.3 | [`12.3-the-account.md`](12.3-the-account.md) | 12.3 The account: profile, settings, deletion, 25 criteria |
| 12.4 | [`12.4-folders-and-membership.md`](12.4-folders-and-membership.md) | 12.4 Folders and membership, 20 criteria |
| 12.5 | [`12.5-sharing-roster-and-people.md`](12.5-sharing-roster-and-people.md) | 12.5 Sharing, the roster and people, 18 criteria |
| 12.6 | [`12.6-tasks-steps-and-the-task-surface.md`](12.6-tasks-steps-and-the-task-surface.md) | 12.6 Tasks, steps and the task surface, 39 criteria |
| 12.7 | [`12.7-today.md`](12.7-today.md) | 12.7 Today, 10 criteria |
| 12.8 | [`12.8-views-filters-and-search.md`](12.8-views-filters-and-search.md) | 12.8 Views, filters and search, 32 criteria |
| 12.9 | [`12.9-pages-blocks-and-covers.md`](12.9-pages-blocks-and-covers.md) | 12.9 Pages, blocks and covers, 22 criteria |
| 12.10 | [`12.10-shelves-and-the-library.md`](12.10-shelves-and-the-library.md) | 12.10 Shelves and the Library, 12 criteria |
| 12.11 | [`12.11-recurrence.md`](12.11-recurrence.md) | 12.11 Recurrence, 15 criteria |
| 12.12 | [`12.12-reminders.md`](12.12-reminders.md) | 12.12 Reminders, 24 criteria |
| 12.13 | [`12.13-events-history-and-notifications.md`](12.13-events-history-and-notifications.md) | 12.13 Events, history and notifications, 9 criteria |
| 12.14 | [`12.14-comments-and-likes.md`](12.14-comments-and-likes.md) | 12.14 Comments and likes, 11 criteria |
| 12.15 | [`12.15-files-images-and-avatars.md`](12.15-files-images-and-avatars.md) | 12.15 Files, images and avatars, 15 criteria |
| 12.16 | [`12.16-duplicating-and-importing.md`](12.16-duplicating-and-importing.md) | 12.16 Duplicating, importing and workflow files, 11 criteria |
| 12.17 | [`12.17-first-run-and-the-sample-workspace.md`](12.17-first-run-and-the-sample-workspace.md) | 12.17 First run and the sample workspace, 9 criteria |
| 12.18 | [`12.18-the-application-shell.md`](12.18-the-application-shell.md) | 12.18 The application shell, 15 criteria |
| 12.19 | [`12.19-drag-drop-selection-and-undo.md`](12.19-drag-drop-selection-and-undo.md) | 12.19 Drag, drop, selection and undo, 12 criteria |
| 12.20 | [`12.20-deletion-trash-and-restore.md`](12.20-deletion-trash-and-restore.md) | 12.20 Deletion, Trash and restore, 17 criteria |
| 12.21 | [`12.21-transactional-email.md`](12.21-transactional-email.md) | 12.21 Transactional email, 6 criteria |
| 12.22 | [`12.22-the-public-surface.md`](12.22-the-public-surface.md) | 12.22 The public surface: landing, legal, install, offline, 7 criteria |
| 12.23 | [`12.23-security-limits-and-rate-limits.md`](12.23-security-limits-and-rate-limits.md) | 12.23 Security, limits and rate limits, 16 criteria |

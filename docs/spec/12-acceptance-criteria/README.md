## 12. Acceptance criteria

Given/when/then, one behavior each, and this section is the definition of done. **Most
criteria here have no executable form**, and a number that resolves to no file under
`app/tests/` is still the specification of Dana's behaviour: the suite was cut to a core
set on 2026-09-20 on the owner's ruling, and `app/tests/README.md` carries what was kept,
on what rule, and how to run what is left. Who added a
criterion and when is git's: `git log -S 'AC-268' -- docs/spec/` finds the commit that
introduced one, with its date and its message.

The criteria are grouped by what they are about. A criterion that could honestly sit in two
groups has exactly one home rather than a copy in each, and each file opens by naming the
groups next to it.

## The next number

**The next number to take from the tail is 680.**

**This section is the allocator and `## Numbers` below it is not.** That one is a
chronological record of what each branch spent and why, written newest-first in places and
oldest-first in others, and it carries at least four superseded sentences of exactly the
shape of the one above — "the next number to take from the tail is 401", then 403, then
423 — each true of the list its author could read and none of them true now. Reading the
history and allocating from it is how a number gets spent twice. Read this section, take
the number it names, and **move the line above in the same commit that spends it**.

`app/tests/guards/guard-criterion-registry.test.ts` parses the bolded sentence above out of
this section and fails when anything in the tree has spent that number or anything over it,
which is what makes a stale allocator a red rather than a trap. It reads this section and no
other part of this file, so keep the sentence's wording; everything else here is prose.

**Assigned 2026-09-20 by issue #252, after reading every open branch rather than any
list.** `git ls-tree -r --name-only origin/<branch> -- app/tests/criteria/` and the section
12 bullets on each branch are the authority; the rows below were verified that way, and the
ones that could not be are marked. 680 rather than the first number after the highest
verified block, because the three branches at the bottom had not pushed and their extent
cannot be read from any tree.

| Block | Branch | Verified from the branch |
| - | - | - |
| 423 | merged, #239 | yes — and its bullet was missing until #252 wrote it |
| 424–428 | merged, #223 | yes |
| 440–447 | merged, #224 | yes |
| 450–452 | merged, #216 and #217 | yes |
| 460–463 | merged, #244 | yes |
| 464–466 | `backend/250-canvas-save-path` | yes, bullets |
| 470–481 | merged, #226 and #259 | yes |
| 490–507 | `backend/220-files-and-media-blocks` | yes, eighteen bullets and ten test files |
| 510–523 | `backend/228-folder-access-model` | yes |
| 540–554 | `backend/227-label-lifecycle` | yes |
| 560–573 | `backend/230-responsibility-document` | yes |
| 580 upward | `backend/250-canvas-save-path` | yes — **spent, not reserved**: AC-580 and AC-581 carry bullets |
| 600 upward | `backend/220-files-and-media-blocks` | no — nothing above 507 is on the pushed branch |
| 620 upward | `backend/253-account-deletion-sweep` | no — branch not pushed |
| 640 upward | `frontend/260-workflow-import-version` | no — branch not pushed |
| 660 upward | `backend/255` | no — branch not pushed |

**The gaps between those blocks are not free by default**, on the rule the AC-377 and
AC-440 bullets below state: whichever merge lands last is the only one that can see what its
siblings actually spent, and listing a number free that an open branch has just taken is the
collision this section exists to prevent. Three of them are known **renumbers** and must
stay empty so that the gap reads as a renumber rather than as an ordinary allocation:
**508 to 509**, **524 to 539** and **555 to 559**.

*(494 to 509 was carried as one such gap in the brief this was written from, and that half
of it is wrong: `backend/220` holds bullets for AC-490 through AC-507, so only 508 and 509
are empty there. This is the sort of thing the table above is verified against branches for,
and the sort of thing a chat message about blocks cannot be.)*

## Numbers

`AC-NNN` numbers are append-only: never renumbered, never reused, and a retired criterion is
marked rather than removed. A gap in the run is ordinary, and it is not a free number by
default, so read this list before spending one.

- **391 criteria carry their text in the files below, and 389 of them are live.** Every
  number from AC-001 to AC-422 not named below is one of them. Re-derived on 2026-09-09 by
  issue #192, after #184's compose-first merge, by **counting the
  `- AC-` bullets across the files** rather than by adding up what three branches each
  believed: 391, with no number appearing twice. Two independent checks agree, which is why
  the number is stated rather than hedged: the per-file rows in the table below **sum to
  exactly 391**, which they cannot do if one number is written twice, and the arithmetic
  gives the same — 422 numbers in the run, less AC-229 and the thirty free ones named below,
  is 391. The wave-3 sentence this replaces read 381 for its own night and was then moved to
  382 by issue #167; both were right when written, and neither was re-derived, which is what
  this bullet exists to do.

  **The two retired ones are inside that 391 and that is this section's own rule, not an
  oversight.** AC-122 and AC-123 were retired by issue #113 and are *marked* rather than
  removed, as the sentence above this list requires, so each still carries its text as a
  `- AC-` bullet and the count that counts bullets counts them. The number of criteria a
  build must satisfy is therefore 389, and the two numbers are given separately because they
  answer different questions: 391 is what is written down, 389 is what is asserted.

  **Six per-file rows moved with it and that is the point of counting rather than adding.**
  12.3 gained AC-404 and AC-409, 12.8 gained AC-405, 12.9 gained AC-406, AC-408 and AC-411,
  12.10 gained AC-407, 12.18 gained AC-401, and 12.23 gained AC-402, AC-410 and AC-412 —
  seventeen rows of the twenty-three were already right, because each branch left the
  arithmetic alone as this bullet asks. A count derived once at the end is one number to
  check. A count carried forward is twenty-three.

  **Two rows moved on the wave-4 merge and the same rule produced them**: 12.9 gained AC-413
  (issue #167) and 12.23 gained AC-414 (issue #6). Both branches were open at once, each
  wrote a bullet below deferring the totals to whichever merge came last, and this is that
  merge. Twenty-one of the twenty-three rows were already right; the one that was not was
  12.23, exactly as the AC-414 bullet said it would be.
- **AC-450 to AC-452 are spent, by issues #217 and #216 on 2026-09-20.** AC-450 is in
  12.7 and AC-451 and AC-452 in 12.8. They were taken from the tail rather than from a
  gap, as this section's rule requires while several branches are open: 423 to 428 and
  440 to 447 were already spoken for that day, so the next free number was 450 and the
  three run from there. The per-file totals in the table below are left to whichever of
  the day's merges lands last, as the branches of 2026-09-04 did.
- **AC-429 and AC-430 were never spent, and two files in `app/src/server/` named them as
  though they had been.** Found on 2026-09-20 by issue #257's citation guard.
  `domain/references.ts` said "AC-429 asserts the agreement behaviourally" and
  `routes/references.ts` said "AC-430 asserts that from the outside"; issue #223 landed
  AC-424 to AC-428 and neither number reached a bullet, a test file or this list. The two
  comments now say what is true and name AC-428, which does reach the second of the two
  claims. **Both numbers stay unspent and neither is added to the free list**, on the AC-440
  bullet's rule that 423 to 439 are not free by default while the branches that stepped over
  them are open; they are recorded here so that whoever greps `AC-429` next finds the answer
  rather than the two comments that used to be it.
- **AC-423 was spent by issue #239 on 2026-09-20 and its bullet was written eight hours
  later by issue #252**, which is the whole of why that issue exists. #239 took the number
  the sentence below named as next, wrote
  `app/tests/criteria/ac-423-task-schedule-start-date.test.ts`, amended 4.5 and 7.6 — and
  never wrote the criterion into 12.6, never wrote a row here, and left this file still
  naming 423 as the next number to take. **Nothing went red**, which is the point:
  `run-suite.mjs` accounted for the new file, the suite passed, and the only artefact was a
  number a test asserted and the specification did not claim. The bullet is now in 12.6 and
  its text is derived from that file's own cases. `guard-criterion-registry.test.ts` is what
  refuses the next one.
- **AC-229 is spent and its text is not here.** It was written into its own test file,
  `app/tests/e2e/ac-229-done-row-drops-the-due-echo.spec.ts`, which is built, named for the
  number and running. The number is taken; do not spend it again.
- **Never spent, and free to take: 286 to 289, 304 to 309, 316 to 329, 347 to 349, 358 to
  359, and 403.** Thirty numbers. Each gap but the last is a range that was allocated ahead
  of the work and only partly used, which is the ordinary cost of allocating a range before
  writing it. **403 is a different shape of gap and is the wave-3 integration's finding.**
  Five branches spent from the tail on the night of 2026-09-04 and between them took 401,
  402 and 404 to 412; 403 was stepped over by every one of them, each reading a list that
  said the next number was one it did not take. Nothing names it, no file under `app/tests/`
  carries it, and it is free.

  **Nothing from 375 upward is free but 403, and this sentence is the answer AC-377's bullet
  below asks the last merge for.** (It read "nothing from 375 upward is free" until the
  wave-3 integration of 2026-09-04 found 403 unspent; the exception is written into the
  sentence rather than left to the list above to contradict.) 375 to 396 were all spent on 2026-09-04 by the six branches of
  the wave-1 batch and by 7.22's export before them, 375 and 376 included — they were taken
  by issues #107 and #76, which is what the sibling branches could not know while they were
  open. **397 to 400 are all spent**, and this sentence is the four of them reconciled by the
  merge that came last, which is what the AC-361 bullet asks for. 397 was reserved for the
  authorization sweep and 398 taken beside it (issue #74); 399 was handed to issue #104 and
  400 taken unassigned beside it. Neither branch could see the other's, which is why each
  wrote a different "next number" and why this list, rather than either bullet, is where the
  answer is. **401 to 422 are spent but for 403, and the next number to take from the tail was
  423** — superseded, and the live answer is `## The next number` at the top of this file.
  Through 414 that sentence is the wave-3 integration's, written as the last merge of the night of
  2026-09-04 and derived from the files: 401 and 402 went to the browser-suite branch, 404
  and 405 to the settings-and-zoom one, 406 to 408 to the covers one, 411 to the images one,
  and 409, 410 and 412 to the settings-bundle one. Issue #184 then took AC-415 through
  AC-421 as one contained production boundary, and issue #192 took AC-422. **Each branch's own bullet below names a
  different tail — 401, then 403 — and none of them is wrong**, each being true of the list
  its author could read; this sentence is what the five reconcile to, and it is the reason
  the rule sends you here rather than to a bullet. The reservation language is left standing
  in the bullets below rather than tidied away, because it is the only record of why 397 sat
  unspent for a day, of why #104 deliberately stepped over 398, and now of how five branches
  between them stepped over 403.

  **229 was in this list until 2026-09-03 and contradicted the bullet directly above it**,
  which says the number is spent and must not be taken again. The count said thirty because
  it counted 229; the five ranges are twenty-nine numbers. Corrected on the branch for issues
  #20 and #100, which read this list to choose AC-368, rather than left for whoever spent 229
  a second time and found out from a duplicate test filename.
- **AC-414 was taken from the tail on 2026-09-04** (issue #6), on the rule the AC-361 to
  AC-365 bullet below states, and it is 12.23's: production answered on `https://dana.so` and
  on the Render address of the same service, session cookies are host-only, and two addresses
  are therefore two cookie jars — which is how "every visit needs a fresh sign-in" happened
  and why it was investigated twice as a cookie defect.

  **413 is not free and is deliberately not added to the list above**: it is spent by the
  sibling branch `backend/167-shelf-page-images`, which was open while this one was, so this
  branch stepped over it rather than take the number the list names as next. That is the same
  move the AC-411 bullet below records for its own night, and the reason is the same, a gap
  being ordinary where a collision is a duplicate test filename. **No total moves with it**,
  on the AC-410 and AC-411 precedent: the count at the top and 12.23's row in the table below
  belong to whichever merge comes last rather than to one of two branches open at once.
- **AC-580 and AC-581 were taken on 2026-09-20** (issue #250 again, after a review of the
  branch that took AC-464 to AC-466 below), and they are 12.9's, beside those three. **Taken
  from 580 rather than from the tail this list names**, and the reason is the same one the
  AC-440 and AC-464 bullets give, one step further along: re-read immediately before
  spending, the live ranges across the open branches were 450 to 452, 464 to 466, 470 to 481,
  490 to 507, 510 to 523 and 540 to 554, with 560 upward reserved, and **494 to 509, 524 to
  539 and 555 to 559 are deliberate renumber gaps that must not be filled**. 580 is above
  every one of them and above the reservation, which is what makes it safe to spend from a
  branch that cannot see what the others will take. **560 to 579 are therefore not free by
  default and are deliberately not added to the free list above**, on the AC-377 bullet's
  rule. **No total moves with these two**, on the AC-410, AC-413 and AC-464 precedent: the
  count at the head of this file and 12.9's row in the table below belong to whichever of the
  open branches merges last.
- **AC-464 to AC-466 were taken on 2026-09-20** (issue #250, the folder canvas save path),
  and they are 12.9's, beside the AC-460 to AC-463 they repair. Taken from **464** rather
  than from 423 or from 448, and the three were checked against every open branch rather
  than against this list alone, immediately before they were spent: 423 to 428 and 440 to
  447 were already merged, #219 had just taken 460 to 463, and six branches open at the same
  time held 450 to 452, 470 to 481, 480 to 493 and 490 to 499 between them. 464 to 466 is
  the widest gap nobody was standing in, and taking it keeps the #219 criteria and the ones
  that prove its client half in one run of numbers. **453 to 459 and 467 to 469 are
  therefore not free by default and are deliberately not added to the list above**, on the
  AC-377 bullet's rule: only the merge that comes last can see what the siblings actually
  spent. **No total moves with them**, on the AC-410 and AC-413 precedent: the count at the
  head of this file and 12.9's row in the table below belong to whichever of the open
  branches merges last.

  **Two of those six overlap each other and this branch is not the place to fix it**,
  recorded because the next reader of this list will otherwise take the silence for
  agreement: as of this branch's last read of the remote, `backend/226-label-core-domain`
  carries AC-480 and AC-481 and `backend/228-folder-access-model` carries AC-480 to AC-493,
  which also runs over `backend/220-files-and-media-blocks`'s AC-490 to AC-492. That is the
  collision this section's rule exists to prevent, it is between three other branches, and
  whichever of them merges second will find it as a duplicate criterion number rather than
  as a duplicate filename.
- **AC-440 to AC-447 were taken on 2026-09-20** (issue #224, task dependencies), and they
  were taken from **440** rather than from 423, which the sentence above names as next.
  Three branches were open at once that day; 423 was assigned to one of them and the range
  above it was being spent by another, so this branch stepped over the whole of it rather
  than take a number a sibling might already hold — the same move the AC-411 and AC-413
  bullets record, over a range instead of over a single number. **423 to 439 are therefore
  not free by default and are deliberately not added to the list above**, on the AC-377
  bullet's rule: whichever merge comes last is the one that can see what the siblings
  actually spent, and listing a number free that another branch has just taken is the
  collision this rule exists to prevent. The eight are 12.6's. **No total moves with them**,
  on the AC-410 and AC-411 precedent: the count at the top and 12.6's row in the table below
  belong to the last merge rather than to one of three branches open at once.
- **AC-413 was taken from the tail on 2026-09-04** (issue #167), on the rule the AC-361 to
  AC-365 bullet below states, and it is 12.9's, beside AC-375 whose gate it leans on: a
  picture on a shelf page had no folder to be uploaded into, so `POST /files { kind: image }`
  answered 422 and a person choosing one on a shelf saw nothing happen. The criterion asserts
  the widened upload, who may read the folder-less row, which page may name it — a shelf's may
  and a folder's may not — that `file` and `voice` still require a folder, and the lifetime
  7.19 gives it, because a picture nothing can reach and nothing can delete is what #116 was
  filed about. **The count at the top and 12.9's row in the table below are re-derived here**
  rather than left to a later merge, this being the only branch open with a criterion in it:
  the wave-3 integration's sentence said the next tail number was 413, and this took it.
- **AC-412 was assigned from the tail on 2026-09-04** (issue #168), on the same rule as
  AC-409 and AC-410 below, and it is 12.23's: the Google sign-in begin and its callback
  carried no rate limiter at all, which is older than every limit in 10.4 and could only be
  fixed once #153 made an address-keyed limit mean one client. **AC-411 is not spent by this
  branch** and is not added to the free list above, on the AC-377 bullet's rule: a sibling
  branch may hold it and listing a number free that another branch has just spent is the
  collision this rule exists to prevent.
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
- **AC-410 was assigned from the tail on 2026-09-04** (issue #153), on the same rule and by
  the same hand as AC-409 below, and it is 12.23's: `trust proxy` was set nowhere in
  `app/src`, so behind the edge of 11.11 every rate limit keyed on an address was one bucket
  for the whole deployment rather than one per visitor. The criterion is the three readings
  of `X-Forwarded-For` — one address, two, none — against the mounted application, plus two
  clients not sharing a bucket. **It is the shape of criterion that has to be written by
  hand**, because under test the socket peer is the real client and so every existing case
  measured the fixed behaviour on the broken code. **No total moves with it**, for the reason
  the bullet below gives.
- **AC-409 was assigned from the tail on 2026-09-04** (issue #152), on the backend README's
  rule for parallel branches rather than out of the gaps above: several branches were open
  that night and the number was handed out by the session that opened them, deliberately
  above 401 to 408, which belong to siblings and are **not** free here. It is 12.3's, and it
  is the guard on the subsection written the same night: `GET` and `PATCH /api/v1/settings`,
  the 4.19 bundle, were described nowhere in section 7 for the whole of RFC 0005 while four
  fields were added to them, so 7.23 records the endpoint and AC-409 holds that record equal
  to the two schemas and to the wire. **No total moves with it**, this branch being one of
  several on these files; the count, the range sentence above and the per-file rows below
  are the last merge's to re-derive, as the AC-361 bullet already says.
- **Five criteria changed state on 2026-09-04 and none of them is a new number** (issue
  #113): frozen 7.2's `GET` and `PATCH /me/settings` were retired on the owner's ruling, and
  AC-119 to AC-123 went with the endpoint. **AC-119, AC-120 and AC-121 are rewritten**
  against 7.23's `/settings` bundle, because the rules they pinned are that subsection's word
  for word — the column defaults, any subset including the empty one with absent fields
  unchanged, and a wrong value answering 422 naming the field and writing nothing.
  **AC-122 and AC-123 are retired and marked in 12.3 rather than removed**, per this
  section's own rule, and **their numbers are spent and are never reused**: AC-122's
  behaviour is already asserted by AC-379's third clause, which cites it by name, and
  AC-123's is unreachable now that no route writes the three v1 columns. **No total moves
  with this**: the run is unchanged, nothing was added or deleted from the numbering, and a
  retired criterion still carries its text. The count of *live* criteria is two lower than
  the bullet count, and re-deriving both is the last merge's as ever — done, and the top
  bullet now gives them as 381 written and 379 live.
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
  and AC-400 and this branch merged again, so **the number that stood was 370**. Nothing was
  wrong with the first derivation; it was simply not last. That is the ordinary shape of this
  rule rather than a failure of it, and it is the argument for deriving from the files every
  time instead of adding to whatever the previous merge wrote — and it happened a third time
  the following night, the wave-3 integration deriving 381, which is what the top bullet
  carries now.
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

The subsection numbers obey the same rule. 12.1 to 12.24 are addresses rather than an
ordering: a group that dies becomes a tombstone row in the table below, and a new topic takes
the next free number after them.

**12.24 is the first new group since the section was written**, taken on 2026-09-20 by issue
#226 for the M1 Label model of #208. It took the number the sentence above named, which is
what that sentence is for.

- **AC-481 was taken from the tail on 2026-09-20** (issue #226), beside the eleven in the
  bullet below and out of the same assignment, when the owner's technical ruling on that
  issue extended the `folder_members.label` expand-and-contract to the wire. It is 12.24's.
  **The registry was re-read immediately before it was taken rather than trusted from the
  bullet below**, which is the rule when several branches spend from one tail: the three
  branches open at that moment hold 450 to 452 (#217), 460 to 463 (#219) and 490 to 499
  (#220), and `main` at 59161e9 holds 423 to 428 and 440 to 447. 481 is inside this
  branch's own "470 upward" assignment and no sibling names it.

  **482 to 489 are deliberately not added to the free list above**, on the AC-412 bullet's
  rule, and neither is anything else this branch stepped over. **The count at the top does
  not move with this bullet** either, on the AC-410 and AC-411 precedent; 12.24's row in the
  table below is exact, this being a new file no other branch is writing into.
- **AC-470 to AC-480 were taken from the tail on 2026-09-20** (issue #226), eleven numbers,
  on the rule the AC-361 to AC-365 bullet below states and for exactly the reason it gives:
  several branches were open at once that day and a gap is the one place two of them
  silently collide. **423 to 428 and 440 to 447 were spent by sibling branches the same
  day, and 450 upward and 460 upward were assigned to branches still open**, so this branch
  was assigned 470 upward rather than taking the next number the list named. The numbers
  between — 429 to 439, 448, 449, and whatever the 450 and 460 ranges do not use — are
  **deliberately not added to the free list above**, on the AC-412 bullet's rule: listing a
  number free that a branch open at this moment has just spent is the collision the rule
  exists to prevent, and whoever merges last is the one who can see which of them are
  really free.

  **No total moves with this bullet**, on the AC-410 and AC-411 precedent, and the
  count at the top of this file is therefore stale by twelve, the eleven here and AC-481
  above, until the merge that comes
  last re-derives it over the files. 12.24's own row in the table below is exact, this being
  a new file that no other branch is writing into.

  The eleven are the backend half of #208 and nothing else: definitions, scope, privacy,
  assignments, archive, caps, projections and the Shelf rename. The Labels filter axis, the
  picker and the Manage Labels surface are #228's and are not numbered here, and the
  lifecycle integrations — move, duplicate, workflow files, export, Trash and purge — are
  #227's.

## The files

| | File | Covers |
| - | - | - |
| 12.1 | [`12.1-schema-and-migrations.md`](12.1-schema-and-migrations.md) | 12.1 Schema and migrations, 8 criteria |
| 12.2 | [`12.2-sign-in-and-sessions.md`](12.2-sign-in-and-sessions.md) | 12.2 Sign-in and sessions, 18 criteria |
| 12.3 | [`12.3-the-account.md`](12.3-the-account.md) | 12.3 The account: profile, settings, deletion, 27 criteria |
| 12.4 | [`12.4-folders-and-membership.md`](12.4-folders-and-membership.md) | 12.4 Folders and membership, 20 criteria |
| 12.5 | [`12.5-sharing-roster-and-people.md`](12.5-sharing-roster-and-people.md) | 12.5 Sharing, the roster and people, 18 criteria |
| 12.6 | [`12.6-tasks-steps-and-the-task-surface.md`](12.6-tasks-steps-and-the-task-surface.md) | 12.6 Tasks, steps and the task surface, 39 criteria |
| 12.7 | [`12.7-today.md`](12.7-today.md) | 12.7 Today, 10 criteria |
| 12.8 | [`12.8-views-filters-and-search.md`](12.8-views-filters-and-search.md) | 12.8 Views, filters and search, 33 criteria |
| 12.9 | [`12.9-pages-blocks-and-covers.md`](12.9-pages-blocks-and-covers.md) | 12.9 Pages, blocks and covers, 31 criteria |
| 12.10 | [`12.10-shelves-and-the-library.md`](12.10-shelves-and-the-library.md) | 12.10 Shelves and the Library, 13 criteria |
| 12.11 | [`12.11-recurrence.md`](12.11-recurrence.md) | 12.11 Recurrence, 15 criteria |
| 12.12 | [`12.12-reminders.md`](12.12-reminders.md) | 12.12 Reminders, 24 criteria |
| 12.13 | [`12.13-events-history-and-notifications.md`](12.13-events-history-and-notifications.md) | 12.13 Events, history and notifications, 9 criteria |
| 12.14 | [`12.14-comments-and-likes.md`](12.14-comments-and-likes.md) | 12.14 Comments and likes, 11 criteria |
| 12.15 | [`12.15-files-images-and-avatars.md`](12.15-files-images-and-avatars.md) | 12.15 Files, images and avatars, 15 criteria |
| 12.16 | [`12.16-duplicating-and-importing.md`](12.16-duplicating-and-importing.md) | 12.16 Duplicating, importing and workflow files, 11 criteria |
| 12.17 | [`12.17-first-run-and-the-sample-workspace.md`](12.17-first-run-and-the-sample-workspace.md) | 12.17 First run and the sample workspace, 9 criteria |
| 12.18 | [`12.18-the-application-shell.md`](12.18-the-application-shell.md) | 12.18 The application shell, 16 criteria |
| 12.19 | [`12.19-drag-drop-selection-and-undo.md`](12.19-drag-drop-selection-and-undo.md) | 12.19 Drag, drop, selection and undo, 13 criteria |
| 12.20 | [`12.20-deletion-trash-and-restore.md`](12.20-deletion-trash-and-restore.md) | 12.20 Deletion, Trash and restore, 17 criteria |
| 12.21 | [`12.21-transactional-email.md`](12.21-transactional-email.md) | 12.21 Transactional email, 6 criteria |
| 12.22 | [`12.22-the-public-surface.md`](12.22-the-public-surface.md) | 12.22 The public surface: landing, legal, install, offline, 7 criteria |
| 12.23 | [`12.23-security-limits-and-rate-limits.md`](12.23-security-limits-and-rate-limits.md) | 12.23 Security, limits and rate limits, 21 criteria |
| 12.24 | [`12.24-labels.md`](12.24-labels.md) | 12.24 Labels, 12 criteria |

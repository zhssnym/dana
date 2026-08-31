# A12 — `docs/spec/` as folders, and the acceptance criteria regrouped

What this is: a precise design for turning `docs/spec/` into one folder per numbered
section, with each subsection as its own file. It is a plan, not the work. Another
session executes it from here.

Measured on branch `pipelines`, 2026-09-01. Nothing outside this file was changed.

## The short version

- Every section becomes a folder. Every numbered subsection becomes a file inside it.
  A section with no numbered subsections holds one file. **That is the whole rule, and
  it reads the document's own numbering rather than anyone's judgement about size.**
- Fourteen files become one hundred and forty-four. That sounds like a lot. It is twelve
  folders and an index, and each folder holds between one and twenty-four small files.
- **Four files must be edited to keep every existing reference alive.** Not thousands.
  The numbering is what the code cites, and the numbering does not move.
- Section 12 is 48% build-session provenance by weight — 52.6 KB of "which session
  wrote this criterion, under which persona, at which change control item". That goes
  to git. 14.6 KB of it stays, because it changes how a criterion is read.
- The 324 criteria get 23 topical groups, and **the groups become numbered subsections
  12.1 to 12.23**, so they are addressable and append-only like everything else.
- Rewrapping is worth doing and must be a separate commit. Mixed into the move, it
  makes the move unreviewable.

---

## 1. The rule (Job 2)

> **Every section is a folder; every numbered subsection is a file in it; a section
> with no numbered subsections holds a single `README.md`.**

### Why this one

You asked me to resolve the tension between uniformity and judgement, and to reject any
rule that needs a human to remember it. This rule needs nobody to remember anything,
because it is not a rule about size. It is a rule about numbering, and the numbering is
already mandatory and already append-only.

Look at what happens when section 3 grows. Today it is 20 lines with no subsections, so
it is one file. The moment somebody adds a fourth invariant that deserves its own
heading, they have to number it — the RFC template already requires that, because a
number is how the rest of the repository will cite it. **Numbering it forces the split.**
There is no threshold to notice and no moment where the rule silently stops applying.

The reverse also holds, and it is the part that stops rot. If a file gets too big — 9.1
is 20 KB and is the one real offender — the fix is not to invent unnumbered files inside
the folder. The fix is to number its parts. 9.1 already has six natural ones: the chrome
elements, Routes, Addressing, Names, Regions, and Inline state copy. Number them 9.1.1
to 9.1.6 and the split follows automatically, and as a bonus a criterion can then cite
"9.1.4" instead of "9.1" and mean something.

### The cost, stated plainly

`03-invariants/` will contain one file. You are right that a folder holding one file is
worse than a file. I am accepting that cost in two places, sections 2 and 3, to buy a
rule with no judgement in it. The alternative — "split when it gets
big" — costs you a person noticing, every time, forever, and nobody ever does.

The second cost is real too: reading section 4 end to end becomes opening 21 files
instead of one. For an agent that is not harder. For you on GitHub it is. The folder's
`README.md` carries the ordered list with one line each, which is the mitigation, and
`cat docs/spec/04-data-model/4.*.md` is the other.

**A5 recommended against a per-subsection split** (`a5-docs-structure.md:322`), on the
grounds that 40+ tiny files would stop the contract being readable end to end. That
objection is real and I have just priced it. I am proposing the split anyway because you
asked for it and because the thing it buys — one change, one file, no merge conflicts —
is the thing you actually named as the problem.

---

## 2. The proposed tree

```
docs/spec/
  README.md                      was 00-index.md: addressing rules, section table, tombstones

  01-scope/
    README.md                    section heading, preamble, subsection map
    1.1-what-dana-is.md
    1.2-what-dana-does.md
    1.3-what-dana-does-not-do.md

  02-glossary/
    README.md                    the whole section: no numbered subsections

  03-invariants/
    README.md                    the whole section: no numbered subsections

  04-data-model/                 FROZEN
    README.md                    preamble, map, and the freeze's amendment record
    4.1-users.md
    4.2-connections.md
    4.3-folders.md
    4.4-folder_members.md
    4.5-tasks.md
    4.6-steps.md
    4.7-my_day_entries.md
    4.8-reminders.md
    4.9-invites.md
    4.10-user_settings.md
    4.11-storage-formats.md
    4.12-index-summary.md
    4.13-events.md
    4.14-notifications.md
    4.15-comments.md
    4.16-files.md
    4.17-page_blocks.md
    4.18-shelves.md
    4.19-user_views.md
    4.20-user_page_covers.md
    4.21-sample_objects.md

  05-state-machines/
    README.md
    5.1-task-status.md
    5.2-invite-lifecycle.md
    5.3-folder-membership.md
    5.4-permission-matrix.md

  06-queries/
    README.md                    the definitions block that governs every query
    Q1-today-open-list.md
    Q1R-today-recap.md
    Q2-undated-open-tasks.md
    Q3-scheduled-list-mode.md
    Q3C-scheduled-calendar-mode.md
    Q4-important.md
    Q5-all.md
    Q6-done.md
    Q7-folder-detail.md
    Q8-search.md
    Q9-Q12-internal.md
    6.1-partition-proof.md

  07-api/                        FROZEN
    README.md                    preamble, map, and the freeze's amendment record
    7.0-conventions.md
    7.1-auth-and-account.md
    7.2-settings.md
    7.3-connections.md
    7.4-folders-and-membership.md
    7.5-invites.md
    7.6-tasks.md
    7.7-steps.md
    7.8-my-day-membership.md
    7.9-reminder.md
    7.10-views-and-search.md
    7.11-server-authoritative.md
    7.12-events-and-notifications.md
    7.13-trash.md
    7.14-comments.md
    7.15-files.md
    7.16-pages-shelves-and-acts.md
    7.17-view-routes.md
    7.18-search-extension.md
    7.19-place-covers.md
    7.20-sample-workspace.md

  08-business-logic/
    README.md
    8.1-timezone-anchors-and-today.md
    8.2-today-evaluation.md
    8.3-concurrency-policy.md
    8.4-clearing-a-due-date.md
    8.5-recurrence.md
    8.6-reminders.md
    8.7-invites-and-sharing.md
    8.8-folder-deletion-and-member-removal.md
    8.9-ownership-transfer.md
    8.10-account-deletion.md
    8.11-completion-count.md

  09-ui/
    README.md
    9.1-global-chrome.md
    9.2-landing-and-login.md
    9.3-the-task.md
    9.4-today.md
    9.5-scheduled-assignments-important-all.md
    9.6-folder-page.md
    9.7-settings.md
    9.8-people-and-invites.md
    9.9-search-overlay.md
    9.10-shelves.md
    9.11-trash.md
    9.12-notifications.md
    9.13-first-run.md

  10-non-functional/
    README.md
    10.1-authentication-and-sessions.md
    10.2-authorization-enforcement-points.md
    10.3-input-validation-and-limits.md
    10.4-rate-limits.md
    10.5-logging.md
    10.6-pwa-requirements.md
    10.7-email-deliverability.md
    10.8-response-security-headers.md

  11-architecture/
    README.md
    11.1-shape.md
    11.2-runtime-language-repository.md
    11.3-server.md
    11.4-client.md
    11.5-database-and-migrations.md
    11.6-authentication-module.md
    11.7-reminder-scheduler.md
    11.8-email.md
    11.9-recurrence-and-time.md
    11.10-testing-infrastructure.md
    11.11-hosting-and-delivery.md
    11.12-observability.md
    11.13-design-artifacts.md
    11.14-rejected-alternatives.md
    11.15-known-hazards.md

  12-acceptance-criteria/
    README.md                    what a criterion is, the number index, the spent-number list
    12.1-schema-and-migrations.md
    12.2-sign-in-and-sessions.md
    12.3-the-account.md
    12.4-folders-and-membership.md
    12.5-sharing-roster-and-people.md
    12.6-tasks-steps-and-the-task-surface.md
    12.7-today.md
    12.8-views-filters-and-search.md
    12.9-pages-blocks-and-covers.md
    12.10-shelves-and-the-library.md
    12.11-recurrence.md
    12.12-reminders.md
    12.13-events-history-and-notifications.md
    12.14-comments-and-likes.md
    12.15-files-images-and-avatars.md
    12.16-duplicating-and-importing.md
    12.17-first-run-and-the-sample-workspace.md
    12.18-the-application-shell.md
    12.19-drag-drop-selection-and-undo.md
    12.20-deletion-trash-and-restore.md
    12.21-transactional-email.md
    12.22-the-public-surface.md
    12.23-security-limits-and-rate-limits.md
```

**144 files, 12 folders.** Section 13 gets no folder — see §6.

**Nothing else goes in a section folder.** Not a `decisions/`, not an `amendments.md`.
A5 proposed both. I am folding the frozen sections' amendment record into the folder's
own `README.md` instead, under an `## Amendments` heading, for the same reason the rule
in §1 has no size threshold: an optional file is a thing somebody has to remember to
create, and one folder with an `amendments.md` and eleven without is a rule that has
already started rotting. Architecture decision records are a separate question and I am
not relitigating A5's answer to it.

### What a folder `README.md` holds

Three things, in this order, and never anything else:

1. The `## N. Section title` heading.
2. Whatever normative text sits above the first numbered subsection. For section 4 that
   is the "Reference dialect: Postgres 16" paragraph. For section 6 it is the whole
   definitions block, which is 3.2 KB and governs every query. For section 8 it is
   nothing.
3. A table of the subsections, one line each.

For sections 2 and 3, which have no subsections, item 2 is the entire section and item 3
is absent.

---

## 3. The exact mapping

Line ranges are measured against the files as they stand on `pipelines` today. Every
byte from the first `###` to the end of the file lands in exactly one subsection file.

| Current file | Lines | Goes to | Split at |
| --- | --- | --- | --- |
| `00-index.md` | 41 | `README.md` | not split; rewritten (see §4) |
| `01-scope.md` | 45 | `01-scope/` | 1–2 → README; `### 1.1` 3–6, `### 1.2` 7–18, `### 1.3` 19–45 |
| `02-glossary.md` | 49 | `02-glossary/README.md` | not split |
| `03-invariants.md` | 20 | `03-invariants/README.md` | not split |
| `04-data-model.md` | 399 | `04-data-model/` | 1–10 → README (its two bold annotations become README's `## Amendments`); then one file per `### 4.N`, 21 of them, at lines 11, 26, 36, 68, 81, 109, 122, 134, 148, 165, 179, 188, 205, 229, 246, 273, 294, 322, 342, 361, 379 |
| `05-state-machines.md` | 79 | `05-state-machines/` | 1–4 → README; `### 5.1` 5, `5.2` 34, `5.3` 49, `5.4` 62 |
| `06-queries.md` | 103 | `06-queries/` | 1–15 → README (the definitions block is normative and governs every query, so it stays there); then Q1 16, Q1R 25, Q2 31, Q3 39, Q3C 47, Q4 55, Q5 63, Q6 69, Q7 77, Q8 86, Q9–Q12 95, 6.1 99 |
| `07-api.md` | 351 | `07-api/` | 1–8 → README (its two bold annotations become README's `## Amendments`); then one file per `### 7.N`, 21 of them, at lines 9, 33, 46, 53, 60, 82, 107, 135, 153, 166, 175, 198, 204, 212, 252, 266, 300, 310, 316, 320, 334 |
| `08-business-logic.md` | 263 | `08-business-logic/` | 1–2 → README; `### 8.N` at 3, 12, 33, 51, 83, 133, 177, 210, 222, 226, 253 |
| `09-ui.md` | 299 | `09-ui/` | 1–4 → README; `### 9.N` at 5, 102, 125, 167, 177, 189, 213, 226, 238, 242, 246, 250, 272 |
| `10-non-functional.md` | 97 | `10-non-functional/` | 1–2 → README; `### 10.N` at 3, 9, 17, 51, 55, 59, 63, 69 |
| `11-architecture.md` | 220 | `11-architecture/` | 1–4 → README; `### 11.N` at 5, 15, 21, 28, 41, 48, 64, 77, 83, 89, 124, 133, 139, 173, 198 |
| `12-acceptance-criteria.md` | 607 | `12-acceptance-criteria/` | **not a mechanical split** — see §5 |
| `13-open-questions.md` | 84 | deleted; 16 items relocate | see §6 |

For sections 1 and 4 to 11, the split is mechanical and byte-preserving. An executing
session can do it with `awk` and verify it with a checksum (§8).

Section 12 is the only one that needs a person to read it, and it is most of the work.

---

## 4. Citation impact

### What breaks: almost nothing, and the reason is already written down

`docs/spec/00-index.md:13-16` says it:

> the numbering is the addressing scheme, not the filenames. Every cross-reference in
> this repository says "section N" or "section N.M", and it resolves to the file whose
> name begins with N.

One word changes. **File becomes directory, and a subsection number resolves to the file
inside it whose name begins with N.M.** That is a strict improvement on today: right now
"section 11.15" gets you a 220-line file to scroll; afterwards it gets you the text.

I measured the citations rather than trusting the number in the brief.

| Form | Count | Breaks? |
| --- | --- | --- |
| `section N.M` / `spec N.M` in `app/` | 2,088 | No |
| Bare `N.M's` in `app/` (e.g. "7.4's") | 2,487 | No |
| `AC-NNN` in `app/` | 3,275 | No |
| Anchor links into a spec file (`…md#heading`) | **0** | — |
| Spec file paths anywhere in the repo | 98, in 14 files | Yes |
| Spec paths read by any build, test, or CI step | **0** | — |

The zero on anchors matters and I checked it specifically: nothing anywhere links to a
spec heading, so splitting headings into files cannot break a link.

The zero on tooling matters more. Only one file under `app/` mentions a spec path at all,
and it is prose inside a comment: `app/tests/e2e/ac-180-folder-groups.spec.ts:69` names
`docs/spec/09-ui.md` while explaining what the test asserts. Nothing resolves it. **No
test can go red from this restructure, because no test reads the specification.**

### The files that need editing

**Must edit — four files.**

| File | What |
| --- | --- |
| `docs/spec/00-index.md` → `docs/spec/README.md` | 13 table rows relink to folders; the two addressing sentences at :13–16 change "file" to "directory" and gain the subsection clause; the freeze paragraph at :38–41 is restated (see §7); the tombstone rows are added |
| `docs/rfcs/0000-template.md:69` | one sentence: "a section number resolves to the file whose name begins with that number" |
| `CLAUDE.md:48` | the repository-map row, which names `00-index.md` and restates the resolution rule |
| `docs/workflow/how-we-work.md:139` | one path, `docs/spec/13-open-questions.md` |

**Should edit — two, and they move anyway.** `11-architecture.md` names `00-index.md`
once at :86; `13-open-questions.md` names `07-api.md` once at :78, and that file is being
deleted regardless.

**Leave alone — two RFCs, 20 citations.** `docs/rfcs/0004-v2-port-and-build.md` (2) and
`docs/rfcs/0005-v2-specification.md` (18) say things like "Folded into
`docs/spec/04-data-model.md`". Those are dated statements about where text went at the
time. Editing them falsifies a record to fix a link. One line at the top of each — *"spec
sections became folders on <date>; a path below resolves to the folder of the same
number"* — costs two lines instead of twenty edits. If A10 and A11 are restructuring
those RFCs anyway, this folds into that work and costs nothing.

**Your call — six.** `app/tests/e2e/ac-180-folder-groups.spec.ts:69` (a comment) and the
five files in `docs/restructuring-workflow-pipelines/` that cite spec paths and line
numbers, 46 citations between them. Those are this project's own working notes and they
record what was true when written.

**So: 4 files must change, 2 more should, 2 get one line each, 6 are optional. Zero test
changes, zero CI changes, zero build changes.**

A5 said 32 edits across those same files (`a5-docs-structure.md:353`). We agree on the
scale; I am counting files rather than edits and I am arguing against editing the two
RFCs at all.

---

## 5. Section 12, regrouped (Job 1)

### What is actually in there

Measured, not estimated:

| | Lines | Bytes | Share |
| --- | --- | --- | --- |
| The 324 criteria | 324 | 76,730 | 52% |
| Prose worth keeping (reading rules) | 21 | 14,611 | 10% |
| Prose about the numbering (gaps, unspent numbers) | 4 | 2,637 | 2% |
| Prose that is build-session provenance | 100 | 52,625 | **36%** |

**Note the count: 324 criteria, not 326.** The file mentions 326 distinct `AC-NNN`
tokens, but two of them — AC-229 and AC-289 — appear only in prose that reserves them.
They were never written. A4 reached the same 324 (`a4-tests-and-ci.md:91`).

### The rot, precisely

You described it correctly and here is the evidence. The first eleven groups name a topic
and a package: `**Schema (P0)**`, `**Auth and provisioning (P1)**`. The last two dozen
name a session: `**S28a's and S23a's criteria, authored 2026-08-30 under persona 11
beside the rows that built them (RFC 0005 change control items 53 and 54)**`.

There is a sharper symptom than drift. **The file now contradicts itself.** Line 486
opens `**AC-257 was claimed at item 34 and is deliberately not spent.**` Nine lines later,
line 495 says S17b's "numbers are AC-257 onward", and line 503 defines an AC-257. Both
paragraphs were true when written — S19 released the number and S17b took it — but a
reader going top to bottom is told a criterion does not exist and then shown it. That is
what a changelog living inside a contract does after enough entries.

### The regrouping

23 groups, by what the criterion is about. They become **numbered subsections 12.1 to
12.23**, which does three things: it gives each group an address, it makes the grouping
append-only like every other number in this repository, and it means section 12 obeys the
same folder rule as everything else with no exception carved for it.

Every one of the 324 numbers appears in exactly one group. I verified that with a script:
no duplicates, no omissions, nothing assigned that is not defined.

| # | Group | n | AC numbers |
| --- | --- | --- | --- |
| 12.1 | Schema and migrations | 5 | 001–004, 211 |
| 12.2 | Sign-in and sessions | 17 | 005–008, 010, 105–115, 239 |
| 12.3 | The account: profile, settings, deletion | 19 | 009, 116, 119–123, 133–138, 208, 241, 250, 261, 281, 339 |
| 12.4 | Folders and membership | 19 | 011–013, 015–023, 173, 181, 193, 202, 217, 243, 246 |
| 12.5 | Sharing, the roster and people | 17 | 024, 059–069, 139–141, 172, 244 |
| 12.6 | Tasks, steps and the task surface | 39 | 025–041, 043, 092–094, 097, 157, 161, 166, 178, 179, 199, 219, 220, 248, 249, 291, 296, 350, 352–354, 356 |
| 12.7 | Today | 10 | 044–050, 132, 165, 355 |
| 12.8 | Views, filters and search | 32 | 051–057, 070, 095, 096, 099, 125–131, 156, 158, 167, 177, 209, 210, 222, 245, 247, 258, 263, 330–332 |
| 12.9 | Pages, blocks and covers | 13 | 058, 176, 197, 198, 259, 260, 270, 271, 293, 295, 335, 336, 342 |
| 12.10 | Shelves and the Library | 6 | 180, 203, 223, 257, 313, 334 |
| 12.11 | Recurrence | 15 | 071–082, 098, 142, 143 |
| 12.12 | Reminders | 24 | 083–090, 144–154, 164, 168–170, 212 |
| 12.13 | Events, history and notifications | 9 | 184–188, 213, 218, 311, 333 |
| 12.14 | Comments and likes | 5 | 204–207, 290 |
| 12.15 | Files, images and avatars | 10 | 194–196, 230–235, 360 |
| 12.16 | Duplicating, importing and workflow files | 10 | 200, 201, 237, 272, 273, 277, 282, 292, 294, 341 |
| 12.17 | First run and the sample workspace | 8 | 226, 297–303 |
| 12.18 | The application shell | 15 | 155, 162, 171, 174, 175, 182, 183, 214–216, 242, 264, 310, 312, 338 |
| 12.19 | Drag, drop, selection and undo | 12 | 221, 225, 227, 228, 266–269, 278–280, 340 |
| 12.20 | Deletion, Trash and restore | 17 | 014, 042, 189–192, 224, 262, 274–276, 283–285, 337, 351, 357 |
| 12.21 | Transactional email | 6 | 251–256 |
| 12.22 | The public surface: landing, legal, install, offline | 7 | 091, 100, 159, 160, 163, 240, 265 |
| 12.23 | Security, limits and rate limits | 9 | 101–104, 117, 118, 124, 236, 238 |

Total: **324.**

The largest file is 12.6 at 7.6 KB of criteria. The smallest is 12.1 at 711 bytes. Today
the one file is 147 KB.

**Criteria numbers do not change. Not one.** Their order inside a file changes, which is
the only thing that moves.

**Where I had to choose.** A few criteria could honestly sit in two groups, and I gave
each exactly one home rather than duplicating it. Folder deletion is the clearest case:
who may delete a folder (AC-015) is in 12.4 with the rest of the permission rules, while
what deletion *does* (AC-014, AC-042) is in 12.20 with Trash. The group file's opening
line names the neighbouring groups so a reader who guessed wrong is one hop away.

### The provenance prose: what stays, what goes

**Keep — 21 paragraphs, 14.6 KB. Each one changes how a criterion is read.** Without
them a test author writes a different test. They move into the group file, directly under
the criterion or criteria they qualify. By line number in today's file:

`73` (AC-046 and AC-050 are asserted by content, not at the instant they name) ·
`105` (same, AC-072 to AC-075) ·
`158` (the two readings of frozen 7.2 the settings criteria rest on) ·
`172` (AC-124 asserts the outcome, not the interleaving) ·
`201` (the backslash case, measured against real Postgres) ·
`234` (the two pairs the account-deletion criteria pin) ·
`258` and `260` (why AC-143's two halves are not redundant) ·
`332` (the exact strings AC-161 and its neighbours report) ·
`334` (AC-138's "Deleted user" clause is deliberately not asserted) ·
`359` (AC-173 asserts identification, not a colour value) ·
`436` and `438` (what AC-227 asserts, and that "Into {group}" is read while the pointer is
still down) ·
`477` (the `section_block_id` reading a case rests on) ·
`499` (AC-180 and AC-246 say "Move to group", not 9.6's "Move to shelf") ·
`501` (AC-262's last arm asserts an absence, and rests on an escalation) ·
`514`, `516`, `518` (what AC-265 asserts about the mark, and what it deliberately does
not) ·
`524`, `526` (AC-269 asserts an absence; the order criteria name neighbours, never a
stored key).

**Move to the folder's `README.md` — 4 paragraphs, 2.6 KB.** Lines `317`, `434`, `473`
and `486` are all about the numbering: why there are gaps, why AC-227 is 227 and not 226,
why 243–247 were spent elsewhere. That is a property of the addressing system and it must
stay honest, but it is one subject and belongs in one place. It condenses to a short
"Numbers" section listing **every number that is not spent**, which today you can only
discover by diffing the file against itself:

> 229, 286–289, 304–309, 314–329, 343–349, 358, 359.

Thirty-six numbers. Without that list somebody will one day write a second AC-229.

**Delete — 100 paragraphs, 52.6 KB.** Everything of the form "these belong to package
P5", "this rides P7's merge gate", "authored 2026-08-26 under persona 11 beside the row
that built them", "the numbers are the next free ones after AC-250". The packages P0 to
P10 do not exist. The sessions do not exist. The Integration Steward and the Adversarial
Test role do not exist. Every one of these paragraphs answers "who added this and when",
and git answers that better, with a diff attached. `git log -S "AC-268" --
docs/spec/` finds the commit that introduced it, the message, and the date.

That includes all 37 of the bold pseudo-headings, which the 23 group headings replace.

---

## 6. Section 13

A9 is triaging it right now and its verdict is to delete the file: 20 items closed, 21
becoming issues, 16 that were never questions. I am designing around its absence, as
instructed, and I only need to answer one thing: where the survivors land.

Under this tree the answer gets sharper than "the section it constrains", because
subsections are files:

| Items | Destination |
| --- | --- |
| 16, 17, 18, 25, 36 — "the library does X, we do Y" | `11-architecture/11.15-known-hazards.md` |
| 26 — the browser leg runs on PGlite only | `11-architecture/11.10-testing-infrastructure.md` |
| 6, 20 — the 1000-row cap and the uncapped folder list | `10-non-functional/10.3-input-validation-and-limits.md` |
| 21, 24 — no index on `important`, none for the projection predicate | `04-data-model/4.12-index-summary.md` |
| 23 — the calendar is bounded by its 62 days and nothing else | `07-api/7.10-views-and-search.md` |
| 7 — one reminder per task | `08-business-logic/8.6-reminders.md` |
| 8 — silent timezone auto-sync | `08-business-logic/8.1-timezone-anchors-and-today.md` |
| 10 — floating `due_time` across timezones | `04-data-model/4.11-storage-formats.md` |
| 12 — invites do not expire | `08-business-logic/8.7-invites-and-sharing.md` |
| 37 | delete; A9 shows its bet is spent |

*Inference:* A9 names the section for the first two rows and says "the section that
states the behaviour" for the rest. The specific files for items 10, 12, 20, 21, 23 and
24 are my reading of which subsection states each behaviour, not A9's.

Each lands as a short trailing paragraph in that file, marked **Assumption:** and saying
what changes if it is wrong. Not a new file kind — a new file kind is a thing somebody
has to remember.

**No `13-open-questions/` folder.** The tombstone is one row in `docs/spec/README.md`:
section 13 retired on <date>, its open items are GitHub issues, its assumptions moved to
the sections they constrain. A tombstone belongs where numbers are resolved, which is the
index, not a folder nobody opens. Section 13's number is never reused.

---

## 7. What "frozen" should mean

Today, `00-index.md:38-41` says changing sections 4 or 7 "is a human decision, never an
agent's". That was written for thirteen autonomous sessions. There are no sessions now,
every change goes through you, and a rule phrased as "never an agent's" is either
redundant or read as ceremony and skipped.

Frozen should mean **a change costs more, and the cost is paid in the folder.** Under the
tree, that is concrete rather than a slogan:

> Sections 4 and 7 are frozen. Frozen is not unchangeable. It means a change to any file
> in `04-data-model/` or `07-api/` requires four things, and the first three are the same
> reviewer's checklist as any breaking change:
>
> 1. an RFC, never an issue alone, however small the change looks;
> 2. an expand-and-contract migration plan per 11.5, because section 4 is data that
>    already exists and section 7 is a contract a deployed client is calling right now;
> 3. the list, by number, of every acceptance criterion the change invalidates;
> 4. a dated line under `## Amendments` in that folder's `README.md`, saying what moved
>    and who decided it.
>
> Neither reason is about trust. Section 4 is frozen because a wrong migration loses real
> data. Section 7 is frozen because a browser is calling those endpoints now.

Item 4 is the part the folder structure buys you. The freeze's audit trail exists today —
it is the two bold paragraphs at the top of each frozen file, and `00-index.md:39-41`
already calls them exactly that. Right now that trail sits on top of the contract, so you
read 600 words of amendment history before reaching `### 7.0 Conventions`. Moving it to
the folder's README gives it a home and gives the contract its first line back.

A5 reached the same restatement independently (`a5-docs-structure.md:367`). We differ
only on where the trail lives: it proposed a separate `amendments.md`, I am putting it in
the README under a heading, on the one-file-kind rule from §1.

---

## 8. Rewrapping

The problem is not confined to section 13. Measured, average characters per non-blank
line:

| File | Avg | Longest line | Lines over 400 chars |
| --- | --- | --- | --- |
| `13-open-questions.md` | 1,463 | 5,048 | 42 |
| `12-acceptance-criteria.md` | 324 | 1,674 | 117 |
| `09-ui.md` | 275 | 2,970 | 52 |
| `11-architecture.md` | 270 | 1,892 | 30 |
| `07-api.md` | 197 | 1,745 | 39 |
| `08-business-logic.md` | 168 | 3,124 | 23 |

Everything else in the repository wraps near 80: `CLAUDE.md` averages 74,
`docs/rfcs/0000-template.md` 58, `docs/workflow/how-we-work.md` 60.

**Yes, rewrap. At 80 columns. In its own commit, after the move.**

Why it is worth doing: a one-word change to a 1,700-character paragraph currently shows
in `git diff` as the whole paragraph rewritten. You cannot review a spec change today,
and that is a bigger cost than the file sizes.

Why it must be separate: a commit that both moves text and rewraps it cannot be verified.
You cannot tell a move from an edit. Two commits, each verifiable on its own:

- The move commit changes zero content. Verified by concatenation checksum (§9).
- The rewrap commit changes zero words. Verified by stripping every newline and run of
  spaces from both sides and comparing.

Nothing outside `docs/restructuring-workflow-pipelines/` cites a spec line number — I
checked all 25 such citations and every one is in this folder — so rewrapping breaks no
reference.

Tables and code fences are left alone. `08-business-logic.md` has 22 fences; the rest have
none.

---

## 9. What could go wrong, and how to know it did not

**1. Content is lost in a split.** The likeliest failure and the easiest to catch. For
each of sections 1 and 4 to 11, the concatenation of the new subsection files in number
order must be byte-identical to the old file from its first `###` line to the end:

```bash
git show HEAD~1:docs/spec/04-data-model.md | sed -n '/^### 4\.1 /,$p' > /tmp/old.txt
cat docs/spec/04-data-model/4.*.md > /tmp/new.txt          # careful: 4.10 sorts before 4.2
diff /tmp/old.txt /tmp/new.txt && echo IDENTICAL
```

The comment is not a nicety. Shell glob order puts `4.10` before `4.2`, so the executing
session must order the concatenation numerically, or the diff will be a false alarm on
every section with more than nine subsections — 4, 7, 9, 10, 11 and 12.

**2. A subsection number is lost or duplicated.** The set of `N.M` filename prefixes in
each folder must equal the set of `### N.M` headings in the pre-move file. Counts to
match: 4 → 21, 5 → 4, 6 → 12, 7 → 21, 8 → 11, 9 → 13, 10 → 8, 11 → 15, 1 → 3.

**3. A criterion is dropped, duplicated, or reworded in the section 12 regrouping.** This
is the one that would do real damage, because 316 of the 324 numbers
name a test file under `app/tests/`. The check is exact:

```bash
git show HEAD~1:docs/spec/12-acceptance-criteria.md | grep '^- AC-' | sort > /tmp/old-ac.txt
cat docs/spec/12-acceptance-criteria/12.*.md | grep '^- AC-' | sort > /tmp/new-ac.txt
diff /tmp/old-ac.txt /tmp/new-ac.txt && echo IDENTICAL
wc -l < /tmp/new-ac.txt        # must read 324
cut -c1-9 /tmp/new-ac.txt | uniq -d    # must print nothing
```

Byte-identical criterion text, 324 lines, no duplicate numbers. If any of the three fails,
stop.

**4. A reading rule is dropped with the provenance.** The 21 paragraphs are listed by
line number in §5. Each must appear in the group file holding the criterion it qualifies.
There is no automatic check for this; it is a read-through of 21 paragraphs, and it is
the reason §5 lists them by number rather than describing them.

**5. Somebody thinks the tests broke.** They cannot. No test, no build step and no CI job
reads a file under `docs/spec/` — I checked `app/`, `.github/workflows/` and
`app/scripts/`. The single mention is prose in a test comment. If the suite goes red after
this work, the cause is something else and the person should say so out loud before
touching the spec again.

**6. `git log --follow` stops working.** It will, for 20 of the 21 files a section splits
into, and there is no way around it: `--follow` handles one-to-one renames only. Two
mitigations. Use `git mv` for the largest subsection of each section, which keeps follow
for the biggest piece. And make the move commit contain nothing but the move, so
`git blame -C -C` still traces every line back across the split, and `git log -S '<a
phrase>'` still finds its origin. If content edits ride along in that commit, both stop
working.

**7. The addressing rule gets changed in one place and not the other.** It is stated
three times: `00-index.md:13-16`, `docs/rfcs/0000-template.md:69`, `CLAUDE.md:48`. After
the change, `grep -rn "file whose name begins" .` must return nothing.

**8. Section 13's number gets reused.** It must not be. Numbers are append-only; a
retired section becomes a tombstone row in `docs/spec/README.md` and stays one.

**9. The 12.x subsection numbers get renumbered later** when a group is merged or split.
They must not be. The same append-only rule that protects 1 to 13 protects 12.1 to 12.23:
a dead group becomes a tombstone, and a new topic takes 12.24.

**10. Line 486 is carried forward as written.** It says AC-257 is "deliberately not
spent" and AC-257 exists. The executing session must drop that paragraph and record 257
as spent in the README's number list.

---

## What I could not verify

- **The criterion count.** Your brief says 326; I measure **324** criteria defined by a
  `- AC-` line. AC-229 and AC-289 appear only in prose reserving them. A4 independently
  reached 324. I could not reconcile the 326 beyond that, and I did not check whether a
  test file exists for either number.
- **The 16,400 citations.** I could not reproduce that figure. A tight regex reads 2,088
  `section N.M` citations in `app/`, plus 2,487 bare `N.M's` forms, plus 3,275 `AC-NNN`
  citations. A deliberately loose regex reads 22,608. The number that matters is
  unaffected either way: none of them break.
- **The 23 groups and their contents are my judgement.** The assignment is complete and
  non-overlapping — I verified that mechanically — but "AC-171 belongs in the shell rather
  than in views" is a reading, not a measurement. Expect to move a handful.
- **The 21 keep / 100 drop split of the provenance prose is also judgement.** I read every
  paragraph and classified it by one test: would a test author write a different test
  without this? Someone else would keep 18 or 25.
- **I did not run the test suite**, as instructed. My claim that nothing can go red rests
  on there being no spec path in any test, build or CI file, which I did check.
- **Section 13's final state.** A9 is in flight and untracked. I read the file as it
  stands (57 items) and A9's draft as it stands. If its conclusions move, §6 moves.
- **I did not check how GitHub renders a folder README** in this repository, or whether
  the 144-file listing reads well in its UI. That is a look-at-it question, not a
  measurable one.
- **Whether you want section 9.1 numbered into 9.1.1–9.1.6.** I identified the six natural
  parts but did not design that split, because it changes the citation surface — a new
  number is a new address — and that is your decision, not a restructure's.

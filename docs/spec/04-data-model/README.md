## 4. Data model

Reference dialect: Postgres 16. All primary keys are uuid with default gen_random_uuid()
unless stated. All timestamps are timestamptz stored in UTC. There is deliberately no
workspace table: the workspace is fully derived from users, connections, and memberships,
and a table would hold nothing.

**Two annotations covering the whole section, added by the S29 fold on 2026-08-27. Neither
is an edit: section 4 is frozen, and RFC 0004's S29 row is annotate rather than rewrite.**

**First, this section now carries the whole schema Dana runs, folded by S29a on
2026-08-30.** RFC 0005's accepted units are folded into this frozen file as text and
nothing else: unit 11 replaced 4.3 and 4.5; unit 10 inserted 4.13 to 4.19; change control
item 46's units appended `position` to 4.5, `width_pct` to 4.17 and inserted 4.20. Every
one of them was ruled by the owner before it was written (RFC 0005's acceptance of
2026-08-24, re-accepted 2026-08-27; item 44 for the four frozen changes of item 46), so
the freeze's rule, that section 4 moves only on a human decision, holds through the fold.
The S29 fold of 2026-08-27 annotated rather than folded, and its annotations on 4.3, 4.7
and 4.10 stand where they were.

**Second, the page names in this section's justification prose are v1's.** "My Day recap"
at 4.5's rationale line and "Q1 My Day automatic inclusion" in 4.12's index table both
name a page now called Today; 4.7's own annotation states the rule that governs both,
which is that the queries and the tables kept their names while the pages were renamed.
Every such name in this section is a citation of a query or a table and none of them is a
claim about what Dana's pages are called.

**A later amendment, and the authority for it. 2026-09-03.** Section 4.11 gained a
paragraph saying what a monthly or yearly rule does when the anchor's day is missing from
a period: short months are skipped rather than clamped, and a yearly rule anchored on 29
February recurs only in leap years. It describes behaviour that has always been
implemented and tested and changes no stored format. It was authorized in advance: retired
section 13's items 15 and 22 each directed one sentence to be folded into 4.11 at the next
authorized change to this section's text, that change was the S29a fold of 2026-08-30, and
the fold missed it. Issue #26 records the miss and the decision to write it now.

**Third, two amendments landed on 2026-09-03 and both are the freeze working rather than
failing.** Issue #27 appended `width` and `height` to 4.16, and issue #30 changed 4.19's
`task_open` default from `panel` to `dialog`. Each was ruled by the owner before it was
written — #27 as a correctness fix rather than a feature, #30 as Imran's ruling that a task
opens as a dialog, which 9.3 has carried since — so section 4 moved on a human decision,
which is what the freeze asks. Neither drops or renames a column. The migrations are 0009 and
0010, and 0010 carries a data statement as well as a DDL one; its reasoning is in the file
because forward-only migrations have no other place to keep it.

**Fourth, five amendments landed on 2026-09-20 under issue #226, on the technical ruling
recorded on that issue** (parent #208, the M1 Label model). Four are new subsections and are
purely additive: 4.24 `labels`, 4.25 `task_personal_labels`, 4.26 `folder_personal_labels`
and 4.27 `task_folder_labels`. The fifth is an addition to 4.4 and **drops nothing**: it
appends `shelf_name` beside the existing `label` column, which stays for this release. That
pair is deliberately an **expand-and-contract** split rather than a rename, and 4.4 carries
the argument; **issue #247 is the contract half and must not merge until migration 0022 is
live in production.**

**The four numbers step over 4.23, and that gap is now closed.** `main` at 59161e9 holds
`04.23-task-dependencies.md` from issue #224, merged while this work was in progress; this
branch was behind it and took the next four rather than the next one, on the same rule the
acceptance-criteria registry states for its own numbers. 4.23's row sits beside these four
in the table below, added when this branch was rebased onto that `main`, so the table is
contiguous from 4.1 to 4.27 and nothing is missing from it.

**Fifth, three amendments landed on 2026-09-21 under issue #230, on the accepted technical
ruling** https://github.com/zhssnym/dana/issues/230#issuecomment-5751322947 **(Ruling 1,
section 4).** Two are new subsections and are purely additive: 4.28
`folder_responsibilities` and 4.29 `folder_responsibility_history`. The third appends
`can_edit_own_responsibilities` to 4.4 and **drops and renames nothing**; 4.9 gains
`responsibility`, the optional initial document an invitation or an instant share may
carry, under the same ruling and with a CHECK that refuses it on an invitation naming no
folder. The migration is 0025. The freeze holds the way it has held four times before: the
owner ruled the change before it was written, the ruling is cited in each file, and every
statement is an addition.

**Sixth, and it is the smallest kind of move this section can take: 4.17 and 4.20 each
gained a dated *Rationale* note on 2026-09-21 and nothing else** (issue #280, on Hassan's
technical ruling there,
https://github.com/zhssnym/dana/issues/280#issuecomment-5754491849). RFC 0005 carried a
section of reasoning that was never folded when `docs/rfcs/` was deleted; the two notes are
the part of it that explains a rule in this section — why `page_blocks.width_pct` is a
percentage, why its bounds sit in the CHECK, and why `user_page_covers` is a table with a
shape-checked preset rather than a list of names. **No column, no constraint, no default and
no rule moves**, in either file: the diff is added paragraphs, and every rule they explain
was already written above them. It is recorded here because the freeze asks that a change to
this section be visible from its front door, and a reader who is told only that nothing
changed cannot check that for themselves.

**Seventh, two amendments under issue #247, release A, on the same technical ruling
recorded at #226: dated 2026-09-20, which is the date the two files themselves carry and the
date 12.24 and `app/tests/README.md` carry for the same ruling, and written into this entry
on 2026-09-21.** 4.4's `label` row and its annotation now say what is true of this release —
the column is written by nothing and is dropped by #247's *second* release rather than by
this one — and 4.18's opening sentence names
`folder_members.shelf_name`, which is the column it has described since #226 renamed it and
the one thing in that file that was left saying `label`. **No column, no constraint, no
default and no bound moves in either file**, and nothing under `app/db/` moves with them:
this release is the code half, and the drop is 11.5's second release for the reason the
Fourth entry above gives about the first. The freeze holds the way it has held five times
before: the owner ruled the change before it was written, the ruling is cited, and every
statement here is a correction of a sentence about a column rather than a change to one.

**Eighth, and it is the first change this section has ever made that cannot be undone:
migration 0026 drops `folder_members.label` and its named constraint
`folder_members_label_length_check`, dated 2026-09-21** (issue #247, release B, on the same
technical ruling recorded at #226,
https://github.com/zhssnym/dana/issues/226#issuecomment-5750483786). 4.4 loses the `label`
row and says the column is gone; 4.18 says the same in one sentence. **Every one of the
seven entries above this one added, renamed a sentence, or explained something. This one
removes a column**, and the front door should say so plainly rather than let a reader infer
it from a table that is one row shorter than it was.

**The order the three steps went in is the whole of why this was allowed, and it is 11.5's
rather than this section's.** Migration 0022 was the *expand* half: it added `shelf_name`
beside `label` and backfilled it, because `label` never meant classification — it is the
viewer's own Shelf membership, held in step with `shelves.name` by 4.18 — and #208's Label
model needed the word back. A single `ALTER ... RENAME COLUMN` was the first draft and was
refused: Render brings the new instance up and passes its health checks before draining the
old one, so a rename would have left the old instance selecting a column that no longer
existed for the length of a deploy. #247 then contracted in **two** releases rather than
one. Release A stopped every write to `label` — `setMyMembership`, the shelf rename, the
shelf delete, the sample workspace and the seed — and left the column standing. Release B,
this one, drops it, and was safe only because A was live and drained first: shipped beside
the code, the instance Render had not drained yet would still have been running those five
writes, and every shelf write would have answered 500 with SQLSTATE 42703 across the same
window. The same hazard, the same window, the other direction.

**What "irreversible" does and does not mean here, because the difference matters to
anyone reading this entry after something has gone wrong.** There is no down migration in
this project by design, so recovery from any of these is a fix-forward migration or a
restore. What is new is that this one destroys data rather than schema shape: the values in
`label` are gone. They were a copy of `shelf_name` and nothing else, 0022 having backfilled
them and A having stopped diverging them, so what was actually lost is a duplicate — but
that is a fact about this column rather than a property of the freeze, and the next drop
proposed under it does not inherit it. The freeze held the way it has held seven times
before in the one respect that is the rule: **the owner ruled the change before it was
written, the ruling is cited in both files and in the migration, and the constraint dropped
is named** rather than left to fall with its column, so that `db/constraint-catalog.ts` and
the SQL are legible against each other by one reader. AC-479 is what asserts the result —
one membership column left, and the old name refused by the server rather than merely
unwritten.

| | File | Covers |
| - | - | - |
| 4.1 | [`04.1-users.md`](04.1-users.md) | 4.1 users |
| 4.2 | [`04.2-connections.md`](04.2-connections.md) | 4.2 connections |
| 4.3 | [`04.3-folders.md`](04.3-folders.md) | 4.3 folders |
| 4.4 | [`04.4-folder-members.md`](04.4-folder-members.md) | 4.4 folder_members |
| 4.5 | [`04.5-tasks.md`](04.5-tasks.md) | 4.5 tasks |
| 4.6 | [`04.6-steps.md`](04.6-steps.md) | 4.6 steps |
| 4.7 | [`04.7-my-day-entries.md`](04.7-my-day-entries.md) | 4.7 my_day_entries |
| 4.8 | [`04.8-reminders.md`](04.8-reminders.md) | 4.8 reminders |
| 4.9 | [`04.9-invites.md`](04.9-invites.md) | 4.9 invites |
| 4.10 | [`04.10-user-settings.md`](04.10-user-settings.md) | 4.10 user_settings |
| 4.11 | [`04.11-storage-formats-each-against-a-standard.md`](04.11-storage-formats-each-against-a-standard.md) | 4.11 Storage formats, each against a standard |
| 4.12 | [`04.12-index-summary-each-justified.md`](04.12-index-summary-each-justified.md) | 4.12 Index summary, each justified |
| 4.13 | [`04.13-events.md`](04.13-events.md) | 4.13 events |
| 4.14 | [`04.14-notifications.md`](04.14-notifications.md) | 4.14 notifications |
| 4.15 | [`04.15-comments.md`](04.15-comments.md) | 4.15 comments |
| 4.16 | [`04.16-files.md`](04.16-files.md) | 4.16 files |
| 4.17 | [`04.17-page-blocks.md`](04.17-page-blocks.md) | 4.17 page_blocks |
| 4.18 | [`04.18-shelves.md`](04.18-shelves.md) | 4.18 shelves |
| 4.19 | [`04.19-user-views.md`](04.19-user-views.md) | 4.19 user_views |
| 4.20 | [`04.20-user-page-covers.md`](04.20-user-page-covers.md) | 4.20 user_page_covers |
| 4.21 | [`04.21-sample-objects.md`](04.21-sample-objects.md) | 4.21 sample_objects |
| 4.22 | [`04.22-user-page-descriptions.md`](04.22-user-page-descriptions.md) | 4.22 user_page_descriptions |
| 4.23 | [`04.23-task-dependencies.md`](04.23-task-dependencies.md) | 4.23 task_dependencies |
| 4.24 | [`04.24-labels.md`](04.24-labels.md) | 4.24 labels |
| 4.25 | [`04.25-task-personal-labels.md`](04.25-task-personal-labels.md) | 4.25 task_personal_labels |
| 4.26 | [`04.26-folder-personal-labels.md`](04.26-folder-personal-labels.md) | 4.26 folder_personal_labels |
| 4.27 | [`04.27-task-folder-labels.md`](04.27-task-folder-labels.md) | 4.27 task_folder_labels |
| 4.28 | [`04.28-folder-responsibilities.md`](04.28-folder-responsibilities.md) | 4.28 folder_responsibilities |
| 4.29 | [`04.29-folder-responsibility-history.md`](04.29-folder-responsibility-history.md) | 4.29 folder_responsibility_history |

# Dana specification

The single source of truth for what Dana is and what it must do: architecture, data model,
behavior, and conventions. It is the accumulated definition of the system, updated
whenever an implemented RFC changes it. Its history lives in git, not in this file.

Conventions: 24-hour clock; ISO 8601 dates; ranges written with "to". SQL fragments are
Postgres dialect and are reference, not normative; the prose rule wins if they ever
disagree. "The viewer" always means the authenticated user making the request, abbreviated
V. today(V) means the current calendar date in V's request timezone (section 8.1).

## How this specification is addressed

The specification is this directory. It is one contract split so that a reader opens only
what a task needs; the numbering is the addressing scheme, not the filenames. Every
cross-reference in this repository says "section N" or "section N.M".

**Section N is the directory whose name begins with N. Section N.M is the file inside it
whose name begins with N.M.** Nothing else needs to be remembered, and no citation
anywhere had to change when this became a directory on 2026-09-01: the numbering did not
move.

Each directory's `README.md` holds whatever text sits above its first numbered subsection,
and a table of the files in it.

Section numbers are identifiers and are append-only. The rules, stated here because this
is the file they govern:

- **A number is never renumbered and never reused.** Something else cites it. - **A
  removed section becomes a tombstone, not a deletion.** The heading stays, with one line
  saying what happened and where the subject went. A gap in the numbering reads as an
  error; a tombstone reads as a decision. - **A new subsection takes the next unused
  number in its section**, and that act is what creates its file.

Acceptance criteria follow the same rule: `AC-NNN` numbers are append-only, never reused,
and a retired criterion is marked rather than removed.

| Section | Where | Covers |
| - | - | - |
| 1 | [`01-scope/`](01-scope/) | What Dana is, what it does, what it does not do and why |
| 2 | [`02-glossary/`](02-glossary/) | Every term with exactly one meaning; no synonyms |
| 3 | [`03-invariants/`](03-invariants/) | The 14 properties that must always hold, and what enforces each |
| 4 | [`04-data-model/`](04-data-model/) | Tables, columns, constraints, storage formats, indexes. FROZEN |
| 5 | [`05-state-machines/`](05-state-machines/) | Task status, invites, membership, and the permission matrix |
| 6 | [`06-queries/`](06-queries/) | The twelve queries behind every page, with exact orderings |
| 7 | [`07-api/`](07-api/) | Every endpoint, its shapes, and its error codes. FROZEN |
| 8 | [`08-business-logic/`](08-business-logic/) | Timezones, Today, recurrence, reminders, sharing, deletion, counts |
| 9 | [`09-ui/`](09-ui/) | Page structure, states, and normative copy |
| 10 | [`10-non-functional/`](10-non-functional/) | Auth, authorization, limits, rate limits, logging, PWA, email, response headers |
| 11 | [`11-architecture/`](11-architecture/) | The stack, its constraints, rejected alternatives, and hazards |
| 12 | [`12-acceptance-criteria/`](12-acceptance-criteria/) | The 382 numbered criteria, 380 of them live, the definition of done |
| 13 | [`13-open-questions/`](13-open-questions/) | **Retired 2026-09-01.** A forwarding address only: open questions are GitHub issues now, its recorded assumptions moved into the sections they constrain, and its table maps all 57 old item numbers to where each went. The number is not reused. |

Sections 4 and 7 are frozen: changing either invalidates acceptance criteria by number and
is a human decision, never an agent's. Both carry an annotation at their head naming the
RFC 0005 units the owner ruled into them and the date they were folded (S29a, 2026-08-30),
which is the freeze's audit trail. Both gained a further annotation on 2026-09-03, for
issues #27 and #30, and it is the same trail rather than an exception to it: the owner
ruled each change before it was written, and the annotation names the ruling, the migration
and what the change does not do. Both gained a third on the same date, for issues #20 and
#100 (migration 0012), on Imran's ruling that folders, shelves and the built-in pages all
get the same cover options and that pictures belong to the person rather than to a folder.
That third annotation was itself corrected before it merged, in 7.15 and 7.19, and the
correction is dated inside each: it restated 7.15's serving rule without the avatar exception
7.15 states, which made the restatement in 7.19 false at that endpoint. **Amending an
annotation of one's own to be true is the freeze working rather than an exception to it** —
what the freeze protects is criteria asserted by number, and a sentence that describes the
server wrongly protects nothing.

The count in row 12 above was 335 while the criteria files held 337, and it is 381 now
because that is what counting the bullets answers. It is arithmetic over the files rather
than a number to be carried forward, and whoever merges last re-derives it, which is the
rule 12's own README states for the same reason. It read 344 until 2026-09-04, when it
went to 366: eighteen criteria from the six branches of the wave-1 integration, and the
four of 7.22's export, which merged before them and left this number for the last merge
exactly as this paragraph asks. It was derived once at the end rather than seven times
on the way.

**Then twice more the same night, and the second time is the useful one to read.** The
authorization-sweep branch (#74) was open across that integration, merged after it, and so
became the last merge in its turn: 368, for AC-397 and AC-398. Then #104's `parseBody` work
merged with AC-399 and AC-400, that branch left the arithmetic alone exactly as this
paragraph asks, and #74 merged a second time and derived **370**. So the same branch wrote
this number twice and was superseded in between, which is not a fault in the rule but the
rule working: **a count that is derived is right or wrong at a moment, and a count that is
carried forward is wrong for as long as nobody checks.** That derivation counted 370
`- AC-` bullets across the twenty-three files with no number appearing twice, and found
twenty-two of the twenty-three per-file rows already correct.

**And once more on the night after, which is where the number in row 12 comes from.** The
wave-3 integration merged five branches and derived **381** the same way, six per-file rows
having moved with them. Two of those 381 are AC-122 and AC-123, retired by issue #113 and
marked rather than removed as section 12 requires, so they carry their text and the bullet
count counts them: **379 criteria are live**, and row 12 gives both numbers because they
answer different questions. It also found AC-403 free — five branches spending from one tail
in one night each stepped over it — which is recorded in 12's own README rather than here.

**382 as of the branch for issue #167**, which took AC-413 from the tail that same integration
had just fixed at 413 and re-derived the two numbers here rather than leaving them, being the
only branch open with a criterion in it: one criterion added, none retired, so **380 are
live**. The derivation is still the files' — a bullet added to 12.9, whose per-file row moved
from 25 to 26 with it — and the next branch to spend a number re-derives it again.

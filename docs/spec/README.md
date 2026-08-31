# Dana specification

The single source of truth for what Dana is and what it must do: architecture,
data model, behavior, and conventions. It is the accumulated definition of the
system, updated whenever an implemented RFC changes it. Its history lives in git,
not in this file.

Conventions: 24-hour clock; ISO 8601 dates; ranges written with "to". SQL fragments are Postgres dialect and are reference, not normative; the prose rule wins if they ever disagree. "The viewer" always means the authenticated user making the request, abbreviated V. today(V) means the current calendar date in V's request timezone (section 8.1).

## How this specification is addressed

The specification is this directory. It is one contract split so that a reader opens
only what a task needs; the numbering is the addressing scheme, not the filenames.
Every cross-reference in this repository says "section N" or "section N.M".

**Section N is the directory whose name begins with N. Section N.M is the file inside
it whose name begins with N.M.** Nothing else needs to be remembered, and no citation
anywhere had to change when this became a directory on 2026-09-01: the numbering did
not move.

Each directory's `README.md` holds whatever text sits above its first numbered
subsection, and a table of the files in it.

Section numbers are identifiers and are append-only. The rules, stated here because
this is the file they govern:

- **A number is never renumbered and never reused.** Something else cites it.
- **A removed section becomes a tombstone, not a deletion.** The heading stays, with
  one line saying what happened and where the subject went. A gap in the numbering
  reads as an error; a tombstone reads as a decision.
- **A new subsection takes the next unused number in its section**, and that act is
  what creates its file.

Acceptance criteria follow the same rule: `AC-NNN` numbers are append-only, never
reused, and a retired criterion is marked rather than removed.

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
| 12 | [`12-acceptance-criteria/`](12-acceptance-criteria/) | The 324 numbered criteria, the definition of done |
| 13 | [`13-open-questions/`](13-open-questions/) | **Retired 2026-09-01.** A forwarding address only: open questions are GitHub issues now, its recorded assumptions moved into the sections they constrain, and its table maps all 57 old item numbers to where each went. The number is not reused. |

Sections 4 and 7 are frozen: changing either invalidates acceptance criteria by
number and is a human decision, never an agent's. Both carry an annotation at
their head naming the RFC 0005 units the owner ruled into them and the date they
were folded (S29a, 2026-08-30), which is the freeze's audit trail.

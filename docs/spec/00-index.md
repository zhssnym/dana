# Dana specification

The single source of truth for what Dana is and what it must do: architecture,
data model, behavior, and conventions. It is the accumulated definition of the
system, updated whenever an implemented RFC changes it. Its history lives in git,
not in this file.

Conventions: 24-hour clock; ISO 8601 dates; ranges written with "to". SQL fragments are Postgres dialect and are reference, not normative; the prose rule wins if they ever disagree. "The viewer" always means the authenticated user making the request, abbreviated V. today(V) means the current calendar date in V's request timezone (section 8.1).

## How this specification is addressed

The specification is this directory. It is one contract split across files so that
a reader opens only what a task needs; the numbering is the addressing scheme, not
the filenames. Every cross-reference in this repository says "section N" or
"section N.M", and it resolves to the file whose name begins with N. Nothing else
needs to be remembered.

Section numbers are identifiers and are append-only: they are never renumbered,
and a removed section becomes a tombstone rather than a deletion. The rules are in
the preamble of `../rfcs/0000-template.md`.

| Section | File | Covers |
| - | - | - |
| 1 | [`01-scope.md`](01-scope.md) | What Dana is, what it does, what it does not do and why |
| 2 | [`02-glossary.md`](02-glossary.md) | Every term with exactly one meaning; no synonyms |
| 3 | [`03-invariants.md`](03-invariants.md) | The 14 properties that must always hold, and what enforces each |
| 4 | [`04-data-model.md`](04-data-model.md) | Tables, columns, constraints, storage formats, indexes, and the v2 tables 4.13 to 4.20. FROZEN |
| 5 | [`05-state-machines.md`](05-state-machines.md) | Task status, invites, membership, and the permission matrix |
| 6 | [`06-queries.md`](06-queries.md) | The twelve queries behind every page, with exact orderings |
| 7 | [`07-api.md`](07-api.md) | Every endpoint, its shapes, and its error codes, the v2 families 7.12 to 7.19 included. FROZEN |
| 8 | [`08-business-logic.md`](08-business-logic.md) | Timezones, Today, recurrence, reminders, sharing, deletion, counts |
| 9 | [`09-ui.md`](09-ui.md) | Page structure, states, and normative copy |
| 10 | [`10-non-functional.md`](10-non-functional.md) | Auth, authorization, limits, rate limits, logging, PWA, email, response headers |
| 11 | [`11-architecture.md`](11-architecture.md) | The stack, its constraints, rejected alternatives, and hazards |
| 12 | [`12-acceptance-criteria.md`](12-acceptance-criteria.md) | AC-001 to AC-342, the definition of done |
| 13 | [`13-open-questions.md`](13-open-questions.md) | Unresolved external facts and the assumptions this spec rests on |

Sections 4 and 7 are frozen: changing either invalidates acceptance criteria by
number and is a human decision, never an agent's. Both carry an annotation at
their head naming the RFC 0005 units the owner ruled into them and the date they
were folded (S29a, 2026-08-30), which is the freeze's audit trail.

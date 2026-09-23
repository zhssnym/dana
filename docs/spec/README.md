# Dana specification

What Dana must do, and a short reason wherever a rule is not obvious. It is the contract
the code is held to; when the two disagree, one of them is a bug and the pull request that
fixes it says which.

Conventions: 24-hour clock; ISO 8601 dates; ranges written with "to". SQL fragments are
Postgres dialect and are reference, not normative; the prose rule wins if they ever
disagree. "The viewer" always means the authenticated user making the request, abbreviated
V. today(V) means the current calendar date in V's request timezone (section 8.1).

## Addressing

**Section N is the directory whose name begins with N. Section N.M is the file inside it
whose name begins with N.M.** Each directory's `README.md` holds the text above its first
numbered subsection and a table of its files. Code comments and other sections cite
"section N.M", so:

- **A number is never renumbered and never reused.** A new subsection takes the next unused
  number in its section.
- **Deleting a subsection deletes its file and its table row.** No tombstone: git has it.
- The same holds for `AC-NNN`: a number is never reused, and a retired criterion is deleted.

## What does not belong here

- **History.** Dates, issue narrative, "amended", "it used to", "corrected", retired text,
  rulings and who made them. Git and the pull request carry all of that.
- **Restated code.** Column lists, zod shapes, route tables, constants, UI copy. The
  migration, the schema in `app/src/shared/` and the component are the truth; a prose copy
  only drifts. Keep exact words only where the words themselves are the decision.
- **Counts.** "The twelve queries", "391 criteria". They are wrong the day after someone
  adds one.
- **Open questions and notes.** Those are GitHub issues or pull request descriptions.

A reason belongs beside its rule in one or two sentences, when the rule would otherwise
look arbitrary and someone would be tempted to undo it.

## Changing it

Change the spec in the same pull request as the code, and only when a rule or contract
actually changes. Write the new rule as if it had always been true: no correction notes,
no "previously". Any section may change; there is no freeze and no ruling step.

**Acceptance criteria** live in section 12, one line each:

```
- AC-NNN Given …, when …, then … (spec N.M)
```

Take the next number from the allocator in [`12-acceptance-criteria/README.md`](12-acceptance-criteria/README.md)
and move it in the same commit.

## Sections

| Section | Where | Covers |
| - | - | - |
| 1 | [`01-scope/`](01-scope/) | What Dana is, what it does, what it does not do and why |
| 2 | [`02-glossary/`](02-glossary/) | Every term with exactly one meaning; no synonyms |
| 3 | [`03-invariants/`](03-invariants/) | The properties that must always hold, and what enforces each |
| 4 | [`04-data-model/`](04-data-model/) | Tables, constraints, storage formats, indexes |
| 5 | [`05-state-machines/`](05-state-machines/) | Task status, invites, membership, and the permission matrix |
| 6 | [`06-queries/`](06-queries/) | The queries behind every page, with exact orderings |
| 7 | [`07-api/`](07-api/) | Endpoints, their shapes, and their error codes |
| 8 | [`08-business-logic/`](08-business-logic/) | Timezones, Today, recurrence, reminders, sharing, deletion, counts |
| 9 | [`09-ui/`](09-ui/) | Page structure, states, and normative copy |
| 10 | [`10-non-functional/`](10-non-functional/) | Auth, authorization, limits, rate limits, logging, PWA, email, response headers |
| 11 | [`11-architecture/`](11-architecture/) | The stack, its constraints, rejected alternatives, and hazards |
| 12 | [`12-acceptance-criteria/`](12-acceptance-criteria/) | The numbered criteria and the number allocator; the definition of done |

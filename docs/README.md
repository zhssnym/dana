# Dana specification

What Dana must do, and a short reason when a rule is not clear. The specification is
reference. When the specification and the code do not agree, the code is the current
behavior. Correct the one that is wrong.

`troubleshooting.md` lists the traps that fail silently, flaky test classes and machine setup.

## Conventions

- 24-hour clock. ISO 8601 dates. Ranges use "to".
- SQL fragments are Postgres, and are reference only. The text rule wins.
- "The viewer" (V) is the signed-in user who makes the request. today(V) is the current
  date in the time zone of V's request (section 8.1).

## Addressing

Section N is the folder whose name starts with N. Section N.M is the file in that folder
whose name starts with N.M. Code comments cite "section N.M", so:

- Do not renumber a section, and do not use a number again. A new subsection takes the
  next free number.
- To remove a subsection, delete its file and its table row.
- The same rule applies to `AC-NNN` numbers.

## Rules

- Write the current rule only. No history, dates or "it used to". Git keeps the history.
- Do not copy code: no column lists, zod shapes, route tables, constants or UI text. The
  code is the truth.
- Do not write counts. They become wrong at the next change.
- Open questions and notes go in an issue or a PR.
- Update a section when a product rule changes. You do not have to update it for each
  change.
- An acceptance criterion is optional. If you add one, write one line in section 12:
  `- AC-NNN Given …, when …, then … (spec N.M)`. Take the next number from
  [`12-acceptance-criteria/README.md`](12-acceptance-criteria/README.md) and move the
  allocator in the same commit.

`app/tests/guards/guard-agent-instructions.test.ts` checks that each backticked repository
path in `troubleshooting.md` and in the root `AGENTS.md` exists.

## Sections

| Section | Folder | Covers |
| - | - | - |
| 1 | [`01-scope/`](01-scope/) | What Dana is, and what it does and does not do |
| 2 | [`02-glossary/`](02-glossary/) | Each term, with one meaning |
| 3 | [`03-invariants/`](03-invariants/) | The properties that must always be true |
| 4 | [`04-data-model/`](04-data-model/) | Tables, constraints, storage formats, indexes |
| 5 | [`05-state-machines/`](05-state-machines/) | Task status, invites, membership, permissions |
| 6 | [`06-queries/`](06-queries/) | The queries behind each page |
| 7 | [`07-api/`](07-api/) | Endpoints, their shapes and their error codes |
| 8 | [`08-business-logic/`](08-business-logic/) | Time zones, Today, recurrence, reminders, sharing, deletion |
| 9 | [`09-ui/`](09-ui/) | Page structure, states and fixed text |
| 10 | [`10-non-functional/`](10-non-functional/) | Auth, limits, logging, PWA, email, headers |
| 11 | [`11-architecture/`](11-architecture/) | The stack, its constraints and known hazards |
| 12 | [`12-acceptance-criteria/`](12-acceptance-criteria/) | The criteria and the number allocator |

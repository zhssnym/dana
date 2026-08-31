# A11: RFCs 0001 to 0004, and the template

Read-only analysis of `docs/rfcs/` on 2026-09-01, branch `pipelines`. Every number
below comes from a command run against this repository. Nothing was changed except
this file. RFC 0005 was not read beyond checking how it is referenced.

---

## 0. The one thing to read first

**Of the 1,371 lines in RFCs 0001 to 0004, about 105 are worth keeping. That is a
92% cut.**

Almost everything in those four files is one of three things, and all three are
dead weight:

1. **Work orders for work that is finished.** The product is the running app.
2. **Copies of the specification.** The spec is in the same repository and is the
   authority. One of these copies now describes a UI that no longer exists.
3. **Bookkeeping about agent sessions, persona files and acceptance-criterion
   numbers.** The folders it depends on were deleted on 2026-08-31.

What survives is the reasoning: why something was chosen, what was rejected, and
what went wrong. That is maybe six paragraphs across four files.

You were right that the folder is a mess. You were also right to be unsure about
the template, and the file tells you why itself: `0000-template.md:3-5` says it is
"two things", the process rules and the template. It is two documents stapled
together, and they belong in different places.

---

## 1. The table problem

### What the template prescribes

`0000-template.md:201-202`, at the end of the Implementation plan section:

```
| ID | Delivers | Depends on | Blocks | Owner | Acceptance |
| - | - | - | - | - | - |
```

Six columns. The instruction above it (`:194-199`) says rows are "sized for one
agent session each" and that "a small RFC has one row".

### What it became

Measured across the four files:

| File | Lines | Bytes | Table rows | Bytes in tables | Widest row |
| - | - | - | - | - | - |
| `0001-mvp.md` | 167 | 138,443 | 15 | 130,293 (**94%**) | **28,179 chars** |
| `0002-client-ui-replacement.md` | 769 | 94,191 | 125 | 12,064 (13%) | 337 chars |
| `0003-free-axiom-log-retention.md` | 66 | 3,642 | 3 | 396 (11%) | 894 chars |
| `0004-v2-port-and-build.md` | 369 | 47,945 | 44 | 27,828 (**58%**) | 1,763 chars |

**RFC 0001 is not a document with a table in it. It is a table with a document
stapled to the front.** 94% of the file lives in 13 rows. The file reads as 167
lines and is 138 KB, because the average line is 829 characters.

Here is the growth, row by row, in the order they were written
(`0001-mvp.md:131-143`):

| Row | Width |
| - | - |
| P0 | 523 chars |
| P1 | 1,221 |
| P2 | 1,400 |
| P2S | 1,779 |
| P3 | 5,290 |
| P4 | 19,379 |
| P5 | 9,238 |
| P6 | 12,199 |
| P7 | 26,271 |
| **P8** | **28,179** |
| P8D | 22,285 |
| P9 | 2,198 |
| P10 | 233 |

The P8 cell is about 4,700 words. That is roughly nine pages of continuous prose
inside one cell of one row of a markdown table. Seven rows are over 5,000
characters. No editor wraps this usefully, no diff shows it usefully, and GitHub
renders it as a single cell you scroll sideways through forever.

### Your diagnosis is right, but the cause is sharper than "too many rows"

It is not the row count. RFC 0001 has 13 rows and is unreadable. RFC 0002's plan
has 12 rows (`0002-client-ui-replacement.md:730-741`) and is fine: every row is
between 163 and 337 characters, and it reads cleanly.

**The table breaks when a cell has to hold an argument instead of a label.**

RFC 0002's cells say what a session delivers. RFC 0001's cells say what a session
delivers, plus every ruling made at its kickoff, plus the reasoning behind each
ruling, plus what was escalated and to whom, plus what a mid-package change control
decided afterwards. Look at where P0 ends (523 chars) and where P8 ends (28,179).
The rulings accumulated during the build and had nowhere to go, so they went into
the nearest cell.

So the failure is that a table has no room for a reason. A cell can hold a name, a
date or a dependency. The moment it has to hold "and here is why", the table is the
wrong shape and it does not push back. It just gets wider.

### What replaces it

Paragraphs, as you said, plus a small table that stays small.

**Keep a table only for what is genuinely tabular**, and cap it at three columns:

```
| Slice | Delivers | Owner |
```

One line per cell. If a cell needs a second sentence, it does not go in the cell.

**Everything else becomes prose under the table.** Reasons, rulings, what changed
mid-build, what blocks what. Prose has a natural brake that a table does not:
three paragraphs of justification look like three paragraphs, and you notice. Three
paragraphs stuffed into a cell look like one row, and you do not.

I would also drop the `Depends on`, `Blocks` and `Acceptance` columns entirely.
`Depends on` and `Blocks` say the same thing twice from both ends, and RFC 0001's
own preamble (`:124-127`) had to write a paragraph explaining that one of them is
"information, not a rule". `Acceptance` was where the agent-session machinery lived
and there is no agent-session machinery now.

---

## 2. The four executed RFCs

The test I applied: **what does this tell someone that the code and the spec do
not?** Where the spec already carries it, I checked rather than assumed, and I say
which file.

### RFC 0001: MVP (167 lines)

**What it is.** The work order that took the repository from empty to shipped v1.
Thirteen packages, P0 to P10, one agent session each. Status Implemented.

**Worth keeping: one paragraph.**

- **`:79-83`, the spec-first bet.** Building spec-as-you-go was rejected, because
  agent implementers in isolated sessions cannot resolve ambiguity in a hallway, so
  every gap in a partial spec becomes a silent wrong guess. The file calls this
  "the project's core bet". I grepped all of `docs/` for "spec-as-you-go" and "spec
  as you go": **this file is the only hit.** Nothing else in the repository records
  why the specification was written whole and frozen first. If you cut this, the
  reason the spec exists in the form it does is gone.
- **`:33-40`** is the same argument stated forward and can be merged into the
  above. Two or three sentences total.

**Cut: everything else.**

- **`:131-143`, the 13 plan rows, 130,293 characters.** Executed. The product is
  the app and the acceptance suite.
- **`:59-78`, the product alternatives.** Already in the spec, and the RFC says so
  itself at `:61-62` ("section 1.3, the authoritative table"). Verified:
  `docs/spec/01-scope.md:19-40` carries all six as a table with reasons and a
  return date, including AI chat, offline writes and sync, realtime and presence,
  task-level sharing ("Never"), roles and permission tiers, and native builds.
- **`:85-89`, the stack alternatives.** The RFC says these live in 11.14 and are
  "not repeated here". Verified: `docs/spec/11-architecture.md`, section 11.14, 18
  rows with rejection reasons, including Next.js, Vercel, Supabase, Neon, Prisma
  and the auth libraries.
- **`:91-113`, the section 13 accounting.** `docs/spec/13-open-questions.md` is a
  live file and is the authority.
- **`:115-127` and `:145-167`, the plan preamble and critical path.** Executed, and
  it routes through `docs/team/`, deleted 2026-08-31. This file carries **116**
  persona-file references and 8 `docs/team/` paths.

**Proposed length: about 15 lines.** One paragraph on the bet, one line saying what
it built and when it shipped.

### RFC 0002: Replace the client UI with the designer's prototype (769 lines)

**What it is.** The decision to throw away the v1 client's markup and adopt the
designer's prototype wholesale, after a restyle attempt was rejected. Status
Implemented, folded 2026-08-17.

**Worth keeping: the failure analysis and three of the rejected options.**

- **`:48-60`, why the instruction was wrong.** This is the best passage in the
  folder. A narrow and correct ruling about component provenance, "his pages are
  read and never copied", was generalised into a rule covering the whole package,
  and the thing the owner was actually rejecting sat inside the part that got
  generalised away. Then: "six sessions did what the row told them, and the row was
  wrong" (`:45-46`). That is a reusable lesson about how instructions fail, and it
  is not recorded anywhere else.
- **`:62-70`, nobody ran the prototype.** Not the kickoff, not the audit, not one
  of the six implementing sessions, in a package whose entire subject was
  appearance. Three claims in the research were false and each was false in a way
  that only running the application exposes. I grepped for this lesson elsewhere in
  `docs/`: **no hit.** `docs/workflow/frontend/README.md:192` requires before and
  after screenshots on a pull request, which is the review side, not the build side.
- **`:645-655`, keeping FullCalendar was a close call.** Worth keeping because it
  says what was given up: the library's keyboard and accessibility handling, in the
  one place the change gives up most. A close call recorded as close is the kind of
  thing that stops someone reversing it cheaply.
- **`:657-663`, refusing to move the tests to the code.** Six criteria would have
  had to be rewritten to assert buttons where they assert links. Partly redundant
  now: `docs/workflow/README.md` rule 7 already says never edit a test to make your
  code pass. Keep one line, or drop it as covered.
- **`:688-696`, the em dash ruling.** This is where the house style rule comes from.
  The designer's approved copy used an em dash and it was replaced with a comma, on
  the ground that the convention holds across the whole corpus including copy
  adopted from outside it. One line.

**Cut: 700 lines.**

- **`:212-595`, the specification delta, 383 lines.** Cut for two reasons, not one.
  It was folded into `docs/spec/` on 2026-08-17, so it is a copy. And **the spec has
  since moved past it.** `docs/spec/09-ui.md` is now 299 lines of v2: "Desk" appears
  18 times and "My Day" twice. The delta is v1: "My Day" 17 times, and "Folder
  header" 3 times against **0** in the current spec. I also checked one distinctive
  sentence from the delta's roles table, "It is this section's only chrome and holds
  the page set": present in the RFC, absent from the spec. **This is 383 lines
  describing a user interface that does not exist.**
- **`:84-150`, "What the prototype actually carries", 67 lines.** Careful
  string-by-string measurement of `docs/design/prototype/`, deleted 2026-08-31.
  Moot by construction.
- **`:151-210`, "Amendments after acceptance", 60 lines.** Almost entirely about
  which acceptance-criterion numbers were still free on 2026-08-13.
- **`:596-634`, the criterion accounting.** Same.
- **`:715-769`, the implementation plan.** Executed. The "what is not replaced"
  paragraph at `:762-769` is now just a description of the code.

**Proposed length: about 30 lines.**

### RFC 0003: Free Axiom log retention (66 lines)

**What it is.** Pick a log store that keeps 30 days without a subscription. Status
Implemented.

**This is the only one of the four that looks like what the template describes, and
it is the shortest file in the folder. It is the model.** One page, one section
touched, a clear motivation, four alternatives with one reason each.

**Worth keeping: the vendor facts and the alternatives.**

- **`:18-24`.** Axiom's free plan gives the required 30-day retention but its Secure
  Syslog endpoint is paid only. Better Stack's free Logs plan retains three days.
  These are facts that cost research, that go stale, and that someone will otherwise
  re-research. Keep them with the date they were checked (2026-08-14).
- **`:46-52`, the four rejected options**, each one line. Upgrading Axiom, upgrading
  Better Stack, keeping only Render's Hobby logs (seven days, violates 10.5), and
  deferring retention entirely.

**Cut:**

- **`:26-36`, the delta.** In the spec. Verified: `AXIOM_DATASET` appears in
  `docs/spec/11-architecture.md`.
- **`:58-66`, the plan.** One row, executed.

**Proposed length: about 18 lines.** And its natural home is beside spec 11.12, not
in an RFC folder. See section 3.

### RFC 0004: The v2 build (369 lines)

**What it is.** The work order for v2: build RFC 0005's backend systems, then
replace the client with the approved design. 44 table rows, S0 to S30. Status
Implemented, released as 2.0.0.

**Worth keeping: four passages, and one of them is the most valuable text in the
folder.**

- **`:207-221`, why patching failed twice, with the mechanism both times.** Keep
  this whole. The first failure: no artifact was ever named `prototype-v2/`, so
  packages S8 to S13 built the client from the v1 prototype while reading the
  rulebook correctly, and the checkpoint showed the owner a client that was never
  being built from his design. The second: the parity audit measured 31 surfaces for
  appearance and structure, so the next checkpoint showed surfaces that match and
  behaviour that does not, because "a surface audit marks a task card ported without
  ever noticing that the prototype's card carries a comment thread". Then the
  general rule at `:216-220`: a design decision reaches the product only by being
  read into a numbered section, so every decision that never reached a section was
  never handed to anyone and was never going to be built. And the conclusion:
  "Patching fixes what the last instrument measured."
- **`:223-237`, lift rather than re-derive.** The strategy, and the measurement it
  rested on: the prototype's coupling to its fixtures was concentrated in a small
  set of named lib modules rather than spread, so the components could cross
  verbatim. The discipline is quotable: "a lifted file diffs empty against its
  prototype original except at named seams". Grepped: this appears only here and in
  RFC 0005.
- **`:79-94`, one package per chat, from measurement.** A session that carried one
  and a half packages spent 72% of its window and about 280 million cached tokens,
  and "a session that runs out of window mid-package is the expensive failure,
  because the next one pays to rediscover what the last one knew". Inference: this
  still applies to how you run agent sessions, though the package machinery it names
  is gone.
- **`:349-357`, the owner column was wrong six times running.** A table column
  naming who owns a row went stale repeatedly, and the fix was to say the column is
  not the authority. This is the table lesson from section 1, learned the hard way,
  in the file that learned it. Two lines.
- **`:45-57`, the three alternatives**, one line each. One combined RFC, port first
  and backend after, and a big-bang client swap with no foundation package.

**Cut: about 320 lines.**

- **`:99-116`, `:120-128`, `:310-326`, the 44 table rows.** Executed and shipped.
- **Every cross-reference to deleted material.** This file carries 7 references to
  `docs/parity/`, 3 to `docs/design/`, 2 to `docs/team/`, 3 to `SESSION-LOG`, and 74
  persona-file references. All of those targets were deleted on 2026-08-31.
- **Every "RFC 0005 change control item NN" citation.** There are many, and they
  address a 5,166-line section of another file by item number.
- **`:359-362`, the S-inf hard dates.** Already in the spec, with more detail:
  `docs/spec/13-open-questions.md` item 35 carries the idle-suspension finding, the
  measurement behind it, and the 2026-09-12 database expiry.

**One live thing, flagged because it is not history.** The database expiry of
**2026-09-12 is eleven days away** as of today. It is recorded in spec 13 item 35,
so trimming this RFC does not lose it, but I am naming it because I found it in a
document I am recommending you delete most of.

**Also.** `0004` is the only file of the four containing em dashes: **10** of them,
starting in its own title at `:1`. `0001` has 7 double hyphens, all of them command
flags such as `--maxWorkers`, which are legitimate.

**Proposed length: about 40 lines.**

### Summary

| RFC | Now | Proposed | Cut |
| - | - | - | - |
| 0001 MVP | 167 | ~15 | 91% |
| 0002 Client UI | 769 | ~30 | 96% |
| 0003 Axiom logs | 66 | ~18 | 73% |
| 0004 v2 build | 369 | ~40 | 89% |
| **Total** | **1,371** | **~103** | **92%** |

---

## 3. The folder structure

### The honest answer on folders

**I would not make a folder per RFC, and I think your instinct is right about the
problem but one folder too far on the fix.**

The mess is not that six files sit loose in a directory. Six files is fine. The
mess is that one of them is 138 KB of table and another is 383 lines of a
specification that no longer applies. **Shorten them and the folder stops being
needed.** A folder holding one 30-line file is ceremony, and four of them is four
extra clicks to reach four short files.

Two more reasons, both concrete:

1. **An RFC never grows after it lands.** The current template already says so:
   "From this moment the only edit an RFC ever receives is a status change to
   Superseded" (`0000-template.md:47-48`). A folder earns its place when a thing
   accumulates files. This one does not.
2. **Git is the archive.** `0001-mvp.md` has 50 commits and `0002` has 7. The full
   originals are permanently recoverable. Do not keep a second copy of a document
   next to its trimmed version; that is how the trimmed version stops being read.

**Where your instinct is right:** the dead should be separated from the live. That
is worth one folder, not four.

### What I propose

```
docs/rfcs/
  README.md                   the index, and how to find one              ~30 lines
  TEMPLATE.md                 what you copy to start an RFC               ~58 lines
  history/
    0001-mvp.md               why the spec was written whole and frozen   ~15 lines
    0002-client-ui.md         why the v1 client was replaced, not fixed   ~30 lines
    0003-log-retention.md     why Axiom, and what the free tiers give     ~18 lines
    0004-v2-build.md          why patching failed twice, and the lift     ~40 lines
  0006-<feature>.md           the first real feature RFC, when there is one
```

Total: about 191 lines where there are 1,575 today, excluding RFC 0005.

**Where the index lives and how someone finds an RFC.** `docs/rfcs/README.md`, one
table, one row per RFC: number, title, status, the issue it came from, the release
that shipped it. That is how you see all of them without opening any of them. The
status also stays on the `- **Status:**` line inside each file, because that is what
a reader opening the file sees. One duplication, deliberate, with a one-sided rule
written into the README itself: **the file's status line is the record, the table is
a copy, and if they ever disagree the file wins.**

The README should also carry the one sentence that tells a reader what the folder is
for now: an RFC is a proposal for a big feature, and once it is implemented the
behaviour lives in `docs/spec/` and the file is history.

### One thing worth considering separately

Three of the four trimmed files are not really RFC history. They are decisions about
the system, and they would be more useful next to the thing they explain:

- **0003's vendor comparison** belongs beside spec 11.12, which is what it changed.
- **0002's and 0004's lessons** about running the app before you write and lifting
  rather than re-deriving are working rules, not history. They belong in
  `docs/workflow/`, where someone about to do the work will actually meet them.

`a5-docs-structure.md` (sections 3.4 and 3.5) argues this at more length and reaches
the same place. **I am not folding that into the proposal above, because it is a
bigger decision than tidying one folder and it is yours to make.** If you take it,
`docs/rfcs/history/` shrinks to 0001 alone and the folder disappears.

Note also that `a5-docs-structure.md:437` recommends against folders for a different
reason than mine. Mine is that the files become too short to justify one. Both point
the same way.

---

## 4. The template

### Does it belong in `docs/rfcs/`?

**Yes, but not as `0000-template.md`, and not as one file.**

Your uncertainty is well founded, and the file explains itself at `:3-5`: it is "two
things", the process rules and the template. Those two have different readers at
different moments.

- **The rules** answer "do I even need an RFC?" and "what do the statuses mean?".
  You ask those **before** you open `docs/rfcs/`. They belong in
  `docs/workflow/big-features.md`, which is the document that already routes you
  ("If there is no RFC, you are in the wrong file", `big-features.md:11`).
- **The template** is the thing you copy once you have decided. It belongs in
  `docs/rfcs/`, where you are about to create the file.

**And the number is wrong.** Calling it `0000` makes it sort like an RFC and read
like RFC zero. Name it `TEMPLATE.md`.

One rule in the current preamble goes to a third place. **The tombstone rule** for
removing a numbered spec section (`0000-template.md:73-97`) is a spec-editing rule,
not an RFC rule. It belongs in `docs/spec/00-index.md`, which **already states the
rule at lines 20-22 and points at the template preamble for the details.** If you
rewrite the template without moving that rule, you break a pointer the spec index is
already making.

### What I dropped from the current template, and why

- **The six-column plan table.** Section 1.
- **The verbatim specification delta.** The current template requires the complete
  replacement text of every touched section, merged word for word (`:135-143`). That
  requirement is exactly what made 0002 769 lines, 383 of them a copy of the spec.
  It buys one property: the RFC is self-contained, so an implementer needs only the
  spec plus the one RFC. But the implementer has the spec, in the same repository.
  The property is nearly worthless and the cost is half the document. **Name the
  sections and say what changes in a line each; write the real text into
  `docs/spec/` when the work lands.**
- **The bootstrap exception** (`:112-115`). It describes a case that cannot recur.
- **Everything naming personas, Stewards, `docs/team/` and `docs/design/`.**
- **`Target release`.** Releases are cut from `main` continuously now. The issue and
  the status carry more.

### What I added

- **A plain-language opening, explicitly for Imran.** The current template's Summary
  says "two to four sentences: what changes and for whom" and its Motivation says
  "written for a reader deciding whether to accept". That is already the right idea
  but it is not labelled, so it reads as a formality. Label it.
- **A contract section with teeth**, matching `big-features.md:25-45`: endpoints,
  shapes, errors, and the stub. The stub is the part that document is most insistent
  about ("Do not skip the stub", "The stub is not optional") and the template should
  make it impossible to forget.
- **Slices**, matching `big-features.md:61-76`.
- **`Issue:`**, since work now starts as a GitHub issue.

### The template, in full

```markdown
# RFC NNNN: <the feature, named the way a person would say it>

- **Status:** Proposed *(then Accepted, then Implemented; or Superseded by NNNN)*
- **Date:** YYYY-MM-DD
- **Issue:** #NNN
- **Accepted by Imran on:** *(blank until he does)*

## What it is

Two or three sentences with no technical words in them. What can a person do
after this ships that they cannot do today?

## Why

Why this is worth weeks of both our time, and what it costs us to not build it.
Imran decides on this section and the one above, so they have to stand on their
own.

## How it behaves

Screen by screen, or step by step, in plain language. Every rule a person would
notice: what is allowed, what is refused, what happens to things that already
exist. Still Imran's half of the document.

## The contract

Hassan's half. Both sides build against this at the same time without waiting for
each other, so nothing here may be vague. See `../workflow/big-features.md`.

**Endpoints.** Each one: method, path, what it does, what it answers.

**Shapes.** The zod schemas written out, and the file in `app/src/shared/` they
land in.

**Errors.** Every failure a screen has to draw, with its status code and its body.

**The stub.** What the endpoint returns before the real implementation exists, so
the screen can be built against it from day one.

## Spec changes

Which numbered sections this changes, and one line on what changes in each. The
real text goes into `docs/spec/` when the work lands. Do not copy the spec here.

## What we rejected

Every option considered, and the reason it lost, put sharply enough that nobody
brings it back by accident. If a call was close, say it was close. In a year this
is the section still worth reading.

## Risks

What could go wrong and what we would do about it. Anything still unanswered goes
here, and it has to be answered before Imran accepts.

## Slices

The order this merges in, per `../workflow/big-features.md`. Schema and stub
first, the screen last. One line each.

| Slice | Delivers | Owner |
| - | - | - |
```

That is 58 lines against 204, and 87 of the current file's lines are preamble that
is moving to `docs/workflow/big-features.md` and `docs/spec/00-index.md` rather than
being deleted.

**One rule to write into `big-features.md` beside it**, because it is the rule that
would have prevented RFC 0001: **if a cell in that table needs a second sentence, it
is not a cell. Put it in a paragraph underneath.**

---

## What I could not verify

- **Whether the reasoning I am keeping is reasoning you already carry in your
  head.** I tested each passage against the repository, not against you. If the
  spec-first bet and the lift discipline are things you would never lose, the
  keepable total is smaller than 105 lines, not larger.
- **Whether RFC 0005 duplicates any of what I am keeping.** I did not read it, per
  the brief. Its change control is 61 numbered items and about 5,166 lines
  (per `a5-docs-structure.md:414-418`), and it is the most likely place for an
  overlap. My greps for "re-derive" and "lift discipline" hit RFC 0005 at lines
  1024, 2353, 2560, 3508, 3528 and 3539, so **there is overlap with 0004's lift
  passage and I did not measure how much.** Whoever trims 0005 should compare before
  either of you keeps a copy.
- **Whether the two lessons I want kept are already binding somewhere I did not
  grep.** I checked `docs/` only. `.claude/`, `CLAUDE.md` and the issue tracker were
  not searched for "run it before you write".
- **Whether Imran can actually read the proposed opening.** I wrote it to be
  readable by someone non-technical, but I have not seen anything he has written or
  rejected, so that is a guess about an audience I have never met.
- **The exact trimmed line counts.** They are estimates from the passages I marked,
  not from a draft. I did not write the trimmed files, per the brief. Expect plus or
  minus a third.
- **Whether the folder-per-RFC recommendation survives contact with what you meant.**
  You asked for folders and I am recommending against them. If the thing you want is
  visual separation of the dead from the live in one directory listing, `history/`
  gives you that. If it was something else, I have argued against the wrong thing.

# What belongs in this folder

**One rule, and it is a test you can run in your head.**

> If an agent could answer this by reading the code or running something, in
> under a minute, it does not belong here.
>
> If an agent could not answer it at all, or would burn an afternoon
> rediscovering it, it belongs here and nowhere else.

Written 2026-09-20, on the owner's ruling, after the same ruling cut the
acceptance suite from 268 criterion files to 47. This folder had the same
problem: 10,554 lines across 166 files, most of it restating what the code
already said, in a voice that cannot be checked and does drift.

## Why the rule is the rule

**A document that describes behaviour is a second copy of the code, and it is
the copy nobody runs.** When they disagree the code wins, always — but the
reader does not know that until they have lost the time. `CLAUDE.md` opens with
a case that cost exactly this: a comment claimed one centred glyph per folder in
the rail, for a row that had never been centred, and a session working from it
concluded a reported bug was impossible.

So the drift is not a maintenance failure to be fixed by more diligence. It is
what prose about behaviour *does*, and the only reliable defence is not to write
it.

## What to keep

Four kinds, and they have one thing in common: **the code cannot tell you.**

**Measurements.** What was observed, when, on what. The Postgres leg takes 55
seconds for 141 files here. A whole browser leg loses about one case a run under
memory pressure. These are facts about the world, and re-deriving one costs a
run.

**Hazards.** Where a library does something other than what a model assumes.
Spec 11.15 exists because recall of FullCalendar 7, Tailwind 4, zod 4, Express 5
and Luxon DST is wrong in specific listed ways. The code shows the workaround; it
never shows the assumption the workaround defends against. Delete this and the
next session re-learns each item by shipping the bug.

**Registries.** Numbers and names that must not collide, where the allocator is
a document because there is nowhere else for it to live: acceptance criterion
numbers, migration numbers and their journal `when` values, invariant and query
identifiers. Nothing enforces these. A registry is not bureaucracy — it is the
only thing standing between two branches and a silent collision.

**Rulings.** A decision, who made it, and what moved. Not the implementation it
produced — the code carries that — but *why it went this way*, which is the one
question the code can never answer. A ruling is short: the decision, the date,
the issue.

## What to delete

**Descriptions of behaviour.** What an endpoint returns, what a screen shows,
what a control is called, what a function does. Grep it. Run it. Read it.

**Restatements.** If a shape is in `app/src/shared/`, the zod schema is the
contract and a prose copy is a liability. If a constraint is in a migration, the
migration is the truth.

**Narrative.** The story of how something came to be, where the outcome is
already visible in the code and the reasoning changed nothing. Git holds it.

**Anything nobody honours.** A process no branch has followed in a month is not a
process. Check the git log before defending one.

## Writing something new here

Three questions, in order. A no to any of them means do not write it.

1. **Could I find this out by running or grepping something?** If yes, do not
   write it. Write the grep into a comment beside the code instead.
2. **Is it true right now, and would I notice if it stopped being true?** If
   nothing would tell you, it will rot. Either make something assert it, or
   write it as a dated measurement — "measured 2026-09-20, on this machine" —
   which stays honest as it ages because it never claimed to be current.
3. **Would deleting it cost somebody real time?** If not, deleting it is free
   and you should not have written it.

**Date what you write and name what moved.** A dated paragraph that is wrong is
recoverable, because the date says how much to trust it. An undated one that is
wrong is indistinguishable from one that is right.

**Correct in place, and say what it replaced.** When something here turns out to
be false, the correction is worth more than the fact: it tells the next reader
which way this document tends to be wrong. Several paragraphs in `CLAUDE.md` are
corrections of their own earlier drafts and say so, and they are the most useful
paragraphs in the file.

## What is here

| | |
| - | - |
| `spec/` | The contract, by numbered section. Sections **4** and **7** are frozen and change only by a ruling on the issue, before the code (`workflow/hard-stops.md`). Section **12** is the acceptance criterion number allocator |
| `workflow/` | How work runs. Start at `workflow/workflow.md`, then your side's file |
| `rfcs/` | History. RFCs 0001 to 0005 describe finished builds. **The RFC process itself is not being followed** — milestone M1, the entire current programme, has no RFC — so read these as a record, not as instructions |

**One file here is read by a test.** `spec/07-api/07.23-settings-bundle.md` is
parsed byte-for-byte by `app/src/server/http/bundle-contract.test.ts`, which
asserts its field table against two zod shapes and against what the API actually
answers a new account. Renaming its `## The fields` heading or reordering an
enum breaks the suite. It is the only one; everything else here is read by
people and by agents.

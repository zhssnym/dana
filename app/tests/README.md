# The acceptance suite

The numbered behaviors of spec section 12. `CODEOWNERS` asks Hassan to read a
change here, and since 2026-09-04 that is all it does: anyone may edit these
files, and what governs the edit is `docs/workflow/hard-stops.md`. **A criterion
changes only when the decision it pins changes, and the pull request names it.**
Nobody edits one to make their code pass: an acceptance test that seems wrong is
a finding you report and leave failing, which is `docs/workflow/workflow.md`'s
rule 6. `docs/workflow/backend.md` records the **seven** counts in this suite and
its neighbours that are fixtures over the shape of the server rather than
behaviours, and the three conditions all of them must meet before one may move.
(It said **two** until 2026-09-20; the other four were named by no document
while carrying the same instruction beside themselves, issue #240, and the
seventh arrived the same day with issue #263.)

*(The "Adversarial Test role" and the "protocol section 8" this paragraph used
to name were deleted at the workflow restructure, `a7886df` on 2026-09-01, and
are in git history before that commit. The rule they carried is unchanged.)*

Run one criterion by its number, which matches on the test name rather than the
file name:

```bash
npx vitest run -t "AC-105"
```

Two runners collect this directory and they never overlap. Vitest takes
`tests/**/*.test.{ts,tsx}`; Playwright takes `tests/e2e/**/*.spec.ts`, which is
the browser leg. Its own by-number form is `-g` rather than `-t`, and it needs
no file naming because the runner builds the client and boots the server
itself:

```bash
npx playwright test -g "AC-095"
```

*(That sentence used to say the browser leg is "the only place AC-091 to
AC-100 run". After the 2026-09-20 reduction only AC-091 of that range survives,
so the range is no longer a useful way to describe the leg and the claim was
removed rather than corrected into a list of one.)*

## Layout

**Four folders, one per kind, and nothing loose beside them but this file.**
Until 2026-09-20 this directory was flat: 47 tests, 22 support modules and an
`e2e/` folder all in one listing, which made `e2e/` look like the odd one out
when the real problem was that everything else had been tipped in around it.

```
tests/
  criteria/   ac-NNN-slug.test.ts    one executable criterion from spec section 12
  guards/     guard-slug.test.ts     pins no criterion; keeps the suite honest
  e2e/        ac-NNN-slug.spec.ts    the browser leg, plus its own harness.ts
  support/    harnesses and helpers  imported by tests; never collected as one
```

Neither runner needs telling about the split. Vitest's `include` is
`tests/**/*.test.{ts,tsx}` and matches at any depth; Playwright's `testDir` is
`tests/e2e` and its `testMatch` is `**/*.spec.ts`, so `support/` and
`e2e/harness.ts` are invisible to both by virtue of their suffixes rather than
by an exclusion anyone has to maintain.

`e2e/` keeps its harness rather than sharing `support/`: it is Playwright's,
not Vitest's, and the two harness layers have no code in common.

**Importing across the split.** A criterion or guard reaches its harness at
`../support/x.js` and the application at `../../src/...`. The colocated tests
under `app/src/**` that borrow a harness reach it at
`../../../tests/support/x.js`.

## Naming

**Two families, and the prefix says which.** A listing should be readable top
to bottom without having to open anything, which it was not until 2026-09-20:
three files sat among the criteria under names that described their subject
rather than their kind.

- **`ac-NNN-slug.test.ts`** — one executable criterion from spec section 12.
  `NNN` is the criterion number and it matches the number the test name carries,
  which is what `-t "AC-042"` finds. A file here pins a decision, and
  `docs/workflow/hard-stops.md` governs changing it.
- **`guard-slug.test.ts`** — an infrastructure guard that pins no criterion.
  These exist to keep the suite itself honest rather than to prove product
  behaviour: `guard-postgres-leg-isolation` fails any test that asserts server
  prose, `guard-postgres-leg-connection-loss` goes red if the pool's `'error'`
  listeners are removed, `guard-document-transaction` covers the document
  transaction seam, `guard-account-deletion-sweep` fails a table added with
  `REFERENCES users(id) ON DELETE CASCADE` that 8.10's deletion transaction
  neither sweeps nor argues for keeping — a cascade on that column never fires,
  because step 7 scrubs the row rather than deleting it (issue #253), and the
  pair added on 2026-09-20 for the criterion registry read it in both
  directions — `guard-criterion-registry` (issue #252) fails when two files
  claim one number, when a criterion a test asserts has no bullet in
  section 12, or when the registry's allocator line names a number this tree has
  already spent; `guard-criterion-citations` (issue #257) fails when a sentence
  in `docs/spec/**` or `app/src/**` says a criterion **pins, asserts or proves**
  something and nothing under `app/` runs that criterion; and `guard-gate-host`
  (issue #273) fails if the gate record goes back to naming an engine version
  nobody measured, or if the browser leg stops refusing a checkout whose path
  carries a dot segment — it measures the Express behaviour that refusal exists
  for, so the refusal can be deleted on evidence the day it stops being true.
  They are not criteria
  and must never be renamed into the `ac-` family, which would claim section 12
  numbers that do not exist.

  **The second of those two is why a citation of a cut criterion reads the way
  it does across this repository now.** After the 2026-09-20 cut, "AC-370
  asserts it" was false in the way that matters — it tells the next reader the
  rule is defended when the thing that would have gone red was deleted. The
  sweep that made the guard green found **107 such sentences in 71 files, over
  83 distinct criterion numbers**, and reworded 106 of them; the one exception
  is in the guard, with its reason. The house form is to state the criterion as
  the **decision** it still is, and to say that its test file went in the cut.
  `tests/support/criterion-registry.ts` carries what counts as a claim and what
  counts as running.

Everything else beside them — `helpers.ts`, `*-harness.ts`, `http-client.ts`,
`oidc-stub.ts`, the `postgres-leg-*.ts` setup modules — carries no `.test.ts`
suffix, is collected by neither runner, and is support code rather than a test.

## Coverage

**This suite was cut to a core set on 2026-09-20, and what it covers is no
longer the whole of section 12.** The owner ruled that M1 velocity outweighs
exhaustive criterion coverage. 221 of the 268 criterion files here were
deleted along with 113 of the 119 browser specs, leaving **47 criterion files
carrying 232 cases and 6 browser specs carrying 20**. The colocated unit tests
under `app/src/**` were deliberately left whole: they are not criteria, they
are cheap, and they were not what made the gate slow.

**47 to 51 the same day, for issue #226's Label model** (AC-470 to AC-481, spec
12.24), and the direction is worth noting rather than the number: the cut was a
ruling about coverage of work that already existed, not a rule that new work
arrives without criteria. A feature landing after it still owes the criteria
that pin its decisions, and #226's land in four files rather than twelve
because several of its twelve numbers are clauses of one behaviour. The fourth
file was `ac-481-shelf-wire-expand-and-contract.test.ts`, added when the owner's
ruling of 2026-09-20 extended the Shelf expand-and-contract from the column to
the wire; it was its own file because it pinned a different decision from AC-479
beside it — that decision being whether the rename could be deployed without
losing somebody's edit, rather than whether it changed Shelf semantics.

**Issue #247 replaced that fourth file the same day, and the replacement is what
the pattern looks like when an expand-and-contract closes.** AC-481's decision
was "the wire carries both Shelf spellings for one deploy window", and the
window closed when migration 0022 reached production. The criterion is retired
under hard stop 7 and marked in 12.24 rather than deleted, and
`ac-750-shelf-wire-contracted.test.ts` stands where it stood, asserting the
inverse: that the retired spellings are inert. **A contraction with no test is
indistinguishable from a contraction somebody forgot** — both leave a green
suite with nothing in it mentioning the old name — which is why the count here
stays at four files rather than dropping to three.

**51 to 66 the same day, for issue #227's Label lifecycle** (AC-540 to AC-554,
spec 12.24's second half — **and AC-520 to AC-534 for about an hour before
that**, renumbered when a sibling branch was moved onto the block this one had
just scanned; the registry carries the story and no criterion changed, only its
number). Fifteen numbers and fifteen files, one apiece,
which is the opposite of the ratio above and is deliberate: #226's twelve were
clauses of four behaviours, while #227's fifteen are fifteen independent acts —
two duplications, a move, a file format both ways, an export, a Trash, a purge,
an account deletion and a membership loss — and a file that failed would
otherwise take four unrelated areas red with it. `support/label-lifecycle-harness.ts`
is theirs and sits beside `support/labels-harness.ts` rather than inside it, the
split being definitions and projections against what happens to them when Work
moves.

**66 to 69 the same day, from the first adversarial read of that branch**
(AC-780 to AC-782, spec 12.24's third block). One defect and two uncovered
shapes, **all three found by reading `shared/workflows.ts` against migration
0022 and against the writer rather than by any red**, which is the note worth
keeping: the fifteen above were proved by mutation and the mutation pass could
not have found any of these, because a mutation pass asks whether a line has a
watcher and every one of these is a line that was never written. AC-780 is a
500 now answered at 422; AC-781 is the file `folderToWorkflowFile` actually
writes for a real folder — a canvas **and** a vocabulary — which AC-547 misses
by passing `undefined` for the page; AC-782 is the one-folder arrangement
dropping the vocabulary before validation saw it. Each was proved by breaking
the line it watches and watching it go red, and AC-781 by two mutations rather
than one, it being the only one of the three that was green on arrival.

**AC-820 to AC-825 on 2026-09-20 and 21, issue #185, and they are the round
trip itself.** The workflow file now serializes the folder page directly — one
ordered array, Sections nesting by `level`, membership positional with an
explicit escape, Tasks as blocks, media as placeholders — and the six criteria
drive a composed page through the writer the folder page calls, the endpoint
over the wire, and the `page_blocks` and `tasks` rows on the other side.
`support/workflow-page-harness.ts` is theirs. Every one was proved red by
mutation: **sixteen mutations across the six**, each named in the commit that
added the case it fired — thirteen when the block was written and three more
from the adversarial review of 2026-09-21, which added an `items` arm and an
ordering arm to AC-824 and a withheld-work assertion to AC-820. **One of that
review's findings is the reason to read this number rather than trust it**: the
commit that first wrote AC-824 claimed it went red "when the index bounds go",
and it did not — a `list_parent` out of range is refused for naming a block that
is not there, whether or not the ordering test exists. The arm that observes the
bound is the one naming a real bullet written *later*, and it was added to make
the claim true. **One other is worth knowing about
before you reach for the same technique.** AC-825 asserts byte equality across
export, import and export again, which is as strong as it sounds about any
*asymmetry* between the two halves and is **blind to a loss they agree about**:
stopping the writer from emitting `rich_content` left the product losing every
bold run and left that criterion green. It now reads the imported rows against
the source's as well, and its header says what the technique cannot see.

**AC-780 was then rewritten, and this is the part worth reading.** Its first
fix refused the file in `canonicalWorkflowBody.superRefine`, folding with
JavaScript `toLowerCase()` in front of `labels_folder_name_idx`'s
`lower(name)`, and argued the two folds' disagreements were all in the safe
direction. A single-string fold has no direction — `toLowerCase` is
idempotent, so for any name the folds disagree about, the pair
`(x, x.toLowerCase())` is one name to JavaScript and two to Postgres, which is
a **false 422**. Nine BMP code points disagree plus Greek final sigma — ten
pairs, every one of them stricter in JavaScript, none looser — and the product
met it: `ΦΩΣ` and `φως` are two live Labels in one folder,
`folderToWorkflowFile` writes both, and re-importing that file was 422.
**Dana could not import its own export.** The fold is gone,
`createWorkflowFolderLabels` maps the SQLSTATE instead, and AC-780's fourth
case drives that pair through the endpoint and expects 201.

**Two mutation records here were wrong, and both were wrong in the same
direction — naming one watcher where there were two, or the wrong one.** They
are corrected rather than deleted, because a mutation record that overstates
how *precisely* a criterion fires is how a later session mis-attributes a red.

- The `.toLowerCase()` mutation was recorded as taking "only the case-only
  one" red. Re-measured on the Postgres leg: **two** cases, AC-780's second
  and **AC-782's fourth**, both at 500 — AC-782 reaches AC-780's refusal
  through the folded folder and is therefore a watcher of the same line.
- AC-781's own header said an importer applying `folder.blocks` beside the
  document "would answer four blocks here rather than two". It does not get
  that far: the mutation dies **at the import call** with `422 The outline must
  retain every Task and undeleted block.`, because `applyDocument`'s outline
  names only the document's blocks. The criterion discriminates either way;
  the sentence naming *how* did not.

The mutations that prove the rewrite, measured 2026-09-20 on the Postgres leg,
one at a time from a clean tree: **removing the 23505 mapping** takes four
cases red at **500** — AC-780's first three and AC-782's fourth, the original
defect exactly — and **re-adding a JavaScript name fold** takes two red,
`src/shared/workflows.test.ts`'s name case and AC-780's fourth, the latter
answering `422 folders.0.labels: … the name "φως" is declared twice in one
folder`, which is the false 422 end to end.

**The first of those three mutations no longer exists, and what replaced it was
re-measured (2026-09-20, issue #279).** The vocabulary is written by one
multi-row INSERT now rather than by one statement per definition, and a
multi-row INSERT raises its 23505 once for the statement: it knows the
constraint and not which of the 250 rows the file's owner should go and look
at. So there is no 23505 mapping left to remove. The refusal is the same
`lower()` in the same session, run over the file's own rows one statement ahead
of the write, and **deleting that fold** is the mutation that stands in its
place: it takes **five** cases red at 500 rather than the four above — AC-780's
first, second, third and sixth, and AC-782's fourth. The sixth is in this list
and not in that one because it did not exist when the four were measured, which
is worth reading as the mutation record catching up rather than as the mapping
having been weaker than it said. The other two mutations below are untouched.

**And one more, for the assignment write the same issue made set-based.**
Writing only the first of a Task's Folder Labels — a `LIMIT 1` inside
`applyWorkflowTaskLabels`'s INSERT — is caught by **AC-780's fourth case
alone**, across AC-540 to AC-554, AC-780 to AC-782 and
`src/shared/workflows.test.ts`: 1 failed, 67 passed. No round-trip criterion
gives one imported Task two Folder Labels, so the case that exists to prove
`ΦΩΣ` and `φως` are two Labels was also the only watcher the import's
assignment write had.

**Three more properties of those two statements have no criterion at all, and
they are `src/server/domain/workflow-label-writes.test.ts`'s** — a colocated
test rather than a criterion, on `src/server/domain/cap-guards.test.ts`'s
precedent and for its reason: what is under test is the statements a path
issues and what one of them does, which no run of the suite can see from the
outside. It counts them through a recording executor, so a later edit putting
either loop back is red rather than eleven seconds slower; it drives a file
naming one key twice on one Task, which nothing else in the suite does and
which is what `ON CONFLICT DO NOTHING` absorbs *within* one statement; and it
asserts which of two colliding spellings `WorkflowLabelNameConflict` carries
and which folder index, neither of which any endpoint case can see — measured
by mutation, naming `definitions[0]` instead of the colliding row leaves AC-780
and AC-782 both green and takes only this file red.

**And a third, 2026-09-20, for the field path itself.** Every assertion of
`folders.<n>.labels` in the suite was made against a **one-folder** file —
AC-780's first three cases and AC-782's fourth all read `folders.0.labels` — so
the folder index the mapping carries had no watcher at all: hard-wiring
`createWorkflowFolderLabels`'s `folderIndex` argument to `0` at its call site in
`domain/acts.ts` left all four green. AC-780's sixth case is that watcher; it
imports a two-folder file whose second folder collides, and under that mutation
it is the only red in AC-780 and AC-782 together, answering
`folders.0.labels: … the name "ac780 URGENT" is declared twice` where
`folders.1.labels` is where the two definitions are. It asserts the rows as well:
the clean first folder, its definition and its task are all written before the
second folder throws, so the transaction taking them back is the half of the
rule the response cannot show.

**Every one of the fifteen was proved by breaking the code it watches**, one
mutation at a time against the real Postgres leg, and two of them were green
under a mutation the first time and were fixed rather than shrugged at: AC-547's
fixture asked the endpoint for active definitions only, so the exporter's own
exclusion of archived ones was never exercised, and AC-546's first mutation
re-attached by name *after* the assignments were already deleted, so it could
not have carried anything. The second was a bad mutation and the first was a
weak criterion; both are recorded in the commit because the difference between
them is the thing a mutation pass is for.

**And a mutation pass over fifteen criteria is not a mutation pass over the
change, which an adversarial review then measured.** Each of the fifteen was
broken at the behaviour it names, and every line the branch added that *no*
criterion names went unmeasured — six mutations survived the whole suite. The
worst was the privacy one: replacing the Personal Label delete's statement
with `DELETE FROM labels WHERE scope = 'personal'` wipes every
account's Personal Labels and, through 0022's composite cascades, every
Personal assignment in the product, and AC-553, AC-470, AC-473, AC-009,
AC-118 and `domain/account-deletion.test.ts` were all green under it — AC-553's
surviving task carried only the leaver's row, so its assertion was `[]` either
way. **That statement is 8.10 step 6c's in `domain/account-deletion.ts` since
this branch rebased onto #253**, which took the Personal Label delete into its
nine-table sweep; the mutation and what it proves are unchanged, the predicate
being `owner_user_id` either way. The other five were the whole of `canonicalWorkflowBody`'s `superRefine`
(both halves), both 10.3 Label caps raised to 100000, and `'labels'` removed
from `dropNulls`. The lesson is the ratio rather than any one of them: the
question a pass answers is "which of my lines has a watcher", and enumerating
the criteria answers a different one. All six are now watched — the privacy
predicate by AC-553's second actor, the format by
`src/shared/workflows.test.ts`'s Label block and AC-548's widened case list.

**Commit before you mutate, and the reason is a failure mode of mutation
testing rather than of git.** A mutation pass is apply, run, restore, and the
obvious restore is `git checkout -- <file>` — which restores from the index,
so it silently discards every uncommitted change in that file, including the
fix the pass was written to prove. That happened during the pass above. It
announces nothing: the script reports "restored", the working tree looks
right, and the *next* mutation is what goes strange, because it runs against
a file that has quietly lost the thing under test. It was caught because that
mutation failed four cases instead of one and the extra three made no sense,
which is luck standing in for a check. So: **commit the work first, then
mutate**, and the restore is exact and total by construction. Where a commit
is genuinely not wanted yet, copy the file and restore from the copy — never
from the index.

**And six more for issue #263, the reclaim sweep** (AC-700 to AC-705, spec 12.9),
on the same reading of that ruling. **Read the sentence above as the dated
record it is rather than as a running total**: the tree already held 69
criterion files when these were written, six branches having merged since
the cut, and a number in this file that every branch tries to keep current is a
number every branch collides on. Count the directory. What these six are worth
saying here is *why* they were written after a cut whose whole point was fewer
files: `reclaimUnwornPictures` permanently deletes a person's uploaded picture
and its bytes on a thirty-day timer, it is the only path in Dana that destroys
anything on a clock rather than on a request, and no test anywhere reached it —
not one of the five reference arms, not the window, not the object store.
AC-700 to AC-704 are the five arms; **AC-705 is the sweep's two scope clauses**,
added after an adversarial review found that widening either of them to eat
every avatar in the product was green across the whole suite.
`tests/support/reclaim-harness.ts` is their shared setup and
`tests/guards/guard-reclaim-reference-arms.test.ts` is the structural half, the
one that fails when a later migration adds a sixth column that can hold a file
id and nobody adds the arm to match — a new table or a second column on a table
it already lists, the second of those having been a hole in it until that same
review.

**And one for issue #274, the Label routes on Access** (AC-800, spec 12.24), on
the same reading again and worth one sentence for what it is evidence *of*.
The twelve Label mutation routes gated on membership alone while
`shared/folder-actions.ts` declared two bars for them, and AC-523 recorded the
mapping while saying in its own header that it does not check the mapping is
right. So the whole suite was green over a surface where a Can-view member
could rename a folder's shared vocabulary and relabel everybody's work.
**Nothing structural could have found that**, which is the argument for writing
a criterion after a cut: the sweeps prove a route is gated *somehow*, and only
an actor at a preset proves which. It was verified by four mutations across
its nine cases: each of the two gates made always-true in turn takes five of
the nine between them, gating the Personal arm as though it were shared takes
a sixth — the over-reaching direction, which nothing else watches — and moving
the 403 behind the archived 409 takes a seventh. The two left standing are the
allowed-side cases, which exist to fail in the other direction. **Two of the
nine were added after the reviewer read the branch**, naming the two things it
said were asserted by prose and not by a test: the refusal ordering end to end,
and a contributor's authority ending when the Task is reassigned away from
them. The reviewer's other finding is recorded rather than closed — the
**concurrent** half of #228's transactional requirement is driven for
`task.status.complete` by AC-516 and for `label.apply` by nothing, and AC-800's
own comment says so rather than letting the row lock read as covered.

**Section 12 was not cut with them.** Every criterion it states is still the
specification of Dana's behaviour; most of them simply have no executable form
in this directory any more. A criterion number that resolves to no file here is
not a criterion that stopped mattering, and its absence is not licence to change
the behaviour it names. `docs/workflow/hard-stops.md` still governs a criterion
that *does* exist.

The build-era coverage table that used to fill this section recorded, package by
package, what each range did at the merge that wrote it. It described files that
no longer exist, so it was removed rather than left to be read as current. It is
in git before this commit, as is every deleted test.

### Two criteria were failing when they were deleted

**This is the part of the cut worth being uncomfortable about.** The PGlite leg
measured immediately before the deletion was already red: three tests failed on
a tree nobody had touched. Two of the three were criterion files on the delete
list, so the cut turned their red into silence rather than into green:

- `ac-390-export-document-shape` — "it names itself and carries 7.22's
  top-level keys and no others";
- `ac-415-compose-migration-backfill` — "loose tasks, Section intro, Section
  tasks, and following blocks backfill in that order".

The third, `src/shared/workflows.test.ts`'s "a file that is neither arrangement
is still refused" (DES-206), is a colocated unit test and survives, so it was
still red and still visible.

**That third one is green and has been since #227; corrected 2026-09-20 on
`backend/185`.** It was never a product defect: the case drives the version
nobody writes, and #227 spent the number it was driving. Its own comment records
the move and #185 moved it again, 4 to 5. **The sentence above was stale rather
than wrong when written**, and it is left standing with this correction under it
because the distinction it drew — a colocated unit test survives a cut of
`tests/criteria/` — is the thing worth keeping.

**Both of the other defects are unfixed and now unwatched.** This paragraph used
to guess that they were "plausibly the same area as the open workflow round-trip
issue". **They are not, checked 2026-09-20 by the session that closed that issue
(#185) against both deleted files in git**: `ac-390` asserts 7.22's account
export top-level keys, and the account export embeds no workflow file at all;
`ac-415` stages rows against a PGlite database with migration 0016 withheld and
asserts that 0016's *backfill* orders them as the old client drew them, which is
a migration written long before any of this. Neither touches
`shared/workflows.ts`, `importWorkflow` or `folderToWorkflowFile`. So the advice
stands and the guess does not: start from the deleted files in git, and do not
expect the workflow work to have swept either of them up.

### What was kept, and on what rule

Four things earned a file, and nothing else did:

- **The structural sweeps.** `ac-397-authorization-sweep` (what a stranger gets
  from every id-taking route), `ac-001-constraint-catalog` (every named
  constraint and index), `ac-236-structural-guard-sweep`, and
  `ac-399-body-parsing-goes-through-parse-body`. These catch whole classes
  rather than single behaviours, and `hard-stops.md` leans on the first of them
  by name: a new route that takes an id writes its row there in the same change.
- **Anything whose failure loses or leaks data.** The delete cascades, the
  account-deletion scrub, file-serving scope, comment permissions, search scope,
  and the SVG polyglot refusal.
- **The state machine of the core objects.** Task create, patch, complete,
  abandon, uncomplete; folder rename and delete permissions; the Section
  hierarchy the M1 composer work builds on.
- **One smoke case for each expensive subsystem** rather than its matrix:
  recurrence generation, reminder fire instants, Today, invitations, duplication.

Everything else — UI copy, tooltips, empty states, the application shell, the
public surface, drag and drop, first-run, event history, and the long tails of
recurrence, reminders and views — was deleted. The browser leg keeps only what a
browser alone can prove: the offline shell, the landing page, the SPA fallback's
scope, the sidebar, one folder list, and quick-add.

### What this costs, stated plainly

A regression in a deleted area now reaches `main` silently. That is the accepted
trade, not an oversight. Two consequences worth holding onto: the permission
model in `docs/workflow/hard-stops.md` is loose *because* the tests were dense,
so the four sweeps above are now carrying more weight than they were designed
to; and a criterion reintroduced later should come back as a test, not as a
comment claiming it is covered.

## The two amendments these tests read closely

**7.1's tz parameter.** `GET /api/v1/auth/google` takes an optional `tz`. The
amendment specifies four behaviors and AC-005 and AC-007 pin all four, because
three of them are the kind an implementation gets right in one direction and
wrong in the other: a reported zone is stored at provisioning and synced on
return, no zone reported means UTC at provisioning and no sync on return, an
unparseable zone is treated as absent rather than answered 422 (a recorded
deviation from 10.3, so that a stale zone database cannot lock anyone out), and
a tzdb alias of the stored zone is not a different zone. AC-007 also pins the
carrier: 7.1 and 11.6 both say the zone rides the pending-authorization state
and never `redirect_uri` or any redirect target.

**10.1's sessions contract.** Four facts are fixed. Three so this suite can
observe expiry and clean up after itself: the table is named `sessions`,
`user_id` references `users(id)` `ON DELETE CASCADE`, and `expires_at` is a
timestamptz that every authenticated request resets to 30 days out. A fourth so
the migration and the module could be authored by separate owners without a
guess: the lookup key is a `token_hash` text column, the primary key, holding
the lowercase hex sha256 digest of the cookie's token. AC-113 asserts all four
and the behavior they exist for, including that the digest really is the
cookie's and that the raw token appears nowhere in the database. Rows are
addressed by `user_id` and never by the cookie value, because the raw token is
deliberately not there to match against.

The table is outside section 4, so AC-001 admits it as that catalog's one named
exception. Admitted means tolerated, not required: AC-001 is about section 4,
so it neither fails when P1 adds the table nor pretends to assert it. Every
other unexpected table is still a failure.

## The harness

`helpers.ts` is the P0 harness: the database seam, rejection matching by
constraint name, and user cleanup. `auth-harness.ts` adds what the P1 criteria
need, `http-client.ts` carries the transport, `oidc-stub.ts` is the stub
identity provider, and `folders-harness.ts` adds the P2 layer: lazily
signed-in casts, setup through the package's own endpoints, direct seeding
only for surfaces later packages own, and an invariant sweep scoped to named
rows. `bundle-harness.ts` is the thin layer over both for 7.23's settings bundle:
the exact eight-field shape stated once, wire-beside-row state assertions, and
the one place the ruled PATCH response body is judged. It was
`settings-harness.ts` and frozen 7.2's three booleans until issue #113 retired
that endpoint on 2026-09-04. `tasks-harness.ts` is the P3 layer over
the P2 one: the 7.0 TaskCard and TaskDetail shapes restated once and
asserted key-exact, the 7.6, 7.7, and 7.8 transports, seeding for P6's rules
and P7's reminders, and the task half of the invariant sweep, which
delegates the folder half to `expectFolderInvariants` rather than restating
it. `views-harness.ts` is the P4 layer over all of them: `today(tz)` computed
through `Intl` rather than imported, calendar arithmetic on 4.11 date
strings, the nine 7.10 response envelopes restated and asserted key-exact
with every row parsed through the frozen `TaskCard` check, fixtures written
directly with every column named, and cursor paging to exhaustion.
`reminders-harness.ts` is the P7 layer: actors whose users.timezone is stated
and written through 7.1's tz parameter, the frozen 7.9 transports with the
owner's 2026-08-10 ruling judged once, 4.8 rows seeded and read, fire-instant
arithmetic computed through Intl with the two DST policy rules deliberately
excluded from it, reminder sends counted through the ratified sink, and one
pass of 11.7's loop behind the assumed seam.
`e2e/harness.ts` is the P8 layer and the only one that never opens a database:
it reaches the application through a browser and a running server instead, so
its own section above rather than this list is where its decisions are.
`sharing-harness.ts` is the P5 layer: the 7.5 and 7.3 transports and their
frozen shapes restated key-exact where the text enumerates and no further
where it does not, actors signed in with chosen emails for 5.2's matching
rule, invite emails counted by word through the ratified sink, the
last_sent_at backdater, and the DELETE /me transport with the by-id user
reader the 8.10 files inspect the scrub through. Each file's header
explains its own decisions; the eight below are worth knowing before
reading any test.

**Outbound email is observed through an injected recorder.** 11.8's
notification module logs instead of sending under test, and AC-024 counts
share-grant emails, so `startAuthTestApp` offers `createApp` a
`notifications` sink beside `dbClient` and `auth` and exposes what arrived as
`app.emails`. Fields are normalized by property, not name, the same way
cookies are identified. The seam is assumed in one place and its ratification
into 11.10 is escalated to the Integration Steward.

**The stub is the Adversarial Test role's, exclusively.** The Security
engineer's module passes against it unmodified and never edits it (personas 06
and 11). It refuses an authorization request that arrives without a PKCE
challenge, which is what stops AC-107 from being satisfiable by an
implementation that never sends one.

**Cookies are identified by property, never by name.** Spec 11.6 fixes that the
session cookie is httpOnly and the CSRF cookie is not, and fixes no names.

**The auth base is `/api/v1`.** This was probed while 7.0's base path and 7.1's
short spellings could each be read as the mount point. The amendment settles
it, so the probe is gone: tolerating a root mount would now mean tolerating a
specification violation.

**Redirects are asserted through one helper**, `expectRedirect`. Written as a
pair of bounds, a 404 satisfies the lower one and fails the upper one, so the
failure lands on whichever half carries no message and the report names
nothing. Every redirect assertion in the suite goes through the helper for that
reason.

**The timezone predicate is aligned with the shared validator, not imported
from it.** `isIanaTimezone` here refuses identifiers opening with a sign, the
same guard `app/src/shared/timezone.ts` carries, because 11.15 records that
`Intl.DateTimeFormat` accepts ECMA-402 offsets like `+05:30` that are not IANA
names. Importing the validator would be borrowing the definition of correct
from the module under test, so a wrong validator would agree with itself; the
two were checked once, off to the side, and agreed on offsets, aliases, case
variants and malformed input alike.

**Frozen response shapes are restated in the harness, never imported, and
asserted key-exact.** The 7.1 object, the 7.2 booleans, and the 7.0 TaskCard
and TaskDetail each appear as a key list in the harness that reads them, by
the standing Steward ruling: this suite measures `app/src/shared/` and
cannot borrow its definition of correct. Exact because those shapes are
enumerated in a frozen section, so a missing key breaks the client contract
and an extra one is drift it cannot absorb.

The tolerance this paragraph used to record is closed. TaskCard's
`pending_invite_email` was the one value the shape check tolerated, its
derivation from `invites.task_id` belonging to P5, the package that creates
those rows, and nothing in section 12 pinning it. P5's tester session is
this one, and AC-139 pins the derivation end to end, on the
detail read and on a view row, through the newest-invite-wins clearing rule
of 8.7 and back to null on a terminal transition. The shape check in
`tasks-harness.ts` stays value-tolerant on that one key, which is now a
division of labor rather than a gap: a shape judge cannot know which email
a particular card should carry, and the criterion's own file asserts it.

The other tolerance is gone, closed by the thing that created it. TaskDetail's
reminder was read loosely here while 7.0 said only "{offset_minutes or
time_of_day}", which names a 4.8 mode rather than a key list, so a one-key
object and a two-key object with one null were both faithful. The P3 shape
review settled it and the owner entered it on frozen 7.0: both columns
always, exactly one non-null, because a stable key set is what lets a client
read the mode off the values. The harness asserts that now, and the same
paragraph settled the wire format of the floating values, so `due_time` is
`HH:MM` exactly where the seconds Postgres renders `TIME` with used to be
admitted.

**Temporal columns are rendered by the database, never handed over by the
driver.** The two backends disagree about what a date or an instant column
hands to JavaScript: PGlite returns the string Postgres printed, while
node-postgres registers a parser for OID 1082 and OID 1184 and returns a JS
`Date`. A reader that takes either straight from the driver therefore reads
one thing on the default leg and another on the `postgres:18` leg that 11.10
makes the production-fidelity authority. So the readers in `tasks-harness.ts`
project every temporal column through `to_char`, which answers text on both
backends, in 4.11's own format, exactly as the domain module serializes every
floating date. Formatting on the JavaScript side was rejected: `postgres-date`
builds a date-only value at local midnight, so `toISOString()` on it prints
the previous day on any machine east of UTC, which is the shift 4.11 stores
floating dates to avoid.

Instants keep all six digits, which is the half that matters most. A
`Date` stringifies at one-second resolution, so before this the package's
"a no-op wrote nothing" and "the refusal touched nothing" assertions
compared `updated_at` across operations that take microseconds and would
have passed on that leg whatever was written. `tasks-harness.test.ts` is the
guard: a unit test of these readers (protocol section 8, unit tests belong
to the module's owner) that pins the three formats and proves one microsecond
of movement still fails an equality. It runs on both legs, so a reader that
regresses fails there once, attributably, instead of somewhere else twenty
times or nowhere at all.

## What the tests need from outside `app/tests/`

One seam, now recorded in 11.10 rather than assumed. `createApp(options?)` in
`src/server/index.ts` is synchronous, performs no I/O, and opens no database:

```ts
createApp(options?: {
  dbClient?: DbClient
  auth?: {
    issuerUrl: string
    clientId: string
    clientSecret: string
    appOrigin: string
    allowInsecureRequests: boolean
  }
}): Express
```

`options.auth` wins over the environment variables that remain the production
path, and the harness sets both (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_ISSUER_URL`, `APP_ORIGIN`, `OIDC_ALLOW_INSECURE`), so an implementation
reading either is fed. Only the database handle genuinely needs the parameter,
because under the default PGlite backend it is an in-memory object that cannot
arrive as a connection string. Routes that touch the database require
`options.dbClient` and fail only when called without it, which is what lets
AC-114 construct the application bare to ask whether a route exists.

Three implementation properties the tests depend on, all now in the
specification rather than inferred:

- The issuer is injectable (11.10). An implementation that hardcodes
  `accounts.google.com` cannot be tested at all.
- `Secure` is set unconditionally, never derived from the request's transport
  (11.6). The suite speaks plain http, and in production TLS terminates ahead
  of the process.
- `DANA_DEV_LOGIN` is read at `createApp()` call time, never at module load
  (11.6), and the development login route is excluded from the compiled output
  rather than guarded at runtime. 11.15 records why that is delicate: tsc emits
  a tsconfig-excluded file anyway if any resolvable import names it, a literal
  dynamic `import()` included.

## One thing this suite needs from `vitest.config.ts`, and does not have

A global `testTimeout`. The config sets `environment` and `include` and
nothing else, so all but six of this suite's 522 cases run under Vitest's
5000 ms default. The six that do not are AC-114's five and one of AC-109's,
which name their own.

**Counts in this section are from before the 2026-09-20 reduction and are not
re-measured; AC-109 and AC-070, named below, were deleted by it while AC-114
was kept.** The argument survives the cut unchanged, because it is about the
absent default rather than about how many cases sit under it: a smaller suite
under the same 5000 ms ceiling still reports a timeout as an Error that does
not say what it was measuring. The numbers are left as the dated measurement
they were rather than rewritten into a freshness they have not earned.

That default is not a comfortable margin here, and the measurement is this
suite's own rather than an argument from principle. Across five consecutive
full runs on an otherwise idle machine, AC-114's slowest case ranged from
1941 ms to 5811 ms. It crosses the five second line, and the only reason it
is not a failure is the `MODULE_LOAD_TIMEOUT = 120_000` its author wrote for
exactly this reason, recorded in that file's header. Nothing else in the
suite has that protection: AC-070's slowest case measured 1237 ms to 2784 ms
over the same five runs, a spread of more than two to one under a ceiling
less than twice its own maximum, and several P2 cases sit in the same band.

Why it matters more than the seconds suggest. A test that exceeds its
timeout is reported as an Error rather than as an assertion failure, so it
does not say what it was measuring, and a run that loses one this way differs
from the previous run by exactly one failure with nothing in the output
naming what moved. The operator measured two gate runs on a byte-identical
tree at 141 failures and then 140, and the Steward two more at 140 and 140;
this is the only mechanism found so far that produces that shape, and it is
load-dependent, which is why nine clean runs in a row do not clear it.

The change is one line in `vitest.config.ts`, which belongs to Platform, and
is escalated rather than made here. Adding per-case timeouts to 516 cases
instead would be the same fix written 516 times, and would leave the next
file written without one exposed again.

# A5 — Documentation structure: inventory, dead links, and a proposed tree

Read-only analysis of `docs/spec/`, `docs/rfcs/`, `docs/audits/`, `docs/workflow/`,
`CLAUDE.md`, `README.md`, `CHANGELOG.md` and `SESSION-LOG.md`, on branch `pipelines`
at `9a22b77`. Nothing was moved, renamed or deleted. Every claim below comes from a
file I opened or a command I ran; where I am reasoning rather than measuring, I say so.

---

## 0. Read this first: the restructure is already half-done, and it is not committed

This matters before anything else, because it changes what "stale" means.

`git status` on `pipelines` shows **347 deletions sitting in the working tree, unstaged
and uncommitted**. `git ls-tree -d HEAD docs/` still lists `docs/design`, `docs/operator`,
`docs/parity`, `docs/security`, `docs/team` and `docs/ux`. On disk, none of them exist.
`git log main..pipelines` is empty — the branch has no commits of its own.

Deleted on disk, still in HEAD:

| Folder | Tracked files still in HEAD |
| - | - |
| `docs/design/` | 270 |
| `dana-reports/` | 54 |
| `docs/team/` | 15 |
| `docs/ux/` | 10 |
| `docs/operator/` | 5 |
| `docs/parity/` | 4 |
| `docs/security/` | 1 |
| `AGENTS.md` | 1 |

Two new things appeared alongside: `.claude/agents/` (13 files, untracked) and two empty
untracked directories, `docs/audits/` and `docs/workflow/`, created 2026-08-31 at 12:39
and 12:45.

**Three consequences.**

1. Every "dead link" in section 1 below is dead *because of this uncommitted change*.
   A `git checkout -- .` would make most of them live again. So the question is not
   "how did the docs rot" — it is "this move is in flight and the references have not
   been followed yet."
2. `git stash`, a branch switch, or a second session running `git checkout` in `D:\dana`
   would silently undo the whole thing. The working tree is the only copy of this decision.
3. The 13 persona files were copied into `.claude/agents/` **byte-identical** to the
   `docs/team/` versions (I diffed all 13 against `HEAD:docs/team/*`; all IDENTICAL).
   But **`_shared-protocol.md` (7,745 bytes) and `docs/team/README.md` (6,116 bytes) were
   not carried over at all.** Those two are the files with the most inbound references in
   the whole repository. `CLAUDE.md:11` calls the protocol "the operative rulebook", and
   15 files under `app/src/` cite `docs/team/README.md` in code comments as the source of
   an ownership "seam". Both are now unreachable.

Also worth knowing: **the 13 files in `.claude/agents/` have no YAML frontmatter.** Each
starts with a plain `# 01. Data and Invariants Engineer` heading. Claude Code needs a
`---` block with `name:` and `description:` to register a subagent. The evidence that
they are not registered is this session itself: it is running in `D:\dana` with
`.claude/agents/` present, and the available agent list contains only the built-ins
(`claude`, `Explore`, `general-purpose`, `Plan`, …) and none of the 13. So right now those
files are inert — moved out of the docs and not yet working as agents.

---

## 1. Inventory and staleness

### 1.1 What exists

`docs/spec/` — 14 files, 546 KB. Last commits 2026-08-27 to 2026-08-31.

| File | Bytes | Lines | Subsections | Last commit |
| - | - | - | - | - |
| `00-index.md` | 3,056 | 41 | — | 2026-08-30 |
| `01-scope.md` | 6,644 | 45 | 3 | 2026-08-27 |
| `02-glossary.md` | 7,702 | 49 | — | 2026-08-27 |
| `03-invariants.md` | 2,261 | 20 | — | 2026-08-27 |
| `04-data-model.md` **FROZEN** | 28,087 | 399 | 21 | 2026-08-30 |
| `05-state-machines.md` | 7,241 | 79 | 4 | 2026-08-27 |
| `06-queries.md` | 13,590 | 103 | 1 | 2026-08-30 |
| `07-api.md` **FROZEN** | 51,603 | 351 | 21 | 2026-08-31 |
| `08-business-logic.md` | 33,003 | 263 | 11 | 2026-08-27 |
| `09-ui.md` | 60,277 | 299 | 13 | 2026-08-31 |
| `10-non-functional.md` | 9,617 | 93 | 8 | 2026-08-31 |
| `11-architecture.md` | 49,180 | 208 | 15 | 2026-08-30 |
| `12-acceptance-criteria.md` | 146,938 | 607 | 324 criteria, AC-001 to AC-360 | 2026-08-31 |
| `13-open-questions.md` | 86,388 | 84 | 57 items | 2026-08-30 |

`docs/rfcs/` — 6 files, 746 KB. All five real RFCs read **Implemented**.

| File | Bytes | Lines | Status line |
| - | - | - | - |
| `0000-template.md` | 8,933 | ~210 | process rules + template |
| `0001-mvp.md` | 138,610 | 167 | Implemented |
| `0002-client-ui-replacement.md` | 94,960 | 769 | Implemented |
| `0003-free-axiom-log-retention.md` | 3,708 | 66 | Implemented |
| `0004-v2-port-and-build.md` | 48,314 | 369 | Implemented 2026-08-30 (S30) |
| `0005-v2-specification.md` | 451,843 | 6,763 | Accepted; Implemented 2026-08-30 |

`docs/audits/` and `docs/workflow/` — both empty, untracked, created 2026-08-31.
Nothing anywhere in the repository refers to either name (grepped `docs/spec`, `docs/rfcs`,
`CLAUDE.md`, `README.md`, `CHANGELOG.md`, `SESSION-LOG.md`, `.claude`, `.github`, `app`: zero hits).

Root files: `CLAUDE.md` 26,766 B / 370 lines · `README.md` 1,389 B · `CHANGELOG.md`
222,249 B / 3,069 lines · `SESSION-LOG.md` 272,609 B / 522 lines · `agreement.md` 15,979 B,
**untracked**.

### 1.2 Staleness, by kind

**Stale because a version shipped and nothing recorded it.** `git tag -l` lists `v2.2.0`
and commit `6684e9d` is `release: 2.2.0`. `CHANGELOG.md` has no `2.2.0` heading
(`grep -n "2\.2\.0" CHANGELOG.md` → nothing), and lines 7-9 still read
`## [Unreleased]` / `Nothing yet.` The changelog is one whole release behind on the day
that release shipped.

**Stale because the subject was deleted.** Spec `11.13 Design artifacts`
(`docs/spec/11-architecture.md:139-160`) is a normative subsection whose entire content
is a table of files under `docs/design/` — `brief.md`, `design-contract.md`,
`screen-registry.csv`, `prototype-v2/`, `prototype/`, `visual_foundation/`, `notes.md`.
Every one of those is gone from disk. This is the highest-stakes staleness in the whole
set, because it is *specification text*, not a note: 11.13 line 143 says
"Every path below is relative to `docs/design/`, a directory every role reads and no agent writes."

**Stale because the workflow changed.** `docs/rfcs/0000-template.md:195` — "Owners are
persona files in `docs/team/`" — and line 197 — "name the `docs/design/` artifacts that
must be updated before the UI package starts." Both describe the package-and-persona
build that is finished.

**Stale by its own admission.** `docs/spec/13-open-questions.md` holds 57 items, many of
which are external facts to re-verify. I did not audit them one by one; several I read
(items 20, 32) reference the deleted design folder. Flagged as an area, not a count.

**Promised and absent.** `agreement.md:65` says "A CODEOWNERS file will be maintained in
the root of the repository." `find . -maxdepth 3 -name CODEOWNERS` finds none, and
`.github/` contains exactly one file, `workflows/ci.yml`. There are also no issue or PR
templates under `.github/`, which is a gap given that work now arrives as GitHub issues.

### 1.3 Dead cross-references — the full list

Method: extracted every markdown link, backticked path and bare `docs/…`-shaped token from
`docs/spec/**`, `docs/rfcs/**`, `CLAUDE.md`, `README.md`, `.claude/**`, then tested each
against the working tree (relative to the file, relative to the repo root, relative to
`app/`, and as a glob). 673 candidate references, of which the ones below fail to resolve.
Prose fragments that only looked like paths (`POST /tasks/:id`, `GET /views/…`) are excluded.

**Occurrence counts, by missing target and by file.** Every number is a live count of the
literal string in the working tree.

| Missing target | `docs/spec` | `docs/rfcs` | `CLAUDE.md` | `CHANGELOG` | `SESSION-LOG` | `app/` (tracked) | `.claude/` |
| - | - | - | - | - | - | - | - |
| `docs/design` | 9 | 37 | 1 | 2 | 9 | 49 in 41 files | 9 |
| `docs/team` | 0 | 12 | 4 | 4 | 0 | 26 in 15 files | 0 |
| `docs/parity` | 2 | 12 | 0 | 1 | 2 | 0 | 0 |
| `docs/security` | 1 | 4 | 0 | 1 | 2 | 0 | 0 |
| `docs/ux` | 1 | 0 | 0 | 1 | 1 | 0 | 0 |
| `docs/operator` | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| `docs/learn` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |

**The ones that actually stop a reader, with line numbers.**

*Entry point.* This is the worst one, because it is the first thing every agent reads.

- `CLAUDE.md:11` — "`docs/team/_shared-protocol.md` is the operative rulebook: the contract,
  boundaries and owned paths, the definition of done, escalation, test ownership, and
  writing conventions all live there." The file does not exist and was not copied anywhere.
- `CLAUDE.md:20` — the hard stop rule: "If your task touches `app/` and your opening
  instructions did not give you `docs/team/_shared-protocol.md` plus exactly one persona
  file from `docs/team/`, say so and stop." **As written, every agent that touches `app/`
  must now refuse to work.** No agent can be handed a file that is not there.
- `CLAUDE.md:35, 36, 37, 38` — four rows of the repository map naming `docs/team/`,
  `docs/design/`, `docs/learn/` and `docs/operator/`. `docs/learn/` has been gone since
  commit `66fa8ff`, so that row was already wrong before this restructure started.

*Process documents.*

- `docs/rfcs/0000-template.md:195` — RFC owners are "persona files in `docs/team/`".
- `docs/rfcs/0000-template.md:197` — "name the `docs/design/` artifacts that must be updated".

*Specification (normative text).*

- `docs/spec/11-architecture.md:143, 155, 159` — the whole of 11.13, seven named artifacts.
- `docs/spec/12-acceptance-criteria.md:442` — `docs/security/2026-08-25-s14-uploads-import-links.md`.
- `docs/spec/12-acceptance-criteria.md:462, 495` — `docs/parity/2026-08-25-prototype-v2-parity-audit.md`
  and `docs/design/prototype-v2/`, named as "the source each surface is measured against".
- `docs/spec/12-acceptance-criteria.md:596` — `docs/ux/2026-08-30-adversarial/`.
- `docs/spec/13-open-questions.md:34, 41, 54` — `docs/design/prototype/src/components/ui/`,
  `docs/design/screen-registry.csv`, `docs/design/prototype/src/screens/states-page.tsx`.

*RFCs.*

- `docs/rfcs/0001-mvp.md:121, 136-140` — `docs/team/README.md` and per-package persona owners.
- `docs/rfcs/0001-mvp.md` — `docs/design/brief.md`, `docs/design/notes.md`,
  `docs/design/screen-registry.csv`, `docs/design/screens/*.png`,
  `docs/design/prototype/public/dana-icon-192.png`.
- `docs/rfcs/0002-client-ui-replacement.md` — `docs/design/prototype`.
- `docs/rfcs/0004-v2-port-and-build.md:72, 115, 130, 299, 302, 312, 353` — `docs/team`,
  `docs/security/…`, four `docs/parity/…` files, `docs/design/v2-pricing.md`.
- `docs/rfcs/0005-v2-specification.md:6168` and ~40 further lines — `docs/team`,
  `docs/design`, `docs/parity`, `docs/security`.

*Tooling — six of eight launch configurations are broken.*

- `.claude/launch.json` — five configs (`prototype-v2`, `prototype-v2-5240`,
  `prototype-v2-share`, `prototype-v2-icons`, `prototype-v2-folder`) run
  `npm run dev --prefix docs/design/prototype-v2`, and one (`imran-prototype`) runs
  `--prefix docs/design/prototype`. All six fail immediately. Separately, the
  `dana-app-audit-dev` config has `cwd` set to
  `C:\Users\imran\OneDrive\Documents\ChatGPT\Dana App\.work\hassan-repo-audit/app` — a path
  on Imran's machine, committed into a shared config, which will never resolve here.
- `.claude/agents/07-frontend-architect.md:20` — "Open `docs/design/` for the committed screens".
- `.claude/agents/08-component-and-design-system.md:10, 20` — "you are the one agent that
  reads `docs/design/**`" and "Open `docs/design/brief.md`".

*Application source (outside my scope, listed because it is the largest single block).*

- 15 files under `app/src/` and `app/tests/` cite `docs/team/README.md` in comments, e.g.
  `app/src/server/domain/accountDeletion.ts:4`, `app/src/server/time/index.ts:4`,
  `app/tests/ac-086-timezone-recompute.test.ts:7`.
- 41 files under `app/src/client/` cite `docs/design/…`.
- 3 files cite `SESSION-LOG` by row number: `app/scripts/run-suite.mjs` (twice),
  `app/src/client/components/page/BlocksEditor.tsx:37`, `app/tests/e2e/harness.ts:525`.

**One thing that is *not* broken, and it is load-bearing for section 2.** The application
almost never cites the spec by file path. `git grep` over tracked `app/` files finds exactly
one path citation of a spec file (`app/tests/e2e/ac-180-folder-groups.spec.ts:69`, naming
`docs/spec/09-ui.md`). What it cites instead are *numbers*: ~16,400 occurrences of
`N.M`-shaped section references and 325 distinct `AC-NNN` numbers. Across all of `docs/`,
only 16 backticked spec filenames appear, and only 13 relative links, all of them the table
in `docs/spec/00-index.md:24-36`.

**Recommended fix order** (cheapest first, and the first two are the ones that unblock work):

1. `CLAUDE.md:11` and `:20` — either restore `_shared-protocol.md` to a real home or delete
   the requirement. Right now the entry point tells agents to stop.
2. `.claude/agents/` — add YAML frontmatter, or move the 13 files somewhere they are read
   as documents rather than expected as agents.
3. `docs/spec/11.13` — the only *normative* section pointing entirely at deleted files.
4. `docs/rfcs/0000-template.md:195, 197` — two lines, and the template is copied into every
   future RFC, so a wrong line here propagates.
5. `CLAUDE.md:35-38` repository map rows.
6. `.claude/launch.json` — delete the six prototype configs and the Imran-path config.
7. The `app/` comments — 56 files, mechanical, low urgency; do it once, not in dribs.

Everything inside `docs/rfcs/0001–0005`, `CHANGELOG.md` and `SESSION-LOG.md` I would
**leave alone**. Those are historical records of what was true when they were written.
Rewriting history to make old links resolve is worse than a link that fails, because it
destroys the record. Say so once, in the folder's README, rather than editing 100 lines.

---

## 2. `docs/spec/` as folders

### 2.1 Why the current shape hurts

Two concrete symptoms, both visible in the files today.

`docs/spec/04-data-model.md:5-9` and `docs/spec/07-api.md:3-7` each open with two long
bold paragraphs — annotations added by the "S29 fold" recording what changed, when, and who
ruled it. In `07-api.md` you read 600 words of amendment history before you reach the first
line of the API contract at `### 7.0 Conventions`. The freeze's audit trail has nowhere to
live, so it lives on top of the thing it audits.

`docs/spec/12-acceptance-criteria.md` is 147 KB and 324 criteria in one file. Every change
to any criterion touches it, so every branch conflicts there.

That is exactly the problem Hassan named: a change has no place of its own.

### 2.2 Proposed tree

One folder per numbered section. The folder name keeps the number and the slug.

```
docs/spec/
  README.md                      (was 00-index.md — the addressing rules and the section table)
  01-scope/
    README.md                    the normative section text, unchanged
  02-glossary/
    README.md
  03-invariants/
    README.md
  04-data-model/                 FROZEN
    README.md                    4.1 … 4.20 only. No annotations, no history.
    amendments.md                every change to this frozen section: date, RFC, who ruled it
    decisions/
      0001-no-workspace-table.md
      0002-soft-delete-over-hard-delete.md
  05-state-machines/
    README.md
  06-queries/
    README.md
  07-api/                        FROZEN
    README.md
    amendments.md
    decisions/
  08-business-logic/
    README.md
    decisions/
  09-ui/
    README.md
    decisions/
  10-non-functional/
    README.md
  11-architecture/
    README.md
    decisions/                   this is where architecture decisions live — see §3.4
  12-acceptance-criteria/
    README.md                    the index: what a criterion is, how they are numbered
    ac-001-099.md
    ac-100-199.md
    ac-200-299.md
    ac-300-399.md
  13-open-questions/
    README.md
```

**What goes in a section folder, and why each thing earns its place:**

- `README.md` — the normative text, exactly what the `NN-*.md` file holds today. Nothing
  else in the folder is normative. A reader who opens the folder and reads only this file
  has read the contract. That property is worth protecting; if it dissolves, the folder
  becomes a pile.
- `decisions/` — one file per architecture decision that shaped this section. Present only
  where there is something to record. An empty `decisions/` folder is noise; do not create
  it pre-emptively.
- `amendments.md` — **only for sections 4 and 7.** This is the head-of-file annotation
  moved into a file. `docs/spec/00-index.md:39-41` already calls those annotations "the
  freeze's audit trail", so this is not a new document, it is the existing one given a home.
  Unfrozen sections do not need it: git log plus the changelog already say what changed.

I deliberately did **not** propose a folder per *sub*section (`11-architecture/11.15-hazards.md`).
Section 4 has 21 subsections and section 7 has 21; that would be 40+ tiny files, and the
contract would stop being readable end to end. Splitting section 12 by criterion range is
the one exception, because 147 KB in one file is a real merge-conflict cost and the ranges
are natural.

### 2.3 How a reader still finds "section 11.15"

This is safer than it looks, and the reason is measured, not assumed.

`docs/spec/00-index.md:14-17` already states the rule:

> "The specification is this directory. It is one contract split across files so that a
> reader opens only what a task needs; **the numbering is the addressing scheme, not the
> filenames.** Every cross-reference in this repository says 'section N' or 'section N.M',
> and it resolves to the file whose name begins with N."

And the codebase obeys it. As measured in §1.3: ~16,400 numeric section citations in `app/`
versus **one** file-path citation. So the folder move changes one word in one rule:

> …and it resolves to the **directory** whose name begins with N. The section text is that
> directory's `README.md`.

**Total edits needed to keep every existing reference alive:**

| What | Count | Where |
| - | - | - |
| Relative links in the index table | 13 | `docs/spec/00-index.md:24-36` |
| Backticked spec filenames across `docs/` | 16 | mostly `docs/rfcs/0004`, `0005` |
| Path citations in `app/` | 1 | `app/tests/e2e/ac-180-folder-groups.spec.ts:69` |
| The merge rule in the RFC template | 1 sentence | `docs/rfcs/0000-template.md` ("a section number resolves to the file whose name begins with that number") |
| The repository map row | 1 row | `CLAUDE.md:33` |

Thirty-two edits. Zero test changes. Nothing in `app/tests/` addresses the spec by path.

Do the move with `git mv docs/spec/11-architecture.md docs/spec/11-architecture/README.md`
so `git log --follow` still reaches the history. One commit, no content edits mixed in —
that way the diff is reviewable as a pure move.

### 2.4 What "frozen" should mean going forward

Today, `docs/spec/00-index.md:39-41`:

> "Sections 4 and 7 are frozen: changing either invalidates acceptance criteria by number
> and is **a human decision, never an agent's**."

That definition was built for a fleet of thirteen autonomous sessions. "Never an agent's"
was a guardrail against a session amending the schema on its own initiative. In the new
mode every change already goes through Hassan, so the guardrail as phrased is either
redundant or, worse, read as ceremony and skipped.

Restate the freeze in terms of *consequence* rather than *actor*. Proposed wording:

> Sections 4 and 7 are frozen. Frozen does not mean unchangeable; it means a change costs
> more than a change elsewhere, and the cost must be paid explicitly. A change to either
> requires all four of:
> 1. an RFC — never an issue alone, however small the change looks;
> 2. a migration plan following expand-and-contract per 11.5, because section 4 is stored
>    data and section 7 is a contract a running client depends on;
> 3. a named list of every acceptance criterion the change invalidates, by number;
> 4. a dated line in that section's `amendments.md` saying what moved and who decided.
>
> Section 4 is frozen because the data already exists in production and a wrong migration
> loses it. Section 7 is frozen because a deployed client is calling those endpoints right
> now. Neither reason is about trust.

That version is enforceable by a reviewer, survives the end of the agent fleet, and gives
`amendments.md` its reason to exist.

---

## 3. RFCs

### 3.1 What the current five actually are

All five read `Implemented`. But they are not five RFCs; they are three different kinds of
document sharing a folder:

- **`0001-mvp.md`** (167 lines) and **`0004-v2-port-and-build.md`** (369 lines) are *build
  plans*. `0004`'s own header says "Spec sections touched: none — this RFC alters no
  specified behavior." A document that changes no behavior is not an RFC by this project's
  own definition (`0000-template.md`: "An RFC is required exactly when the change alters
  specified behavior"). They are work orders.
- **`0002`** (769 lines) and **`0005`** (6,763 lines) are *specification deltas* — real RFCs.
- **`0003-free-axiom-log-retention.md`** (66 lines) is the only one that looks like what the
  template describes: one page, one section touched (11.12), a clear motivation. It is the
  model, and it is the smallest file in the folder.

And one structural problem worth naming plainly. In `0005`, `## Change control` runs from
line 1587 to line 6753 — **5,166 of 6,763 lines, 76% of the file, 61 numbered items**. Each
item is a decision: what was ruled, why, and what it changed. `CLAUDE.md:299` cites one of
them as "RFC 0005 change control item 51(n)". So the project's decision record already
exists — it is buried inside one 452 KB implementation RFC, addressable only by an item
number you cannot find without opening the whole thing. That is the strongest argument for
section 3.4 below.

### 3.2 Naming

Feature-shaped, not version-shaped. Keep the number.

```
docs/rfcs/0006-recurring-task-templates.md
docs/rfcs/0007-mobile-offline-writes.md
docs/rfcs/0008-shared-folder-roles.md
```

Keep the four-digit number for three reasons that all still hold: it sorts, it gives a
short spoken handle ("RFC 7"), and it is stable when the title changes. The slug carries the
feature. Drop nothing from the existing rule at `0000-template.md:31-34` — "Numbers are
never reused; a rejected RFC keeps its number forever" is correct and cheap.

Do **not** move to `docs/rfcs/0006-name/` folders. RFCs are one-shot documents; unlike a
spec section they do not accumulate amendments after they are implemented, because the
template already says so: "From this moment the only edit an RFC ever receives is a status
change to Superseded" (`0000-template.md`). One file each.

### 3.3 Lifecycle and where status lives

Keep the five states already defined — `Draft`, `Accepted`, `Implemented`, `Rejected`,
`Superseded by NNNN`. They are correct and they were used for real: `0002`'s header records
an actual Accepted → Draft → Re-accepted round trip.

Rename `Draft` to `Proposed` only if Hassan prefers it; there is no substance in the choice
and `Draft` matches every existing header.

**Status lives in two places, and each has one job:**

1. **The `- **Status:**` line at the top of the RFC file.** This is the record. It is what
   a reader opening the file sees, and it survives GitHub. Keep it.
2. **A table in `docs/rfcs/README.md`** — number, title, status, the issue it came from,
   the release that shipped it. One row per RFC. This is the index, so you can see all of
   them without opening six files.

That is one duplication, deliberately. To stop it drifting, make the rule directional and
one-sided: **the file's Status line is the record; the README table is a copy that must be
updated in the same commit that changes a Status line.** If they ever disagree, the file
wins. Say that sentence in `docs/rfcs/README.md` itself so the reader of the copy is told
it is a copy.

Do **not** use GitHub issue labels as the status of record. They live outside the repository,
they cannot be read by an agent working from a checkout, and they are not in git history.

### 3.4 Where architecture decisions live — and why they are not RFCs

**Recommendation: keep them separate, and put them in the spec folders, not in `docs/rfcs/`.**

The two documents answer different questions, and merging them would lose one of the answers.

- An **RFC** asks *should we do this?* It is written **before**, it is a proposal, it can be
  rejected, and it is dead once implemented. Its audience is Hassan-and-Imran deciding.
- A **decision record** asks *why is it like this?* It is written **when the choice is made**,
  it is never rejected, and it stays useful for years. Its audience is whoever next opens
  that part of the system and wants to know why it is not the obvious way.

The project already proves the distinction is real and already has the second kind of
content, in three different places, none of them findable:

- `docs/spec/11-architecture.md:161-185` — subsection **11.14 "Rejected alternatives"**.
  That is a set of decision records, unnumbered, inside a spec section.
- `docs/rfcs/0005` change control, 61 items — decision records inside an RFC.
- `CHANGELOG.md` under `[1.0.0]` — ~2,800 lines of "ruled 2026-08-11", "the four P8
  silences", "grounds recorded here". Decision records inside a changelog.

So the answer is not "invent ADRs"; it is "the ADRs exist, give them one address."

**Proposal.** A decision record lives in `docs/spec/NN-section/decisions/`, next to the
part of the contract it explains. Numbered per section, so
`docs/spec/04-data-model/decisions/0001-no-workspace-table.md`.
Content: five short parts — **Decision**, **Date**, **Context** (what forced the choice),
**What we rejected and why**, **What would make us revisit this**. That last one is the part
most ADR templates leave out and the part that is worth the most, because it tells a future
reader whether the decision is still binding.

Relationship to RFCs, stated in one line each so there is no overlap:

- An RFC that is accepted and touches a section **should leave a decision record behind** in
  that section's folder. The RFC then dies as planned and the reasoning survives where the
  code lives.
- A decision record may also be written with **no RFC at all** — for the many technical
  choices that change no specified behavior. "We use Luxon rather than date-fns" changes
  nothing a user can see, needs no RFC, and is exactly the kind of thing a future reader
  will want the reason for.
- 11.14 "Rejected alternatives" becomes an index that points at
  `11-architecture/decisions/`, or is retired into it. Either is fine; do not keep both
  full of text.

### 3.5 The template — slim it, but not much

`docs/rfcs/0000-template.md` is 8,933 bytes and it is genuinely good. It already contains
the two things Hassan is asking for: a "Does your change need an RFC?" test and a "How it
scales" section that explicitly says a small change is one page. It also contains the
tombstone rule for removing sections, which is real institutional knowledge that took a
build to learn.

**Cut only what the finished build made false:**

- Line 195 — "Owners are persona files in `docs/team/`". Replace with "Owner: Hassan or Imran."
- Line 197 — "name the `docs/design/` artifacts that must be updated before the UI package
  starts." Replace with the new home of Imran's prototypes (see §5, §7).
- "Route to the Integration Steward" and "the Steward records the status change" — the
  Steward was persona 12. Replace with "Hassan".
- The Implementation plan table has six columns (`ID | Delivers | Depends on | Blocks |
  Owner | Acceptance`) sized for parallel agent sessions. For two people, cut to three:
  `Step | Delivers | Owner`. Keep the sentence "State the critical path and what may run in
  parallel"; with two people working in parallel that is still the useful part.
- The bootstrap-RFC exception paragraph ("This has happened once (RFC 0001) and by
  construction cannot happen again") can go — it describes a case that cannot recur.

**Keep:** the "Does your change need an RFC?" test, the numbering rules, the status
lifecycle, the two-fates split (delta merges, plan does not), the removal/tombstone rules,
"How it scales", and the header block. Add one field to the header: `- **Issue:** #NNN`,
since work now starts as a GitHub issue and the link back is worth one line.

That trims maybe 25% and leaves the parts that were paid for.

### 3.6 When something needs an RFC at all

The template's existing test is right and I would not replace it, only re-anchor it to the
agreement. `agreement.md:87` says "For significant features, once the product direction is
sufficiently clear, Hassan can turn it into a technical RFC", and `agreement.md:77` says
"The amount of explanation and documentation required should also depend on the size and
complexity of the feature."

So, in plain terms:

**Issue only** — a bug, a wording change, a refactor with no behavior change, a UI tweak
Imran can describe in a prototype, anything where Hassan already knows how he will build it
and nobody will ask "why" in six months.

**Issue plus a decision record** — a technical choice with no user-visible change that a
future reader would question. A new library. A change of hosting. An index added for
performance. No RFC, one short file.

**RFC** — any of these, and the list is short on purpose:
1. it changes what a user can do, or what the app does in a case the spec already covers;
2. it touches section 4 or section 7 (always, no exceptions — see §2.4);
3. it adds or changes a limit, a rate limit, or an operational contract;
4. Hassan does not yet know how to build it, and writing it down is how he finds out;
5. Imran needs a cost estimate before deciding, per `agreement.md:33`.

And keep the template's own tie-breaker verbatim, because it is the sentence that stops the
argument: **"if you are unsure whether something is behavioral, it is; the cost of a small
RFC is one page."**

### 3.7 What happens to the existing five

**Leave all five files exactly where they are, unedited.** All are Implemented; the template
says an Implemented RFC is never edited again except for a status change. They are history
and their value is that they are unaltered.

Three things to do *around* them:

1. Create `docs/rfcs/README.md` with the status table, and add one line at the top:
   *"RFCs 0001 to 0005 were written during the package-based build (2026-07 to 2026-08).
   They contain paths to `docs/team/`, `docs/design/`, `docs/parity/` and `docs/security/`
   that no longer exist. They are historical records and are deliberately not corrected."*
   That single sentence retires ~65 dead links without touching a byte of history.
2. Mark `0001` and `0004` in the status table as **build plans** rather than RFCs, so nobody
   copies their shape for a feature.
3. **Harvest `0005`'s change control before it is forgotten.** 61 numbered decisions,
   several of them still cited (`CLAUDE.md:299` cites item 51(n); `docs/spec/12` cites items
   20, 23, 30). Do not migrate all 61 — most are spent. Pull out the ones still binding on
   the running system and write each as a decision record in the right spec folder, with a
   line saying "originally RFC 0005 change control item N". That is a one-off task worth
   one session, and it is the single highest-value piece of archaeology in this whole tree.

---

## 4. `CHANGELOG.md` — 222 KB

### 4.1 What format it is actually in

The header (`CHANGELOG.md:3-5`) claims Keep a Changelog and SemVer. The file only half does.

Four version blocks: `[Unreleased]` (31 bytes), `[2.1.0]` (2,466), `[2.0.0]` (12,037),
`[1.0.0]` (**207,509**). The 1.0.0 block is **93% of the file**.

There are exactly **four** `###` subheadings in 3,069 lines: two `Added` and two `Changed`
(under 2.1.0 and 1.0.0). No `Fixed`, `Removed`, `Deprecated` or `Security` anywhere. So the
Keep a Changelog category structure exists in two places and is absent everywhere else.

And the 1.0.0 block is not a changelog at all. Its bullets read:

- "**The P8R mid-package change control, 2026-08-13: ten controls named, one …**"
- "**Five P8 kickoff rulings, 2026-08-10, grounds recorded here.**"
- "**Two carried items closed in section 11, neither of them frozen.**"
- "**The four P8 silences, ruled 2026-08-11, three closed and one recorded.**"

That is a decision log. It records kickoffs, rulings, escalations and spec amendments — the
internal reasoning of the build. A user reading a release note does not want any of it, and
a developer looking for why a rule exists cannot find it, because it is filed under a
version number rather than under the thing it decided.

**Also: it is already out of date.** `v2.2.0` is tagged and released; the changelog's top
entry is 2.1.0 and `[Unreleased]` says "Nothing yet."

### 4.2 Is it still earning its keep?

**Yes, but only about 7% of it is, and that 7% should be the whole file.**

The reason to keep a changelog is not that git history is missing — git has everything. It
is that git history answers *"what commits landed"* and a changelog answers *"what changed
for the person using this"*. Those are different questions and the second one has a real
audience here:

- **Imran.** He cannot read backend code, and the agreement makes him the person who decides
  what to build next (`agreement.md:31`). A short list of what each release changed is the
  only artifact in this repository written for him.
- **Beta users, later.** `README.md` says the app is deployed. Once ten people rely on it, a
  release note is the thing you point them at.
- **Hassan in six months**, asking "when did the reminder behavior change?"

`git log --oneline` cannot serve any of those three. The commit subjects are written for
the build ("polish: the sidebar gives its room to the Library"), not for a reader.

### 4.3 How it is maintained from now on

**Hand-written, by Hassan, one entry per release, at release time.** Not generated.

Generated changelogs (conventional-commits tooling) fail here for a measurable reason: they
turn commit subjects into bullets, and this project's commit subjects are internal
("merge: release 2.2.0, the owner's polish rounds 2 and 3"). A generated file would be
longer, less useful, and still need editing. Two people shipping a handful of releases a
month do not have a volume problem.

**The rule, in four lines:**

1. When a change ships that a user would notice, add a bullet under `## [Unreleased]` in the
   same pull request that makes the change. One sentence. Present tense. Say what a person
   can now do, not which file moved.
2. At release, rename `[Unreleased]` to the version and date, and start a fresh `[Unreleased]`.
3. Use only the Keep a Changelog categories that actually occurred — `Added`, `Changed`,
   `Fixed`, `Removed`, `Security`. Omit empty ones rather than writing "None".
4. **No entry may explain *why*.** The why goes to a decision record (§3.4). A changelog
   bullet that starts explaining reasoning is how this file reached 222 KB.

Hassan writes it because he is the one who knows what shipped, and `agreement.md:43` puts
"maintaining appropriate technical documentation" on him. Imran can review it — he is the
audience, so if a bullet does not make sense to him it is written wrong.

A target size, since a rule with no number gets ignored: **a release entry should fit on one
screen.** The 2.1.0 entry (2,466 bytes, 40 lines) is at the outer edge of acceptable and is
a good model. The 2.0.0 entry (12,037 bytes) is already too long.

### 4.4 What to do with the existing 222 KB

**Split it, once, and do not archive it into oblivion.**

1. Keep `CHANGELOG.md` at the root with the header, `[Unreleased]`, and the release entries
   for 1.0.0, 2.0.0, 2.1.0 **trimmed to release notes**. Trimming 1.0.0 means keeping the
   opening paragraph plus roughly one screen of what actually shipped, and cutting the ~2,800
   lines of rulings. Target: the whole file under 15 KB.
2. Move the cut material — verbatim, no edits — to `docs/audits/2026-08-build-record.md`, or
   whatever §7 settles on. It is the reasoning behind the v1 build and it should not be lost.
   It is also 93% of the current file, so this one move fixes the size problem entirely.
3. Then harvest it the way §3.7 says to harvest RFC 0005's change control: pull out the
   rulings still binding on the running system as decision records in the spec folders. The
   rest stays in the archive as history.
4. **First, add the missing 2.2.0 entry**, before anything else, because that is the actual
   bug in this file today.

Do not split by version into `changelog/1.0.0.md`, `changelog/2.0.0.md`. That solves a size
problem that will not exist once step 1 is done, and it costs you the ability to read the
project's history top to bottom in one file.

---

## 5. `SESSION-LOG.md` — 272 KB

### 5.1 What it actually recorded

522 lines, but the average table row in the v2 section is **1,908 characters** and the
longest single line is **15,248**. So it is not a log of 522 short entries; it is ~130 dense
paragraphs formatted as table cells. 22 tables, one per package, `P minus 4` through
`The v2 build`.

Its own header (`SESSION-LOG.md:5-13`) is unusually honest about what it is:

> "`CHANGELOG.md` records what the product became; this records how it was built. **This is
> a record, not a source of truth.** … Read it for context if you like. **Never reason from
> it, never treat a row as evidence that something landed**, and never read a planned row as
> an assignment."

A real row, truncated, from the v2 build table:

> "**S4, System B.** The object store behind one interface (files/store.ts, disk factory over
> DANA_FILES_DIR, construction pure per 11.10); the 7.15 surface with multer under the 25 MB
> cap, sharp decoding and downscaling images in one act, the raster allowlist, the 1 GB quota
> under the owner's row lock answering 413 with section 9's copy…"

So it bought three different things at once:

1. **A handoff between sessions.** Session S5 needed to know what S4 left behind, and no
   session shared memory with another. This was the shared memory.
2. **A dispatcher's state board.** From P8 onward it carried Planned and Blocked rows so a
   coordinating session could see what was startable. `SESSION-LOG.md:17-24` says exactly this.
3. **A memory of why.** Rows like S4's above record technical decisions — the row lock, the
   413 status, the pure construction — that appear nowhere else in that form.

### 5.2 Recommendation: archive it, keep it readable, and do not replace it

**Move it to `docs/audits/2026-08-session-log.md` and stop writing to it. Do not delete it.
Do not create a successor.**

Here is the reasoning, straight through.

**Jobs 1 and 2 are gone, completely.** They existed because thirteen agents with no shared
memory had to coordinate through a file. There are now two people who talk to each other, and
work arrives as GitHub issues. An issue thread *is* the handoff, and the issue board *is* the
state board — and both are better at it, because they are the thing people actually look at.
Writing a second state board in a markdown file would recreate exactly the drift problem
`CLAUDE.md:13` warns about. There is nothing left to replace.

**Job 3 is real and still needed — but this file is the wrong shape for it.** A decision
buried in the middle of a 1,900-character table cell addressed as "row 21" is not findable.
Two people already hit this: `app/tests/e2e/harness.ts:525` says "Row 21 of SESSION-LOG is
the worked example of that confusion", and `app/src/client/components/page/BlocksEditor.tsx:37`
says "Recorded in SESSION-LOG's S12 row." Both are code comments pointing into a narrative
log by row number — which is what you write when there is no better address. Decision records
(§3.4) are the better address, and that is the replacement: not a smaller session log, but
decisions filed where the code is.

**Why archive rather than delete.** Three files in `app/` cite it by row number
(`run-suite.mjs` twice, `harness.ts`, `BlocksEditor.tsx`), and `CHANGELOG.md` cites it four
times. Deleting it turns those into dangling references and destroys the only account of a
few real measurements — `app/scripts/run-suite.mjs:118` points at "the SESSION-LOG entry" as
the record of why that guard script exists. It costs nothing to keep 272 KB of text.

**Why not keep writing it.** The header rule — "never reason from it" — is a warning sign.
A document you must not trust, that must still be written after every session, is pure
overhead. That was a fair trade when it was the only handoff mechanism between agents. It is
not a fair trade now.

**One concrete follow-up before archiving**, and it is small: read the four code comments
that cite row numbers, open those rows, and inline the one useful sentence into the comment
itself. Then the code stops depending on the archive. That is maybe an hour.

**If Hassan wants to keep something session-shaped**, the honest minimum is a line in the
pull request description — what was built, what was measured, what surprised you. It is
already where a reviewer looks and it needs no new file. But I would not mandate even that.

---

## 6. `CLAUDE.md` — 26 KB

### 6.1 What is actually in it

370 lines. By block:

| Lines | Block | Share |
| - | - | - |
| 1-16 | What this file owns / pointer to the protocol | 4% |
| 17-28 | Before implementation work | 3% |
| 29-41 | Repository map | 4% |
| **42-343** | **Commands and this machine** | **82%** |
| 344-370 | Architecture in brief | 7% |

The environment lore is 302 of 370 lines, in 20 bullets. Several are long because they record
a correction: the `--maxWorkers` bullet (89-99) opens "**Capping the workers is not certainty,
corrected 2026-08-24 against measurement**" and explains what the previous version got wrong.
The `TEST_DATABASE_URL` bullet (144-163) records that the variable's state flip-flopped twice
and concludes "the state of this variable must never be read from this file". This is the
most expensive content in the repository by hours-per-byte, and it is right that Hassan wants
it protected.

### 6.2 The file already warns about the failure mode

`CLAUDE.md:9-15`, quoted in full because it is the rule that should govern the split:

> "**What this file owns:** the repository map, this machine's environment and commands, and
> an orientation sketch of the architecture. **Everything else is a pointer.**
> `docs/team/_shared-protocol.md` is the operative rulebook: the contract, boundaries and
> owned paths, the definition of done, escalation, test ownership, and writing conventions
> all live there and are deliberately not restated here, **because a rule stated twice is a
> rule that will one day disagree with itself.** Wherever the two appear to differ, the
> protocol wins."

Two things about that paragraph. It states the anti-duplication rule better than I could.
And its own example is now broken — the rulebook it points at does not exist. The file
practised what it preached, and then the target moved.

### 6.3 The split

**`CLAUDE.md` keeps four things and gets to about 60 lines:**

1. **What Dana is**, in three sentences.
2. **The repository map** — corrected. The current rows for `docs/team/`, `docs/design/`,
   `docs/learn/` and `docs/operator/` (lines 35-38) are all dead and must go.
3. **Where to go next**, as pointers with a one-line reason each. This is the part Hassan
   asked for: `docs/workflow/` for how work is done, `docs/spec/` for the contract,
   `docs/rfcs/` for changes in flight.
4. **The two rules that must be read before any code is written**, because they are the ones
   that cost real time when missed:
   - Everything runs from `app/`, never the repository root.
   - Read spec 11.15 (12 hazards) before touching FullCalendar, Tailwind, React Router, zod,
     Express, Luxon or PGlite. `CLAUDE.md:24-28` already says this and it is worth its space:
     the hazards exist because model recall of these library versions is wrong in listed ways.

Everything else becomes a pointer.

**The environment lore moves to `docs/workflow/environment.md`** — one file, all 20 bullets,
unchanged. Not split by topic. Splitting it into `testing.md`, `git.md`, `database.md` would
break the cross-references the bullets make to each other (the browser-leg bullets at lines
189, 211 and 231 explicitly correct and scope one another, and the whole point of the 231
bullet is that it must not be confused with the 189 one).

### 6.4 How to make sure it still gets read

This is the real risk. `CLAUDE.md` is loaded automatically; a file in `docs/workflow/` is not.
Moving the lore out could mean nobody reads it, and then it gets relearned the expensive way.

Three mechanisms, cheapest first:

1. **Make the pointer specific and consequential.** Not "see `docs/workflow/environment.md`
   for test notes" — that gets skipped. Instead:
   *"Before you run the test suite, read `docs/workflow/environment.md`. It is 20 bullets and
   it is the difference between reading a red run correctly and spending an evening
   debugging code that is fine. Six of those bullets were written after a session did
   exactly that."*
   That is honest and it is the kind of sentence a reader does not skip.
2. **Keep a two-line summary of the two costliest ones inline**, with the pointer, not a
   restatement: *"A red test run here is often the machine, not the code. `app/.data` can
   corrupt; the browser leg loses about one case per run; `TEST_DATABASE_URL` is ambient and
   has flipped twice. Do not believe a red run until you have read
   `docs/workflow/environment.md`."* That is a signpost, not a copy — it contains no rule you
   could follow without opening the file, which is exactly what keeps it from drifting.
3. **State the ownership rule at the top of both files**, in the same shape the current file
   already uses. In `CLAUDE.md`: *"This file owns orientation and pointers only. Nothing about
   how to run or read the test suite is stated here; it is all in
   `docs/workflow/environment.md`, and if the two ever disagree, that file wins."* In
   `environment.md`: *"This file is the only home for how this machine behaves. Nothing here
   is repeated in `CLAUDE.md`."*

**The drift-proofing rule, generalised:** a fact lives in exactly one file, and every other
mention is a pointer that contains no version of the fact you could act on. If you can follow
the pointer's text without opening the target, you have made a copy, and it will drift. That
is the same rule `CLAUDE.md:13` states; it just needs applying to a second pair of files.

**One thing that must not be lost in the move.** Several bullets are valuable *because* they
record a wrong belief being corrected — lines 89-99 and 144-163 especially. When the file
moves, resist the urge to tidy them into clean rules. The correction is the content: it is
what stops the next session re-deriving the wrong answer with confidence.

---

## 7. The proposed `docs/` tree, whole

```
docs/
  spec/          the contract: what Dana does. One folder per numbered section (§2).
                 Owner: Hassan. Imran reads section 9 (UI) and section 1 (scope).
  rfcs/          proposals to change the contract, one file per feature (§3).
                 Owner: Hassan writes them; Imran accepts or rejects them.
  workflow/      how the two of you work: environment lore, the release checklist,
                 the definition of done, how a feature goes from issue to shipped.
                 Owner: Hassan. Both read it.
  product/       Imran's feature requests, prototypes and the .md files
                 agreement.md:89 asks for. Owner: Imran. Hassan reads it.
  handoffs/      frontend <-> backend contracts: what the API gives a screen and
                 what the screen needs. Owner: shared — see §7.2.
  audits/        one-off investigations and archived records. Written, dated,
                 and never edited again. Owner: whoever ran the audit.
```

Root stays: `README.md`, `CLAUDE.md`, `CHANGELOG.md`, `agreement.md`, and a new `CODEOWNERS`
that `agreement.md:65` already promises.

`SESSION-LOG.md` moves into `docs/audits/`. The trimmed 93% of `CHANGELOG.md` moves into
`docs/audits/`.

### 7.1 One line each

| Folder | What belongs there | Who owns it |
| - | - | - |
| `docs/spec/` | The current truth about what the system does. If it is not true of the code today, it does not belong. | Hassan. Sections 4 and 7 frozen per §2.4. |
| `docs/rfcs/` | Proposals, before they are true. Dead once implemented. | Hassan writes, Imran decides (`agreement.md:33`). |
| `docs/workflow/` | How the two of you work. Not what the product does. | Hassan. |
| `docs/product/` | What Imran wants and why, in his words, with prototypes. | Imran. |
| `docs/handoffs/` | The interface between his screens and Hassan's API, per feature. | Both — §7.2. |
| `docs/audits/` | Dated one-off investigations and archives. Never edited after writing. | Whoever wrote it. |

### 7.2 Where the frontend↔backend handoff reports go

`docs/handoffs/`, one file per feature, named for the feature and dated:
`docs/handoffs/2026-09-recurring-templates.md`.

This is the folder most likely to be argued about, so here is the reasoning. The agreement
sets up a genuine two-sided seam: Imran owns "what the user sees and experiences"
(`agreement.md:39`) and Hassan owns "backend architecture, APIs, database structure"
(`agreement.md:45`), and Hassan's job includes "connecting Imran's frontend work to them"
(`agreement.md:49`). The document that says *what the screen needs and what the API gives it*
is the only document neither of them owns alone. Filing it under either person's folder
would make the other person a guest in it.

Ownership rule: **whoever is blocked writes it.** If Hassan needs to know what a screen
expects, he writes the questions and Imran answers in the same file. If Imran needs to know
what the API returns, he asks and Hassan answers. It is a conversation with a file for a
home, and it is dated because it describes one moment in one feature.

### 7.3 Overlaps, and how each resolves

Five places where two folders could both claim a document. Each needs one rule, decided once.

**1. `docs/rfcs/` vs `docs/spec/*/decisions/`.**
Overlap: an RFC contains reasoning; so does a decision record.
Rule: **an RFC is the proposal, a decision record is the conclusion.** The RFC is dated to
when you were deciding; the decision record is dated to when you decided and is written to be
read years later. When an RFC is implemented, it leaves a decision record behind and then it
is history. If you only ever write one of the two, write the decision record — it is the one
that stays useful.

**2. `docs/spec/` vs `docs/workflow/`.**
Overlap: spec section 11 is architecture, and workflow describes how the machine behaves.
Rule: **the spec describes the system; workflow describes working on it.** "The reminder tick
runs every 60 seconds in-process" is spec 11.7. "A PGlite worker can die mid-run and it reads
as broken code" is workflow. The test: would this still be true if someone else, on a
different machine, took over the repository? If yes, spec. If no, workflow.

**3. `docs/audits/` vs everything.**
Overlap: an audit finds something true about the system — so does the spec.
Rule: **an audit is a dated snapshot and is never updated; the spec is current and is always
updated.** If an audit finds something that changes what the system should do, the *fix* goes
to the spec or an RFC and the audit stays as the record of how it was found. An audit is
never the place someone looks for current truth. This is also why the archived session log
and the trimmed changelog belong here: same property, written once, never edited.

**4. `docs/product/` vs `docs/spec/09-ui/`.**
Overlap: both describe screens.
Rule: **`product/` is what Imran asked for; `09-ui/` is what was agreed and built.** The first
is a request and can be aspirational; the second is a contract and must match the running app.
Spec 11.13 already carries this exact rule for the old design folder and it is worth keeping
in the new one: "Section 9 always wins over any design artifact on structure and copy."

**5. `docs/handoffs/` vs `docs/spec/07-api/`.**
Overlap: both say what an endpoint returns.
Rule: **section 7 is the contract, a handoff is the conversation.** Anything settled in a
handoff that binds the system must land in section 7 — and since 7 is frozen, that means an
RFC. A handoff file is never authoritative on its own. If it were, section 7 would stop being
the single source of truth about the API, which is the property the whole spec exists to have.

**And one folder that should not exist: `docs/design/`.** It is tempting to recreate it,
since 41 files under `app/src/client/` and nine lines of the spec still name it. Do not.
`docs/product/` is the same content with a clearer owner, and recreating the old name would
resurrect the ambiguity about whether it holds requests or contracts — which is what let
`screen-registry.csv`'s `implementation_status` column sit wrong for weeks
(`docs/spec/11-architecture.md:143`, which flags it as "not authoritative and must not be
read as state").

---

## What I could not verify

- **Whether the uncommitted deletions are intentional and final.** They are in the working
  tree on `pipelines`, unstaged, at the same commit as `main`. I could not tell whether
  someone means to commit them, is mid-restructure, or left them by accident. Everything in
  §1.3 assumes they stand. If they are reverted, most of the dead links come back to life.
- **Whether `.claude/agents/*.md` are meant to be Claude Code subagents.** I verified they
  have no YAML frontmatter and that none of the 13 appears in this session's available-agent
  list. I did not test whether adding frontmatter makes them load, and I do not know whether
  the intent was working subagents or just a new shelf for the persona documents.
- **The contents of `docs/audits/` and `docs/workflow/`.** Both are empty. My proposals for
  them are proposals, not descriptions.
- **Whether the 57 items in spec section 13 are still open.** I read three. Auditing all 57
  is its own task.
- **Whether the 61 change-control items in RFC 0005 are still binding.** I read the first four
  and confirmed the structure and count. Deciding which still bind the running system needs a
  session with the code open.
- **Anything about `app/` beyond grep counts.** I did not run the test suite, per instructions,
  and I did not read application code except where a grep hit landed in a comment.
- **What Imran's actual workflow looks like.** I inferred his needs from `agreement.md` and
  from the task brief. He may already have a way of handing over prototypes that none of this
  accounts for.

## Open questions for Hassan

1. **Are the working-tree deletions committed on purpose?** If yes, commit them soon —
   347 uncommitted deletions are one `git checkout` away from vanishing, and a second session
   in `D:\dana` shares this working tree.
2. **Where does `_shared-protocol.md` go?** It is the file `CLAUDE.md:11` calls the operative
   rulebook and it currently exists nowhere on disk. My guess is that most of it becomes
   `docs/workflow/` and the persona-specific parts die with the fleet — but that is a
   judgment about which of its eight sections still apply to two people, and it is yours.
3. **Do the 13 personas still have a job?** If yes they need frontmatter to work as subagents.
   If no, they should be archived rather than left inert in `.claude/agents/`. Either is
   defensible; the current state is neither.
4. **Does `docs/design/` need a successor for the deleted prototypes?** `prototype-v2/` was
   270 files and spec 11.13 calls it "the only artifact that is [authoritative for the
   client's markup and appearance]". If Imran still builds prototypes, they need a home before
   the next feature, and six `.claude/launch.json` configs need repointing at it.
5. **Do you want the spec folders now or after the next feature?** The move is 32 edits and is
   safe (§2.3), but it is easier to do it while restructuring than to interleave it with
   feature work — and harder to justify if the next feature is already waiting.
6. **Who writes the changelog entry — you at release, or whoever opens the pull request?**
   I recommended the PR author adds the bullet and you assemble at release. That only works
   if Imran's PRs do it too.
7. **CODEOWNERS.** `agreement.md:65` promises one and there is none. It also needs the new
   `docs/` folders in it, which means §7 has to be settled first.
8. **Is there anything in the 2,800 lines of `CHANGELOG.md` 1.0.0 you would be upset to see
   moved to an archive?** I read enough to be confident it is build reasoning rather than
   release notes, but you wrote it and I did not read all of it.

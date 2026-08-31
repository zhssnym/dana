# 2. The proposed structure

**Status:** revised 2026-08-31 after Hassan's review. This version records his decisions and
is the base for the implementation session.

Section [2.10](#210-problems-and-things-to-watch) lists the problems with these decisions —
including two places where a premise turned out to be wrong. Read it before implementing.

---

## 2.0 The principle everything else follows from

You wrote issue #5 yourself, on 30 August:

> "the whole workflow needs to be loosened up because too much rigidity makes the ai put
> into word games rather than leaving time for actual coding tasks…"

That is correct, and it points at a real failure of the old setup: thirteen personas, a
shared protocol, escalation clauses and a definition of done, all of which an agent had to
read and reason about on every task. The result is an agent spending attention on compliance
instead of on work.

But you also need rules, because Imran's agent must not wander into the backend unnoticed.

**The resolution is not fewer rules or more rules. It is a different *kind* of rule.**

| Rule an agent must interpret | Rule a machine enforces |
| --- | --- |
| "Escalate if the change is significant" | `no-restricted-imports` fails the build |
| "Do not push to main" | Branch protection refuses the push |
| "Stay in your area" | CODEOWNERS requests the owner's review |
| "Use good judgement about the contract" | Six named behaviours always stop; the rest is judged on stated criteria |

The left column costs attention on every task and is obeyed unevenly. The right column costs
nothing to follow and needs no persona text at all.

Your review pushed consistently in this direction — removing folders, merging documents,
using standard patterns instead of invented ones. Everything below reflects that.

---

## 2.1 The repository, top level

```
dana/
├── CLAUDE.md            entry point for agents. Stays here. See 2.6
├── README.md            what Dana is, for a human arriving cold
├── CHANGELOG.md         stays here. Short paragraph per version. See 2.5
├── AGREEMENT.md         the founders' agreement            ← currently untracked
├── CODEOWNERS           who owns what                      ← does not exist yet
├── LICENSE              ownership and terms                ← does not exist yet
├── .claude/             agents and settings. See 2.8
├── .github/
│   ├── workflows/ci.yml
│   ├── ISSUE_TEMPLATE/  ← does not exist yet; issue #5 asks for it
│   └── pull_request_template.md   ← does not exist yet
├── docs/                see 2.2
└── app/                 the application
```

**Removed from the previous draft:** `SESSION-LOG.md` (deleted — see 2.5).

## 2.2 `docs/` — four folders, not six

```
docs/
├── spec/        what Dana does today
├── rfcs/        proposals for big features only
├── workflow/    how we work. See 2.7
└── handoffs/    RARE. Only the ~5% of handoffs too big for an issue body
```

`docs/product/` and `docs/audits/` are **cut**, on your reasoning: *"the repo is not a
scratchpad, it is a codebase"* and *"we do not do hoarding."*

| Folder | Belongs there if… | Owner |
| --- | --- | --- |
| `spec/` | it is **true of the code today** | Hassan |
| `rfcs/` | it is a **big new feature**, not yet built | Hassan writes, Imran decides |
| `workflow/` | it is about **how we work**, not what the product does | Hassan |
| `handoffs/` | it is a handoff **too big for an issue body** — rare | whoever is blocked writes it |

### `spec/` — sections become folders

Each numbered section becomes a folder, so a change to one part of the contract has an
obvious home instead of being an edit buried in a long file.

```
docs/spec/
├── 00-index.md
├── 04-data-model/
│   ├── README.md          the section text
│   └── …                  per-change notes as they arise
├── 07-api/
├── 09-ui/
└── …
```

**Keep the numbers.** They are the addressing system — the application cites the spec by
number roughly 16,400 times and by file path exactly once. `docs/spec/00-index.md:16` already
says "the numbering is the addressing scheme, not the filenames," so the move costs **32
edits and zero test changes**. Renaming `07-api` to `api` would break several thousand
references to buy nothing.

Your instinct about UX and API folders is right — that is exactly what the numbered sections
already are (`07-api`, `09-ui`, `04-data-model`). Keeping the numbers gets you the folders
without the breakage.

**One correction, and it matters for what you do here:** the spec files are *not* too big to
read. All fourteen come to 2,641 lines; the largest is 607. The genuinely unreadable files
are elsewhere — `SESSION-LOG.md` (272 KB), `CHANGELOG.md` (222 KB) and
`docs/rfcs/0005-v2-specification.md` (6,763 lines). So do the folder move because it gives
each change a home, not because an AI is choking on the files. It is not urgent.

### `rfcs/` — big features only

Your rule, written down:

| Size of work | What it needs |
| --- | --- |
| Bug, small change, small feature | A GitHub issue. The agent makes its own short plan and does the work. **No document.** |
| A big new feature — real design decisions, weeks not hours | An RFC first |

That is a real threshold, not a judgement call: **if the work needs decisions that outlive
the branch, it needs an RFC. Otherwise it does not.**

The five existing RFCs are version-shaped (`0004-v2-port-and-build`). New ones are
feature-shaped, with a status line at the top: proposed, accepted, implemented, superseded.

### `handoffs/` — and it may never be created

**Handoffs are GitHub issues, not files.** A GitHub issue has no length limit, so a handoff
with full detail, example payloads and a file list fits in the body. It also has what a folder
does not: notifications, an assignee, an open/closed state, and permanent searchability.

The labels already exist: `handoff-to-backend` and `handoff-to-frontend`.

This folder is for the remaining few per cent — an RFC-scale handoff with diagrams or long
worked examples. Even then the issue is still opened, labelled and assigned; it just points
here.

**So do not create this folder during implementation.** It appears the first time something
genuinely needs it, which may be never. Git does not track empty directories anyway.

**And handoffs are deleted when the work merges** — the issue is closed, and the file, if
there was one, is removed. Git history keeps it. A folder of stale handoffs describing an API
that has since changed is worse than nothing, because someone will eventually read one and
believe it.

Details in [document 4](04-crossing-the-boundary.md).

## 2.3 Prototypes: there are none

Your decision, and I think it is the strongest call in your review:

> "A prototype is better for when you are starting from scratch… Right now we already have a
> working product. He can branch directly from `main` and make changes to the front end. The
> 'prototype' is simply a second branch."

This is right, and it is worth being explicit about *why*, because it removes a whole class
of failure rather than just some files.

The V2 mess happened because a prototype was built somewhere else and then swapped over the
working application. **If there is no separate place to build one, that cannot happen again.**
It is designed out rather than forbidden.

It also removes real weight: `docs/design/` currently holds two complete Vite applications
with **four lockfiles between them** and four duplicate copies of assets that already exist
in `app/src/client/public/`.

So the rule is:

1. **No standalone prototypes.** Branch from `main`, work in `app/src/client/`.
2. **Demos are branches**, named like any other branch. Show them by running the branch.
3. **Merge or delete.** A demo branch either becomes real work or gets closed.

That is just the normal workflow, which is the point — there is nothing new to learn.

## 2.4 Tests — you are already doing the standard thing

You asked the right question, and asked it honestly:

> "If the standard way of doing tests is that the front end gets its own tests inside the
> client folder and the backend gets its own tests inside the server folder, then we will do
> that. However, if… we are just inventing something new… then I do not think we should."

**The standard way is exactly what you described, and this repository already does it.**

Across the JavaScript and TypeScript world the convention is:

- **Unit and component tests sit next to the code they test** — `Button.tsx` beside
  `Button.test.tsx`. This is what Vitest and Jest look for by default.
- **End-to-end tests live in their own folder**, because they run against a built,
  running application rather than against modules. Playwright's own setup creates exactly
  such a folder.

Dana already has 65 co-located tests under `app/src/` and `app/db/` — including some in the
client (`views/`, `parts/`). So co-location is established practice here, not an invention.

**This makes the ownership question answer itself, and more simply than I proposed before.**
If a test sits next to the code it tests, it is owned by whoever owns that code. CODEOWNERS
needs no rules about tests at all:

| Test | Lives | Owner |
| --- | --- | --- |
| Component tests | `app/src/client/**/*.test.tsx` | **Imran** — inherited from `/app/src/client/` |
| Server unit tests | `app/src/server/**/*.test.ts` | Hassan |
| Acceptance suite (`ac-NNN`) | `app/tests/` | Hassan |
| Browser tests | `app/tests/e2e/` | Hassan |

**I was wrong in the previous draft**, where I proposed splitting `app/tests/` by area. Your
"use the standard way" instinct gets there more cleanly: don't split anything, just put new
frontend tests where the standard says they go.

**The gap this fills.** There are currently **zero component tests**, even though five
testing-library and jsdom packages are installed and imported by nothing. That missing layer
is exactly where Imran's agent should work: it can write tests for its own components, in its
own folder, and make its own work green without touching anything of yours.

The `ac-NNN` files stay as they are. `AC-NNN` appears 2,577 times across 194 files outside
`app/tests/`; renaming buys a reader nothing.

## 2.5 `CHANGELOG.md`, and deleting the session log

**`CHANGELOG.md` stays at the repository root.** Your call, and correct — a changelog is a
front-door document.

It needs trimming rather than moving. The `[1.0.0]` block is 207 KB of the 222 KB file — 93%
— and it is not a changelog: it is a decision log of the v1 build with only four category
headings across 3,069 lines. Cut it down to a few paragraphs describing what 1.0.0 was.

Nothing is lost by cutting it, and that is your own principle applied: the full text stays in
git history forever, exactly as you said about deleted audits.

From here, the rule is the one you described: **when the version changes, add a short
paragraph.** Nothing is written per merge. One immediate fix — the file is a release behind:
`v2.2.0` is tagged and shipped while `[Unreleased]` still says "Nothing yet."

**`SESSION-LOG.md` is deleted.** I proposed archiving it; you are right that nothing uses it,
and archiving a file nobody reads is hoarding with extra steps. See
[2.10](#210-problems-and-things-to-watch) for the one cost.

## 2.6 `CLAUDE.md` stays, and keeps the machine knowledge

**You are right, and this corrects my earlier proposal.** I had suggested moving the
environment lore out to `docs/workflow/backend/testing.md`. That was wrong, and the file
itself says why — its own opening states:

> "**What this file owns:** the repository map, this machine's environment and commands, and
> an orientation sketch of the architecture. **Everything else is a pointer.**"

The test-leg failure modes, the port collisions, the `TEST_DATABASE_URL` flip-flops — that is
"this machine's environment" and it belongs exactly where it is. It is also the content
most expensive to relearn, and moving it to a file nothing loads automatically would be the
surest way to lose it.

So `CLAUDE.md` keeps the environment knowledge and loses three things:

1. **The stop instruction at line 19**, which currently tells any agent touching `app/` to
   halt unless it was given `docs/team/_shared-protocol.md` — a file that no longer exists.
   An agent obeying your entry point today refuses to work.
2. **Every dead pointer** — `docs/team/`, `docs/design/`, `docs/learn/`, `docs/operator/`.
3. **The process content**, which moves to `docs/workflow/` and is replaced by a pointer.

One correction to make while editing it: the bullet saying the browser leg needs
`env -u TEST_DATABASE_URL` is **stale**. `playwright.config.ts` has pinned
`TEST_DATABASE_URL: ''` since commit `63ecc34` on 14 August.

## 2.7 `docs/workflow/`

Your structure, adopted as written:

```
docs/workflow/
├── README.md                       the hard rules, about ten lines, then an index
├── how-we-work.md                  issue → branch → PR → review → merge
├── big-features.md                 building both sides at once. Rare — RFC-sized only
├── frontend/
│   ├── README.md                   everything Imran's agent needs, self-contained
│   └── allowed-backend-changes.md  what Imran may change in the backend
└── backend/
    ├── README.md                   everything Hassan's agent needs, self-contained
    └── allowed-frontend-changes.md what Hassan may change in the frontend
```

Seven files. Three changes from the first draft, all yours:

**`how-we-work.md` absorbs the small documents.** Handoff rules and naming and versioning go
inside it unless one of them grows large enough to need its own file. Two files an agent
actually reads beat five it skims.

**No `changelog.md` here.** The rule is two sentences and lives in `how-we-work.md`.

**`big-features.md` is one file, not one per side, and that is deliberate.** It describes a
handshake between two roles, and a handshake written down in two places will eventually be
written down two different ways. On this particular protocol a disagreement between the
copies is a *silent* bug — one file saying Imran may add request schemas and the other saying
he may not produces an API that answers 200 and drops the field. So the sequence lives once,
with each side's part marked, and both side READMEs link to it. Draft in
[document 7](07-big-features.md).

**`allowed-frontend-changes.md` is new, and it is a better idea than what I proposed.** I had
the whitelist running one way, as a constraint on Imran. You made it symmetric:

> "Even as the repo maintainer and main admin, I follow these rules: only small front-end
> changes are allowed for me or the AI… For major changes, hand off the documentation and the
> details to the handoff folder."

That matters for a reason beyond fairness. A rule that binds one person is a leash, and gets
resented and then worked around. A rule that binds both is just how the project works.
It also protects something real: you doing a "quick" frontend fix is how Imran discovers his
own area changed underneath him.

## 2.8 `CODEOWNERS`

You understood exactly what it is for:

> "I do not really want to block something… if he is able to change small stuff and then I
> get a review, that is the best workflow ever."

That is precisely what CODEOWNERS does — it **requests a review**, it does not forbid the
edit. Two things to understand about it here, though.

**One: on this repository it is a map, not a gate — and that is now the intended role.**
CODEOWNERS only blocks a merge when branch protection requires code-owner review, and branch
protection returns `403: "Upgrade to GitHub Pro or make this repository public"`. You settled
that in review by choosing convention over mechanism ([D3](05-open-decisions.md)), so the
file's job is to be **the document each agent reads to learn where the boundary is**, and to
record ownership for a human skimming the repo. That is genuinely useful and worth having.

It may not even auto-request reviews on a free private plan — that feature has historically
been tied to the same paid tiers. Worth a five-minute test (add the file, open a throwaway
PR, see whether a reviewer appears) rather than an assumption either way.

**Warning two: the git history does not support the split you are making.** 941 of 1,021
commits carry a `Co-Authored-By: Claude` trailer, and between 24 and 27 August *every* commit
— `db:`, `server:` and `spec:` included — was authored `mranwafa`. The two names are two
checkouts of the same agent swarm. 284 files carry both identities. So **CODEOWNERS is not
describing a split that exists; it is creating one.** Expect friction rather than
recognition. One number to hold: 22% of client-side commits also touched something outside
the client.

```
# CODEOWNERS
#
# When a pull request changes a file, GitHub asks that file's owner to review it.
# That is ALL this file does. It does not stop anyone editing anything.
# It has teeth only while branch protection requires code-owner review.
#
# THE LAST MATCHING LINE WINS — not the most specific one. Order matters.
#
# Boundaries follow section 5 of AGREEMENT.md.

# Default: anything not claimed below is Hassan's.
*                         @zhssnym

# --- Imran's ground -------------------------------------------------------
# Both names on purpose. With Imran alone, every client fix Hassan makes would
# sit blocked waiting for Imran's approval — and most recent client commits
# were Hassan's. With both names, whoever did not write it can approve it.
# Component tests live in here too, and are owned by this line.
/app/src/client/          @mranwafa @zhssnym

# --- Hassan's ground ------------------------------------------------------
/app/src/server/          @zhssnym
/app/src/shared/          @zhssnym
/app/db/                  @zhssnym
/app/tests/               @zhssnym
/.github/                 @zhssnym
/docs/spec/               @zhssnym
/docs/rfcs/               @zhssnym
/docs/workflow/           @zhssnym
/CODEOWNERS               @zhssnym

# Dependencies: Imran's agent will want UI libraries. That is a bundle-size,
# licence and supply-chain decision, so it comes here.
/app/package.json         @zhssnym
/app/package-lock.json    @zhssnym

# --- Shared ---------------------------------------------------------------
# Rare, and may never exist. Whoever is blocked writes it.
/docs/handoffs/           @mranwafa @zhssnym
```

## 2.9 `.claude/`

```
.claude/
├── settings.json         committed: shared by both machines
├── settings.local.json   gitignored: personal, per-machine
├── agents/
│   ├── frontend.md       Imran's agent
│   ├── backend.md        Hassan's agent
│   └── reviewer.md       the adversarial reader
                          (no memories/ — memory stays per-machine, see P1)
```

**Delete all thirteen personas.** Agreed on both sides. Three facts make it easy:

- They were **never committed on any branch** (`git log --all -- .claude/agents` is empty),
  so Imran has never had them.
- They have no YAML frontmatter, so Claude Code registers none of them. Verified live: in
  the session that produced this report, running from `D:\dana`, the available agent types
  were the six built-ins and not one Dana persona. **Your orchestrator plan does not work
  today, and it fails silently.**
- Nine of them define "done" against `docs/team/_shared-protocol.md`, which is deleted.

Before deleting, harvest the **hazard lists** out of the ten domain personas — the
version-specific traps, the things that bite. That knowledge is real. It goes into the three
new agents or into `docs/workflow/`, per your note.

The three new agents get proper YAML frontmatter so they are actually registered.

`.claude/launch.json` gets deleted or rewritten: six of its eight configurations point at
`docs/design/`, and one has a working directory on **Imran's** machine.

**What is committed:** `agents/` and `settings.json` yes; `settings.local.json` no. Do not use
a blanket `.claude/` ignore — it would hide the one file whose whole job is constraining an
agent nobody can review.

**Memory stays per-machine.** The goal — knowledge both machines share — is real, but
`docs/workflow/` serves it better. Three specific obstacles are recorded in
[2.10](#210-problems-and-things-to-watch).

---

## 2.10 Problems and things to watch

Six things. The first three are real problems with decisions above; the rest are smaller.

### P1 — Shared memory: RESOLVED, memory stays per-machine

You wrote: *"if Claude has the same memory on both my PC and my partner's PC, it will be much
better."* Three obstacles, in order of how much they hurt:

**The setting cannot be shared through the file that would share it.** To point Claude at a
repository folder you set `autoMemoryDirectory`. Put it in `settings.local.json` and it is
gitignored, so Imran does not get it — he has to set it himself. Put it in the committed
`settings.json` and the settings schema says it is *ignored there for security*, though the
code appears to honour it for trusted projects. **That contradiction was not resolved — nobody
ran it.** So the honest plan is: try it in `settings.json`, and if it is ignored, both of you
set it in `settings.local.json` and the workflow documents that as a one-time setup step.

**Two agents writing to one committed folder will conflict.** Memory is written automatically
as you work. If both your Claude and Imran's Claude write to a committed `memories/` folder,
you get merge conflicts in files neither of you wrote, on a branch neither of you was thinking
about. Nothing about memory is designed for two writers.

**One file must not be committed as-is.** Current memory includes `hassan-profile.md`, which
contains private characterisations of Imran and of yourself. Committing memory publishes that
to him and to his agent. Split personal from shared before anything moves.

**Decided: memory stays per-machine.** Knowledge both machines need goes into
`docs/workflow/`, which is reviewed, version-controlled, conflict-free and already in the
plan. Nothing to build in phase 2.3 — leave `autoMemoryDirectory` alone. The three obstacles
above are kept on record in case this is ever revisited.

### P2 — Deleting `SESSION-LOG.md` breaks 31 references

Measured: `SESSION-LOG` is referenced **31 times across 9 files** — including two source
files, `app/src/client/components/page/BlocksEditor.tsx:37` and `app/tests/e2e/harness.ts:525`,
which cite it by row number to explain why code is the way it is.

Deleting the file leaves those comments pointing at nothing.

This is not a reason to keep it — you are right that nobody reads it. But the deletion has a
step attached: fix the two code comments to say the thing directly instead of citing a row.
The other references are in the spec, four RFCs and the changelog, all of which are being
reworked anyway.

### P3 — "AI can generate that backend logic" needs the six always-stop behaviours

In your prototypes note: *"If any major backend work is needed while Imran works on the front
end, AI can even generate that backend logic."*

For **minor** changes that is exactly right, and it is what `allowed-backend-changes.md` is
for. For **major** ones it is the thing that produced the V2 mess — an agent that does not
understand the backend confidently writing backend code, in a pull request where the diff is
mostly frontend and the backend part is easy to skim past.

What keeps those two apart is **not** a judgement about size — a one-line change to an
authorization check is tiny and can expose another person's data. It is the six named
behaviours in [4.2](04-crossing-the-boundary.md), which always stop regardless of size,
because they are the ones where the agent cannot tell it got the change wrong by looking.

Nothing to decide here — just make sure `allowed-backend-changes.md` gets written as those
six behaviours plus stated criteria, rather than as a sentence saying "small changes are
fine."

### P4 — The spec files are not too big

Your reason for foldering `docs/spec/` was that files are too big for an AI to read. They are
not: fourteen files, 2,641 lines total, largest 607.

The move is still worth doing for the reason you gave second — a home for each change — but it
is not urgent, and it should not be prioritised over the boundary work in phase 1. The files
that genuinely are too big are `SESSION-LOG.md`, `CHANGELOG.md`, and RFC 0005 at 6,763 lines,
and all three are already being dealt with.

### P5 — Imran can run the browser tests but cannot edit them

Under 2.4, `app/tests/e2e/` stays yours. Those 110 specs assert how the interface behaves, so
Imran's changes will break them sometimes.

Usually that is fine — the fix is in his own client code, and he *can* run the browser leg
locally (it needs one browser download). It only becomes a handoff when the **test itself** is
what needs updating, because the intended behaviour changed.

Worth watching for a few weeks. If it turns into a handoff every time, moving the
appearance-only specs to Imran is the next move. Do not do it pre-emptively.

### P6 — The code READMEs: keep them, trim them

You left this to me, so: **keep them as files, do not convert them to comments.**

They describe how a *folder* fits together, and a comment can only live in one file, so
converting them means either picking an arbitrary host file or scattering the explanation.
A README beside code is also a standard, well-understood pattern.

But they are too long — 3,200 lines across five files, with `app/src/client/README.md` alone
at 1,143. Much of that is build-era narrative, and they hold a good share of the dead
`docs/design/` and `docs/team/` references. Trim them hard when fixing those references, and
hold them to one rule:

> **`docs/workflow/` says how we work. A README next to code says how that code works.**

`app/src/client/README.md` sits inside Imran's area, so he ends up owning the document that
explains his own folder. That is the right outcome.

---

## 2.11 What changed in this revision

| Item | Before | Now |
| --- | --- | --- |
| `docs/product/` | proposed | **cut** — the repo is not a scratchpad |
| `docs/audits/` | proposed | **cut** — no hoarding; git history holds it |
| Prototypes | a folder | **branches from `main`** — designs out the V2 failure |
| `SESSION-LOG.md` | archive it | **delete it** (see P2) |
| `CHANGELOG.md` | move the bulk out | **stays at root, trimmed hard** |
| Environment lore | move to `workflow/backend/testing.md` | **stays in `CLAUDE.md`** — my error |
| `app/tests/` split by area | proposed | **not needed** — co-location is the standard, and already in use |
| `workflow/` files | 8 | **6**, with the small ones absorbed |
| `allowed-frontend-changes.md` | not proposed | **added** — the rule binds both of you |
| `.claude/memories/` | not proposed | **added, with warnings** (see P1) |
| Backend "do not touch" rule | a file blacklist | **six behaviours that always stop, then stated criteria** — files are not blocked |
| Handoffs | issue + folder for large ones | **GitHub issues, ~95% with no file at all**; folder created only if ever needed |
| Finished handoffs | kept as a record | **deleted** — issue closed, file removed |
| Branch lifetime | short-lived, a week | **as long as the work is active**; the test is activity, not age |
| `docs/workflow/big-features.md` | not proposed | **added** — the parallel RFC process ([doc 7](07-big-features.md)) |

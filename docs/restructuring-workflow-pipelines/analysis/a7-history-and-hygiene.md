# A7 — History and repository hygiene

Read-only analysis of `D:\dana` on 2026-08-31, branch `pipelines` (identical to
`main`: `git log --oneline main..pipelines` is empty). Every number below comes
from a command run against this repository or from the GitHub API as `zhssnym`.
Nothing was changed except this file.

---

## 0. The one thing to read first

**The git author field in this repository records which machine a session ran
on, not who wrote the code.** Everything in question 1 depends on this, so it
goes first.

```
$ git log --all --pretty=format:'%b' | grep -ci 'Co-Authored-By: Claude'
941        # of 1021 commits (92%)
```

```
$ git log --no-merges --since=2026-08-20 --pretty=format:'%ad %an' --date=short | sort | uniq -c
      2 2026-08-23 mranwafa
     57 2026-08-24 mranwafa
     86 2026-08-25 mranwafa
      1 2026-08-25 zhssnym
     61 2026-08-26 mranwafa
     47 2026-08-27 mranwafa
     63 2026-08-30 zhssnym
      5 2026-08-31 zhssnym
```

For four straight days every commit in the repository was authored `mranwafa`.
Their subject-line prefixes for 2026-08-26 alone:

```
     21 client      13 spec       6 tests      5 log       5 docs
      2 criteria     1 server     1 plan       1 parity    1 db
```

`spec:`, `server:`, `db:` and `tests:` commits under Imran's identity. One of
them is `bbaa6ac db: 0005, the ruled schema, expand-only and data-free`, whose
body opens "Persona 01" and closes with `Co-Authored-By: Claude Opus 5`. Then on
2026-08-30 the identity flips and 68 commits, including every one of the last 20
client commits, are authored `zhssnym`.

So the two names are **two checkouts of the same agent swarm**, not two people
writing two halves. This does not make the numbers useless — a checkout is a
person's machine, and it tells you where each person's sessions have been
allowed to reach — but you cannot read "Imran touched 46 server files" as
"Imran wrote server code". Read it as "sessions launched from Imran's machine
were pointed at the server 46 times."

That distinction changes what CODEOWNERS is for. It is not being introduced to
describe a split that already exists. It is being introduced to **create** one.

---

## 1. Who actually worked where

### Raw totals

```
$ git shortlog -sne --all
   618  zhssnym <hassan.k.shahir@gmail.com>
   403  mranwafa <imranullah.wafa@gmail.com>
```

1021 commits, 2026-07-29 to 2026-08-31. 912 non-merge, 109 merges.

### File-touches by ownership zone

A "touch" is one file appearing in one non-merge commit. Merges are excluded by
`git log --name-only`, so nothing is double-counted.

```
$ git log --author=<name> --name-only --pretty=format: | grep -v '^$' | <bucket by path>
```

| Zone | Hassan | Imran |
| - | -: | -: |
| `app/tests/` | 633 | 226 |
| `app/src/client/` | 571 | 464 |
| `docs/` | 513 | 786 |
| `app/src/server/` | 236 | 107 |
| repo root files | 190 | 84 |
| `app/` config files | 69 | 24 |
| `dana-reports/` | 54 | 1 |
| `app/src/shared/` | 54 | 29 |
| `app/db/` | 25 | 9 |
| `.github/` | 5 | 1 |
| `.claude/` | 2 | 7 |

There is no zone that belongs to one identity. Even `app/db/` — hand-written
SQL migrations, the most "backend" thing in the repository — has nine touches
from Imran's machine.

### Inside `docs/`, the split is real

| Path | files | Hassan | Imran |
| - | -: | -: | -: |
| `docs/design` | 270 | 125 | **615** |
| `docs/spec` | 14 | **167** | 53 |
| `docs/team` | 15 | **63** | 1 |
| `docs/rfcs` | 6 | 70 | 99 |
| `docs/operator` | 5 | 32 | 8 |
| `docs/parity` | 4 | 3 | 9 |
| `docs/ux` | 10 | 10 | 0 |

`docs/design` is the one directory in the repository that is genuinely lopsided
toward Imran, 5:1. `docs/spec` and `docs/team` are lopsided toward Hassan.
Handing all of `docs/` to Hassan, as the new workflow proposes, would put a rule
over the one place the numbers say is Imran's.

### The overlap — where the boundary will hurt

```
distinct files touched by Imran : 654
distinct files touched by Hassan: 857
touched by BOTH                 : 284
Imran only                      : 370
Hassan only                     : 573
```

Restricted to files still tracked in `HEAD` — 270 contested files:

| Zone | tracked | Hassan touched | Imran touched | **both** | both as % of zone |
| - | -: | -: | -: | -: | -: |
| `app/src/client/` | 214 | 170 | 160 | **116** | **54%** |
| `app/src/server/` | 127 | 106 | 67 | **46** | **36%** |
| `app/tests/e2e/` | 110 | 87 | 59 | **38** | 35% |
| `app/tests/` (vitest) | 229 | 175 | 75 | **21** | 9% |
| `app/src/shared/` | 27 | 23 | 15 | **11** | **41%** |
| `app/db/` | 14 | 11 | 5 | **2** | 14% |
| `docs/` | 325 | 127 | 221 | 23 | 7% |

**More than half of the client is contested, and more than a third of the server
is.** Inside `app/src/client/` there is no sub-directory that is clean either
way:

| Path | files | H-touch | I-touch |
| - | -: | -: | -: |
| `components` | 87 | 207 | 166 |
| `pages` | 24 | 127 | 78 |
| `shell` | 16 | 54 | **66** |
| `lib` | 29 | 38 | 38 |
| `api` | 7 | 29 | 19 |
| `views` | 14 | 12 | **47** |
| `parts` | 7 | 25 | 22 |
| `screens` | 4 | 13 | 2 |
| `styles` | 1 | 12 | 1 |

The 46 server files Imran's machine has edited include `routes/tasks.ts`,
`routes/folders.ts`, `domain/tasks.ts`, `domain/folders.ts`, `auth/router.ts`,
`scheduler/pass.ts`, `notify/templates.ts` and `index.ts` — the load-bearing
middle of the API, not the edges. In `app/db/` it reached three migrations
(`0003`, `0004`, `0005`), the migration journal, and `constraint-catalog.ts`.
It has also edited `app/.env`, `app/package.json`, `app/vite.config.ts` and
`app/playwright.config.ts`.

### The number that predicts the friction

How often does a commit that touches the client also have to touch something
else in `app/`?

```
author     client-touching commits   also touched app/ outside client
mranwafa            76                        17  (22%)
zhssnym             92                        29  (32%)
```

**Roughly one client change in four cannot stay inside the client.** That is the
rate at which the new boundary will produce a blocked PR, an issue handed
across, or a rule quietly ignored. It is not a reason to skip the boundary. It
is the number to design the hand-off around.

### The trend nobody has noticed

Every one of the last 20 commits touching `app/src/client/` is authored
`zhssnym`, dated 2026-08-30 and 2026-08-31. "The client is Imran's" is a plan
for the future, not a description of the last two days.

---

## 2. How work actually flowed

### `main` grew by direct commit, almost entirely

```
$ git rev-list --count --first-parent main
207
$ git log --first-parent main --pretty=format:'%an|%p' | <classify merge vs direct>
  186  zhssnym DIRECT
   14  zhssnym MERGE
    7  mranwafa MERGE
```

**186 of 207 commits on `main` were pushed straight to it, all under Hassan's
identity. Zero direct commits to `main` under Imran's identity.** The seven
merges authored `mranwafa` are six GitHub PR merges (`Merge pull request #1`
through `#6`, 2026-08-14 to 08-16) and one local merge,
`f097b8e merge: v2 to production, the whole of RFC 0005 built by S0 to S14`,
2026-08-25.

That last one matters: it is a merge into `main` made locally and pushed from
Imran's checkout. **The "Imran never pushes to main" rule has already been
broken once, six days ago.** Not maliciously — it was the release merge for a
package his machine had built — but the platform allowed it, and it will allow
it again.

### The branch shapes

```
$ git log --all --merges --pretty=format:'%s' | grep -oE "Merge branch '[^']+'" | sort | uniq -c
      4 v2-build
      3 main
     10 worktree-agent-<16 hex chars>   (ten distinct ones)
      1 claude/rfc-0002-spec-fold

$ git log --all --merges --pretty=format:'%an' | sort | uniq -c
     65 mranwafa
     44 zhssnym
```

Three eras, visible in the shape:

1. **2026-07-29 to 2026-08-13** — no branches. 186 commits straight onto `main`,
   one package at a time (`P0` … `P8`), with occasional
   `merge p8-client: package P8 of RFC 0001` style merges of a package branch.
2. **2026-08-14 to 08-16** — six pull requests, from branches named
   `codex/p9-hardening`, `p10-release`, `claude/vision-doc`. All opened in a
   *different repository* (see below) and merged by Imran.
3. **2026-08-23 to 08-31** — a long-lived `v2-build` integration branch, with
   per-session branches (`s10-interaction`, `s11-interaction`, `s29a-lift`,
   `polish-round-2`, `ui-polish`) and ten `worktree-agent-<hash>` branches
   merged in. `v2-build` merged into `main` four times. This is a swarm
   pattern: many parallel agents, each on its own worktree, integrated by a
   steward.

65 of the 109 merges were made from Imran's checkout — his machine was doing
most of the integration during era 3.

### Reverts

No `git revert` commits exist anywhere in history. Two manual reversals do:

```
4205c79 mranwafa 2026-08-18 design: revert the shell port, leaving the lab as the single source
74e6436 mranwafa 2026-08-18 design: reverse the shell sweep at Imran's direction
```

Both are in `docs/design`, both undo a prototype that had been swept into the
app. This is the "bolted on and swapped over" pattern in the record.

### Force pushes — partially unverifiable

`main`'s reflog holds only four entries and `.git/logs/HEAD` starts on
2026-08-28, because **this clone is three days old**. Within that window there
are no forced updates: every `origin/main` entry reads `update by push` and
every `main` entry is a fast-forward merge or a commit.

```
$ git reflog show origin/main
9a22b77 origin/main@{0}: update by push
fa86fc5 origin/main@{1}: update by push
589912b origin/main@{2}: update by push
eb5b0cf origin/main@{3}: update by push
f097b8e origin/main@{4}: update by push
```

Anything before 2026-08-28 is invisible from here. There *is* circumstantial
evidence of caution around history: a tag `backup/pre-p10-live-2026-08-14`
exists, pointing at `4439af6` on `main`. `git fsck` reports a handful of
dangling commits and trees, which is normal after merges and amends and is not
evidence of a rewrite.

### The repository moved

```
$ git remote -v
origin  git@github.com:zhssnym/dana.git
$ gh api repos/zhssnym/dana --jq .created_at
"2026-08-30T08:27:21Z"
$ gh api repos/dev-dana/dana
HTTP 404 Not Found
```

The current repository was **created two days ago**. PRs #1–#6 were merged from
branches prefixed `dev-dana/`, so they lived in a `dev-dana` repository that is
now gone or invisible to this token. The commit
`eb5b0cf docs: point the build-pace audit at the repo's new home` confirms a
move. Consequence: **`zhssnym/dana` has zero pull requests in its own history**
(`gh api repos/zhssnym/dana/pulls?state=all` returns an empty list). The PR
workflow you are about to adopt has never actually run in this repository.

Issue numbering starts at #5; #1–#4 return 404. Probably the four issues or PRs
that were not carried across in the move. Unverified.

---

## 3. Repository hygiene, current state

### The absences, verified

Checked twice: against the current tree and against the entire history.

```
$ git ls-files | grep -i <pattern> | wc -l                                            # now
$ git log --all --name-only --pretty=format: | sort -u | grep -i <pattern> | wc -l    # ever
```

| File | tracked now | ever in history |
| - | -: | -: |
| `LICENSE` / `COPYING` | 0 | 0 |
| `CODEOWNERS` | 0 | 0 |
| `PULL_REQUEST_TEMPLATE` | 0 | 0 |
| `ISSUE_TEMPLATE` | 0 | 0 |
| `CONTRIBUTING` | 0 | — |
| `SECURITY.md` | 0 | — |
| `dependabot.yml` | 0 | — |

All confirmed absent, and none has ever existed. `.github/` contains exactly one
tracked file: `.github/workflows/ci.yml`.

### `.gitignore`

```
node_modules/
.next/
.data/
dist/
test-results/
playwright-report/
desktop.ini
Thumbs.db
.DS_Store
*.tsbuildinfo
```

Correct as far as it goes, with two gaps.

**Gap 1 — nothing ignores env files any more.** It used to:

```
$ git show bd4ebba:.gitignore | grep -n env
13:.env*
14:!.env.example
```

`e12e7ac chore: track app/.env on the owner's ruling` deleted **both** lines.
The ruling was about `app/.env` specifically, but the fix removed the whole
class. A future `.env.local`, `.env.production` or `app/.env.render` is now
committable by accident, with no warning. The narrower change would have been to
keep `.env*` / `!.env.example` and add `!app/.env`.

**Gap 2 — no `.vscode/`, no `.idea/`.** `.vscode/` exists on disk right now,
untracked. `.claude/launch.json` *is* tracked and is per-machine editor
configuration; it contains a hard-coded path from Imran's machine:

```
"cwd": "C:\\Users\\imran\\OneDrive\\Documents\\ChatGPT\\Dana App\\.work\\hassan-repo-audit/app"
```

Harmless, but it is one person's local path shipped to the other, and it will
never be correct for anyone else.

### `.gitattributes`

```
* text=auto eol=lf
*.png binary   *.jpg binary   *.jpeg binary   *.gif binary
*.ico binary   *.pdf binary   *.woff binary   *.woff2 binary
```

Right for this project. `eol=lf` matters — two Windows machines and a Windows CI
runner — and the binary list covers every binary type actually tracked. `*.svg`
is treated as text, which is correct: SVGs are text and diffing them is useful.

Worth adding, optional: `app/package-lock.json linguist-generated=true` and the
same for the prototype lockfiles, so GitHub collapses them in PR diffs. Cosmetic
only.

### What is tracked that probably should not be

```
$ git ls-files | wc -l
1126
$ git count-objects -vH
size-pack: 20.21 MiB
```

The repository is small and healthy. No file over 520 KB is tracked. The single
biggest object ever committed was a 2.6 MB PNG
(`docs/design/prototype-v2/public/travel-route-editorial.png`), since deleted.
No `git gc` or history surgery is warranted.

Tracked bytes by area:

```
   8142 KB   737 files  app
   4405 KB    99 files  docs (rest)
   3429 KB    54 files  dana-reports              <- 54 PNG screenshots
   3240 KB   156 files  docs/design/prototype-v2  <- a whole second Vite app
    810 KB    70 files  docs/design/prototype     <- and a third
    266 KB     1 file   SESSION-LOG.md
    217 KB     1 file   CHANGELOG.md
```

Three things stand out.

**Two complete Vite applications live under `docs/design/`.** Each has its own
`package.json`, its own `.gitignore`, and — this is the actual problem — **two
lockfiles each**:

```
docs/design/prototype-v2/package-lock.json
docs/design/prototype-v2/pnpm-lock.yaml
docs/design/prototype/package-lock.json
docs/design/prototype/pnpm-lock.yaml
```

npm and pnpm lockfiles for the same project, both committed, both stale relative
to each other. Whichever one a session picks it gets a different tree. These are
the prototypes the brief describes as having been "bolted onto or swapped over
the real app", and they are still sitting in the repository as live, installable,
runnable code. That is exactly the shape that invites the next accidental sweep.

**Four asset files are byte-identical duplicates** across the prototype and the
real app (verified by comparing blob hashes, not names):

```
IDENTICAL  dana-mark.svg
IDENTICAL  dana-product-collaboration.png
IDENTICAL  dana-product-travel.png
IDENTICAL  google-g.svg
```

`app/src/client/public/` and `docs/design/prototype-v2/public/` hold the same
bytes under the same names. Nothing tells you which is the source. Change one
and the drift is silent.

**`dana-reports/` is 3.4 MB of screenshots** from past audit runs, 49 PNGs.
Point-in-time evidence, not living documentation.

None of this is urgent. All of it is worth a decision now that the restructure is
happening, because after CODEOWNERS lands each of these directories needs an
owner and none of them obviously has one.

### `agreement.md` is not in git

```
$ git ls-files agreement.md
(nothing)
```

The founders' agreement — the document the whole restructure derives from — is
untracked. Sitting on one disk, in one place. It should be committed.

### The working tree, right now

At the moment I ran this, `git status` showed **360 unstaged deletions**:

```
    269 docs/design      49 dana-reports/shots      15 docs/team
     10 docs/ux           5 docs/operator            4 docs/parity
      1 docs/security     1 AGENTS.md                5 dana-reports/*.md
```

plus a modified `app/index.html`. This is another session's in-flight
restructuring, not committed. Flagging it because of the known hazard in
`CLAUDE.md`: two sessions in `D:\dana` share one index, and a `git commit -a`
from any of them sweeps all 360 deletions into whatever is being committed.
Stage with an explicit pathspec until that work settles.

### CI

`.github/workflows/ci.yml` — one workflow, one job (`ci`), seven named steps:
Install, Lint, Typecheck, Test on PGlite, Test on a real Postgres 18, Build,
Playwright. Runs on `[self-hosted, windows, x64]`.

```
on:
  push:
  workflow_dispatch:
```

**There is no `pull_request` trigger.** Today that is fine — `push:` fires on
every branch and the check attaches to the head commit, which a PR shows. It
stops being fine in two cases: if anyone ever works from a fork (a fork's pushes
do not run this repo's workflows), and if the base branch moves after the head
was tested (there is no merge-commit run). If you turn on required status checks,
add `pull_request:` alongside `push:`, and expect two runs per push on a PR
branch unless you filter.

---

## 4. The committed `app/.env`

### What the decision was

```
e12e7ac zhssnym 2026-08-25 chore: track app/.env on the owner's ruling, and say why in CLAUDE.md
```

The commit body states it plainly, including the cost: "the repository's privacy
becomes the only control over live credentials, so it stays private and anything
that leaves it is rotated." The reasoning was sound for two collaborators who
both already had the credentials.

### What is actually in the file

Thirteen keys. By category, with values checked for emptiness but never read:

| Category | Keys | State |
| - | - | - |
| **Live secret** | `GOOGLE_CLIENT_SECRET` | **populated, 35 chars** |
| Public identifier | `GOOGLE_CLIENT_ID` | populated, 72 chars — not secret, it ships to the browser |
| Non-secret config | `PORT`, `NODE_ENV`, `APP_ORIGIN`, `GOOGLE_ISSUER_URL`, `DANA_DEV_LOGIN` | populated |
| Deliberately empty | `DATABASE_URL`, `TEST_DATABASE_URL`, `OIDC_ALLOW_INSECURE` | empty |
| Empty but *would* be secret | `RESEND_API_KEY`, `SCHEDULER_HEARTBEAT_URL`, `RESEND_FROM` | empty today |

**The exposure is one secret, not thirteen.** A repository-wide scan for
secret-shaped strings finds exactly one file, in the current tree and across all
1021 commits:

```
$ git grep -IlE 'GOCSPX-|ghp_|github_pat_|AKIA[0-9A-Z]{16}|BEGIN .*PRIVATE KEY|xox[baprs]-' \
    $(git rev-list --all --max-count=400)
app/.env
```

And it has had one value the whole time — never rotated, so there is no second
secret buried in an old commit:

```
$ for c in $(git log --format=%H -- app/.env); do
    git show "$c:app/.env" | grep '^GOOGLE_CLIENT_SECRET=' | cut -d= -f2- | md5sum
  done | sort | uniq -c
      1 6aa284b4...      # one distinct value
```

Two smaller facts. The file's own first line says
`# Local development only. Gitignored, never committed.` — now false. And
`app/.env.example` documents **twenty** keys against the `.env`'s thirteen:
Sentry, Axiom and `DANA_FILES_DIR` are in the template and absent from the
working config.

### What changes under the new workflow

Nothing about the file. Everything about who reads it.

Today: two people, both of whom set up that OAuth client together.

Under the new workflow: Imran's agent gets read access to the whole repository on
every task, including tasks that have nothing to do with authentication.
Concretely — the Google client secret is in the context window of a model
provider on every frontend issue, it is on the disk of whatever machine that
agent runs on, and it can travel into whatever the agent writes: a scratch file,
a pasted log, a bug report, a PR body. Without anyone deciding that it should.

The other change is that the blast radius grew. When the ruling was made the app
was pre-release. It is now deployed on Render with real Google sign-in. That
secret plus the client ID lets someone exchange authorization codes against your
OAuth client. It does not by itself open your database or your users' Google
accounts, and Google's redirect-URI allowlist limits where a code can be sent —
but it is a live production credential, and "the repository stays private" is now
protecting it against a wider set of readers than it was designed for.

### Options

**A. Leave it exactly as is.** Zero work. Defensible if you judge Imran's machine
and his agent provider as trusted as your own — he is a 50% owner and could ask
you for the secret at any time. The risk is not "Imran"; it is the surface area,
which is now several machines and a model provider instead of two laptops.

**B. Blank the one secret, keep the file.** Change
`GOOGLE_CLIENT_SECRET=<value>` to `GOOGLE_CLIENT_SECRET=` and commit. The other
twelve keys stay, so the "one shared working config" benefit that motivated the
ruling survives almost entirely — a new machine still gets the port, the origin,
the issuer, the dev-login flag, all of it. What breaks: real Google sign-in stops
working locally until someone pastes the secret in by hand. What replaces it:
`DANA_DEV_LOGIN=1` already exists precisely so a session without Google
credentials can sign in, and it is already set in the committed file. **This is
the cheapest option that actually changes anything, and it costs one line.**

**C. Untrack the file, restore the ignore rules, keep `.env.example` as the
contract.** The orthodox answer. Reverses a deliberate ruling, reintroduces the
exact failure the ruling was made to stop (`e12e7ac`'s body records it: switching
branches deleted the operator's own `.env` from disk), and buys little over B
given that twelve of the thirteen keys are not secrets.

**D. B or C, *and* rotate the secret in the Google Cloud console.** The value is
in git history and will stay there whatever you do to the working tree. If you
want it to stop being a live credential, rotation is the only move. Rotating a
Google OAuth client secret is a two-minute job in the console plus one update in
Render's environment panel. Nothing in the app breaks — the client ID does not
change, so no redirect URIs move.

My read: **B + D.** Blank it, rotate it, keep the file. You keep the benefit the
ruling was chasing, you take the one credential out of a widening blast radius,
and it costs a commit and a console visit. Then put the `.env*` /
`!.env.example` lines back with an `!app/.env` exception, so the *class* is
ignored again — that gap is the part that will bite you later, when someone adds
`.env.production`.

---

## 5. CODEOWNERS

### What it actually does

Three sentences, because it is routinely over-trusted:

1. When a pull request changes a file, GitHub looks up that file's owner and
   **automatically requests a review from them**. That is the whole mechanism.
2. It does **not** stop anyone from editing any file, opening a PR against any
   file, pushing to any branch, or merging. Imran with write access can edit
   `app/db/migrations/` today and can still do it after CODEOWNERS lands.
3. It only acquires teeth when branch protection turns on **"Require review from
   Code Owners"**. Without that, it is a notification system and a comment.

Four more details that matter in practice:

- **The last matching line wins.** Not the most specific — the last. Order is
  everything.
- **A PR author cannot approve their own PR.** So listing two owners on a path
  means "whoever did not write it must approve", which is usually what you want.
- **Listing two owners requires only one of them to approve**, not both.
  CODEOWNERS cannot express "both must sign off."
- **A repo admin can dismiss all of it** unless branch protection has "Do not
  allow bypassing the above settings" ticked. That asymmetry is useful here — it
  makes the rule hard for Imran and a speed bump for you — but be honest with
  yourself that it is what you are choosing.

The file must live at the repository root, in `.github/`, or in `docs/`. Section
5 of the agreement says root, so root.

### Proposed content

```
# CODEOWNERS
#
# When a pull request changes a file, GitHub requests a review from that file's
# owner. That is all this file does. It does not prevent anyone from editing
# anything. It has teeth only while branch protection requires code-owner
# review on main.
#
# THE LAST MATCHING LINE WINS. Not the most specific one. Order matters.
# A leading / anchors at the repository root. A trailing / matches everything
# inside the directory.
#
# Boundaries follow section 5 of agreement.md.


# --------------------------------------------------------------------------
# Default. Anything not claimed below belongs to Hassan.
# --------------------------------------------------------------------------
*                              @zhssnym


# --------------------------------------------------------------------------
# Imran's ground.
# --------------------------------------------------------------------------

# What the user sees. Both names on purpose: with Imran alone, every client
# fix Hassan makes would sit blocked waiting for Imran's approval, and all 20
# of the most recent client commits were Hassan's. With both names, whoever
# did not write the PR can approve it.
/app/src/client/               @mranwafa @zhssnym

# Design material, prototypes, visual direction. 615 touches from Imran's
# machine against 125 from Hassan's - the one directory the history says is
# genuinely his.
/docs/design/                  @mranwafa @zhssnym


# --------------------------------------------------------------------------
# Hassan's ground. Redundant with the `*` line today. They stop being
# redundant the moment anyone adds a broader rule above them, which is the
# whole reason to write them down.
# --------------------------------------------------------------------------
/app/src/server/               @zhssnym
/app/db/                       @zhssnym
/app/tests/                    @zhssnym
/.github/                      @zhssnym
/docs/spec/                    @zhssnym
/docs/rfcs/                    @zhssnym
/docs/team/                    @zhssnym
/docs/operator/                @zhssnym


# --------------------------------------------------------------------------
# The contested middle. Every line below is a file where a client change and
# a server change meet. Each one is Hassan's deliberately.
# --------------------------------------------------------------------------

# The API contract. 55 client files and 45 server files import from it, and
# 11 of its 27 files have been edited from both machines. Reading it is free
# and constant; only editing it asks for a review.
/app/src/shared/               @zhssnym

# Dependencies. Imran's agent will want to add UI libraries. That is a bundle
# size, licence and supply-chain decision, so it comes here.
/app/package.json              @zhssnym
/app/package-lock.json         @zhssnym

# Build, type and test configuration. Imran's machine has touched none of
# these: 0 of 24 recorded touches across the tsconfigs, eslint, vitest and
# index.html. Codifying what is already true costs nothing.
/app/tsconfig*.json            @zhssnym
/app/eslint.config.ts          @zhssnym
/app/vitest.config.ts          @zhssnym
/app/index.html                @zhssnym

# These two are 4:2 and 2:2 Hassan:Imran. Not clean, but they decide how the
# client is built and how the browser leg runs, so they sit on this side.
/app/vite.config.ts            @zhssnym
/app/playwright.config.ts      @zhssnym

# The one file in the repository holding a live credential, and its template.
/app/.env                      @zhssnym
/app/.env.example              @zhssnym

# Repository-level rules. Changing these changes how both of us work.
/CLAUDE.md                     @zhssnym
/AGENTS.md                     @zhssnym
/.gitignore                    @zhssnym
/.gitattributes                @zhssnym
/.nvmrc                        @zhssnym
/CODEOWNERS                    @zhssnym


# --------------------------------------------------------------------------
# Joint. Two names here means "whichever of us did not write the change must
# approve it" - GitHub needs only one owner's approval, and a PR author
# cannot approve their own PR. It does NOT mean both must sign off; no
# CODEOWNERS rule can say that.
# --------------------------------------------------------------------------
/agreement.md                  @zhssnym @mranwafa
/LICENSE                       @zhssnym @mranwafa
/README.md                     @zhssnym @mranwafa
```

### Three things to decide before this lands

**`docs/design/` conflicts with the plan.** The brief says all of `docs/` goes to
Hassan. The history says `docs/design/` is Imran's by 5:1. I have written it as
joint. If you want it all yours, delete that line — but then Imran needs your
review to change his own design notes, and that rule will be the first one
ignored.

**Paths may be about to move.** 360 deletions are sitting uncommitted in the
working tree, most of them under `docs/design` and `docs/team`. Re-check every
path in this file against the tree after that restructure lands. A CODEOWNERS
line that matches nothing fails silently — GitHub does not warn you.

**Two prototype apps and `dana-reports/` have no owner here** beyond the `*`
default. If they survive the restructure they should get an explicit line.

---

## 6. Branch protection — what I verified and what I could not

### Verified, from the GitHub API as `zhssnym`

```
$ gh api repos/zhssnym/dana
{"full_name":"zhssnym/dana","private":true,"visibility":"private",
 "default_branch":"main","fork":false,"owner_type":"User",
 "created_at":"2026-08-30T08:27:21Z","archived":false,
 "allow_squash_merge":true,"allow_merge_commit":true,"allow_rebase_merge":true,
 "allow_auto_merge":false,"delete_branch_on_merge":true,
 "has_issues":true,"web_commit_signoff_required":false}
```

| Question | Answer | How |
| - | - | - |
| Default branch | `main` | `gh api repos/zhssnym/dana --jq .default_branch` |
| Is `main` protected? | **No** | `gh api .../branches/main --jq .protected` → `false` |
| Are PRs required? | **No** | follows from the above |
| Branch protection rules | **Cannot exist on this plan** | see below |
| Rulesets | **Cannot exist on this plan** | see below |
| Do `frontend` / `backend` labels exist? | **Yes, both** | `gh api .../labels` |
| Imran's permission | **write** (`push: true`, `admin: false`) | `gh api .../collaborators` |
| Branches on the remote | exactly one, `main`, unprotected | `gh api .../branches` |
| PRs in this repo | **zero, ever** | `gh api '.../pulls?state=all'` |

The plan question is answered by GitHub itself, not by me guessing:

```
$ gh api repos/zhssnym/dana/branches/main/protection
{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.",
 "status":"403"}

$ gh api repos/zhssnym/dana/rulesets
{"message":"Upgrade to GitHub Pro or make this repository public to enable this feature.",
 "status":"403"}
```

**Both branch protection and rulesets are unavailable on this repository right
now.** Not "not configured" — not reachable by configuration at all. The token
has `repo` scope and `admin: true` on the repository, so this is a plan limit,
not a permissions problem.

Collaborators, in full:

```
zhssnym   role_name=admin   {admin:true,  maintain:true,  push:true, triage:true, pull:true}
mranwafa  role_name=write   {admin:false, maintain:false, push:true, triage:true, pull:true}
```

Labels present: `backend` (#b60205, "Work related to backend."), `frontend`
(#4e1dc1, "Work related to frontend."), plus `bug`, `documentation`, `duplicate`,
`enhancement`, `invalid`, `question`, `wontfix`. The two GitHub defaults
`good first issue` and `help wanted` have been removed.

Nine issues exist, #5 to #13, and they are already being labelled the new way:

```
#13 [open]   zhssnym  [bug,backend]                profile picture routers not working as expected
#12 [open]   zhssnym  [enhancement,frontend]       sidebar collapsed version not aligned
#11 [closed] mranwafa [frontend]                   Dana v2.0 does not match Prototype v2 ...
#10 [closed] zhssnym  [enhancement,frontend]       profile icons
 #9 [closed] zhssnym  [enhancement,frontend]       dark mode compatability is clunky
 #8 [closed] zhssnym  [enhancement,frontend]       pwa install is useless
 #7 [closed] zhssnym  [enhancement,frontend]       side ui is just duplication ?
 #6 [open]   zhssnym  [bug,backend]                cookies not storing ?
 #5 [open]   zhssnym  [documentation,enhancement]  workflow: to much rigidity
```

### So, as of today

**"Imran never pushes to main" is a promise, not a rule.** He has write access,
`main` is unprotected, GitHub will not stop him, and he has already merged into
`main` once (`f097b8e`, 2026-08-25).

### How to make it a rule the platform enforces

Four options. The first two are the real ones.

**Option 1 — GitHub Pro on the `zhssnym` account.** Roughly $4/month. The API
message names it explicitly, so this is verified to unlock the feature, not
assumed. Pro applies to the account, and the repository is user-owned by
`zhssnym`, so it must be *your* account that upgrades. Then, on `main`:

- Require a pull request before merging — 1 approval.
- Require review from Code Owners. *(This is the switch that gives CODEOWNERS
  teeth. Without it the file is a comment.)*
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass — select the check named `ci`. Add
  `pull_request:` to the workflow's `on:` block first, or the check may not
  appear against the merge commit.
- Require branches to be up to date before merging.
- Block force pushes to `main`. Block deletions of `main`.
- Leave **"Do not allow bypassing the above settings" OFF.** Then Imran is
  hard-blocked and you keep an admin override for a production incident. Tick it
  only if you want the rule to bind you too.

Financing is Imran's call under section 3 of the agreement, and $4/month for the
thing that makes his own "Imran does not push to main" commitment real is an easy
conversation.

**Option 2 — drop Imran to `read` and use a fork.** Free, and platform-enforced
today with no upgrade. With `read` he cannot push a branch anywhere in the
repository; he forks, pushes to his fork, and opens a PR. You merge. Costs: his
branches no longer live in the shared repo, and — importantly — **your
self-hosted CI will not run on his PRs.** The workflow triggers on `push:`, and a
push to a fork does not run the base repo's workflows. You would have to add
`pull_request:` and approve each fork run manually, and a self-hosted runner
executing code from a fork is a real security consideration on any machine that
holds your credentials. I would not recommend this one for you specifically,
because the runner is your own Windows box.

**Option 3 — move the repository into a GitHub Organization.** *Unverified.* I
cannot test it without creating an org, and I did not. Org-owned private repos on
the Free plan have historically also lacked protected branches; GitHub has
changed ruleset availability more than once and I will not guess at today's state.
If you want to check it, create a throwaway free org, push a private repo, and
call `gh api repos/<org>/<repo>/rulesets` — if it returns `[]` instead of a 403,
it works. Note this also has a cost the others do not: an org changes who "owns"
the repository, which touches section 8 of the agreement.

**Option 4 — change nothing and rely on the agreement.** Which is where you are.
It has held for one month and broken once.

Independent of which you pick, two free things are worth doing now:

- Add `pull_request:` to `.github/workflows/ci.yml` so a PR gets a verdict on the
  merge result, not just on the branch head. Costs nothing and is a prerequisite
  for required status checks.
- `delete_branch_on_merge` is already `true`. Good — that is what stops the
  `worktree-agent-*` sprawl from accumulating on the remote.

---

## 7. LICENSE

### What section 9 requires

Section 9 says everything either of you produces for Dana belongs to Dana as a
jointly built project; that a departing partner cannot stop Dana using their
contribution; that neither of you may reuse Dana's proprietary code in a
competing product without discussing it; and that general knowledge and skills
travel freely. Section 8 says neither of you may transfer or give away any part
of Dana's ownership without agreeing together.

**A permissive open-source licence — MIT, Apache, BSD — would violate section
8.** Those licences grant every person on earth an irrevocable right to use,
modify and redistribute the code. Adding one is exactly "giving away part of
Dana" unilaterally, and it cannot be taken back for the versions already
released. Do not add one. Not even "just for now."

Section 9's last line is permissive about the file itself: "A LICENSE file
**may** be maintained ... where necessary." So this is optional. It is still
worth having, for a reason that has nothing to do with lawyers: **without a
licence file, an AI agent reading this repository has no statement of terms, and
neither does anyone the repo is ever shared with.** The file's job here is to be
unambiguous to a reader who has not read `agreement.md`.

### Recommendation: proprietary, all rights reserved, both names

Put it at the repository root as `LICENSE` (no extension), so GitHub picks it up
and shows "Proprietary" rather than "No licence".

```
Copyright (c) 2026 Hassan Shahir and Imranullah Wafa.
All rights reserved.

Dana, including its source code, database schemas, specifications,
documentation, designs, prototypes, branding, and associated assets, is the
joint property of Hassan Shahir and Imranullah Wafa (the "Owners"). It is
proprietary and confidential.

No licence, express or implied, is granted by the publication or sharing of
this repository. No person or entity may copy, modify, merge, publish,
distribute, sublicense, sell, or create derivative works from any part of this
project, or use it for any purpose, without the prior written permission of
both Owners.

Access to this repository, whether granted directly or through any service,
tool, or automated agent, does not confer any right to use its contents beyond
the specific purpose for which access was granted.

Neither Owner may grant, transfer, assign, sell, or promise any rights in this
project to a third party, nor place any part of it under an open-source or
other public licence, without the agreement of the other Owner.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
OWNERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The working relationship between the Owners, including their respective roles,
responsibilities, and the ownership arrangement summarised above, is set out in
agreement.md in this repository. Where this notice and that agreement appear to
differ, the agreement governs as between the Owners.
```

### What that file does and does not do

**Does:** state the default. In most jurisdictions copyright already vests in the
authors the moment code is written, and unlicensed code is already "all rights
reserved" — the file does not create the right, it *announces* it, which removes
the ambiguity a silent repository creates. It names both of you, so neither can
later be treated as sole author. It says out loud that access does not equal
permission, which is the paragraph that matters if the repo is ever shared with a
contractor, a designer, or a tool. And its fourth paragraph puts section 8's
"no unilateral giveaway" rule in the one file a stranger would read.

**Does not:** stop anyone who copies the code from copying it. Enforcement is a
lawsuit, not a text file. It does not register a copyright anywhere. It does not
resolve what happens if one of you leaves — the agreement handles that, not this.
And it does not, by itself, make the joint ownership legally airtight, because
"joint ownership" between two individuals with no legal entity is decided by the
law of wherever each of you lives, and those laws differ on questions like
whether one joint owner can license the work without the other's consent.

### What a lawyer would need to settle

I am not one, and this draft is a clear statement of intent, not a legal
instrument. The things a real lawyer would fix:

- **Which country's law applies.** You and Imran may be in different
  jurisdictions. Joint authorship rules differ sharply — in the US, one joint
  owner can generally grant a non-exclusive licence without the other's consent,
  which directly contradicts the fourth paragraph above. This is the single most
  important gap.
- **Whether "joint ownership" is even the right structure** without an entity. A
  two-person unincorporated project may be treated as a partnership by default in
  some places, which brings consequences neither of you chose.
- **Full legal names and any addresses**, if this is ever to be relied on. I have
  used the names as signed in `agreement.md`: Hassan Shahir and Imranullah Wafa.
- **The AI-authorship question.** 941 of 1021 commits carry a
  `Co-Authored-By: Claude` trailer. In several jurisdictions the copyrightable
  status of AI-generated output is contested, and who owns it is not settled law.
  It does not change what you should write today, but it is the thing that would
  come up first in a real review.
- **`agreement.md` itself is not signed in any verifiable way** and is not even
  committed to git. If it is ever going to matter, commit it and get a dated
  signature.

Do this now if it is worth an hour, not if it is worth a lawyer. It is the
former.

---

## What I could not verify

- **Force pushes before 2026-08-28.** This clone is three days old;
  `.git/logs/HEAD` has 49 entries and starts on 2026-08-28. Within that window
  there are none. Anything earlier is invisible from this machine. Your original
  clone, if it still exists, would have a longer reflog. GitHub's audit log would
  settle it but is not available on this plan.
- **Whether an Organization on the Free plan gets rulesets on private repos.** I
  did not create an org to test it. Do not act on any assumption here.
- **What issues #1 to #4 were.** They return 404 and no PRs exist in this
  repository. Most likely they did not survive the move from `dev-dana`.
- **The `dev-dana` repository.** `gh api repos/dev-dana/dana` returns 404 to this
  token. It may be deleted, renamed, or simply not visible to `zhssnym`. Six
  merged PRs and their reviews live there and are currently unreachable.
- **Whether `main` was ever protected in the old repository.** No way to check
  from here.
- **The account plan name.** `gh api user --jq .plan` returns `null` — the token
  lacks the `user` scope. I did not need it: the 403 body from the protection and
  ruleset endpoints is GitHub stating the limit directly.
- **Whether the required status check would be named `ci`.** The workflow is
  `name: CI` with job id `ci` and no job-level `name:`, so the context should be
  `ci`, but no PR has ever run in this repository so I could not observe the
  actual check name. Confirm on the first PR before selecting it as required.
- **I did not run the test suite**, per the brief, so nothing here says anything
  about whether the tree is green.

---

## Open questions for Hassan

1. **Does the client boundary survive contact?** 116 of 214 client files have
   both identities on them, 54% of the directory, and 22% of Imran-side client
   commits also had to touch something outside the client. What happens to the
   one-in-four that cannot stay inside? That is the design problem, not
   CODEOWNERS.

2. **Is `docs/design/` yours or Imran's?** The plan says all of `docs/` is yours.
   The history says `docs/design/` is his 5:1. I wrote it joint. Your call, but a
   rule that contradicts a 5:1 record is the first one to get ignored.

3. **Will you spend $4/month?** Without GitHub Pro, CODEOWNERS is a comment and
   "Imran never pushes to main" is a promise the platform will not keep. Nothing
   else in this report is blocked on money; this one is.

4. **The Google client secret: blank it and rotate, or leave it?** One key, one
   value, never rotated, now read by an additional machine and a model provider
   on every frontend task. `DANA_DEV_LOGIN=1` already covers local sign-in
   without it.

5. **Restore the `.env*` ignore rule?** The ruling was about one file; the fix
   deleted the whole class. Nothing today stops `.env.production` being committed
   by accident.

6. **What happens to the two prototypes under `docs/design/`?** Two complete Vite
   apps, four lockfiles between them (npm *and* pnpm for each), four
   byte-identical asset duplicates shared with the real app. This is the exact
   shape of the "bolted on and swapped over" problem, still sitting in the tree.
   Archive, delete, or move out of the repo?

7. **Commit `agreement.md`.** It is untracked. The document the whole restructure
   is built on exists on one disk.

8. **The 360 uncommitted deletions.** Another session is mid-restructure. Every
   path in the CODEOWNERS draft needs re-checking after it lands, because a
   CODEOWNERS line that matches nothing fails silently.

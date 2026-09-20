# Working on the frontend

**One issue, one fresh chat.** Read this before you start. It is everything you need to begin
a task on a screen.

## Where this starts

**`app/src/client/`**, which is where a task about what a person sees begins. It is a
starting point and not a fence: the same task may end in `app/tests/`, in `app/src/shared/`,
in the specification, or in a route. Change what the issue needs and change all of it.

Component tests live beside the components they test — `task-row.tsx` and
`task-row.test.tsx` in the same folder — which is why `app/src/client/` and `app/tests/` are
not split by owner.

`app/tests/` holds the acceptance suite and the browser specs. **A criterion your change
makes wrong moves in the same pull request**, under the rule in
[`../hard-stops.md`](../hard-stops.md): a criterion changes only when the decision it pins
changes, and the pull request names it. What is never allowed is editing one to make your
code pass.

## The rules that are never broken

1. **Never push to `main`.** Push your branch. Hassan merges, and merging deploys.
2. **Every change starts from a GitHub issue**, and one issue is one fresh chat.
3. **Read [`../hard-stops.md`](../hard-stops.md) before you start.** Eight things stop
   everyone. Everything else: decide, do it, and say what you decided.
4. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
   Say so in the pull request and leave it failing.
5. **Say you are blocked rather than saying you are done.**
6. **Run `npm run gate`, then run the `reviewer` agent.** The pull request exists only after
   both, green on the head commit, and it carries the record.
7. **When the workflow itself is what stopped you, fix it or open an issue labelled
   `documentation`.** `docs/workflow/` is everyone's, so fixing it in the pull request that
   hit the problem is usually right; where it needs a decision, name the file and the
   section, say what you were trying to do and what you did instead, and carry on. Shared
   rule 12.

## Starting a task

A **fresh chat** for each issue. Then:

1. Read the issue and anything it links to.

   **Most frontend issues here are a screenshot and one sentence, and the screenshot is the
   specification.** `gh issue view` prints the image as a raw `user-attachments` URL. The
   repository is private, so fetching it needs a token:

   ```
   "C:\Program Files\GitHub CLI\gh.exe" issue view 12 --json body
   curl -H "Authorization: Bearer $(gh auth token)" -o /tmp/issue.png "<the URL>"
   ```

   Then read the image. Working from the sentence alone means guessing at what someone
   photographed.
2. Check whether an open pull request is already touching the same files.
3. Read [`../hard-stops.md`](../hard-stops.md). Before you start, not when you are unsure.
4. `git checkout main && git pull && git checkout -b frontend/<issue>-<short-description>`.
   CI checks that shape: `^(frontend|backend|chore)/[0-9]+-[a-z0-9-]+$`.
5. Read `CLAUDE.md` at the repository root for the commands and the ways this machine's test
   suite fails that are not your fault.

## The client, folder by folder

236 files. Some of the names overlap, and the honest reason is that this code was
ported from a prototype and never fully tidied. Where a distinction is real, it is noted.
Where it is a leftover, that is noted too, so you do not waste time inventing a rule that
was never there.

**Every count below is `find app/src/client/<folder> -type f | wc -l`, measured 2026-09-05,
and it counts the component tests that live beside their components.** Re-measure with that
command rather than trusting the number: the table read 190 files on 2026-09-01 and the tree
read 230 three days later.

| Folder | Files | What it is |
| - | - | - |
| `components/` | 96 | The reusable pieces. `components/ui/` is the base layer. `components/page/` holds the loading, empty and error screens, which moved there from `states/` in #82. |
| `lib/` | 31 | The shrinking catch-all. Task-owned logic moved to `tasks/` in #86; unrelated settings, folders, shelves, identity, people, history, conversations, icons, drag helpers and Trash remain for later bounded slices. |
| `pages/` | 27 | A route's wiring: fetching, state, deciding what to render. |
| `shell/` | 18 | The frame around every page: sidebar, layout, navigation. |
| `views/` | 16 | The saved and native views (My Day, Planned, and so on). |
| `api/` | 9 | Every call to the server. See below. |
| `parts/` | 7 | **A leftover.** The shell session's holding pen, which `app/src/client/README.md` now calls the page layer: the row callbacks, the presenters and two colour palettes. Do not add to it. |
| `public/` | 6 | Manifest icons and the static art, copied to the build root. |
| `onboarding/` | 5 | First-run flow. |
| `state/` | 4 | Global client state: toasts, connectivity. |
| `screens/` | 3 | The markup half of a page, split out. Only 3 of 24 pages do this, and the directory is retiring into `components/`. |
| `pwa/` | 2 | Install prompt and service worker glue. |
| `observability/` | 1 | The browser's half of 11.12's error reporting. |
| `styles/` | 1 | `tokens.css`. See below. |
| `tasks/` | 6 | Task-owned model, wire mapping, actions, writer and expanded-detail read, plus the structural ownership test. These follow the task across every surface rather than belonging to one page or component. |

Four files sit at the root of `app/src/client/` and are in none of those folders: `main.tsx`,
`Router.tsx`, `routes.ts` and `README.md`.

**The table tells you where things live, not where a given feature lives.** One screen often
straddles two folders: the sidebar's navigation rows are in `shell/app-sidebar.tsx` while its
folder rows are in `components/folder-row.tsx`, and a change to "the sidebar" can need both.
Grep for the thing you can see on screen rather than reasoning from the table.

## Three things that will bite you

**Colours live in exactly one file.** `app/src/client/styles/tokens.css` is the only place a
raw colour, size, spacing or radius value may appear. A test enforces this and will fail the
build if you write a hex value in a component. This is not style policing: it is what makes
the design changeable in one place. **The values inside that file are guarded by nothing** —
`components/ui/foundation.test.ts` asserts two strings and nothing about whether any value is
right — so changing one is a hard stop, and the rule is that you declare it in the pull
request.

**Every server call goes through `app/src/client/api/http.ts`.** The CSRF header and the
timezone parameter are added there, once, for everything. Do not call `fetch` directly: you
will get a 403 or a 422 that looks like a backend bug. **A lint rule enforces this since
issue #72** — `no-restricted-syntax` in `app/eslint.config.ts`, which fails `fetch(...)`,
`window.fetch(...)`, `globalThis.fetch(...)` and `self.fetch(...)` anywhere in `src/client/`
but that file. What it does not catch, and says so in its own comment, is an alias:
`const g = fetch` and then `g(url)` passes. One file is exempt by a disable comment,
`lib/viewer.ts`, which round-trips a `data:` URL into a Blob and reaches no network.

*(Corrected 2026-09-04. This paragraph said nothing enforced the rule and named
`components/folder-cover.tsx:192` as a live violation of it. #42 removed that call and #72
added the rule.)*

**The Content Security Policy refuses external images and scripts silently.** If you add an
image from a new domain, it will not load, nothing will appear in the console, and it will
look exactly like a missing image. This already cost this project months on Google profile
pictures. The source is listed in `securityHeaders` in `app/src/server/index.ts`, and adding
one is a hard stop: name it and what it is for in the pull request, and check it in a real
browser rather than in a test.

## Testing

**`npm run gate` is the whole of it**, and it is what a pull request carries:

```
npm run gate              spec 11.11's six steps, in order, stopping at the first failure
npm run gate -- --quick   lint, typecheck and build, for the middle of the work
```

The individual commands, for when you want one of them:

```
npm run lint
npm run typecheck
npm test          the full suite on PGlite, an embedded database, about 6 minutes
npm run build
```

The browser tests need one download first:

```
npm run e2e:install     once
npm run e2e             about 11 minutes
```

**The Postgres leg needs a database created with an exact locale, and setting it up is a
one-time job rather than a reason to skip the leg.** Spec 11.10 carries the `CREATE DATABASE`
statement and `CLAUDE.md` describes the cluster here. Where the machine has one,
`TEST_DATABASE_URL` names it and the gate runs that leg. **Where it does not, the gate ends
`GATE: incomplete (Postgres leg not available on this machine)` and exits non-zero**, because
green means all six of 11.11's steps ran — so a machine without that database cannot open a
pull request until it has one. That variable is ambient here and has changed more than once,
so read what the gate record printed rather than what you expected.

**Know what `npm test` mostly proves about your work: that the client compiles.**
`app/vitest.config.ts:5` sets `environment: 'node'` for the whole suite, and 344 of the 351
files it collects run under it. **Seven opt into `jsdom` and Testing Library per file** and
are the only cases in the suite that render anything —
`components/person-face.test.tsx`, `components/folder-cover.test.tsx`,
`components/page-head.test.tsx`,
`components/page/BlocksEditor.test.tsx`, `lib/calendar-zoom.test.tsx`,
`lib/page-identity.test.tsx` and `views/usePlace.test.tsx`.
Writing more of them is the "Component tests exist now" section below. Everything else your
screen *does* is covered by the 117 Playwright specs, and nothing else.

*(Corrected 2026-09-04. This said `jsdom` and the `@testing-library` packages were installed
and **nothing imported them**, which the section further down this same file already
contradicted. Counts re-measured the same day at 343 of 350 and seven, having been written
that morning as 338 of 343 and five: `npx vitest list --filesOnly`,
`grep -rl "@vitest-environment jsdom" app/src/client`, and
`find app/tests/e2e -name '*.spec.ts'`. **Re-measure rather than trusting the numbers** —
they moved twice in one day.)*

So for a visual or behavioural change, say honestly how you checked it:

- you ran the Playwright spec that covers it, and you name it; or
- you ran the app and looked; or
- **you say it was not verified in a browser.**

To find the spec that covers a screen, grep `app/tests/e2e/` for the thing on it: a label, a
role, a test id. To *measure* a layout rather than assert on it, copy `playwright.config.ts`
to an untracked file, change its port and `testDir`, and write a throwaway spec that reads
the numbers you care about. Do not commit either.

**Budget for it.** Each browser run rebuilds the client first, so a measure, fix, measure
loop costs a couple of minutes per turn on this machine. That number governs how you work
once you are past the first few minutes, so know it before you start rather than paying to
discover it.

The third is an acceptable answer. Writing "tested" after watching it compile is not.

**The order for a small change: look at it first, gate it last.** The full suite is about six
minutes and the browser leg about eleven, and spending both before anyone has seen a
seventeen-line change spends them in the wrong order; issue #66 measured fourteen minutes
before the change could be shown to anybody. So: make the change, run
`npm run gate -- --quick`, run the one Playwright spec that covers that screen, and look at
it in a browser. Show it, take the corrections, and run `npm run gate` in full when the work
is accepted and you are preparing the pull request. **Nothing is weakened by this: the same
six steps, in full, on the head commit, before every pull request. Only the order moves.**

**`npm test` is deliberately not in that fast loop**, and not to save the six minutes. Under
`environment: 'node'` it proves the client compiles and almost nothing about what it does,
which `npm run typecheck` has already told you in seconds. For a change to what a person
sees, the focused spec and your own eyes are the whole of the evidence.

**Component tests exist now, and they are yours.** A component test lives beside its
component: `person-face.tsx` and `person-face.test.tsx` in the same folder. They run in
milliseconds, which makes them the only fast way to check that a component draws the right
thing.

Three things they need, and `components/person-face.test.tsx` is the worked example of all
three. Read it before writing your first one; it is commented for exactly that.

- **`// @vitest-environment jsdom` on line 1.** The suite runs under `node`, so without this
  there is no document and nothing renders. Per file, because the other 338 files want
  `node` (2026-09-04).
- **`afterEach(cleanup)`.** Testing Library only unmounts automatically when vitest runs with
  `globals: true`, which this config does not set. Without it, one test's markup is still in
  the document during the next one, and a query that should find one element finds two. The
  error reads like a component bug and is not one.
- **A load stub, if the component shows an image.** `Avatar` puts no `<img>` in the tree
  until the image reports that it loaded, and jsdom never loads anything. Without the stub
  the fallback is all that renders and the test looks like the component is broken.

**If you cannot leave a test behind, say so in the pull request.** Some things still have no
cheap guard, and an honest note is worth more than silence: it tells the next person that
nothing is watching that code.

## When the work needs the server

Most screen work stays in `app/src/client/`. When yours does not — a field the API does not
send yet, a criterion your change made wrong, a specification sentence that named the old
word — that is part of the same change and lands in the same pull request.

Two ways to do it, and both are ordinary:

- **Do it.** [`../backend/README.md`](../backend/README.md) is the folder map and the five
  things about the server that are not obvious from reading it.
- **Invoke the `backend` agent** with the exact need, on the same branch, and integrate its
  commit. That is not an escalation and it needs no issue.

**An issue exists when a person must decide something**, and only then: a product decision is
Imran's, a technical one is Hassan's. Use the `Decision needed` template, say what you will
do in each case, and carry on with whatever does not depend on the answer.

And read [`../hard-stops.md`](../hard-stops.md), which is what actually stops you. A request
field on a schema the server does not read is the one that has cost this project most: it is
accepted, dropped, and answered 200, so the screen looks correct and the feature does
nothing.

## Labels, in one line

Your issue needs an area label (`frontend`) and a type label (`bug`, `enhancement` or
`documentation`). Add `blocked` if you stop, `breaking` if it changes something people rely
on. The full table is in [`../how-we-work.md`](../how-we-work.md); you rarely need the rest
of that file.

## Opening the pull request

**Only when the work is finished**, which means `npm run gate` is green on the head commit
and the `reviewer` agent has run. Never a draft.

The template asks for four things and none is optional:

- **the gate record**, pasted;
- **the hard stops you touched**, with the rule you met, or "none";
- **the criteria you changed and why**, or "none";
- **the reviewer's verdict**, in a paragraph.

Add **before and after screenshots**. A screenshot is how a visual change gets reviewed
without checking out your branch.

Title it as a Conventional Commit, because it becomes the commit on `main` and the version
number is read from it:

```
feat: assignee avatar in the task row
fix: sidebar collapses behind the dialog on mobile
```

Then say it is ready. Hassan merges, because merging deploys to production within minutes.

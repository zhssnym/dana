# Working on the frontend

Read this before you start. It is everything you need for a frontend task.

## What you own

**`app/src/client/`**, and nothing else.

Component tests count as yours, because they live beside the components they test. A test
for `task-row.tsx` is `task-row.test.tsx` in the same folder, and it is yours by the same
rule that makes the component yours.

`app/tests/` is not yours. Those are acceptance and browser tests, and they belong to
Hassan. You may run them. Do not edit them.

## The rules that are never broken

1. **Never push to `main`.** Push your branch. Hassan merges.
2. **Every change starts from a GitHub issue.**
3. **Never edit a test to make your code pass.** If a test looks wrong, that is a finding.
   Say so in the pull request and leave it failing.
4. **Say you are blocked rather than saying you are done.**
5. **If the workflow itself is what stops you, open an issue labelled `documentation`.**
   `docs/workflow/` is not yours — `CODEOWNERS` puts it with Hassan — so an issue is the only
   channel you have when it is wrong or missing the one thing you needed. Name the file and
   the section, say what you were trying to do and what you did instead, and carry on. Shared
   rule 11.

## Starting a task

Start a **new session** for each issue. Then:

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
3. Read [`allowed-backend-changes.md`](allowed-backend-changes.md) if the work looks like it
   might reach the server.
4. `git checkout main && git pull && git checkout -b frontend/<issue>-<short-description>`
5. Read `CLAUDE.md` at the repository root for the commands and the ways this machine's test
   suite fails that are not your fault.

## The client, folder by folder

Roughly 190 files. Some of the names overlap, and the honest reason is that this code was
ported from a prototype and never fully tidied. Where a distinction is real, it is noted.
Where it is a leftover, that is noted too, so you do not waste time inventing a rule that
was never there.

| Folder | Files | What it is |
| - | - | - |
| `components/` | 86 | The reusable pieces. `components/ui/` is the base layer. |
| `lib/` | 29 | Named "helpers", but 18 of its files now read or write the server. Treat it as application logic, not utilities. |
| `pages/` | 24 | A route's wiring: fetching, state, deciding what to render. |
| `shell/` | 16 | The frame around every page: sidebar, layout, navigation. |
| `views/` | 14 | The saved and native views (My Day, Planned, and so on). |
| `parts/` | 7 | **A leftover.** Its own file says it is the last one in the directory and there are now several. Do not add to it. |
| `api/` | 7 | Every call to the server. See below. |
| `onboarding/` | 5 | First-run flow. |
| `state/` | 4 | Global client state: toasts, connectivity. |
| `screens/` | 4 | The markup half of a page, split out. Only 4 of 24 pages do this. |
| `states/` | 3 | Loading, empty and error screens. **Not the same as `state/`.** |
| `pwa/` | 2 | Install prompt and service worker glue. |
| `styles/` | - | `tokens.css`. See below. |

**`state/` and `states/` are genuinely different things one letter apart.** Check which one
you meant before importing.

**The table tells you where things live, not where a given feature lives.** One screen often
straddles two folders: the sidebar's navigation rows are in `shell/app-sidebar.tsx` while its
folder rows are in `components/folder-row.tsx`, and a change to "the sidebar" can need both.
Grep for the thing you can see on screen rather than reasoning from the table.

## Three things that will bite you

**Colours live in exactly one file.** `app/src/client/styles/tokens.css` is the only place a
raw colour, size, spacing or radius value may appear. A test enforces this and will fail the
build if you write a hex value in a component. This is not style policing: it is what makes
the design changeable in one place.

**Every server call goes through `app/src/client/api/http.ts`.** The CSRF header and the
timezone parameter are added there, once, for everything. Do not call `fetch` directly: you
will get a 403 or a 422 that looks like a backend bug. The comment at `http.ts:4` claims
nothing else calls `fetch`, and that is **already false** at
`components/folder-cover.tsx:192`. Nothing enforces it, so it is on you.

**The Content Security Policy refuses external images and scripts silently.** If you add an
image from a new domain, it will not load, nothing will appear in the console, and it will
look exactly like a missing image. This already cost this project months on Google profile
pictures. Adding a new external source is a backend change and a handoff, not something to
debug from here.

## Testing

Four things run on any machine with no setup:

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

**Do not run the Postgres leg.** It needs a database created with an exact locale that only
Hassan's machine has. If `npm test` behaves strangely, check `CLAUDE.md`: `TEST_DATABASE_URL`
is ambient on that machine and picks the leg for you.

**Know what `npm test` actually proves about your work: that the client compiles.**
`app/vitest.config.ts:5` sets `environment: 'node'` for the whole suite. `jsdom` and four
`@testing-library` packages are installed and **nothing imports them**, so there is no
component test leg to render anything in. What your screen *does* is covered by the 109
Playwright specs, and nothing else.

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
before the change could be shown to anybody. So: make the change, run `npm run lint` and
`npm run typecheck`, run the one Playwright spec that covers that screen, and look at it in a
browser. Show it, take the corrections, and run the full gate when the work is accepted and
you are preparing the pull request. **The gate is not weakened by this: the same four
commands and the browser leg, in full, before every pull request, each named with its result.
Only the order moves.**

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
  there is no document and nothing renders. Per file, because the other 277 files want
  `node`.
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

## When the work needs the backend

**A change confined to `app/src/client/` needs none of this.** Skip straight to the pull
request. The rules below are only for work that reaches outside your folder.

When it does: read [`allowed-backend-changes.md`](allowed-backend-changes.md). Do not decide
for yourself that a change is small. Six things always stop you, and there are written
criteria for everything else.

## Labels, in one line

Your issue needs an area label (`frontend`) and a type label (`bug`, `enhancement` or
`documentation`). Add `blocked` if you stop, `breaking` if it changes something people rely
on. The full table is in [`../how-we-work.md`](../how-we-work.md); you rarely need the rest
of that file.

## Opening the pull request

Not a draft. The template asks for the things the review depends on, and two are not
optional:

- **which files outside `app/src/client/` you touched, and why.** "None" is the usual
  answer, and the best one.
- **which test commands you ran**, named, with results, and which you could not run.

Add **before and after screenshots**. A screenshot is how Hassan reviews a visual change
without checking out your branch.

Title it as a Conventional Commit, because it becomes the commit on `main` and the version
number is read from it:

```
feat: assignee avatar in the task row
fix: sidebar collapses behind the dialog on mobile
```

Then say it is ready. Hassan reviews and merges. Merging deploys to production within
minutes, which is why he does it and you do not.

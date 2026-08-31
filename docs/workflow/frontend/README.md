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

## Starting a task

Start a **new session** for each issue. Then:

1. Read the issue and anything it links to.
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
npm test          the full suite on PGlite, an embedded database, about 7 minutes
npm run build
```

The browser tests need one download first:

```
npm run e2e:install     once
npm run e2e             about 17 minutes
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

The third is an acceptable answer. Writing "tested" after watching it compile is not.

**Component tests are coming but do not exist yet.** They cannot until the suite has a jsdom
environment for client files. Do not add one and assume it runs.

## When the work needs the backend

Read [`allowed-backend-changes.md`](allowed-backend-changes.md). Do not decide for yourself
that a change is small. There is a short list of six things that always stop you, and
written criteria for everything else.

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

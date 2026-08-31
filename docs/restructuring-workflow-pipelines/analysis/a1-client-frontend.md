# A1. `app/src/client/` — what it is, how it works, and what it costs to hand over

**Status:** analysis, for review. Nothing here is implemented and nothing was changed.

**Written for Hassan**, who said plainly that he does not know this folder. Parts of
section 6 and section 8 are readable by Imran.

**Everything below comes from a file I opened.** Where I am guessing rather than
observing, the sentence says so. Line references are `path:line`.

**One thing to know before you read.** The working tree I read is the `pipelines`
branch, and it is not clean: 364 tracked files are missing from disk, including all
269 files of `docs/design/`. `app/src/client/` itself is complete and untouched, so
everything in sections 1 to 7 stands. But one client test reads a file inside
`docs/design/` and cannot pass right now. Section 6.6 has the detail.

---

## 1. The short version

`app/src/client/` is the whole user interface. 191 code files, about 52,000 lines, of
which roughly 33,000 are actual code and 15,000 are comments — this codebase explains
itself in prose more than most, which is why it reads as bigger than it is.

Nothing in it touches the database. Nothing in it imports server code. Every byte it
gets from the server comes through one file, `app/src/client/api/http.ts`. That is a
genuinely good position to be in, and it is the single strongest argument for giving
this folder to Imran.

The mess is real but it is a *naming* mess, not a *wiring* mess. There are eighteen
directories and at least four pairs of them look like the same idea twice. When I
opened them, most of the pairs turned out to mean different things — but the names do
not say so, and two of them are genuine leftovers from the V2 prototype swap.

The thing that will actually bite you is not the folder names. It is that **the tests
that prove the interface works are not in this folder.** 110 Playwright browser tests
live in `app/tests/e2e/`, outside anything Imran would own. A frontend change breaks
them constantly — one commit I traced changed 3 client files and 17 test files.
Section 6.5 explains why this is the hard problem in the handover.

---

## 2. A guided tour

### 2.1 How the app starts

Three files, in order.

**`app/index.html`** is the page the browser downloads. It is 30 lines. It carries a
`<div id="root">` for React to fill, a link to the favicon, and one small inline
script that reads the saved theme out of the browser and sets `data-theme="dark"` or
`"light"` on the page *before* the app loads, so a dark-mode user does not see a white
flash. Then it loads `/src/client/main.tsx`.

**`app/src/client/main.tsx`** (129 lines) is the entry point. It does five things and
nothing else:

1. Imports the stylesheet (`./styles/tokens.css`) — this is what makes the app have
   colours at all (`main.tsx:26`).
2. Creates the "query client", the thing that remembers server data (`main.tsx:33`).
3. Fires off four requests immediately — who you are, your settings, your folders,
   and any pending invites (`main.tsx:62-90`). These start *before* React renders,
   which is why the sidebar has your folder list on the first paint instead of the
   second.
4. Installs the keyboard shortcut for search (`main.tsx:119`).
5. Renders `<Router />` into `#root`.

**`app/src/client/Router.tsx`** (120 lines) is the list of addresses. It is deliberately
boring: `BrowserRouter`, `Routes`, `Route`, and nothing clever. The file's own comment
says why (`Router.tsx:1-12`) — React Router has a "framework mode" with data loaders,
and using it here is recorded as a defect in spec 11.15, so this file stays as plain
components.

The shape is: `/` is the landing page, `/privacy` and `/terms` are public, and
everything under `/app` is wrapped in `<AppShell>`. `AppShell` draws the sidebar and
the chrome; the page for the current address is rendered inside it.

### 2.2 The address list

`app/src/client/routes.ts` (257 lines) is the address list as data, separate from the
router. It holds:

- `paths` — every URL as a constant (`routes.ts:47-67`). Nothing spells a URL by hand.
- `retiredPaths` — two old addresses that redirect instead of 404ing (`routes.ts:85-88`).
- `navPages` — the nine main pages, each with its name, its URL, the one-line question
  it answers, and its icon (`routes.ts:132-215`).

**That last one is worth knowing.** The sidebar does not have its own list of pages. It
filters `navPages`. So renaming "Scheduled" or changing its icon is one edit here, not
a hunt through the sidebar file.

### 2.3 How a page gets its data

This is the cleanest part of the folder, and it is worth Imran understanding it too.

There is one door to the server: **`app/src/client/api/http.ts`** (317 lines). Nothing
else in the client calls `fetch` for API data. I checked — the only two other `fetch`
calls are `components/folder-cover.tsx:192`, which hits our own server for cover photos,
and `lib/viewer.ts:84`, which converts an image already in memory.

The door exists because two rules have to be true of *every* request, not just the ones
someone remembered (`http.ts:4-17`):

- Every read of a list carries the browser's timezone. `getView` appends it. There is
  no way to read a list without one.
- Every write echoes a security token from a cookie. `mutateApi` sets the header. There
  is no way to write without one.

Above that door sit two files:

- **`api/queries.ts`** (554 lines) — every *read*, as a hook. `useTodayView()`,
  `useFolders()`, `useImportantView()`, and so on.
- **`api/mutations.ts`** (891 lines) — every *write*, as a hook. `useCreateTask()`,
  `useUpdateTask()`, `useDeleteFolder()`.

**The rule a page follows:** a page calls one hook for its own data, and components take
rows as props. That rule is written down at `app/src/client/README.md:42-46`, with a
worked example. It exists so that a component like a task row can be rendered on six
different pages without each one refetching.

A real page, `pages/AnytimePage.tsx`, looks like this in outline:

```
const view = useTasksView()          // one read
const actions = useRowActions()      // the standard row callbacks
return <PageBody query={view} ...>   // loading / empty / error handled for you
         <TaskRows tasks={view.data.rows} {...actions} />
       </PageBody>
```

**What happens after a write.** Every successful write invalidates *everything*
(`api/queryClient.ts:16-19`). Not a per-write map of "which lists does this affect" —
deliberately not. The file's own reasoning: a map is a list of the things somebody
remembered, and when it is wrong you get a shared folder that silently shows stale
rows. So the client refetches whatever is currently on screen. That is spec 8.3.

### 2.4 Where state lives

Four separate places, and knowing which is which saves a lot of confusion.

| Kind of state | Where | Example |
| - | - | - |
| Server data | The query cache, via `api/queries.ts` | Your tasks, your folders |
| Preferences that persist | `localStorage`, via small store files | Sidebar width, theme, row density |
| Working state for this tab | `sessionStorage` | The filter on a page (`views/filter-store.ts`) |
| Cross-component messages | Tiny subscribable modules | Toasts, "open the search overlay" |

That last one is a pattern worth naming because it appears three times. `state/toasts.ts`,
`shell/overlays.ts`, `shell/undo.ts` and `shell/tabs.ts` are all plain modules with a
`Set` of listeners — not React context. The reason is at `state/toasts.ts:4-13`: the
thing that raises a toast is the query cache, which is created *above* React, so a
context would put the raiser outside the tree it needs to reach.

**There is no Redux, no Zustand, no global store.** If you were looking for one, that is
why you could not find it.

### 2.5 How styling works

One file: **`app/src/client/styles/tokens.css`** (876 lines). It is Tailwind 4, which
is configured in CSS rather than in a JavaScript config file — there is no
`tailwind.config.js` and there should not be (`vite.config.ts:9-19`).

Every colour, type size, spacing step and corner radius in the product is defined in
that one file as a `@theme` variable. Components then use utility classes that point at
those variables. A component spelling `#3b82f6` or `24px` directly is a defect.

**And that rule is enforced by a test**, `components/ui/foundation.test.ts`. It reads
every file under `components/` and `lib/` and fails if any of them contains a six-digit
hex colour or reaches for a raw colour ramp step. It also fails if a file imports icons
from `lucide-react` instead of from `lib/icons.tsx`.

The test carries three explicit exemption lists (`foundation.test.ts:71`, `:106`, `:171`)
naming the files that currently break the rules. The lists are asserted with `toEqual`,
so they fail in *both* directions — adding a new offender is red, and fixing an existing
one without removing it from the list is also red. Twenty-seven files are currently
exempt from the colour rule. That is not rot; it is a debt ledger that has to shrink to
zero on purpose.

### 2.6 The offline / installable layer

`pwa/registerServiceWorker.ts` registers a service worker so `/app` opens with no
network. `pwa/useUpdateAffordance.ts` shows the "Update available, reload" prompt.
The build side is `vite.config.ts:20-140`, and six of the values in there are load-bearing
and documented as such. This is the least likely part of the folder to need frontend
work and the most likely to break badly if it gets it.

---

## 3. The folder names — which distinctions are real

This is the question you cared most about, so here is the honest answer, folder by folder.

**Summary:** of the four suspicious pairs, **two are real distinctions with terrible
names**, **one is a real distinction applied to only 4 of 20 cases**, and **one is
genuine leftover duplication**. The bigger problem than any pair is that there are
eighteen directories for what is really five jobs.

### 3.1 The counts

| Directory | Code files | Tests | What is actually in it |
| - | - | - | - |
| `api/` | 7 | 0 | The one door to the server, plus reads and writes |
| `components/` | 39 | 0 | Presentational components, big ones |
| `components/ui/` | 32 | 2 | shadcn primitives — button, dialog, input |
| `components/page/` | 4 | 1 | The block editor for a folder/shelf body |
| `components/calendar/` | 4 | 2 | The month/week grid |
| `components/search/` | 2 | 0 | A 76-line wrapper around a component in `components/` |
| `lib/` | 27 | 2 | Adapters between our API and the prototype's shapes |
| `pages/` | 24 | 0 | 20 route components + 4 helpers |
| `screens/` | 4 | 0 | Markup lifted from the prototype for 4 of those pages |
| `views/` | 11 | 3 | Filtering, grouping, view modes — shared by 8 pages |
| `shell/` | 15 | 1 | Sidebar, tab strip, and 8 small state stores |
| `parts/` | 5 | 2 | Leftovers: presenters, row callbacks, 2 colour palettes |
| `state/` | 4 | 0 | Toasts and online/offline detection |
| `states/` | 3 | 0 | The loading / empty / error page treatments |
| `onboarding/` | 4 | 1 | First-run offer and sample workspace |
| `pwa/` | 2 | 0 | Service worker registration |
| `observability/` | 1 | 0 | Sentry error reporting |
| `styles/` | 1 | 0 | `tokens.css` |
| `public/` | 6 files | — | Icons and two product screenshots |

### 3.2 `pages/` vs `screens/` — real, but applied to 4 cases out of 20

**This is a real distinction.** A file in `pages/` is *wiring*: it calls the data hooks,
builds the callbacks, and hands both to something else. A file in `screens/` is *markup*:
it takes rows and callbacks as props and touches nothing.

Proof: I listed every import in all four screens. Three of them import only
components and helpers. `screens/important-screen.tsx` imports seven modules and none is
`api/`. Its page, `pages/ImportantPage.tsx`, does the fetching.

**But only four pages work this way.** `Important`, `Settings`, `Shelf` and `Trash`.
The other sixteen route components carry their own markup inline. `pages/FolderPage.tsx`
is 1,526 lines of wiring and markup together.

So the honest description is: *`screens/` is a migration that is 20% done.* Every one
of those four files says so in its own header — `pages/TrashPage.tsx:3` reads "**This
file is wiring and the markup is `screens/trash-screen.tsx`**", and each names the
package that did the lift.

**One more inconsistency.** `screens/settings-screen.tsx:99` imports `useBundle` from
`../api/queries.js`. So one of the four "presentational" screens does fetch. That is
one file breaking its own rule, not a rule that never existed.

**Verdict:** real idea, half-applied, and the two names are close enough that nobody can
tell them apart from the sidebar of an editor. Either finish it or drop it. I would
finish it — see section 7.

### 3.3 `state/` vs `states/` — real, and the worst names in the folder

**Both are real and they mean completely different things.**

- **`state/`** (4 files) is *application state*: the toast message bus
  (`state/toasts.ts`), the online/offline detector (`state/connectivity.ts`), a hook
  over it (`state/useOnline.ts`), and the component that draws toasts
  (`state/ToastRegion.tsx`).
- **`states/`** (3 files) is *the four states a page can be in*: loading, populated,
  empty, error. `states/PageStates.tsx` is the component every page wraps its content in
  so it never writes its own spinner. `states/PageSection.tsx` is the collapsible named
  section. `states/CompletedFoot.tsx` is the "finished work" section at the bottom of a
  list.

They are 30 lines of naming apart from each other and one letter apart in an import
path. `import { PageBody } from '../states/PageStates.js'` versus
`import { showToast } from '../state/toasts.js'`. **This is the single change I would
make first**, because it is pure rename with zero behaviour risk and it removes a class
of mistake permanently.

### 3.4 `components/` vs `parts/` — `parts/` is a leftover, and its own file says so

`parts/` has five code files:

| File | Lines | What it is |
| - | - | - |
| `presenters.ts` | 840 | Maps our API shapes onto the designer's display props |
| `useRowActions.ts` | 221 | The standard callbacks every task list needs |
| `format-dates.ts` | 299 | Every date the app renders outside a task row |
| `person-tint.ts` | 75 | A person's colour, derived from their name |
| `identity-colors.ts` | 32 | The ten folder colours as hex |

`parts/useRowActions.ts:2` says it outright: "the only file left in this directory" —
written when it was true and now out of date by four files. The original `parts/` was a
holding pen that was meant to shrink to nothing.

**It did not shrink, because two different things got put in it.** The two colour
palettes are there for a mechanical reason, not a design one:
`components/ui/foundation.test.ts` forbids hex colours anywhere under `components/`, and
these two files *must* contain hex because a folder colour is stored on the wire as
`#RRGGBB` (`parts/identity-colors.ts:5-15`). So they were parked outside the test's
reach.

That is a real constraint solved by an accidental address. **`parts/` is not a concept.
It is a place where four unrelated things ended up.**

### 3.5 `components/search/` — genuine wrapper, wrong address

`components/search-overlay.tsx` (442 lines) is the prototype's overlay, lifted whole.
`components/search/SearchOverlay.tsx` (76 lines) is the wiring around it, and
`components/search/index.ts` is a 2-line re-export.

This is the *exact same pattern* as `pages/` + `screens/` — wiring wrapping markup — but
implemented inside `components/` with a subfolder instead. Two names for one pattern.

### 3.6 `pages/page-heading.tsx` vs `components/page-head.tsx` — real duplication

Two independent implementations of "the heading at the top of a page".

- `components/page-head.tsx` (371 lines) is the current one. Used by
  `pages/FolderPage.tsx`, `screens/important-screen.tsx`, `screens/trash-screen.tsx`,
  and `views/usePlace.tsx` — so it reaches nearly every page.
- `pages/page-heading.tsx` (121 lines) is the old one. **Used by exactly one file:**
  `pages/PeoplePage.tsx:37`.

Its own header (`pages/page-heading.tsx:5-13`) describes the migration that replaced it
and records two features it never got. **This is leftover duplication and it is safe to
delete once PeoplePage moves over.**

### 3.7 The word "page" means three things

Not a duplication, but it will confuse anyone reading the folder cold:

1. **`pages/`** — a route. The thing at a URL.
2. **`components/page/`** — the *body* of a folder or shelf: paragraphs, images, sections.
   Dana's Notion-like block editor.
3. **"place-page"** — the eight list pages that share filtering and grouping, which is
   what `views/` serves.

Three meanings, one word. Worth renaming (2) to `blocks/` — it is what the file is
called: `components/page/BlocksEditor.tsx`.

### 3.8 `lib/` — no longer a helpers folder

27 files, and **18 of them import from `api/`**. `lib/theme.ts` reads and writes the
server. `lib/page-identity.ts` does GET/PUT/DELETE against `/place-covers`.
`lib/row-density.ts`, `lib/page-pins.ts`, `lib/task-surface-preference.ts` and
`lib/task-acts.ts` all write.

That is not what "lib" means to most people. What `lib/` actually holds is **the adapter
layer**: the prototype's screens expect a module called `lib/theme.ts` with a certain
shape, so Dana provides one, backed by the real API instead of by browser storage.
Nearly every file in there says so in its first two lines — `lib/viewer.ts:2` reads
"`prototype-v2`'s `lib/viewer.ts` rewritten over 7.2's session".

The name is inherited from the prototype and kept on purpose, so lifted files could cross
without their import lines being rewritten. That is a defensible reason. It is still
misleading to anyone who was not there.

### 3.9 What is *not* a problem

To be fair to the folder:

- **`views/` is a real, earned abstraction.** Eight pages share filtering, grouping, view
  modes and the entry-point defaults. `views/place-pages.ts:5-11` records the bug that
  forced it into existence: a task created on Today never appeared on Today, because
  three different capture points each decided the defaults for themselves.
- **`api/`, `pwa/`, `observability/`, `styles/`, `onboarding/` are all clean.** One job
  each, obvious names.
- **Almost no dead code.** I checked every file for whether anything imports it. Only two
  are unreferenced: `components/ui/item.tsx` and `components/ui/select.tsx`. That is
  remarkably tidy for a codebase that went through a prototype swap.
- **`states/PageStates.tsx` builds on `components/state-patterns.tsx` builds on
  `components/ui/empty.tsx`.** That looks like three empty-state implementations and is
  actually one, layered.

### 3.10 Filename casing is inconsistent

38 files are `PascalCase.tsx`, 153 are `kebab-case.tsx`. It is not random — `pages/` and
`states/` are PascalCase, `components/` and `lib/` are kebab — but `shell/` has both
(`app-sidebar.tsx` next to `TabStrip.tsx`) and so does `views/` and `onboarding/`.

The reason is recorded: lifted prototype files keep the designer's filenames on purpose
(`components/README.md:29-33`), so a reader can put each beside the file it came from.
That reason is real for the ~50 lifted files. It does not explain `shell/TabStrip.tsx`
sitting next to `shell/app-shell.tsx`. **This one is cosmetic** — mention it in a
convention document and stop.

---

## 4. What a frontend change actually touches

Three real examples, from git history and from reading the imports.

### 4.1 A sidebar change — the cheap case

**Commit `248a293`, "the sidebar gives its room to the Library".** Files changed:

```
app/src/client/shell/app-sidebar.tsx
app/tests/e2e/ac-181-folder-dialogs.spec.ts
app/tests/e2e/ac-242-help-sheet.spec.ts
app/tests/e2e/ac-264-sidebar-footer.spec.ts
app/tests/e2e/ac-313-an-empty-shelf.spec.ts
```

**One client file, four browser tests.** This is the shape you want, and it is the
shape most sidebar work has. Note the ratio: 1 file of product code, 4 files of test.
The tests are outside `app/src/client/`.

`shell/app-sidebar.tsx` is 2,160 lines and imports from 11 places, including
`../../shared/bundle.js`, `../../shared/folders.js` and `../../shared/shelves.js`.

### 4.2 Adding a page to the sidebar — the case that crosses the line

Nobody did this recently, so this is traced by reading rather than from a commit. **I am
inferring the file list from the code, not reporting a change that happened.**

To add a tenth page you would touch:

1. `app/src/client/routes.ts` — a new `paths` entry and a new `navPages` row.
2. `app/src/client/Router.tsx` — a `<Route>`.
3. `app/src/client/pages/NewPage.tsx` — the page.
4. `app/src/client/views/place-pages.ts` — the `PLACES` row saying which views it can
   draw and what a task made on it carries.
5. `app/src/client/pages/empty-states.ts` — its empty-state copy.
6. **`app/src/shared/bundle.ts:11`** — the `NATIVE_VIEWS` list. This is a hard enum, and
   `pinned_views` is validated against it with `.max(9)` at `bundle.ts:39`.

**Step 6 is outside `app/src/client/`.** Without it, a person pinning the new page to
their sidebar gets a validation error from the server. The page also probably needs a
new API endpoint unless it can be derived from an existing one, which is what
`pages/AbandonedPage.tsx:24` and `pages/AnytimePage.tsx:40` do — both read an existing
view and filter it in the browser.

### 4.3 A task row change — the expensive case

**Commit `2818211`, "capture lands at the foot, the title drags through".** Files:

```
app/src/client/components/task-row.tsx
app/src/client/lib/use-sortable-list.ts
app/src/client/shell/app-sidebar.tsx
+ 8 unit tests in app/tests/
+ 17 browser tests in app/tests/e2e/
```

**3 client files, 25 test files.** `components/task-row.tsx` is 3,527 lines and is the
largest file in the folder. It is rendered on every list page, inside the search
overlay, inside the board, and inside the task surface. A change to it reaches
everything.

### 4.4 The avatar feature — a frontend request that was mostly backend

**Commit `359d28d`, "avatars by default, the Remove control, and the CSP that was
refusing every Google picture".** This one is worth reading closely because it is
exactly the case your new workflow has to handle.

```
14 files under app/src/client/
 3 files under app/src/server/   (domain/files.ts, index.ts, routes/files.ts)
 2 test files
 5 documentation files          (RFC 0005, spec 7, 9, 10, 12)
```

The visible symptom was pure frontend: **every account's photo showed as initials
instead of the picture.** The cause was a single missing entry in the Content-Security-
Policy header at `app/src/server/index.ts:180` — the browser was silently refusing to
load `googleusercontent.com` images, and the avatar component falls back to initials on
a failed image, so the failure looked exactly like "no picture set".

The comment in the server records why nobody noticed for months
(`app/src/server/index.ts:146-155`).

**An agent working only inside `app/src/client/` cannot fix that.** It cannot even see
it. It would rewrite the avatar component several times and conclude the component was
fine.

### 4.5 The fan-out, measured

I counted the imports of every route component. Here is the whole table.

| Page | Imports | Client dirs reached |
| - | - | - |
| `FolderPage.tsx` | 52 | 11 |
| `AllPage.tsx` | 21 | 8 |
| `ImportantPage.tsx` | 16 | 8 |
| `ScheduledPage.tsx` | 16 | 7 |
| `ShelfPage.tsx` | 15 | 8 |
| `TodayPage.tsx` | 14 | 8 |
| `AssignmentsPage.tsx` | 14 | 7 |
| `DonePage.tsx` | 14 | 6 |
| `AnytimePage.tsx` | 13 | 7 |
| `AbandonedPage.tsx` | 12 | 6 |
| `PeoplePage.tsx` | 12 | 5 |
| `TaskPage.tsx` | 8 | 5 |
| `SettingsPage.tsx` | 8 | 6 |
| `InviteGate.tsx` | 8 | 5 |
| `DeskPage.tsx` | 5 | 4 |
| `LandingPage.tsx` | 5 | 4 |
| `TrashPage.tsx` | 3 | 3 |
| `NotFoundPage.tsx` | 1 | 1 |
| `LegalPage.tsx` | 1 | 1 |

**A typical page reaches into 6 to 8 of the 18 directories.** `FolderPage.tsx` reaches
11. That is the concrete cost of having eighteen directories: not that any one of them is
wrong, but that finding anything means knowing all of them.

---

## 5. Where the frontend is forced to touch the backend

### 5.1 The good news, stated precisely

I grepped every import in `app/src/client/`. **Nothing imports from `app/src/server/`.
Nothing imports from `app/db/`.** The only npm packages the client pulls in are `react`,
`react-router`, `@tanstack/react-query`, `zod`, `lucide-react`, `clsx`, `tailwind-merge`,
`@sentry/react` and `vitest`. No database driver, no Express, no Node built-ins.

The boundary is real today.

### 5.2 The one seam: `app/src/shared/`

136 import statements cross from `app/src/client/` into `app/src/shared/`. That folder
holds the zod schemas — the shape of every request and response — used by both sides.

By module:

| Shared module | Imports from client |
| - | - |
| `shared/folders.ts` | 28 |
| `shared/tasks.ts` | 26 |
| `shared/bundle.ts` | 14 |
| `shared/shelves.ts` | 9 |
| `shared/pages.ts` | 8 |
| `shared/me.ts` | 7 |
| `shared/workflows.ts` | 6 |
| `shared/invites.ts` | 6 |
| `shared/views.ts` | 5 |
| `shared/events.ts` | 5 |
| `shared/covers.ts` | 5 |
| `shared/comments.ts` | 5 |
| `shared/sample.ts` | 4 |
| `shared/connections.ts` | 3 |
| `shared/trash.ts` | 2 |
| `shared/recurrence.ts` | 2 |
| `shared/error-envelope.ts` | 1 |

By client directory, the files that reach across: `lib/` 14, `views/` 10, `shell/` 7,
`pages/` 6, `parts/` 3, `components/` 3, `api/` 3, plus `main.tsx`, `states/`,
`onboarding/`, `components/calendar/`, `components/page/`.

**`app/src/shared/` is clean and safe to keep on Hassan's side.** I checked: it imports
nothing from the server, touches no database, reads no environment variables. It is
purely schemas and types.

**The practical rule this implies:** Imran's agent may *import* from `app/src/shared/`
but must never *edit* it. Editing it is a contract change and needs the server to change
with it.

### 5.3 The seams that are not imports

These are the ones that will actually cause trouble, because grep does not find them.

**(a) The Content-Security-Policy header.** `app/src/server/index.ts:177-182` says:

```
default-src 'self'; base-uri 'self'; object-src 'none';
frame-ancestors 'none'; style-src 'self' 'unsafe-inline';
img-src 'self' data: https://*.googleusercontent.com;
connect-src 'self' https://*.sentry.io
```

Any image from any other host is silently refused. Any script from a CDN is silently
refused. Any request to a third-party API is silently refused. **Silently** — the
component falls back and the page looks merely wrong, not broken. Section 4.4 is what
that costs.

There is already one live example of this in the client:
`components/folder-cover.tsx:273` builds a background image from
`https://picsum.photos/...` for a legacy cover tier. Under the deployed CSP that
image cannot load. It is a leftover path, only reachable if stored data still carries a
`photo:` key — but it is there, and it is exactly the class of thing a frontend agent
would add without knowing.

**(b) The inline theme script in `app/index.html`.** The CSP has no `script-src`
directive, so scripts fall back to `default-src 'self'`, which does **not** permit
inline scripts. There is no nonce anywhere in `app/src/server/`. **Inferring from
reading the header and the built file — I did not run a browser — the theme pre-paint
script in `index.html` is refused in production.** I confirmed the built file still
carries it: `app/dist/client/index.html` contains one inline `<script>` and the string
`dana:theme`. If that inference is right, dark-mode users get a white flash on every
cold load, and the fix is a server header, not a client file. Worth ten minutes with
the browser console to confirm or kill.

**(c) `NATIVE_VIEWS` and the 9-item cap.** Covered in 4.2.

**(d) The design token test reads outside `app/`.**
`components/ui/foundation.test.ts:192` reads
`docs/design/prototype-v2/src/styles/tokens.css` from disk, five directory levels up,
and asserts that every line the prototype writes also appears in
`app/src/client/styles/tokens.css`.

So **changing a colour in the app requires changing it in the design prototype too.**
That is arguably correct — it keeps the design the source of truth — but it means
`app/src/client/styles/tokens.css` cannot be owned independently of `docs/design/`.

**(e) The Vite build config.** `app/vite.config.ts` sets `publicDir` to
`src/client/public`, so the client's own icons are copied to the build root. It also
configures the whole PWA layer with six values that are documented as measured rather
than chosen. A frontend change that adds a large asset can push the app chunk past
`maximumFileSizeToCacheInBytes` (currently 4 MiB, `vite.config.ts:96`) and break offline
mode, which fails as a test red in `ac-091`, `ac-100` and `ac-160` and says nothing about
size.

---

## 6. Handing this folder to Imran's agent

### 6.1 What is genuinely safe to own

These I would hand over without hesitation. Nothing in them touches security, data
integrity, or the server contract, and breaking one produces a visibly wrong page rather
than a quiet fault.

| Path | Files | Why it is safe |
| - | - | - |
| `components/ui/` | 32 | Buttons, dialogs, inputs. No data access at all. |
| `components/` (root) | 39 | Presentational. Caveat in 6.3. |
| `components/page/` | 4 | The block editor. Builds request bodies but sends none. |
| `components/calendar/` | 4 | Grid maths, unit-tested in place. |
| `screens/` | 4 | Pure markup by design. |
| `states/` | 3 | Loading / empty / error treatments. |
| `pages/` | 24 | Page assembly. Caveat in 6.3. |
| `views/` | 11 | Filtering, grouping, view modes. |
| `onboarding/` | 4 | First-run offer. |
| `parts/` | 5 | Presenters and row callbacks. |
| `public/` | 6 | Icons and screenshots. |

That is roughly 130 of 191 files, and it covers essentially all visible design work.

### 6.2 What should stay with Hassan even though it sits under `client/`

| Path | Files | Why |
| - | - | - |
| `api/` | 7 | The only door to the server. `http.ts` makes the timezone and the CSRF token structural — you cannot forget them because there is no way to omit them. `queryClient.ts` is the caching and offline policy, and its comments are explicit that a persisted cache would satisfy the offline test while showing the user yesterday's data. |
| `pwa/` | 2 | Service worker lifecycle. Getting `skipWaiting` wrong takes the page out from under someone mid-typing. |
| `observability/` | 1 | 39 lines that strip personally identifying data before sending errors to Sentry. `error-tracker.ts:14-30` deletes `request`, `user`, `contexts`, `extra` and `breadcrumbs` and sets `sendDefaultPii: false`. A well-meaning "let's add more context to our error reports" change is a privacy incident. |
| `state/connectivity.ts` | 1 | Offline detection. Its comment explains why `navigator.onLine` is not the answer and cannot be. |
| `Router.tsx`, `routes.ts` | 2 | `/privacy` and `/terms` must stay *outside* `/app` or the redirect rule bounces the people they exist for — Google's OAuth review among them (`Router.tsx:58-74`). |
| `main.tsx` | 1 | Boot order. |
| `shell/session.ts` | 1 | Sign-out. 23 lines, and both of them matter: the theme mirror is cleared so a shared device does not paint the previous person's theme, and it is a full page load so the query cache holding their rows is destroyed. |
| `styles/tokens.css` | 1 | See 6.4 — this one is genuinely contested. |
| `components/ui/foundation.test.ts`, `ui/copy.test.ts` | 2 | These are the guardrails. Whoever can edit the guardrail does not have one. |
| `app/vite.config.ts`, `app/tsconfig.client.json`, `app/index.html` | 3 | Build configuration and the CSP-sensitive entry document. |

### 6.3 The caveats inside the "safe" list

**Seven components fetch data, against the folder's own stated rule.** The rule at
`app/src/client/README.md:44` is "nothing below a page fetches anything". These break it:

```
components/calendar/PlannedCalendar.tsx:76-77   usePlannedCalendarView, useFolders, useUpdateTask
components/folder-mark.tsx:51                    useFolders
components/notifications-bell.tsx:68-69          useConnections, useMe, useNotifications, 2 mutations
components/task-assignee-invite.tsx:34           useCreateInvite
components/task-editing.tsx:31-33                6 mutations, 5 queries, uploadFile
components/task-move-guard.tsx:44                useFolder
components/task-surface-host.tsx:58-59           useCreateTask, useBundle, useFolders, useMe
```

Plus `states/CompletedFoot.tsx:49` and `screens/settings-screen.tsx:99`.

Nine files. Not a catastrophe, but it means "components are presentational" is a
description of intent rather than of the code, and a handover document that repeats it
will be wrong nine times.

**`components/task-row.tsx` is 3,527 lines and `components/task-card.tsx` is 2,334.**
These are safe in the sense that they hold no secrets. They are not safe in the sense
that two agents editing them in the same week will conflict. `shell/app-sidebar.tsx` at
2,160 lines is the same story.

**`lib/` cannot be classified as a unit.** 18 of its 27 files read or write the server.
It has to be split before it can be assigned — see 7.2.

**`shell/` cannot be classified as a unit either.** It mixes the visual chrome
(`app-sidebar.tsx`, `TabStrip.tsx`, `FloatingAddButton.tsx`, `OfflineBanner.tsx`) with
eight small state stores (`tabs.ts`, `undo.ts`, `overlays.ts`, `preferences.ts`,
`library-order.ts`, `appearance.ts`, `session.ts`, `library-drag.ts`). The chrome is
design work; `session.ts` is not.

### 6.4 `styles/tokens.css` — the one I cannot decide for you

By the agreement, colours and visual language are Imran's (§3, "design direction,
branding, visual language, colors, animations, spacing, layouts"). By the code,
`tokens.css` is asserted line-for-line against `docs/design/prototype-v2/src/styles/tokens.css`
and it is the single file every colour in the product comes from.

Both of those can be true. The clean answer is: **Imran owns the design prototype's
`tokens.css`, and the app's copy follows it.** That is what the test already enforces.
But it means `app/src/client/styles/tokens.css` and `docs/design/` have to move in the
same pull request, which cuts across the folder-based ownership the CODEOWNERS plan
assumes. Flagging it rather than deciding it.

### 6.5 The real risk, which is not any of the above

**The tests that prove the interface works are not in the folder.**

- `app/tests/e2e/` — 110 Playwright specs that drive a real browser against the built
  app. This is where essentially all UI verification lives.
- `app/tests/` — 229 more files, the API and domain acceptance suite.
- Inside `app/src/client/` — only 14 test files, and they are unit tests of pure
  functions: date formatting, grouping, filtering, calendar maths, copy strings.

**There are zero component tests.** No `.tsx` test files exist under `app/tests/` at all.
The React tooling is installed (`@testing-library/react`, `jsdom`) and `tsconfig.client.json`
has a comment explaining the arrangement, but nothing uses it.

So: a change inside `app/src/client/` is proved correct by tests outside it. Commit
`2818211` changed 3 client files and 25 test files. Commit `4a872c5` changed 12 client
files and 17 test files.

**This breaks the folder-ownership model as stated.** Three ways out, and they are a real
decision, not a formality:

1. **Imran's agent may edit `app/tests/e2e/`**, and Hassan reviews those diffs hardest.
   Simplest, and the one the history suggests is already how it works.
2. **Hassan updates the browser tests** after Imran's PR is opened, as part of review.
   Safest, and it makes every frontend PR wait on Hassan.
3. **Split the suite**: browser tests that are about *appearance* move under
   `app/src/client/`, tests that are about *behaviour and contract* stay. Cleanest
   long-term, largest up-front cost, and somebody has to classify 110 files.

Whichever you pick, the CODEOWNERS file has to say it, because the default — Imran owns
`app/src/client/` and nothing else — means his agent cannot make its own work green.

### 6.6 One thing that is broken right now

`docs/design/` is missing from the working tree on this branch — 269 tracked files,
deleted but not committed. `components/ui/foundation.test.ts:192` reads
`docs/design/prototype-v2/src/styles/tokens.css` with `readFileSync`. **That file is not
on disk**, so that test throws. I did not run it — you asked me not to — so this is read
from the code and the filesystem, not from a test result.

`app/index.html` is also modified in the working tree: someone stripped the two
explanatory comment blocks (the favicon note and the theme-script note). Behaviour is
unchanged.

Neither is a client-code problem. Both are worth resolving before this branch goes
anywhere.

### 6.7 Risks I looked for and did not find

Stating these explicitly so they do not get re-litigated:

- **No database access.** No driver imported, no SQL anywhere under `app/src/client/`.
- **No secrets.** The only environment variables read are `VITE_SENTRY_DSN`,
  `VITE_SENTRY_RELEASE` and `MODE`, all in `observability/error-tracker.ts`. A `VITE_`
  variable is public by design — it is compiled into the browser bundle. There is no
  place in this folder where a private key could hide without being visible in the
  bundle anyway.
- **No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function`.** Zero
  matches across the folder.
- **No client-side authorization.** The client shows and hides controls by role — a
  folder's menu offers "Leave" or "Delete" depending on who you are
  (`lib/object-acts.ts:207-209`) — but that is display only. The server enforces it, and
  `AC-190` and `AC-217` check both halves. An agent that got the display wrong would
  produce a confusing menu, not a security hole.
- **No CSRF logic to get wrong.** `api/csrf.ts` reads one cookie by one specified name
  and does nothing else. 50 lines.

**The one thing nothing prevents:** there is no lint rule and no build check stopping a
client file from importing `../server/something.js`. `app/eslint.config.ts` is 27 lines
and has no import restrictions. TypeScript follows imports regardless of what
`tsconfig.client.json` lists in `include`. So a confused agent *could* import server code
and Vite would happily bundle it into the browser. **This is worth one lint rule**, and
it is about twenty lines of `no-restricted-imports` config.

---

## 7. A proposed structure

**Only worth doing if you are already going to spend time here.** The folder works. What
it costs is comprehension, not correctness. Everything below is a rename or a move —
no behaviour changes.

### 7.1 The tree

```
app/src/client/
  main.tsx                  boot: stylesheet, query client, router
  Router.tsx                the route table as components
  routes.ts                 addresses and the nine nav pages as data

  api/                      the one door to the server, plus reads and writes
  runtime/                  ← was state/ : toasts, connectivity, overlays,
                              undo, tabs, preferences. Everything that is a
                              subscribable module rather than a component.
  server-state/             ← was the fetching half of lib/ : theme, viewer,
                              row-density, page-identity, page-pins, trash,
                              history, task-acts. Adapters that read or write.
  utils/                    ← was the pure half of lib/ + parts/format-dates :
                              icons, time-format, drop-zones, task-model,
                              nav-links, presenters, format-dates. No I/O.

  pages/                    one file per route. Data in, callbacks out.
  screens/                  presentational markup for a page. Props only.
  place/                    ← was views/ : what the eight list pages share —
                              filter, grouping, view mode, the spine table
  chrome/                   ← was the visual half of shell/ : sidebar, tab
                              strip, floating button, offline banner
  page-states/              ← was states/ : loading, empty, error, sections

  components/               presentational components
    ui/                     primitives — button, dialog, input
    blocks/                 ← was components/page/ : the block editor
    calendar/               the month and week grid
  styles/tokens.css         every colour, size, radius, spacing step
  onboarding/               first-run offer and sample workspace
  pwa/                      service worker and update prompt
  observability/            Sentry, with the PII stripping
  public/                   icons and screenshots
```

### 7.2 What moves, and how disruptive each move is

Ordered cheapest first. Every one is mechanical: rename the directory, fix the import
paths, run the suite.

| Move | Files | Disruption | Why bother |
| - | - | - | - |
| `states/` → `page-states/` | 3 | **Trivial.** ~15 import lines. | Removes the `state/` vs `states/` trap permanently. Do this one on its own, today. |
| Delete `components/ui/item.tsx`, `ui/select.tsx` | 2 | **Trivial.** Nothing imports them. | Dead code. |
| `pages/page-heading.tsx` → delete | 1 | **Small.** Move `PeoplePage` onto `components/page-head.tsx`. Visual check needed. | Removes the one genuine duplicate. |
| `components/page/` → `components/blocks/` | 5 | **Trivial.** ~8 imports. | Kills one of the three meanings of "page". |
| `state/` → `runtime/`, absorb the 8 stores from `shell/` | 12 | **Small.** ~40 imports. | Puts every subscribable store in one place. Makes `shell/` purely visual. |
| `shell/` → `chrome/` | 7 remaining | **Small.** | Says what it is. |
| `views/` → `place/` | 11 | **Small.** ~35 imports. | "views" collides with `views/` on the server and with `?mode=` in the URL. |
| `components/search/` → fold into `pages/`+`screens/` | 2 | **Small.** | One pattern, one name. |
| `parts/` → dissolve | 5 | **Medium.** The two colour palettes need `foundation.test.ts` updated, or they need an exemption at their new address. | Removes a folder that is not a concept. |
| Split `lib/` into `server-state/` + `utils/` | 27 | **Medium.** ~90 imports. Needs judgement on each file. | This is the one that actually makes ownership assignable: `utils/` is safe to hand over, `server-state/` is not. |
| Finish `pages/` + `screens/` for the other 16 pages | ~16 | **Large.** Weeks, not days. `FolderPage.tsx` alone is 1,526 lines. | The right end state, and not something to do as a restructure. Do it one page at a time as each page needs work anyway. |

**My recommendation:** do the first eight. They are a day's work between them, they are
all mechanical, and they take the folder from eighteen directories to twelve with no
overlapping names. Split `lib/` if you are assigning ownership, because you cannot assign
it as it stands. Leave the `pages`/`screens` migration alone as a project — let it happen
page by page.

### 7.3 The one non-move that matters more

Add the lint rule. `app/eslint.config.ts` currently has no import restrictions at all.
A `no-restricted-imports` block that forbids `app/src/client/**` from importing
`../server/**` or `../../db/**` costs twenty lines and turns the most important boundary
in this repository from a convention into a build failure. Right now the only thing
stopping server code reaching the browser bundle is that nobody has tried.

---

## 8. For Imran, if he reads this

Three things worth knowing before your agent opens this folder.

**The colours are all in one file.** `app/src/client/styles/tokens.css`. Every colour,
every text size, every corner radius, every spacing step. If a component spells a colour
directly, a test fails. That is on purpose — it means a change to the palette is one
edit, not four hundred.

**Components do not fetch data.** A task row does not know how to load a task. It is
handed one. This is what lets the same row appear on Today, in search results, on a
board and inside a folder without four copies existing. If your agent writes a component
that loads its own data, it has made that component impossible to reuse.

**Some things that look like frontend bugs are not.** Section 4.4 has the real example:
every user's profile photo showed as initials, which looks exactly like a broken avatar
component. It was a one-line security header on the server. If your agent has tried
three different fixes and none worked, that is the signal to open an issue rather than
try a fourth.

---

## What I could not verify

- **I did not run any tests.** Every claim about what passes or fails is read from code,
  not measured. In particular the claim that `foundation.test.ts` currently throws (6.6)
  follows from the file being absent on disk; I did not watch it fail.
- **I did not open the app in a browser.** The claim that the inline theme script in
  `index.html` is refused by the CSP (5.3b) is an inference from reading the header and
  confirming the script is in the built file. It needs ten minutes with a browser console
  to confirm or kill, and I would not act on it until someone has.
- **Whether `app/dist/client/` is current.** I read the built `index.html` to confirm the
  inline script survives the build, but I did not check that `dist/` was built from the
  current source.
- **Effort estimates in 7.2** are my reading of the import counts, not measured work. The
  `lib/` split in particular depends on judgement calls I did not make for each of the
  27 files.
- **Runtime behaviour generally.** I read what the code says it does. I did not observe
  the sidebar, the drag-and-drop, the calendar or the offline mode actually working.
- **`docs/design/`, `docs/team/`, `docs/ux/`, `docs/operator/`** are all missing from this
  working tree, so I could not read the personas, the ownership statements, or the design
  record. Several claims in the client's own comments point at documents I could not open
  to check.
- **The other 269 missing files** — I did not investigate why they are gone or whether
  the deletion is intentional.

## Open questions for Hassan

1. **The browser tests.** 110 specs in `app/tests/e2e/` verify the interface Imran owns.
   A frontend PR that cannot touch them cannot be green. Which of the three options in
   6.5 do you want? This is the decision that makes or breaks the CODEOWNERS plan, and it
   has to be made before the first issue is assigned.

2. **`tokens.css` and `docs/design/`.** The test binds them together line for line.
   Colours are Imran's by the agreement. Does a colour change become a PR that touches
   both directories — and if so, whose PR is it?

3. **`lib/`.** 18 of its 27 files read or write the server. It cannot be assigned to
   either person as it stands. Split it, or carve out named exceptions in CODEOWNERS, or
   give the whole thing to you?

4. **`components/task-row.tsx` (3,527 lines), `components/task-card.tsx` (2,334),
   `shell/app-sidebar.tsx` (2,160).** These are where design work concentrates and where
   two agents will collide. Is splitting them worth doing before the workflow starts, or
   do you handle it with issue sequencing?

5. **The nine components that fetch data** (6.3). Fix them, or amend the rule in
   `app/src/client/README.md` to describe what is actually true? A written rule that is
   wrong nine times will be ignored on the tenth.

6. **The lint rule** (7.3). Nothing currently stops client code importing server code.
   Twenty lines of config. Yes?

7. **The CSP.** It refuses things silently, and that has already cost you one long-lived
   bug. Is there value in a short "what the frontend cannot do" note that an agent reads
   before it starts — no external images, no CDN scripts, no third-party APIs?

8. **This branch.** 364 tracked files are missing from the working tree, including all of
   `docs/design/`, and `app/index.html` has been edited. Intentional, or a bad checkout?

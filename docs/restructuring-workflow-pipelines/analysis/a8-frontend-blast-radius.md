# A8: what a backend agent must not change in `app/src/client/`

Input for `docs/workflow/backend/allowed-frontend-changes.md`, the mirror of
`docs/workflow/frontend/allowed-backend-changes.md`.

Read-only investigation. Nothing was changed and no test was run.

---

## The short answer

**The prior is right, and it is right for a reason I did not expect.**

The frontend does not have six always-stop behaviours. It has **four**, and one of those is
a behaviour rather than a file. Padding it to six would be inventing symmetry.

But the reason is not the one in the brief. The brief guessed that frontend mistakes are
visible, so the list would be short and about blast radius instead of silence. The blast
radius half is correct. The visibility half is not, and the correction matters more than the
list:

**A backend agent verifies the client with `npm test`, and `npm test` cannot see the client
render.** `app/vitest.config.ts:5` sets `environment: 'node'` for the entire suite. There is
no jsdom, no `@testing-library`, nothing that mounts a component — `jsdom` and three
`@testing-library` packages are in `app/package.json:54-69` and **not one file in the
repository imports any of them** (grepped across `src`, `tests`, `db`). The client's own
tests say so out loud: `app/src/client/lib/use-sortable-list.test.ts:5`, "this repository has
no component test leg to render one in."

So "a broken screen looks broken" is true for a human with a browser open, and false for the
agent doing the work. Everything the agent runs — lint, typecheck, `npm test`, build — proves
the client **compiles**. Client *behaviour* lives in the Playwright leg, 109 specs under
`app/tests/e2e/`, which `CLAUDE.md` records cannot even run from a worktree whose path
contains a dot directory, needs its own port, and loses about a case a run.

That is the finding. For a backend agent, **most of the frontend is silent**, in exactly the
sense a migration is.

---

## 1. Import census

Counts are of **files**, from the whole client tree, test files excluded. `direct` = files
that import the module by a relative path. `transitive` = files that reach it through any
chain, computed by resolving every relative import in the 191 non-test client source files
into a graph of 207 nodes and walking it backwards.

| direct | transitive | module |
| -: | -: | - |
| 60 | 109 | `app/src/client/lib/icons.tsx` |
| 56 | 142 | `app/src/client/components/ui/utils.ts` (`cn`) |
| 39 | 80 | `app/src/client/api/queries.ts` |
| 32 | — | `app/src/client/parts/presenters.ts` |
| 32 | 92 | `app/src/client/components/ui/button.tsx` |
| 24 | 74 | `app/src/client/api/mutations.ts` |
| 22 | 77 | `app/src/client/routes.ts` |
| 19 | 95 | `app/src/client/api/http.ts` |
| 17 | 86 | `app/src/client/state/toasts.ts` |
| 14 | 81 | `app/src/client/components/ui/input.tsx` |
| 11 | 72 | `app/src/client/lib/time-format.ts` |
| 10 | 88 | `app/src/client/api/keys.ts` |
| 10 | 82 | `app/src/client/api/queryClient.ts` |
| 5 | 97 | `app/src/client/api/tz.ts` |
| 2 | 97 | `app/src/client/state/connectivity.ts` |
| 1 | 96 | `app/src/client/api/csrf.ts` |

**Read the transitive column with care.** The graph is dense: 207 nodes, and anything in
`api/` reaches 80 to 97 of them. Past a point the number stops discriminating and just says
"this is upstream of the shell." The direct column is what separates modules.

The interesting rows are the bottom three. `api/csrf.ts` has **one** direct importer and sits
under 96 files. `api/tz.ts` has five and sits under 97. That is the shape the brief predicted:
a file nobody imports that everything depends on.

Two things the graph does not count, because they are not `import … from`:

- **`app/src/client/styles/tokens.css`** is pulled in three times as a side effect
  (`main.tsx:27`, `components/index.ts:29`, `components/ui/index.ts:34`). It defines
  **132 custom properties** on `:root` (`tokens.css:211`) plus 36 in `@theme inline`, and 38
  are overridden for dark at `tokens.css:591` and `:672`. Its real dependents are the **101
  client files that write a `className`**, of 116 that render markup at all. Nothing imports
  it and everything uses it.
- **The CSP** at `app/src/server/index.ts:177` is not a client file, but it decides which
  client resources load.

---

## 2. The always-stop list

Four. For each: what it is, how many files depend on it, and what a diff review misses.

### 1. `app/src/client/parts/presenters.ts` — 32 dependent files

The layer that maps API shapes to display props: a `due_date` and `due_time` becoming a due
label, an assignee becoming initials and a name, step counts becoming a done-and-total pair.

**Its own header says the acceptance suite cannot see it.** `presenters.ts:14-18`:

> **No acceptance criterion sees this file.** The criteria address rendered roles, names,
> regions and copy, and every one of them would still pass if a label here read the wrong
> date, because they assert that a due badge exists and never what it says.

So the criteria check that a due badge is *present*. They do not check what it *says*. A
wrong date, a wrong name, a wrong count renders as a perfectly healthy-looking badge on 32
files' worth of screens, and the whole test suite stays green.

**This has already happened, and it is in the history.** Commit `359d28d`: `personDisplay`
dropped the `avatar_url` column, so a person wore a photograph on a card and a coloured disc
on the row directly beneath it. The commit message names **nine surfaces** it had to fix. It
survived until a human looked at the product and noticed.

The only guard is `presenters.test.ts`, 65 cases in the same directory. That test is not
optional and is not a formality — it is the entire safety net for the module.

### 2. `app/src/client/styles/tokens.css` — 101 dependent files

One file, 132 tokens, every screen.

**The values are not tested.** `foundation.test.ts:178-199` used to compare this file line by
line against the approved prototype. That prototype was deleted, and what survives is two
`toContain` assertions — that the string `v1 interim block` appears, and that
`--sharing-panel-width: 440px;` appears (`foundation.test.ts:197-198`). **A wrong hex, a
wrong spacing step, a wrong radius passes every check in this repository.**

The neighbouring test *is* strict in the other direction: `foundation.test.ts:172` fails if
any literal `#rrggbb` appears outside this file, with exactly one named exception. So the
rule "colour lives only here" is enforced. The rule "the colours here are correct" is not
enforced at all.

Second trap in the same file: light and dark are separate blocks. 132 tokens on `:root`,
38 overridden under `[data-theme="dark"]`. A token edited in one block and not the other is
correct in the theme you happened to look at and wrong in the other, and nothing says so.

### 3. `app/src/client/api/queryClient.ts` and `app/src/client/api/http.ts` — the request and cache layer

10 and 19 direct importers; 82 and 95 files transitively. These are one item because they are
one contract.

`queryClient.ts:99-111` is six lines of configuration that are all **specification**, not
tuning:

- `staleTime: Infinity` — nothing refetches on a timer, because spec 8.3 says nothing does.
- `refetchOnWindowFocus: 'always'` — and the file explains at line 10 that plain `true`
  silently turns the policy off, because `true` only refetches stale queries and under the
  line above nothing is ever stale.
- `networkMode: 'always'` on both queries and mutations — TanStack's default `'online'`
  **pauses a mutation while offline and runs it when the connection returns**, which is an
  offline write queue, which spec 10.6 forbids.

That last one is the sharpest silent failure in the client. Switching it back to the library
default makes offline writes appear to work. They queue, then land later. Nothing on screen
says anything is wrong. The criterion that catches it, AC-091, is
`app/tests/e2e/ac-091-offline-shell.spec.ts` — the Playwright leg. **No vitest test anywhere
reads `queryClient.ts`.**

`http.ts` carries the same kind of load. It is the only file that calls the API, and two
obligations are structural in it rather than remembered per call: `getView` appends `tz`
(`http.ts:184`), `mutateApi` sets `X-CSRF-Token` (`http.ts:112-115`). Its own header,
`http.ts:14-17`, states why: a client can satisfy both on whichever endpoint a criterion
happens to read and omit them everywhere else, and every criterion still passes.

**Being fair about this one:** the `tz` and CSRF halves fail *loudly* if you break them. A
missing `tz` is a 422 naming the field (`src/shared/views.ts:67`, `:355`); a missing CSRF
header is a 403. Those are visible. The silent half is the third obligation nobody names:
the offline check at `http.ts:108` and the error-envelope handling at `http.ts:144-152`,
which produce spec 9.1's offline toast and carry a 409's server-written message through
verbatim. Bypass `http.ts` and you lose those and nothing else complains.

### 4. Adding a `fetch` call anywhere outside `api/http.ts` — a behaviour, not a file

`http.ts:4` states the invariant: "Nothing in `src/client` calls `fetch` except this file."

**It is already false.** `app/src/client/components/folder-cover.tsx:192` calls
`/api/v1/covers/photos` directly. Nothing enforces the rule — `eslint.config.ts:36-55`
restricts client imports of `server/` and `db/` and says nothing about `fetch`. The bypass
survives because it is a GET to a non-view endpoint, so it needs neither `tz` nor CSRF. What
it does lose is the offline path: offline, it throws a raw `TypeError` instead of the
`OfflineError` that produces spec 9.1's "Couldn't save. You're offline."

This is on the list because it is the mistake a backend agent is *most* likely to make. It
looks like the smallest possible change — one call, one endpoint, no imports — and it is the
one change that silently opts out of every cross-cutting rule the client has.

**And one genuinely irreversible thing, cheap to state.** There are **16 `localStorage` and
`sessionStorage` key constants** in the client (`shell/preferences.ts:44-45`,
`lib/theme.ts:51`, `lib/time-format.ts:47`, `views/view-mode.ts:37`, `onboarding/sample.ts:35`,
and eleven more). Renaming one silently resets that preference for every person who already
had it, and the old value is orphaned in their browser where no deploy can reach it. This is
the only thing in the client that a revert does not undo. It is small, but it is the honest
answer to "is anything here irreversible."

---

## 3. The safe list

Grounded in what the code actually looks like, not in what feels harmless.

**Safe, make the change:**

- **Anything inside one page under `app/src/client/pages/` or `app/src/client/views/`** that
  changes what that page renders. 24 page files, each imported by `Router.tsx` and nothing
  else. A mistake is confined to one URL.
- **Adding a read to `api/queries.ts` for a shape the server already sends**, using
  `getPlain` or `getView` and a schema from `src/shared/`. `http.ts:164-170` parses every
  response against its schema and throws `ResponseShapeError` on a mismatch, so getting it
  wrong fails loudly on one screen. Pick `getView` if the endpoint evaluates dates and
  `getPlain` if it does not — `http.ts:190-195` explains the split.
- **Copy in `app/src/client/components/ui/copy.ts`.** It has a real vitest guard,
  `copy.test.ts`, 65 cases, and that test transcribes each expected string from the
  specification rather than importing it from the module (`copy.test.ts:17-22`). It runs in
  the node leg. This is one of the few client files where `npm test` genuinely checks you.
- **Comments, types, log lines, renaming a local variable** — everywhere, including the four
  files above. The always-stop rule is about changing what these things *do*.
- **Adding a route to `routes.ts` and `Router.tsx`.** Both are declarative tables with
  extensive headers stating what may and may not go in them (`routes.ts:15-38` names three
  surfaces that must never get a path, and why `/privacy` and `/terms` sit outside `/app`).
  Read the header. A wrong route 404s, which is visible.
- **A new leaf component** that nothing else imports yet.

**Careful but not stop:**

- **`components/ui/*`** — the shadcn primitives. `button.tsx` is imported by 32 files,
  `input.tsx` by 14. High blast radius, but a mistake here is genuinely visible: a broken
  button looks broken on every screen at once, which is the loudest possible signal.
  `foundation.test.ts` also fails on any literal hex added here.
- **`lib/icons.tsx`** — 60 direct importers, the single largest fan-out in the client. Same
  logic: a wrong icon is wrong everywhere and obvious anywhere. `foundation.test.ts:79-83`
  fails if anything but this file imports `lucide-react`.

---

## 4. Verdict on the prior

**Confirmed on the length, corrected on the reason.**

The list is four, not six. Do not pad it. Three of the four are single files and the fourth
is one habit. That is the honest extent of it, and a rule with four entries someone believes
beats a rule with six that gets skimmed.

The blast-radius framing in the brief is the right one — `csrf.ts` with one importer sitting
under 96 files is exactly the shape it predicted. But **"most frontend mistakes are visible"
is false for this agent in this repository**, and the rule file should say so in the first
paragraph rather than leaning on it. The backend's six are silent because a 200 hides a
dropped field. The frontend's four are silent because **the agent's own gate never opens a
browser**. Different cause, same consequence: the code compiles, the tests pass, and the
damage is real.

There is a second-order point worth putting in the rule file. The backend list says a
migration cannot be rolled back. The frontend has one thing like that and it is *smaller than
the backend's*: a renamed storage key strands a preference. Everything else in the client
**is** revertable. So the frontend rule can afford to be shorter and to lean harder on
question 2 — *can you describe it in one sentence, does it touch at most two files, can you
name the command you ran* — because for the frontend, question 2 is doing almost all the
work. Say that plainly rather than implying a parity that does not exist.

One suggestion for the rule file's question 2, specific to this direction: the backend
version asks "you tested it, and you can name the command you ran." For a backend agent
touching the client, **`npm test` is not an answer to that question.** The honest options are
naming the Playwright spec, or saying plainly that it was not verified in a browser and
handing off to Imran.

---

## What I could not verify

- **I ran no tests.** Every claim about what a test does or does not check comes from reading
  the test source, the vitest config, and the package manifest — not from a run. In
  particular I did not confirm by execution that `foundation.test.ts` passes on a wrong hex;
  I read that it asserts only two `toContain` strings about `tokens.css`
  (`foundation.test.ts:197-198`) and inferred the rest. **That is inference.**
- **I did not open the application.** Everything about what a mistake "looks like" on screen
  is read off the code and its comments, not observed.
- **The transitive numbers are approximate.** My graph resolves relative imports only. It
  ignores side-effect imports (`import './x.js'`, four in the client), the `@/` alias if any
  build step introduces one, and dynamic imports. `observability/error-tracker.ts` is missing
  from the graph entirely for this reason — it is a side-effect import at `main.tsx:28`.
- **I did not check whether `folder-cover.tsx:192` was a deliberate exception.** The comment
  above it explains why the call goes through this origin, but says nothing about why it does
  not go through `http.ts`. It may be intentional. I read it as drift.
- **The light/dark parity claim is thin.** I counted 132 tokens on `:root` and 38 overridden
  under `[data-theme="dark"]`. I did not check which of the remaining 94 are colours that
  *should* have a dark value versus spacings and radii that correctly have none. **The
  "edited in one block and not the other" hazard is inference from the file's structure, not
  a measured defect.**

## Open questions

1. **Should the rule name `parts/presenters.ts` specifically, or the pattern?** It is the
   only file of its kind today. If a second presenter layer appears, a rule naming one path
   goes quietly out of date — the same failure mode `foundation.test.ts` uses exact lists to
   avoid.
2. **Is `api/keys.ts` a fifth entry?** I left it off. Its 10 dependents are real and a key
   *collision* would silently serve one endpoint's data under another's name, which the file
   itself worries about twice (`keys.ts:32`, `:42-43`). But invalidation is unfiltered
   (`queryClient.ts:96`), which absorbs most mistakes, and the file is 52 lines a reviewer can
   read whole. **My call is: not a fifth entry, mention it inside entry 3.** Worth a second
   opinion.
3. **Does the rule file want a "run the Playwright spec" escape hatch?** There is a real one —
   copy the tree to a dot-free path, take an unused port — but `CLAUDE.md` records it as
   expensive and flaky. If the answer is that a backend agent never runs it, then the client
   changes it may make alone must be exactly the ones that fail at compile time or on one
   screen, which is roughly the safe list above and not much more.
4. **Should `src/shared/` appear in this file at all?** It is not `src/client/`, but the
   census puts eight shared schema modules above 80 transitive client dependents
   (`shared/bundle.ts`, `shared/tasks.ts`, `shared/folders.ts` and five more). The frontend
   rule already covers shared from its side. Whether the backend rule needs a mirror sentence
   about *read* schemas is a real question and I have not answered it.
5. **The CSP is on the backend list. Does it need a line on the frontend one too?**
   `src/server/index.ts:145-155` records that the Google avatar failure was a **client**
   symptom with a **server** cause, invisible for months because a photo that will not load
   falls back to initials and looks identical to no photo. A backend agent adding any remote
   URL to the client hits the same wall. It may deserve a cross-reference rather than a
   second entry.

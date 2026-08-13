# P8R sessions R3 and R4 — grouped run report

Branch: `p8d-design`. Started 2026-08-13 at `7723fc3`.
Two sessions, back to back, each in its own isolated context.

- Phase 1 — Component and Design System engineer (`docs/team/08-component-and-design-system.md`): port the designer's seven presentational components.
- Phase 2 — Frontend Architect (`docs/team/07-frontend-architect.md`): write `app/src/client/parts/presenters.ts`.

Each phase appends its own section below.

---

## Phase 1 — Component and Design System engineer (R3)

Commit pushed: **`f48b063`** on `origin/p8d-design`, parent `7723fc3`.

### What running the prototype told me that the files would not have

I ran it at `docs/design/prototype` on port 5199 and drove it through the DOM.
Screenshots were unavailable in this environment (the Browser pane is not
displayed, so the page composites no frames and every screenshot timed out), so
the observations below are measurements off the running page rather than
pictures of it. That turned out to suit the work: every correction this session
owed is about a role, a name or a computed box, and those are exactly what the
DOM answers and a picture does not.

Five things I would not have got from reading his `.tsx` files.

1. **His row action controls have an empty bounding box at rest, and four
   criteria act on them without hovering.** Reading `task-row.tsx` shows a
   width transition and looks like an animation. Measured on the states page,
   `Mark important` and `More task actions` render 0 by 40 on every default
   row; the only ones with a box are on rows the demo passes
   `showSecondaryActions` to. `clickControl` asserts `toBeVisible()` before it
   clicks, and Playwright calls an empty box invisible, so AC-157, AC-162 and
   AC-183 (each opens a row's "More actions" on a freshly loaded page) and
   AC-165 (asserts the un-pull control on My Day) would all have failed at R6
   against a component that reads correctly in the editor. This is the single
   largest thing this session changed and I would have shipped it unnoticed.

2. **His faded states are colour and never opacity.** Every row on the states
   page computes `opacity: 1`, including the completed and abandoned ones;
   what differs is `color`, graphite-600 against graphite-800. AC-097 compares
   `opacity` and `color` together as one string, so his treatment satisfies it,
   but the P8 ledger's note that "the fade is set on the element carrying the
   title because opacity does not inherit" describes a mechanism his files do
   not use at all. Anyone porting from the ledger rather than from the running
   page would have added an opacity that is not his design.

3. **The star's accessible name and its tooltip are one string in his
   component.** In the file, `importantTooltip ?? (important ? ... : ...)`
   reads like a tooltip override. In the browser it is the `aria-label` too, so
   the moment a page points the tooltip outward on Important, the control stops
   answering to "Important" and AC-055 and AC-099 both lose their locator. The
   two attributes had to be split.

4. **His `menuitemradio`.** The move-to-group submenu is a
   `DropdownMenuRadioGroup` in the source, which says nothing about what role
   base-ui renders. Opened in the browser it is `menuitemradio`, and AC-180
   addresses only `menuitem` and `option`. That is the escalation below, and it
   is a fact about a library's output rather than about his code.

5. **His `header` sits inside `main`, which is the only reason his shell exposes
   no banner landmark.** `page-bar.tsx` renders a bare `header`; whether that
   is a `banner` depends entirely on where the shell puts it, and AC-174
   asserts zero banners on every page. Measured: two `header` elements, both
   inside `main`, zero banners. The component cannot hold this alone, so it
   became a written request to R5 rather than a note I would have missed.

I also confirmed the two facts the RFC measured and which the port turns on:
zero `nav` elements and zero `role="navigation"` anywhere in his sidebar, and
all six page entries plus every folder row rendered as `button` with the brand
as the only anchor.

### Files created or changed

Created, all under `D:\dana\app\src\client\components\`:

- `task-row.tsx`
- `quick-add.tsx`
- `state-patterns.tsx`
- `page-bar.tsx`
- `folder-row.tsx`
- `new-folder-dialog.tsx`
- `folder-group-dialog.tsx`
- `index.ts` — the ported set's barrel, and the second importer of
  `styles/tokens.css`

Changed:

- `D:\dana\app\src\client\components\ui\copy.ts` — added `READ_FAILED` and
  `TRY_AGAIN`
- `D:\dana\app\src\client\components\ui\index.ts` — re-exports the two
- `D:\dana\app\src\client\components\README.md` — the ledger: where the seven
  live, the correction tables, the roles, the reveal departure, the two
  requests to R5, and the open escalation

Nothing under `app/tests/`, `app/src/server/`, `app/db/`, `app/src/shared/` or
`app/src/client/api/` was touched. No dependency was added.

### Control names corrected, old to new

Every one is a `.tsx` string change and nothing else; his layout, spacing and
class strings are untouched, per the owner's ruling of 2026-08-13.

| Where | Old | New | Table row that fixed it |
| - | - | - | - |
| `task-row.tsx`, row overflow | `More task actions` | `More actions` | 9.1 names table, "A task row's overflow menu (9.4)" |
| `task-row.tsx`, star filled | `Remove from Important` | `Important` | 9.5, "the star's name is its own state ... 'Important' when filled" |
| `task-row.tsx`, star empty | `Mark important` | `Mark as important` | 9.5, the same sentence, "'Mark as important' when not" |
| `task-row.tsx`, abandoned restore | `aria-label="Restore task"` over text reading "Restore" | `Restore`, the `aria-label` removed | 9.5, "an 'Abandoned' chip and a 'Restore' control" |
| `quick-add.tsx`, collapsed control | `Add task` | `Add a task` | 9.1 names table, "Inline quick-add, collapsed and expanded alike (9.1)" |
| `quick-add.tsx`, expanded text box | `Task title for {folder}` | `Add a task` | the same row; 9.1's 2026-08-13 amendment makes it one name across two states |
| `state-patterns.tsx`, inline retry | `Retry` | `Try again` | 9.1 names table, "The inline retry control (9.4)" |

Two further label changes that are not from the names table and are recorded so
they are not mistaken for invention:

- `page-bar.tsx`: `aria-label="Open page: {title}"` **removed** from the static
  page tab. It sat on a plain `div` with no role and no handler, so it named a
  control that does not exist and told a screen reader the element opens a
  page. Section 9 names no control here; the visible title is now the only
  thing announced.
- `quick-add.tsx`: the escalation control's *tooltip* moved from `More options`
  to `Open full task form`, matching its own `aria-label`. `More options` is
  9.3's name for the task form's expander, and the form is a dialog over the
  page, so both would be in one document. Its `aria-label`, which is the
  accessible name, is unchanged from his.

I went through the whole names table. The four remaining rows are not in my
seven files: the global search control ("Search") and the floating add button
("Add task") are the shell's at R5, and the task form's save, "Add step" and
its overflow are R7's. "Continue" and "Cancel" are `ui/ConfirmDialog.tsx`,
already exact and untouched.

### Roles set against the roles table

| Element | Role required | What his file did | What I set |
| - | - | - | - |
| Each folder row (`folder-row.tsx`) | Link | `SidebarMenuButton` rendering a `button`; the only anchor in his sidebar is the brand | Renders as an anchor carrying a required `href`, with `aria-current="page"` when active. A `render` prop accepts the router's own link element so R5 can supply a `Link`; either way it is an anchor with an `href`, which is both halves of AC-175 |
| A task row (`task-row.tsx`) | List item, or row | `role="listitem"`, measured carrying | Unchanged and kept explicitly; the list container is the page's |

The other four rows of the roles table are outside my seven files: the sidebar
landmark and the six page entries are R5's, the task form's dialog role is
R7's, the switch is R5's and R7's, and the calendar grid cell is R9's. My two
dialogs get their `dialog` role from `ui/dialog.tsx`, which R2 landed.

### The two normative strings, exactly as written

The failed-read line, in `app/src/client/components/ui/copy.ts` as `READ_FAILED`
and rendered by `InlineError` as one child of one `AlertTitle`, so AC-183 reads
it as one text run:

```
Couldn't load this. Nothing was changed.
```

The apostrophe is U+0027, checked byte by byte against the RFC delta and
against the harness's own `copy.readFailed`.

The steps cap notice:

```
Limit 50 steps
```

**It reached me as a verification rather than as an edit, which is the
conditional my instructions set.** No component in my seven carries a steps
editor. The string already exists, already exact, at
`app/src/client/components/task-form/copy.ts:32` as `STEP_CAP_NOTICE`, rendered
by `StepsEditor.tsx:98`. That directory is the Complex Interaction engineer's,
so I did not touch it, and I deliberately did not copy the string into
`ui/copy.ts`: one normative string held in two files is two things to keep in
step with one specification, which is the defect the harness's own header warns
about. R7 replaces that editor and R11's copy sweep owns the nine strings; both
find it where it is.

### Gate, six legs, all measured on this tree

| Leg | Command | Result | Wall time |
| - | - | - | - |
| Lint | `npm run lint` | clean, exit 0 | about 10s |
| Typecheck | `npm run typecheck` | clean, exit 0, all three projects | about 25s |
| Vitest, PGlite | `env -u TEST_DATABASE_URL npm test` | **1476 passed (1476)**, 188 files passed (188) | 215.15s reported, 216s wall |
| Vitest, Postgres | `npm test` | **1476 passed (1476)**, 188 files passed (188) | 63.53s reported, 65s wall |
| Build | `npm run build` | clean; `1180` occurs 0 times in `dist/client/assets/*.css`; the only `min-width` declarations are `0`, `0!important`, `calc(var(--spacing) * 32)`, `* 48`, `* 5` and `var(--anchor-width)`, all component widths from his files and none a viewport floor | about 12s |
| Browser | `env -u TEST_DATABASE_URL npx playwright test` | **98 passed, 37 failed** of 135 | 7.8m reported, 468s wall |

The 1476 figure is the one that had to hold and it held on both engines. Note
for the ledger: the suite is now **188 files**, not the 134 `CLAUDE.md` records,
and the PGlite leg is 215s rather than about 190s.

**The browser leg's baseline, and why the delta is measured rather than
asserted.** I tried to take a baseline before writing anything and it failed:
`http://localhost:3100/api/health is already used`. A `tsx src/server/index.ts`
process held the port, started seconds earlier and gone by the time I looked
again, which is a concurrent session's own `webServer` rather than anything of
mine, and `playwright.config.ts` sets `reuseExistingServer: false` deliberately.
I did not kill it.

So the 98/37 above is the after-count with no before-count beside it, and I
closed that gap by measurement instead of by argument. **None of the seven new
files is in the built client.** Six distinctive strings from them, `Open full
task form`, `Manage `, `Create folder`, `New folder group`, `Loading tasks` and
`data-task-metadata`, each occur **0 times** in `dist/client/assets/*.js`, and
nothing outside `src/client/components/` imports any of them (the only matches
elsewhere are the words "quick-add row" in page comments). The two files I
edited gained exports and lost nothing. The client the browser leg exercised is
therefore behaviourally the pre-R3 client, and 98/37 is simultaneously the
baseline and the after-count. **My phase moved no browser case in either
direction.**

**What the 37 are**, counted from the run and named so the next session does not
re-diagnose them:

- AC-097, one case, "an abandoned row renders faded and struck". This is the
  R2 interim, not a regression of mine: the fade and the strike-through were
  `task-row-abandoned` and its neighbours among the 94 named utilities that
  left with the old token file, and the P8 markup that still writes those names
  now resolves them to nothing. `components/README.md` already records this as
  the expected interim.
- The thirteen RFC 0002 criteria the Adversarial Test Engineer landed red at
  R1, in the 36 remaining cases: AC-166 (4), AC-172 (2), AC-174 (3), AC-175 (3),
  AC-176 (3), AC-177 (3), AC-178 (4), AC-179 (3), AC-180 (4), AC-181 (2),
  AC-182 (5).

Two of the thirteen are **already green** and are worth naming because they are
easy to break: **AC-093 and AC-183 both pass today.** AC-183's nine strings are
all rendered correctly by the P8 client, which was written to section 9 from the
start; it is the port that is known to lose them. Keeping it green is R11's
charter and every session between here and there is capable of turning it red.

### Every problem I hit

1. **His row action controls collapse to a zero-width box at rest, and four
   criteria cannot see them.** Measured, not read. Fixed: the reveal is opacity
   alone in `task-row.tsx` and in `folder-row.tsx`'s action cluster, and the box
   is always reserved. `pointer-events-none` came off with the width collapse,
   because a control that is present but cannot be clicked fails Playwright's
   "receives events" check for the same reason and is no better for a person.
   **This is a real visible departure from his design**: a row's metadata now
   sits a fixed distance from its right edge instead of sliding left as the
   controls grow. It also removes the layout jitter that sliding produced. I
   chose it on 9.1's addressing sentence (every control section 9 names is
   reachable by its role and its name) plus 9.4's row-elements list, which is
   11.13's rule working as written rather than an exception to it. Flagged in
   the file, in the README and here for the visual review of item 33, which is
   the surface that can overrule it.

2. **The star's name and tooltip were one string.** Fixed by splitting them:
   `importantTooltip` now moves the tooltip alone and the `aria-label` is always
   the state's own name. Without this, Q4's outward tooltip on Important would
   silently rename the control and take AC-055's and AC-099's locators with it.

3. **AC-180 cannot address `menuitemradio`.** Escalated, see below. Not worked
   around.

4. **The browser baseline was blocked by a port collision with a concurrent
   session.** Handled by measuring bundle non-inclusion instead of killing
   another session's server. Named here because the co-lead should know that R3
   and R4 running in parallel will collide on port 3100 whenever both reach
   their browser leg, and the config refuses to reuse a running server by
   design.

5. **`styles/tokens.css` was about to fall out of the build and nothing would
   have said so.** Its only importer was `ui/index.ts`, whose export list
   shrinks to nothing as the P8 markup retires, so the first page importing only
   from the new set would have produced an unstyled client with a green gate.
   Fixed by importing it from `components/index.ts` too, which is a stopgap: the
   real fix is one line in `main.tsx` and that file is the Frontend Architect's.
   Requested in the README.

6. **`page-bar.tsx` is a banner landmark or not depending on where the shell
   puts it**, and AC-174 asserts zero banners on every page. The component
   cannot hold this. Written into the README as a request to R5, with the
   measurement that his own shell renders it inside `main`.

**Decided not to fix, with reasons.**

- **The unstyled P8 markup.** Expected interim per my instructions and per the
  README; AC-097's red is its only browser symptom and it clears when R6
  replaces the pages.
- **The 94 named utilities.** Not restored, same reason.
- **The row's `aria-label="Open task: {title}"` on a focusable
  `role="listitem"`.** It is an unusual shape, a list item that is also a click
  target, but it is his design, 9.5 does say "click on any row opens the task",
  and nothing addresses the row by its accessible name (`taskRow` filters on
  text content). Left alone rather than redesigned.
- **The quick-add escalation control's name**, `Open full task form for
  {folder}`. 9.1 describes the control and names it nowhere. Inventing a string
  is precisely the unrecorded deviation RFC 0002 lists as this package's most
  likely failure, so his description stands.
- **The folder row menu's name**, `Manage {name} folder`. Not "More actions":
  9.1 gives that name to the task row's overflow, the task form's and the folder
  header's, which are the same control pointed at different objects, and the
  sidebar row's menu is not that control. AC-180 addresses it as
  `/more|manage|action|option/i` and resolves.
- **His `min-w-48` on the page tab and the other component `min-width`
  declarations.** Section 13 item 32 forbids the prototype's 1180px viewport
  floor; `1180` occurs zero times in the built stylesheet. A component width is
  not that floor.
- **The steps cap notice.** Already exact in another role's directory; see
  above.

### ESCALATION

**To the Adversarial Test Engineer, then the Integration Steward. Trigger:
"An acceptance criterion appears wrong."**

**Spec section.** 9.1's roles table and its closing sentence, "a control not in
this table is reached by its role in the ordinary sense of the word."

**The problem.** `folder-row.tsx` carries 9.1's "a folder is moved between
groups from its own menu" as a submenu built from `DropdownMenuRadioGroup`,
which is his design and is the accurate shape: a folder holds exactly one
personal label, so this is a single-valued choice, and the radio role is what
announces to a screen reader which group the folder is already in. Measured
against the running prototype on 2026-08-13, base-ui renders those entries as
`menuitemradio`. `app/tests/e2e/ac-180-folder-groups.spec.ts` at lines 252 and
272 addresses them as `getByRole('menuitem', ...)` or `getByRole('option', ...)`.
Playwright matches ARIA roles exactly and never by superclass, so neither
resolves, and AC-180's "a folder moves between groups and out of every group"
case cannot pass against a component that is correct.

**Options considered.** (a) Degrade the submenu to plain `DropdownMenuItem`
entries so the locator resolves. Rejected: that is writing the implementation
from the test, which protocol section 8 exists to prevent, and it pays a real
accessibility property, the announced current group, for nothing. (b) Add a
duplicate hidden control the test can find. Rejected outright. (c) Widen the
criterion's locator.

**Recommendation.** (c). One term added to AC-180's existing `.or(...)` chain so
it admits `menuitemradio` beside `menuitem` and `option`, which is the same
shape the tester already used there and which no other criterion depends on.
9.1's roles table fixes six elements and this is not one of them, so the
criterion is narrower than the specification rather than the component being
wrong; nothing in section 9 or section 12 moves. The file is the Adversarial
Test Engineer's and I did not touch it.

**Urgency: low.** AC-180 is red until R10 regardless, so nothing turns green or
red on the timing. It needs to be settled before R10 reports.

### Handoff notes for R5, R6 and R10

- Import the ported set from `app/src/client/components/index.js`, not by file
  path, or the token stylesheet leaves the build. Better still, land
  `import './styles/tokens.css'` in `main.tsx` and tell me to remove both
  imports.
- `PageBar` must render inside `main`. AC-174 asserts zero banner landmarks.
- `FolderRow` now requires `href` and takes an optional `render` element for the
  router's link. `aria-current="page"` follows `active`.
- `TaskRow` takes `importantTooltip` for Q4's outward tooltip on Important only.
  Passing it anywhere else renames the control and breaks AC-055 and AC-099.
- `InlineError` takes `onRetry`. AC-171 presses the control and asserts the read
  happened, so an unwired callback renders a control that does nothing.

---

## Phase 2 — Frontend Architect (R4)

Session R4 of package P8R, on branch `p8d-design`, opened at `f48b063` and run
against `docs/team/_shared-protocol.md` plus `docs/team/07-frontend-architect.md`.
Delivers `app/src/client/parts/presenters.ts`, the layer that maps our API
shapes onto the designer's display props, with its own unit tests.

The state this session derived from the repository rather than from any
summary: R1's thirteen criteria are in `app/tests/` and red, R2's dependency
set, token file and twenty primitives are in, and R3's seven presentational
components are in `app/src/client/components/`. Nothing in `app/tests/` and
nothing under `app/src/client/api/` was touched.

### What running the prototype told me that reading the files would not have

I ran it as `docs/design/prototype` on port 5199 through the Browser pane, both
views: the shell at `/` and the state lab at `/?view=states`. Six findings, of
which the first two changed the code I wrote.

**1. His prototype has no due-label formatter, so there was nothing to port.**
This is the finding that most changed the work. Every due label in his codebase
is a hand-written string: `fixtures.ts` and `shell-page.tsx` between them carry
`"Due today"`, `"Due 6 Aug"`, `"Due 9 Aug"`, `"Due 12 Aug"`, `"Due 14 Aug"`,
`"Due 16 Aug"`, `"Due 17 Aug"`, `"Due 18 Aug"` and `"Overdue · 6 Aug"`, and no
function anywhere produces one. His two real date formatters are elsewhere and
are not the row's: `search-overlay.tsx` formats a search result's date with a
year, and `task-form.tsx` formats a date-picker value as "Today", "Tomorrow" or
"Aug 6, 2026". So the row's formatter is new code written this session, and the
only evidence for what it must produce is the literal strings the running pages
show. Reading `task-row.tsx` alone would have suggested the opposite, that a
label arrives ready-made and the presenter only passes it through.

**2. The design agrees with Q3C that a finished task is not overdue, and this
is observable only with the page in front of you.** The state lab's STATE-03 is
a completed row carrying `"Due 9 Aug"` while the shell's own header reads
"Monday, 10 August": a past date rendered in the ordinary form, with no colour,
no alert glyph and no "Overdue" word, on the same surface where STATE-02 shows
the overdue treatment on 6 Aug. That is the whole of the pending-only
restriction, confirmed against the design rather than only inferred from
Q3C's sentence.

**3. His shell renders `min-w-[1180px]` on its own root element.** Measured off
the live DOM: `#root`'s only child is
`<div class="flex h-svh min-w-[1180px] flex-col overflow-hidden bg-background">`,
written in `app-shell.tsx` line 324. That is the floor section 13 item 32
forbids and that R2 stripped out of the token file. It is not in `tokens.css`;
it is in the shell component R5 is about to port. **R5 must drop that class
when it carries the shell across**, and the grep that decides item 32 is
against `dist/`, so a `min-w-` written in a `.tsx` reaches the built stylesheet
exactly as a declaration would.

**4. `page-bar.tsx` really does render inside `main`, and the document exposes
zero banner landmarks.** The live tree is
`div > div[data-slot=sidebar-wrapper] > main[data-slot=sidebar-inset] > header`.
That confirms the request `components/README.md` filed against R5 for AC-174,
measured rather than assumed.

**5. His folder colour is one value everywhere.** Every folder in his fixtures,
in the sidebar and on task rows alike, is `var(--color-graphite-900)`; his
design ships no per-folder swatch at all, because 7.4's `my_color` is a runtime
choice his fixtures have no source for. That is why the presenter's fallback
for a null `my_color` is that exact token and not something invented.

**6. A single-word name yields a single letter.** The running rows show `S`
beside `Sara`, which fixes the initials rule's degenerate case against the
design rather than against a guess.

**And one thing I could not make the prototype do, reported because R5 depends
on it.** In this Browser pane, at 1280x720 and at 1440x900, on a fresh load,
**his shell renders no sidebar at all**: `[data-slot="sidebar"]` is absent from
the document, and `[data-slot=sidebar-wrapper]`'s only child is the `main`. I
checked the obvious cause and eliminated it: `matchMedia("(max-width: 767px)")`
reports false, `innerWidth` is 1280 or 1440, `useIsMobile` therefore returns
false, `app-sidebar.tsx` passes `collapsible="icon"` so the `collapsible ===
"none"` branch is not taken either, and the console is clean. I could not
determine the cause and I am not claiming one. It is an environment
observation, not a property of the prototype: RFC 0002's own sidebar
measurements and R3's ledger both record positive observations of that sidebar
rendering ("six `button` elements carrying `aria-current`", "the only anchor in
the sidebar is the brand"), which a sidebar that never rendered cannot produce.
**R5 should re-measure the sidebar in whatever browser does render it, and
should not read a zero from this pane as a zero in the prototype.** It changed
nothing about this session's work, `presenters.ts` mapping no sidebar prop that
is not also `folder-row.tsx`'s, which I read from the file and from R3's port.

### Files created or changed

| Path | What |
| - | - |
| `app/src/client/parts/presenters.ts` | New. The whole mapping: the due label, the overdue computation, the initials derivation, the folder resolution by id, the folder-group name-to-id bridge, and `taskRowDisplay` |
| `app/src/client/parts/presenters.test.ts` | New. 54 unit tests, this role's under protocol section 8 |
| `app/src/client/README.md` | Changed. The `parts/` row of the "Where things live" table and its paragraph, which still described the directory as provisional rows awaiting replacement, plus a new closing section recording what this module owns, its three rules, its three first passes and its one open request |

Nothing else. `app/tests/` untouched, `app/src/client/api/` untouched,
`app/src/client/components/` untouched, no dependency added.

### The three rules, each with the sentence it came from

**The due label.** Four forms, one per case:

| Case | Label |
| - | - |
| `due_date` null | no badge at all |
| `due_date == today` | `Due today` |
| `due_date < today` and `status == 'pending'` | `Overdue · 6 Aug` |
| every other dated row | `Due 6 Aug` |

and `due_time`, when the task has one, is appended as ` 09:00`, giving
`Due today 09:00`, `Due 18 Aug 18:30`, `Overdue · 6 Aug 23:45`.

*Where each part comes from.* The three cases are 8.10's boundary statement,
transcribed: "a task with due_date D is due today when D = today(V), overdue
when D < today(V), future when D > today(V)". The wording and the separator are
the design's, and 9.1 is what makes them the design's to fix: "Where a region's
name comes from data rather than from this section, a test addresses it by the
text the page rendered rather than by a string fixed here. Done's day groups are
the case: the format of a date is the design's and this section has never
spelled one." The time is Q4's, whose Important-page row adornments read "dated
rows show due date and time like a Planned row"; 24-hour notation is protocol
section 7's convention, and minute precision is 4.11's.

**The overdue rule.** `status === 'pending' && due_date !== null && due_date <
today`, with today from `todayInBrowserZone()` and the comparison lexicographic
because both operands are 4.11's `YYYY-MM-DD`, which makes lexicographic and
chronological the same order.

*Where it comes from.* The comparison is 8.10's "overdue when D < today(V)" and
9.4's row element list, "due badge (overdue styled when due_date < today)". The
pending-only restriction is Q3C's sentence, which gives all three statuses their
own treatment in one line: "Pending renders normal (overdue styled on past
dates), completed faded and checked, abandoned faded and struck." The design
agrees, measured, at finding 2 above.

**The initials rule.** The first letter of the first word, plus the first letter
of the last word when there is more than one, upper-cased, at most two, taken
from the *rendered* name rather than from the record so the two cannot disagree.

*Where it comes from, and it is the weakest of the three.* **The specification
is silent on initials at every section**; I searched all thirteen and there is
no sentence about an avatar's contents anywhere. What exists is the design:
brief section 6's row anatomy gives an assigned row "a small avatar chip with
their name", and the running prototype renders "S" beside "Sara" and pairs the
initials with the name rather than showing the initials alone. So the rule is
recorded in `src/client/README.md` as a **first pass** and not as settled.

### How I resolved the id-keyed to name-keyed mismatch

**The folder chip and the folder dot are resolved by id, which is the mismatch
the module exists for.** 7.0's `TaskCard` carries a folder stub of `{id, name,
is_default}` and no colour, deliberately: 11.4's ruling of 2026-08-12 says a
folder's colour is the viewer's own `my_color` on 7.4's membership, per member
and free-form under 4.4, so it is data on the wire rather than a design value
and a card carrying it would answer a question the card never asks. His row and
his sidebar row take a name and a colour and no id. So `folderDisplay(stub,
folders)` looks the id up in the `Folder` objects `useFolders()` already
returns, takes `name` and `my_color` from the match, and falls back to the
stub's own name plus the neutral token for the window before that list arrives
or for a folder the list does not hold. A unit test pins that two folders
sharing one name resolve differently by id, which is the case the fallback
would otherwise hide.

**A folder with no personal colour takes `var(--color-graphite-900)`**, which is
the value the designer's own fixtures give every folder in his prototype. It is
a token reference rather than a raw value, so 11.4's rule that raw colours live
only in `tokens.css` is untouched, and it is the value for 4.4's null rather
than a substitute for a colour somebody chose.

**Folder groups need no bridge and his group dialog does.** 9.1 makes a group
"the label of 7.4's my-membership and nothing else", so a group is a string on
both sides; `folder-row.tsx`'s `groupLabels`, `currentLabel` and
`onMoveToLabel` are already in our own currency, and `folderGroupLabels()` just
gathers the distinct labels ascending, which is 9.1's order for them.
`FolderGroupDialog` is the one real mismatch: it takes `folders` as `{name,
color, label}` and hands back `onSubmit(label, folderNames)`, while the write is
PATCH `/folders/:id/my-membership` and needs ids.

**4.3 does not make folder names unique**, its only unique index being one Inbox
per account, so two folders a person can see may carry the same name, one their
own and one shared with them. `folderIdsForNames` therefore resolves one
selected name to *every* id that carries it. That is a deliberate reading and it
is the honest one: the alternative picks one of two identically labelled rows,
writes the label to a folder the person did not point at, and leaves nothing on
the screen to say which one moved. It is recorded here and at the file as a
limitation of his dialog's shape rather than as a defect in either half, and it
is R10's to live with when it wires that dialog.

**The three orderings are not ported.** `plannedServerOrder`,
`importantServerOrder` and `doneGroups` exist in `shell-page.tsx` because his
screens run on `fixtures.ts` and have no server. Section 6's preamble is
explicit ("every view returns rows already ordered; clients never re-sort") and
7.11 makes a rule found only in the client a specification violation. None of
the three is in this module and the file header says so, so that the next
session reading his shell beside ours does not read the absence as an omission.

### Where the specification is silent, and what I chose

Five, each named at the file and in `src/client/README.md`, none of them
silently.

1. **The due date's format.** 9.1 hands it to the design outright, and the
   design carries no formatter, only rendered strings. **Chosen:** reproduce his
   strings exactly, day first, no leading zero, three-letter month:
   `6 Aug`, `14 Aug`.
2. **A due date in another year.** His screens settle the same-year form and say
   nothing about any other, every date on them falling in the fixture's own
   year. **Chosen:** append the year only when it differs from the reader's,
   giving `6 Aug 2027`. It changes no string the design actually shows, and
   without it two dates twelve months apart render identically.
3. **How the month is named.** **Chosen:** a fixed twelve-entry table, not
   `Intl`. A locale-driven formatter renders "août" on a French browser beside
   section 9's normative English copy, and this machine's own Postgres tooling
   is the standing demonstration that a French locale is not hypothetical here.
   The table also makes the function total: it constructs no `Date`, so it
   cannot read a clock, cannot shift a civil date across a zone, and cannot
   depend on an ICU version.
4. **Whether the row's due badge carries the time.** 9.4 says "due badge" and
   spells nothing; his rows never show one, but no fixture of his carries a
   timed task either, so his silence is an absence of evidence. **Chosen:**
   carry it, on Q4's "due date and time like a Planned row", which is the one
   sentence in the corpus that says what a dated row shows.
5. **A null `display_name`.** 4.1's note is "null after deletion, rendered
   'Deleted user'". The P8 client renders "Someone" at four sites.
   **Chosen:** 4.1's own string, because it is the specification's and
   "Someone" is nowhere in it, and AC-178 asserts "Deleted user" for the same
   fact on the task form. The branch is unreachable from an assignee in
   practice, 8.10 step 4 clearing the deleted account's assignments before it
   scrubs the row, so this changes no rendered pixel today; it is pinned so that
   the day it becomes reachable it is right. The four P8 sites are not mine and
   are retiring at R5 to R10; a reviewer who wants one string rather than two
   should route the change there.

Two further silences I did not close, because closing them would have been
inventing rather than choosing: the tooltip on Important renders Q4's own date
form (`Also in Planned, due 2026-07-28`) rather than the design's, because Q4's
example writes the ISO form and that is the only date format any numbered
section spells; and the repeat glyph, below.

### The one prop I could not fill, and the request that goes with it

`task-row.tsx` renders the repeating glyph only when its `recurrence` prop
carries the rule as prose, announcing it as `Repeats {recurrence}` in both the
tooltip and the accessible name. **Frozen 7.0 gives a card `is_recurring:
boolean` and puts `recurrence_rule` on TaskDetail alone**, so nothing a view
endpoint hands this module can fill that string, and both values that would fill
it are wrong: a rule invented here is copy no numbered section carries, which
RFC 0002's own "Alternatives considered" names as this package's most likely
failure, and a placeholder renders "Repeats repeats" or something equally
untrue.

So the presenter sets `recurrence: undefined` and a repeating row shows no
glyph. That is a visible regression against the brief's state table, which gives
a repeating row "a small repeat glyph", and against the P8 client, which
rendered the glyph with `Repeats` as screen-reader text. **Request to the
Component and Design System engineer:** `task-row.tsx` should admit the boolean
it can actually be given, rendering the glyph on `recurring` with a fixed
screen-reader string, and take the prose rule only where a caller has one. The
file is that role's; I did not touch it. No acceptance criterion reads the
glyph, so nothing turns red on the timing, and the surface that will notice is
the human visual review of section 13 item 33.

### The unit tests

54 tests in one file, `app/src/client/parts/presenters.test.ts`, all passing.
They are this role's under protocol section 8 and they exist because **no
acceptance criterion reads this module**: the thirteen R1 added and the ones
already green assert rendered roles, names, regions and copy, and every one of
them would still pass if a due label here read the wrong date, because they
assert that a due badge exists and never what it says.

| Group | Cases | What it pins |
| - | - | - |
| `formatDueDate` | 5 | The designer's four literal strings; all twelve month abbreviations; the year suffix only across a year boundary; a malformed date returned untouched rather than guessed at; no locale in the month name |
| `dueDisplay` | 9 | 8.10's three cases; Q3C's pending-only overdue, asserted separately for completed and for abandoned; the time appended with the seconds dropped; the comparison chronological across a year boundary; the day before today overdue and the day itself not |
| `initialsOf` | 7 | One word to one letter, two and three words to first-and-last, whitespace, upper-casing, the empty name, and a name outside the basic plane contributing a whole code point rather than half a surrogate pair |
| `personDisplay` | 2 | 4.1's "Deleted user" and its initials derived from the rendered name |
| `folderDisplay` | 5 | Resolution by id including two folders sharing one name; 4.4's null colour taking the token; the card's stub as the fallback; a renamed folder rendering its current name |
| `folderRowDisplay` | 2 | 8.11's pending tally and 9.1's `/app/folders/:id` |
| folder groups | 6 | An option carrying no id; a shared name resolving to both ids; order; 9.1's ascending labels |
| `taskRowDisplay` | 16 | 9.4's assignee-when-not-the-viewer and Q2's default-folder exception; Q3's unassigned chip needing both conditions; 9.4's pulled marker being My Day's and absent when Q1's automatic disjunct holds, in all four combinations; steps; the invite chip; Q4's outward tooltip; `recurrence` never invented; determinism |
| no clock of its own | 2 | That the module's own source contains no `new Date`, no `Date.now`, no `Intl.` and no locale date formatting, and that its one date read goes through `api/tz.js` |

The last group is a source-level assertion and is deliberate: the failure it
guards against is an *absence*, and no call can assert one. It reads the module
through Vite's `?raw` rather than `node:fs`, because this project typechecks
under `vite/client` and carries no node types.

### Gate, six legs, all measured

Run from `app/`. The vitest total stood at 1476 before this phase; 54 of the
1530 below are mine and the other 1476 are unchanged.

| Leg | Command | Result | Wall time |
| - | - | - | - |
| Lint | `npm run lint` | exit 0 | 4 s |
| Typecheck | `npm run typecheck` | exit 0 | 7 s |
| Vitest, PGlite | `env -u TEST_DATABASE_URL npm test` | **1530 passed** in 189 files, exit 0 | 200 s |
| Vitest, Postgres | `npm test` | **1530 passed** in 189 files, exit 0 | 60 s |
| Build | `npm run build` | exit 0; PWA precache 11 entries | 5 s |
| Browser | `env -u TEST_DATABASE_URL npx playwright test` | baseline 32 failed, 103 passed; after, **32 failed, 103 passed**, exit 1, the identical failure set | baseline 4.6 min, after 4.6 min (278 s) |

**The browser leg is red by design and stays red until R10.** I measured a
baseline before writing anything, and the failures are the thirteen criteria R1
landed red plus the P8 markup that renders unstyled since R2 replaced the token
file. **Which browser failures my phase moved: none, in either direction.** The two
runs are byte-comparable, 32 failed and 103 passed of 135 both times, and the
32 failing case ids are an identical set: AC-182 (5), AC-180 (4), AC-178 (4),
AC-166 (4), AC-179 (3), AC-174 (3), AC-181 (2), AC-177 (2), AC-176 (2),
AC-172 (2) and AC-097 (1). Twelve of the thirteen criteria R1 landed red, plus
the one P8 case that the R2 token swap left unstyled, which
`components/README.md` already records as the expected interim. Nothing this
phase wrote is imported by any page, so a moved case would have been a
surprise; the baseline exists so that the claim is measured rather than
reasoned.

**One discrepancy with Phase 1's numbers, reported rather than reconciled
away.** R3 measured 98 passed and 37 failed at 7.8 minutes; my baseline, taken
on R3's own commit `f48b063` with nothing of mine on the tree, measured 103
passed and 32 failed at 4.6 minutes, and my after-run reproduced it exactly.
The five cases are all of AC-175, one of AC-176 and one of AC-177. R3's report
records that its run met `http://localhost:3100/api/health is already used`
from a concurrent session's server, so the likeliest reading is that its run
was degraded rather than that five cases turned green with no commit between
them. **R5 should treat 32/103 as the standing baseline and re-measure rather
than trust either number**, and should be aware that AC-175 may be passing for
a reason the port is about to remove.

### Every problem I hit

1. **The typecheck rejected `node:fs` in a client test.** `tsconfig.client.json`
   sets `"types": ["vite/client"]` and includes `src/client/**/*`, so my
   source-inspection test could not read its own module the obvious way. Fixed
   by importing through Vite's `?raw` suffix, whose string type that same
   declaration file supplies. Caught by the gate before anything was committed.
2. **`EXIT=$?` after a pipe reports `tail`'s status, not the command's.** My
   first browser-leg baseline printed `EXIT=0` under a run with 32 failures. The
   root `CLAUDE.md` warns about exactly this and I walked into it anyway; every
   leg above is reported from `${PIPESTATUS[0]}` and from the summary line, not
   from `$?`.
3. **The prototype's shell renders no sidebar in this Browser pane**, cause
   undetermined, detailed above. Not fixed, because it is not mine to fix and
   because the evidence says it is this environment rather than the prototype.
   Flagged to R5 rather than worked around.
4. **The repeating glyph cannot be produced from a `TaskCard`**, detailed above.
   Not fixed: the fix is in the Component engineer's file and inventing the copy
   here would be the unrecorded deviation this package's RFC warns about.
5. **`folder-group-dialog.tsx` is keyed by a name that 4.3 does not make
   unique**, detailed above. Not fixed, because both available fixes are worse:
   changing his dialog's prop shape is R3's file and R10's wiring, and
   disambiguating names for display would put data-derived suffixes into a
   surface the design fixes. Resolved to every matching id and recorded.
6. **The P8 client's "Someone" and 4.1's "Deleted user" are two strings for one
   fact.** I used 4.1's in my module and did not touch the four P8 sites, which
   are not mine. If a reviewer wants one string in the client, it is a change to
   `pages/` and `components/task-form/` and belongs to the sessions replacing
   them.

### ESCALATION

None. Two items above are requests rather than escalations under protocol
section 6, and I am naming them so nobody has to decide which they are:

- **The repeat glyph** is a change to a file outside my paths
  (`app/src/client/components/task-row.tsx`), which protocol section 3 routes to
  the Integration Steward as a request with a precise description. That
  description is in the section above. It is not a specification ambiguity: the
  brief asks for a glyph, 7.0 gives the boolean, and only the component's prop
  shape stands between them.
- **The initials rule** is a genuine specification silence, but it is one this
  role is entitled to close as a first pass under `src/client/README.md`'s own
  convention, and closing it costs nothing that a later ruling could not undo in
  one function. I have recorded it as a first pass rather than escalating a
  silence with no consequence attached.

I also carried forward, unresolved and not mine, the AC-180 `menuitemradio`
escalation R3 raised against `folder-row.tsx`. Nothing in this session touches
it.

### Handoff notes for R5, R6, R7, R8 and R9

- Read today **once per page**, with `presenterToday()`, and hand it to every
  row through `RowContext.today`. Do not call it per row: two rows either side
  of midnight would then disagree inside one list.
- `RowContext` carries the page's own facts and each has a spec sentence behind
  it: `viewerId` from `useMe()`, `folders` from `useFolders()`,
  `multiMemberFolderIds` from `useMultiMemberFolderIds()` and only on the pages
  Q3 gives the unassigned chip, `starTooltip: 'outward'` on Important alone
  (Q4), `showFolder: false` on Tasks where the group heading is the folder
  (Q2), and `showPullMarker: true` on My Day alone (9.4).
- `taskRowDisplay` returns the display half of his `TaskRowProps` and nothing
  else. The callbacks are still `parts/useRowActions.ts`'s, unchanged, and the
  visual-state props are his state lab's and belong to no page.
- The return type is written as a `Pick` of his own interface, so if
  `task-row.tsx` renames or retypes a prop, this module fails the typecheck
  instead of silently leaving it unmapped. Keep it that way.
- `folderRowDisplay` gives the sidebar row its `name`, `color`, `pending` and
  `href`; `active`, `render` and the callbacks are the shell's.
- **Drop `min-w-[1180px]` when you port `app-shell.tsx`.** Section 13 item 32,
  and the grep that decides it is against `dist/`.

### Commit

`32e51e0` on `p8d-design`, pushed to `origin p8d-design`. Three files: `app/src/client/parts/presenters.ts`, `app/src/client/parts/presenters.test.ts`, `app/src/client/README.md`.

---

## Run close — reconciliation across both phases

Written by the session that grouped R3 and R4, on the one fact neither phase
could establish alone.

**The browser leg is 32 failed / 103 passed of 135, and R3's 37 was an
artifact.** Phase 1 measured 98 passed / 37 failed; Phase 2, measuring a
baseline on Phase 1's own commit `f48b063`, measured 103/32, then the identical
32 after its own change. Phase 1 recorded a port-3100 conflict with a concurrent
session's `webServer` during its run and could not obtain a clean pre-change
baseline for the same reason. Two runs on one commit, one of them known to have
been degraded, so the clean one stands. The five cases that differ are all of
AC-175 plus one each of AC-176 and AC-177. **R5 should treat 32 as the number to
beat, not 37.**

Both phases therefore moved the browser leg by **zero**, and neither claim rests
on the other's arithmetic.

Two escalation-adjacent items are open and neither belongs to a session that has
ended: AC-180's `menuitemradio` (R3, above) and the repeat-glyph request from
`is_recurring` (R4, above). Both are recorded in their own phase sections.

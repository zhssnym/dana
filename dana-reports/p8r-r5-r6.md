# P8R grouped session: re-acceptance, name corrections, R5 and R6

Branch `p8d-design`. Four phases, back to back, each its own agent session with its
own persona, each deriving its state from the repository per protocol section 2.

Starting point, measured by the co-lead on 2026-08-13 at `32e51e0` and carried
forward through `daf7e9b`: lint and typecheck clean, 1530 vitest tests across 189
files green on PGlite and on PostgreSQL 18, build clean, browser leg 135 cases with
103 passing and 32 failing. The thirty-two red are the plan, not a defect. They are
the number to beat, and no phase may reduce them by weakening a test.

| Phase | Persona | Delivers |
| - | - | - |
| 1 | Integration Steward | RFC 0002 re-acceptance recorded, changelog entry |
| 2 | Component and Design System | The two disagreeing accessible names corrected |
| 3 | Frontend Architect | R5: the shell and sidebar on our router |
| 4 | Frontend Architect | R6: the six list screens on our view hooks |

---

## Phase 1 — Integration Steward

Landed at `b5eec9f` on `p8d-design`, pushed. Documentation only: two files,
`CHANGELOG.md` and `docs/rfcs/0002-client-ui-replacement.md`. Nothing under
`app/` was touched, and nothing in `docs/spec/` was amended, the delta still
merging at implementation rather than now.

### What changed

**`docs/rfcs/0002-client-ui-replacement.md`.** The status line reads `Accepted`
again. The header keeps `Returned to Draft` as its own line and gains a
`Re-accepted` line dated 2026-08-13, recording that the owner's decision was on
the three amendments alone rather than on the RFC again, and that the Steward
re-checked the numbering on the same date. That shape is the preamble's own
lifecycle applied literally: `Draft` to `Accepted`, with the Steward recording
the status change and assigning final numbers, a Draft's numbering being
provisional. Both round-trip lines stay so that a later reader finds the trip
rather than a status that appears never to have moved.

A closing block was added to **Amendments after acceptance** carrying the
re-acceptance, the numbering re-check with its result, and the two figures that
did move.

**`CHANGELOG.md`.** One entry at the top of `### Added`, above the change
control entry it answers, in the file's existing voice: bolded lead sentences,
the numbering check stated with what was verified against what, the untouched
implementation plan stated with how it was verified, and the one piece of work
the untouched plan does not carry.

### How the no-numbers-move claim was confirmed

Not taken from the briefing. Five checks, each against an artifact:

1. **Which commits could have moved anything.** `git log 32e51e0..HEAD --
   docs/rfcs/0002-client-ui-replacement.md` returns exactly one commit,
   `6f8dbaf`. `git diff --stat 32e51e0..HEAD` shows four files total and not one
   of them under `app/`, so no application code differs from the sha the
   baseline was measured at.
2. **The whole diff of that commit, read.** Eight hunks. The header, the new
   Amendments section, the eleven names rows and their five reason paragraphs,
   the new 9.4 delta unit, one line of 9.6's filter copy, one sentence swapped in
   9.8's gate bullet plus its new reasoning paragraph, and the text of AC-172.
   No hunk adds, removes or renumbers a criterion or a section 13 item.
3. **The tail of the file, compared rather than read.** Everything from
   `### Append to section 12` to the end of the file hashes identically before
   and after (`791a0e5c06c1b8c998754be1b271bfaf`), and so does everything from
   `## Implementation plan` to the end (`f69c677d998116916e6f5fb33b03a2ae`). That
   covers AC-174 to AC-183, section 13 items 35 to 37, the item 27 and item 30
   replacements, the compatibility accounting, the alternatives, the open
   questions and the twelve-row plan. The implementation plan is untouched byte
   for byte, which is stronger than the briefing's claim rather than equal to it.
4. **The numbering re-check the preamble asks for at acceptance**, run against
   the repository rather than inherited from the first acceptance:
   `docs/spec/12-acceptance-criteria.md` still ends at AC-173,
   `docs/spec/13-open-questions.md` still ends at item 34, AC-174 to AC-183
   appear nowhere outside the RFC except in R1's own spec files under
   `app/tests/e2e/`, role 08's `app/src/client/components/README.md` and stale
   `app/test-results/` artifacts, none of which is a claim on a number, and
   `docs/rfcs/` holds three files of which RFC 0001 references no criterion above
   AC-173 and adds none of its own.
5. **What each amendment could have needed a number for.** The first is eleven
   rows inside a table the 9.1 unit already carried. The second strikes a
   sentence from the 9.8 unit and a clause from the text of AC-172, a criterion
   this RFC was already rewriting under its own number, so nothing is added and
   nothing is invalidated that was not already being rewritten. The third is a
   new delta unit whose rule AC-178 and AC-179 already assert, which is why it
   was a silence rather than an addition.

**Verdict: the claim holds, with two qualifications that are worth stating and
are not falsifications.** Two figures moved: the delta is sixteen units rather
than fifteen, and the touched-sections line gained 9.4. Neither is a number
anything cites, and both are recorded in the RFC and the changelog.

And one piece of work exists that the untouched plan does not schedule: R3 has
landed, and amendment 1 rules four names against what it shipped, so corrections
are owed inside R3's own paths with no row carrying them. The plan is untouched
as a fact about the file, which is what was claimed; this is named so nobody
later reads its absence as an oversight. Phase 2 of this run is that correction,
so it is scheduled by this run rather than by the RFC.

### The prototype was run

`npm run dev` at `docs/design/prototype` through `.claude/launch.json`'s
`imran-prototype` entry, port 5199, opened and inspected, then stopped. Four
things measured in the running application, each bearing on an amendment:

- Zero `nav` elements and zero `role="navigation"` in the whole document, which
  is the RFC's own measured finding standing up on re-measurement.
- A task row is `listitem` with the accessible name `Open task: {title}`. The
  prototype already treats the row as a thing that opens, which is exactly what
  amendment 3 writes into 9.4 and what no numbered section said before it.
- The row's overflow is named "More task actions" and its star reads "Mark
  important" and "Remove from Important", none of which is the specified string.
  Those are R3 relabel work under rules that predate these amendments, not new.
- `?view=invites` renders the gate alone, no sidebar and no page beneath, which
  is amendment 2's premise: the gate is where invites are answered.

One observation from the prototype's People screen, offered to whoever ports it
rather than as a finding against this phase. It carries a "Pending invitations"
section, but of invites the viewer has **sent**: email, sent time and a cancel
control. That is not Q12's inbound list, so amendment 2 strikes the right
sentence and this surface survives it untouched. It is also a surface 9.8 does
not name, and it predates these amendments, so it is a candidate for exactly the
failure RFC 0002's own alternatives section warns about, porting a component and
saying nothing. It was not among the ten affordances the RFC ruled.

### Gate

Run from `D:\dana\app`. The change is documentation only and touches no file
under `app/`, so every leg here is a confirmation that the tree is where the
baseline says it is rather than a measurement of this change.

| Leg | Result |
| - | - |
| `npm run lint` | clean |
| `npm run typecheck` | clean, all three projects |
| `npm test` (Postgres, default workers) | **1 failed, 1529 passed of 1530**, twice; then 1530 passed on a third run. See below |
| `npm test --maxWorkers=1` (Postgres) | 189 files, 1530 tests, all green, 185s |
| `env -u TEST_DATABASE_URL npm test` (PGlite) | 189 files, 1530 tests, all green, 197s |
| `npm run build` | clean |
| `env -u TEST_DATABASE_URL npx playwright test` | **135 cases, 103 passed, 32 failed, 4.5 minutes** |

**The browser leg is exactly the baseline count.** 103 passing and 32 failing.
The thirty-two are AC-097 (1), AC-166 (4), AC-172 (2), AC-174 (3), AC-176 (2),
AC-177 (2), AC-178 (4), AC-179 (3), AC-180 (4), AC-181 (2) and AC-182 (5), which
is the red set R1 wrote and R3 has not yet turned. No failure moved in either
direction, which is what a documentation commit should do to it.

### ESCALATION

**AC-086 fails intermittently on the Postgres leg at default parallelism, and it
is not this change.** Routing: the Adversarial Test Engineer owns the criterion
and `app/tests/`, and whoever owns the 7.1 recompute owns the other candidate;
the co-lead decides which. Recording it here because a criterion that failed two
runs in three is a criterion CI can go red on with nobody having changed
anything, and because a Steward who saw it and said nothing would have handed
the next phase a gate it cannot trust.

What was measured today, in order:

- `tests/ac-086-timezone-recompute.test.ts > AC-086: one login recomputes two
  due dates either side of a transition` failed on two consecutive full Postgres
  runs, the same assertion both times:
  `expected '2010-01-15T04:00:00.000000Z' to be '2010-01-15T14:00:00.000000Z'`.
  09:00 on 2010-01-15 in `America/New_York` is 14:00Z. The value observed is
  09:00 at UTC+5, which is the `KARACHI` zone the fixture is travelling **from**,
  so what the case caught is the recompute of 7.1 not having landed on that row
  when it was read.
- The same file alone on the Postgres leg: 7 of 7 green.
- The full Postgres leg with `--maxWorkers=1`: 1530 of 1530 green.
- The full PGlite leg: 1530 of 1530 green.
- A third full Postgres leg at default parallelism, after the two above:
  1530 of 1530 green.

So it is intermittent rather than deterministic, it appeared only on the leg
where parallel workers share one `dana_test`, and it did not appear on PGlite.
The two failures came immediately after the browser leg, on a loaded machine,
and the pass came later on a quiet one, which fits a read-after-write race that
only contention exposes. Two readings are available and I am not the role that
should choose between them: either the login's recompute is not ordered before
the response the test reads, which is a defect the PGlite leg may structurally
be unable to see, or the case needs isolation it does not have. **It is not
caused by this commit**: `git diff --stat 32e51e0..HEAD` touches no file under
`app/`, so the code under test is byte for byte the code the baseline was
measured on. CI runs `npm test` with no worker flag, so CI is exposed to it.

**Recommendation.** Do not paper over it with a retry and do not weaken the
case. Hand it to the Adversarial Test Engineer with these five measurements to
decide which of the two readings it is, on the ground that the case's own header
says the fixture exists to catch an implementation that "never recomputed at
all", so a race in the recompute is exactly what it is built to see and the
finding may be real. Until it is settled, read a lone AC-086 failure on the
Postgres leg as this rather than as a regression, and confirm by re-running that
one file, which passes in isolation.

### What remains

Nothing owed by this phase. The RFC is Accepted, the changelog carries the
re-acceptance, and P8R is unblocked from R5 onward, which is where two of the
three amendments were blocking. `SESSION-LOG.md` was deliberately not written
to; it is the co-lead's.

---

## Phase 2 — Component and Design System

Persona `docs/team/08-component-and-design-system.md`, one session, on branch
`p8d-design`. State derived from the repository per protocol section 2: branch
read at `b5eec9f`, tree clean, RFC 0002 Accepted and carrying the three
amendments, the amended 9.1 names table read from the RFC's own delta rather
than from the briefing.

Commit pushed: **`6432abc`**, "correct the control names the P8R ruling moved".
Eight files, all inside this persona's owned paths, staged by explicit pathspec.

### The prototype was run

`docs/design/prototype` on port 5199 through `.claude/launch.json`'s
`imran-prototype` entry, `node_modules` already present so no install was
needed. Opened, read as an accessibility tree and queried for every
`aria-label` on the page, then stopped.

What it carries, measured rather than recalled, and every measurement matches
what RFC 0002 says it would find. The sidebar's page entries and folder rows
are `button` elements; the only anchor is the brand, "Dana, go to My Day". The
folder row's menu is "Manage {folder} folder" and its add control is "Add task
to {folder}". A folder group's menu is "Manage {group} folder group". The
avatar menu is "Open Imran Wafa's account menu". The search control is "Search
Dana. Keyboard shortcut Control K or slash." The floating button is "Create a
new task". A row's overflow is "More task actions" and its star is "Mark
important" or "Remove from Important". The collapse control is a
`SidebarTrigger` whose screen reader text is "Toggle Sidebar" in both states.
Row completion checkboxes are already "Complete task". Five of those strings
are names 9.1's amended table now fixes differently, and the ones inside this
phase's paths are corrected below.

### The two corrections the phase was called for

Both verified against the amended names table in
`docs/rfcs/0002-client-ui-replacement.md` before being changed, and both had
drifted from the briefed line numbers.

| File | Line at read | Was | Now |
| - | - | - | - |
| `app/src/client/components/quick-add.tsx` | 137 | `Open full task form for {folder}` | `Open full form` |
| `app/src/client/components/folder-row.tsx` | 203 | `Manage {folder} folder` | `More actions` |

The quick-add's tooltip moved with its name, so the visible text and the
accessible name are one string rather than two. Both files' header comments
carried the reasoning for the old strings, including an explicit claim that
9.1 named the escalation control nowhere; both now carry the ruling instead.

### What the sweep of 9.1's amended table found

**Already correct, checked string by string.** A task row's overflow menu is
`More actions` in both the ported `task-row.tsx` and the P8 `ui/OverflowMenu.tsx`,
which the task form also uses. The quick-add is `Add a task` collapsed and
expanded, in both `quick-add.tsx` and `ui/QuickAddRow.tsx`. The ported row's
completion checkbox was already `Complete task` and `Mark as not done`. Every
confirmation's two controls are `Continue` and `Cancel`, uniform and not
overridable, in `ui/ConfirmDialog.tsx`. The inline retry control is `Try again`
and the failed-read line beside it is 9.1's own words, in `state-patterns.tsx`
through `ui/copy.ts`. The star is `Important` and `Mark as important` per 9.5,
with the outward tooltip moving alone. The "New folder" dialog's field is
`Folder name` and a folder-group dialog's field is `Group name`. The folder
row's `Move to group` entry matches the folder-group action of the same name.
No role in 9.1's roles table is wrong in this directory: the folder row renders
an anchor carrying `href`, and a task row renders `role="listitem"`.

**Two further disagreements found inside the owned paths and fixed in the same
commit**, neither of them shipped by R3.

- `app/src/client/components/ui/TaskRow.tsx`, the P8 client's row and the one
  that renders today, named its completion checkbox `Complete` in both states.
  A completed row therefore announced the transition it had already made. It
  now carries the table's two names. No test binds that checkbox by name, so
  nothing moved; the Done page's own "Mark as not done" control is a separate
  element on a page that does not use this row, so no collision was created.
- `app/src/client/components/ui/sidebar.tsx`, the shadcn primitive copied in at
  R2, names the rail control `Toggle Sidebar` in both states where the table
  now gives it `Collapse sidebar` and `Expand sidebar`. `useSidebar` already
  exposes the state, so the correction is the name and nothing else. This is
  the one string in the twenty vendored primitives this client now departs from
  the distribution on, and the file says so where it departs. Both
  `SidebarTrigger` and `SidebarRail` still accept an overriding `aria-label`
  from the caller, so R5 can say something else if a later section asks it to.

**Two controls deliberately left interpolated**, because section 9 names
neither and inventing a fixed string would be the unrecorded deviation RFC
0002 lists as this package's most likely failure: `Add task to {folder}` on a
sidebar folder row, and `Open task: {title}` on a task row. Both are the
designer's own strings on controls no table reaches. This is recorded in
`components/README.md` with the rule, so the next reader does not "fix" them.

**Outside this phase's paths, reported rather than reached across.** Three of
these will otherwise ship wrong.

- `app/src/client/shell/TopBar.tsx` names the avatar menu by its content,
  `{displayName ?? 'Account'}`, so it announces the person's display name. The
  amended table rules it `Account` exactly, and its paragraph gives the reason:
  a name carrying the display name would be the one string in that table a test
  cannot know before it reads the fixture. R5 replaces this file when the top
  bar goes, so the correction belongs with that work rather than as a patch
  here. Frontend Architect.
- The designer's sidebar names a folder group's menu `Manage {group} folder
  group`. The amended table rules it `More actions`, the same string the folder
  row's menu now carries. The group row is the shell's, not this directory's.
  Frontend Architect, at R5.
- The floating add button and the global search control are `Add task` and
  `Search` in the P8 shell today, which is correct, and are `Create a new task`
  and `Search Dana. Keyboard shortcut Control K or slash.` in the prototype.
  Whoever ports his shell must not carry those two strings across. Frontend
  Architect, at R5.

One further hazard, no action taken: `folder-group-dialog.tsx` commits with
`Rename group`, which is also one of the four ruled folder-group action names
that R5 will put in the sidebar's group menu. The menu closes before the dialog
opens, so no page holds both at once, but a locator written without a region
scope would match twice if that ever changes.

### Gate

Run from `D:\dana\app` on the committed tree, six legs, each leg selected
explicitly rather than by habit.

| Leg | Command | Result |
| - | - | - |
| Lint | `npm run lint` | clean, exit 0 |
| Typecheck | `npm run typecheck` | clean, all three projects |
| Vitest, PostgreSQL 18 | `npm test` | **189 files, 1530 tests, all passed**, 49s |
| Vitest, PGlite | `env -u TEST_DATABASE_URL npm test` | **189 files, 1530 tests, all passed**, 193s |
| Build | `npm run build` | clean; PWA precache 11 entries |
| Browser | `env -u TEST_DATABASE_URL npx playwright test` | **135 cases, 103 passed, 32 failed**, 4.5 minutes |

`AC-086` did not flake on either vitest leg in this session; both ran at
default parallelism.

**The browser leg moved nothing in either direction.** 103 and 32 are the
recorded baseline exactly, and the failing set is what the plan says it is:
AC-097 (1 of its 3 cases), AC-166 (4), AC-172 (2), AC-174 (3), AC-176 (2),
AC-177 (2), AC-178 (4), AC-179 (3), AC-180 (4), AC-181 (2), AC-182 (5), which
is 32. No test was touched; `app/tests/` is byte for byte what it was.

Two notes on that set, because one member of it is not an RFC 0002 row and a
reader will ask.

- **AC-097's first case is red for a reason already recorded, and R6 closes
  it.** It fails on the fade comparison, not on the name and not on the Restore
  control: the abandoned title computes `1/rgb(47, 49, 54)`, identical to a
  pending title beside it. `components/README.md` records why, from R2: the
  designer's `tokens.css` replaced 94 `@utility` definitions, so every class
  the P8 markup writes now resolves to nothing and that markup renders
  unstyled until R3 to R10 replace it. The ported `task-row.tsx` sets the
  abandoned treatment as Tailwind utilities on the title, colour and
  line-through together, so the criterion goes green when R6 mounts it. Not a
  defect of this phase and not fixable inside it: the page that renders is
  R6's.
- **AC-182 is the criterion this phase's rail-control fix is for**, and it
  stays red until R5 renders a rail. The fix removes the way it would have
  failed twice: with the vendored default, R5 would have shipped
  `Toggle Sidebar` and the criterion would have failed on a name nobody looked
  at rather than on a control nobody had built yet.

### What remains

Nothing owed by this phase inside its own paths. The three shell names above
are R5's and are the reason this section names them. `SESSION-LOG.md` was
deliberately not written to; it is the co-lead's. Nothing was merged and
nothing irreversible was done.

The escalation `components/README.md` already carries against this directory is
unchanged and still open: AC-180 reaches for `menuitem` or `option` while
`folder-row.tsx`'s move-to-group submenu renders `menuitemradio`, which is the
accurate role for a single-valued choice and is what 9.1's roles table leaves
free. It was raised at R3 with the recommendation that AC-180 admit
`menuitemradio`, and this phase did not degrade the component to make the
locator resolve. AC-180 is red until R10 either way.

---

## Phase 3 — Frontend Architect, R5

Landed at `eebed3f` on `p8d-design`, pushed. Thirteen files under
`app/src/client/`: five new, three modified, four deleted, plus this role's own
README. Nothing under `app/tests/`, `app/src/server/`, `app/db/`,
`app/src/shared/`, `app/src/client/api/`, `app/src/client/components/` or
`docs/` was touched.

### The prototype was run

`npm install` then `npm run dev` in `docs/design/prototype`, on the
`.claude/launch.json` entry `imran-prototype` at port 5199, and it was measured
in the running document rather than read out of the files. Screenshots are not
available to this session's browser pane, so what was taken is the DOM, the
accessibility tree and the computed styles, which is where every claim below
comes from. It was stopped when the port was done with.

Every claim the brief handed me about his markup was re-measured and all of
them held:

| Claim | Measured in the running prototype |
| - | - |
| The sidebar is not a navigation landmark | 0 `nav` elements and 0 `role="navigation"` in the whole document |
| The six page entries are buttons | 6 `button`s at `data-sidebar-tier="primary"`, `aria-current="page"` on the active one; the only anchor in the sidebar is the brand |
| His folder rows are buttons too | 7 more `button`s at `data-sidebar-tier="folder"` |
| His shell root carries the viewport floor | the root element's computed `min-width` is 1180px |
| The folder group's menu is `Manage {group} folder group` | exactly that, per group: `Manage Personal folder group`, `Manage Work folder group` |
| His search control is a sentence | `Search Dana. Keyboard shortcut Control K or slash.` |
| His FAB is `Create a new task` | that as the `aria-label`, with `New task` as the visible text |
| The rail control is the distribution's | `Toggle Sidebar` in both states, which R3 had already corrected in our copy |
| The avatar menu interpolates the person | `Open Imran Wafa's account menu` |
| The resize handle | `role="separator"`, `aria-label="Resize sidebar"`, already section 9's string |

Two things I measured that the brief did not name and that changed what I
built. His folder directory carries `group-data-[collapsible=icon]:hidden`, so
collapsing to the rail drops Inbox, every label group and every folder, which
9.1 and AC-182 both forbid. And his label group panel really does unmount when
collapsed rather than hiding, which is what AC-155's third case needs, so
nothing had to be done about it.

### What was ported and where

| File | What it is |
| - | - |
| `shell/app-shell.tsx` (new) | His `app-shell.tsx`: the layout element of the `/app` route, the three chrome reads, 9.1's Ctrl+K and `/` shortcut, both view preferences, the page strip, the offline banner, the scroll region and its measure, the floating action, and the two overlay mounts |
| `shell/app-sidebar.tsx` (new) | His `app-sidebar.tsx`: the landmark, the six page links, the folder list, the three relocated controls, the footer |
| `shell/SidebarResizeHandle.tsx` (new) | His handle, lifted out of that file because it is a control in its own right |
| `shell/preferences.ts` (new) | The two view preferences of 9.1 and the argument for where they live |
| `pwa/useUpdateAffordance.ts` (new) | 10.6's offer as state rather than markup, so his `page-bar.tsx` can render it |
| `shell/FloatingAddButton.tsx` | His floating action; 9.1's name |
| `shell/OfflineBanner.tsx` | Now the connectivity read alone; the banner is R3's ported component |
| `Router.tsx` | One import and one element: `AppLayout` becomes `AppShell` |
| `shell/AppLayout.tsx`, `shell/Sidebar.tsx`, `shell/TopBar.tsx`, `pwa/UpdatePrompt.tsx` | Deleted |

His file names are kept, `app-shell.tsx` and `app-sidebar.tsx`, which is the
convention R3 set for the seven presentational components: a reader can put
each beside the prototype file it came from, and 11.13 as RFC 0002 amends it
makes a difference between the two a defect unless a numbered section says
otherwise. Every such difference is named at the top of the file that makes
it.

**On our router and our data.** The six page entries and every folder row are
React Router `Link`s handed to `SidebarMenuButton`'s and `FolderRow`'s `render`
prop, which is how that distribution composes with a router, so the anchor is
real and the navigation is the client's. R3's `folder-row.tsx` is consumed
rather than rebuilt, and R4's `folderRowDisplay` is the only thing that knows
how a 7.4 Folder becomes his four display props. The three chrome reads, the
sidebar's ordering rule, 9.7's visibility filter and the entry-point defaults
came across from `AppLayout.tsx` and `Sidebar.tsx` unchanged in substance.

### Preference persistence: what I chose and why

**Both preferences are `localStorage`, one key each, read synchronously at the
first render.** His prototype keeps the width in `localStorage` under
`dana:desktop-sidebar-width` and lets the shadcn primitive mirror the collapsed
state into a `sidebar_state` cookie. I kept the first mechanism and refused the
second, and the refusal is the part with a reason.

A cookie is the right store for that distribution because it is built for a
server-rendered host that reads the preference before it paints. We have no
such host: 11.1 gives the server a landing page and the built client, and
nothing on the server has ever read a client preference. So the cookie buys
nothing here and costs two things. It rides every request the document makes,
including every call to the section 7 API, which puts a view preference on a
wire the frozen contract does not give it. And 11.6's double-submit leaves
exactly one readable cookie in the browser, the CSRF token, which is a property
the acceptance suite depends on directly: `harness.ts`'s `csrfToken` picks the
token out by being the only non-httpOnly cookie and asserts that count. A
second readable cookie appearing the first time somebody collapsed the sidebar
would have broken every fixture-creating spec, far from the cause and long
after this session.

The primitive writes that cookie inside its own state setter, which is not a
file this role owns, so `app-shell.tsx` clears it after every toggle. Measured
in the running client after collapsing the sidebar: `document.cookie` holds
`dana_csrf` and nothing else.

**The design's default width stays in `tokens.css`.** The custom property is
set to `var(--shell-sidebar-width)` until this viewer has chosen a width of
their own, and only their own choice is ever written as a number. That is
11.4's rule read the way that section already reads it for a folder's colour: a
chosen width is the person's datum rather than a value the design fixes. The
drag reads the width the browser painted rather than a mirrored constant, so
nothing in `shell/` duplicates the token.

### The 1180px floor, and how its absence was proved

It is absent from `shell/app-shell.tsx`: his root element's classes arrive
without it. Proving that is not the same as proving the built stylesheet is
clean, because Tailwind's source detection scans markdown and comments as well
as markup, and R2 learned that the hard way when prose describing the forbidden
utility emitted it. So the check is against `dist/` and never the source, and
no file this session wrote spells the utility in any form, in code or in prose.

```
npm run build
grep -o "min-width[^;}]*" dist/client/assets/*.css
grep -rn "1180" dist/client/assets/
```

The built stylesheet carries seven `min-width` declarations and not one of them
is a viewport floor: `min-width:var(--anchor-width)` (a popover sized to its
anchor), three `min-width:0` or `min-width:0!important` (flex children that must
be allowed to shrink), and `min-width:calc(var(--spacing) * 5 | 32 | 48)` (a
badge and two menu panels). The string `1180` occurs zero times anywhere under
`dist/client/assets/`, in the stylesheet and in the bundle alike.

### What the retirement of TopBar touched

`shell/TopBar.tsx` is deleted. It was the only importer of `initialsOf` from
`components/ui/`, the only `header` element outside `main`, and the only place
this client rendered a `banner` landmark. Three consequences:

- **AC-174's fourth case now passes** on all four paths it checks: the document
  exposes zero `banner` landmarks. A page's own `header` is inside `main`,
  `SidebarInset` being the `main` landmark, which is the placement
  `components/README.md` filed as a request against this session.
- **The app name, the search control and the avatar menu moved into the
  sidebar** and there is exactly one of each. 9.1's obligations on all three
  are unchanged: they exist, the app name links to `/app`, and each is
  reachable by role and by name.
- **The update affordance moved with the bar.** It was `pwa/UpdatePrompt.tsx`,
  a banner of its own; it is now the control inside his `page-bar.tsx`, which
  R3 built to take `showUpdate` and `onUpdate`. The registration, the watch and
  the rule that `skipWaiting` is never called unprompted are untouched in
  `registerServiceWorker.ts`, and AC-100 still reads a control named
  `Update available, reload`.

### Names corrected

Every one was checked against 9.1's amended names table rather than taken from
the brief, and one of the three the brief flagged turned out not to be mine.

| Control | What his prototype says | What 9.1 rules | Where it landed |
| - | - | - | - |
| The global search control | `Search Dana. Keyboard shortcut Control K or slash.` | `Search` | `app-sidebar.tsx`; the shortcut is in the tooltip, where it describes rather than names |
| The floating add button | `Create a new task`, over the visible text `New task` | `Add task` | `FloatingAddButton.tsx`; the string is the visible text, so the name and the label agree |
| The avatar menu | `Open Imran Wafa's account menu` | `Account` | `app-sidebar.tsx`; the person's name is still rendered inside the control and is no longer what the control answers to |
| The app name | an `aria-label` naming the link and its destination, in a punctuation this repository does not use | 9.1 names no string; the section requires it exist and link to My Day | `app-sidebar.tsx`; the label is removed rather than reworded, so the name is the word the link renders |

Two flagged names were not in my territory after all, and both were already
right. `shell/TopBar.tsx`'s `{displayName ?? 'Account'}` is retired with the
file. `Manage {group} folder group` sits on a control this session does not
render at all: the folder group's menu opens a dialog RFC 0002's plan gives to
R10, and R3 already corrected the folder row's twin of it to `More actions`.
When R10 draws it, `More actions` is the string, and the general rule is the
one R3 recorded: a name in that table is a fixed string, and the region it sits
in is what separates two instances of it.

The rail control and the resize handle needed nothing: R3 corrected
`ui/sidebar.tsx` to `Collapse sidebar` and `Expand sidebar` before this session,
and his handle already carried `Resize sidebar`.

### Departures from his prototype, each with the sentence that forced it

1. **The sidebar is a navigation landmark.** 9.1's roles table. `role` and
   `aria-label` on the vendored `Sidebar`, which spreads them onto the element
   carrying the sidebar's own width, so the landmark and the box AC-182
   measures are one thing.
2. **The six page entries and every folder row are links.** 9.1's roles table
   and its routes table.
3. **The rail keeps the whole folder list.** 9.1 says the collapsed state
   "changes nothing about what the sidebar holds" and AC-182 asserts it. His
   `group-data-[collapsible=icon]:hidden` on the directory is gone; the section
   headings, which name nothing a person can reach, are hidden there instead,
   and the primitive's own clipping is what makes the rail look like a rail.
4. **The width transition is off.** The distribution animates the very property
   both preferences set, so a drag lagged the pointer by a fifth of a second
   and the rail arrived long after the click that asked for it. Three of
   AC-182's five cases were failing on a frame of that animation rather than on
   the preference. Flagged for the visual review of item 33: what is lost is
   the slide.
5. **The floating action is absent on Done and present everywhere else**, which
   is one page fewer than his: he also hides it on People and Settings. 9.1
   spells the exception as "every page except Done" and AC-096 asserts that
   page alone.
6. **His duplicate "New folder" is not rendered twice.** His sidebar offers it
   in the folder directory menu and again as the footer action; 9.1's
   addressing sentence does not admit two controls answering to one name inside
   one region, so the footer action is the one that survives.
7. **Three groups of his menus are not rendered yet**, each opening a dialog
   RFC 0002's plan gives to R10: the folder row's own menu, the folder group
   menus, and the folder directory menu. `folder-row.tsx` draws its action
   cluster only when a callback arrives, so this is a prop that is absent
   rather than markup that was removed, and a control that opens nothing is
   worse than a control that is not there yet.
8. **`Add task to {folder}` and `Add folder to {group}` are dropped.** No
   numbered section names either, 9.3's entry-point table gives neither a row,
   and neither is among the ten controls the P8R change control ruled on. The
   RFC's own alternatives section refuses to admit his affordances silently;
   inventing fixed names for them would have been the unrecorded deviation.
9. **The pending count is rendered inside the folder row's link.** See the
   request below.
10. **Both P8 overlays are mounted inside a positioned wrapper**, which is
    interim scaffolding rather than a design decision and is dated by
    construction. `TaskFormOverlay` and `SearchOverlay` draw themselves with
    `dialog-scrim` and `dialog-panel`, two names from the class vocabulary that
    left with the old token file at R2, so neither is positioned any more. That
    was invisible while the chrome was unpositioned too and stops being
    invisible here, this sidebar being `fixed`. It is what the next section is
    about.

### Gate

Run from `D:\dana\app`, in CI's order, six legs.

| Leg | Result |
| - | - |
| `npm run lint` | clean |
| `npm run typecheck` | clean, all three projects |
| `env -u TEST_DATABASE_URL npm test` (PGlite) | **189 files, 1530 tests, all green**, 209s |
| `npm test` (Postgres) | **189 files, 1530 tests, all green**, 53s |
| `npm run build` | clean; `dist/` carries no viewport floor, proved above |
| `env -u TEST_DATABASE_URL npx playwright test` | **135 cases, 109 passed, 26 failed, 4.4 minutes** |

**The browser leg goes from 32 failing to 26, and nothing moved the other
way.** Baseline was 103 passing and 32 failing; this tree is 109 and 26. The
six cases that turned green:

| Criterion | Cases that turned | Why |
| - | - | - |
| AC-174 | 1 of 4: "no chrome exists above or outside it" | the top bar is retired and the page strip renders inside `main`, so the document exposes zero `banner` landmarks on all four paths that case checks |
| AC-181 | 1 of 2: the "New folder" dialog | 9.1's action in the sidebar footer opens R3's `NewFolderDialog`, which takes a field named "Folder name" and creates the folder |
| AC-182 | 4 of 5: the rail across a reload, the rail reaching every page and folder, a resized sidebar across a reload, and the preferences surviving a navigation | the rail, the resize handle and localStorage persistence, with the width transition off so what is read is the preference rather than a frame of an animation |

The failing 26, by criterion, against the baseline's 32:

| Criterion | Baseline | Now | Whose |
| - | - | - | - |
| AC-097 | 1 | 1 | the fade and strike that left with the old token file |
| AC-166 | 4 | 4 | R6 |
| AC-172 | 2 | 2 | R10 |
| AC-174 | 3 | **2** | the escalation below |
| AC-176 | 2 | 2 | R8 |
| AC-177 | 2 | 2 | R9 |
| AC-178 | 4 | 4 | R7 |
| AC-179 | 3 | 3 | R7 |
| AC-180 | 4 | 4 | R10 |
| AC-181 | 2 | **1** | R10, the "Label and color" half |
| AC-182 | 5 | **1** | R7, the task form's own resize handle |

**Two criteria went red inside this session and were repaired before the run
above, and it is worth naming because the cause outlives the repair.** The
first full leg on this tree failed AC-092 (4 cases) and AC-093 (6 cases), and
neither is about the form: both P8 overlays lost their positioning at R2 with
the class vocabulary, this sidebar is `fixed`, and a `fixed` element paints
over anything unpositioned beneath it and takes the pointer events with it.
Measured in the failure log: the task form's "More options" expander resolved,
was visible, enabled and stable, and the account menu intercepted every click
at its coordinates. The repair is `z-50` on a positioned wrapper around each
overlay mount, which restores the paint order those criteria were passing
under and changes nothing else about either surface. AC-092, AC-093, AC-156
and AC-161 are green in the reported run.

**AC-086 did not appear on either vitest leg**, on default parallelism, so
this session has nothing to add to that escalation.

### ESCALATION

**AC-174 addresses the avatar menu by the viewer's display name where 9.1's
amended names table rules the fixed string "Account", and the two cannot both
be satisfied.** Two of that criterion's four cases are red because of it, and
they are the only red this session leaves that is not another row's work.

**Routing:** the Adversarial Test Engineer, who owns `app/tests/`, then the
Integration Steward.

**The spec section:** 9.1's names table as the P8R mid-package change control
amended it on 2026-08-13 and the owner re-accepted the same day. Its row reads
`The avatar menu (9.1) | "Account"`, and the paragraph beneath it gives the
reason in the exact terms this criterion falls foul of: "The avatar menu takes
'Account' rather than a name interpolating the person's own name. What the
control opens is the viewer's account, there is exactly one of it, and a name
carrying the display name would make the one control in this table whose
string a test cannot know before it reads the fixture."

**The exact problem:** `ac-174-sidebar-is-the-only-chrome.spec.ts` addresses
the control as `nav.getByRole('button', { name: new RegExp(VIEWER) })` with
`VIEWER = 'Hassan'`, and its own header explains that choice on the ground that
"9.1 ... names the avatar menu nowhere". That was true when R1 wrote it and
stopped being true at the change control four commits later. Playwright matches
an accessible name and nothing else, so a control named "Account" cannot match
`/Hassan/`, and a control whose name contains "Hassan" is not the fixed string
the table rules. The rendered name is what has to give either way: the person's
name is still rendered inside the control and is still read by anyone looking
at it.

**Options considered.** Name the control after the viewer, which turns both
cases green and makes the client contradict a table the owner re-accepted three
commits ago, an unrecorded deviation being a defect under protocol section 1
even where the code works. Name it "Account Hassan", which is the same
deviation wearing a longer string and is what the table's paragraph explicitly
refuses. Amend the table, which this role owns 9.1 and could have done, and
which is the spec changing by drift to match an implementation detail the owner
has already ruled on. Or implement the table and report the criterion.

**Recommendation:** the last. `ac-174`'s second and third cases change
`new RegExp(VIEWER)` to `{ name: 'Account', exact: true }`, and the case
comment's "this section names no string for it" is replaced by the row that now
does. Nothing else about the criterion moves: the app name, the search control,
the two menu entries and the banner assertion are unaffected and green. The
implementation is at `shell/app-sidebar.tsx` and needs one string changed if
the ruling goes the other way.

**Two smaller items, neither blocking, both recorded so they are not
rediscovered.**

- **Below 768px this client has no navigation at all**, which is section 13
  item 32's floor removal meeting the vendored sidebar's own breakpoint.
  Measured at 700px: zero navigation landmarks and zero sidebar elements. It
  wants a ruling on what Dana does on a narrow window, which is the owner's or
  the Steward's rather than an implementer's. The browser leg runs at 1280 and
  nothing is red.
- **`components/folder-row.tsx` renders the pending count beside the link and
  AC-155 asserts it inside**, which this session works around rather than
  regresses. The request is in the section below and the workaround is one
  wrapper that deletes itself when the badge moves.

### Requests, and what remains

- **Against `components/folder-row.tsx`, role 08's file: render the pending
  badge inside the link.** His row renders `SidebarMenuBadge` as a sibling of
  the anchor, and AC-155's second case has asserted since P8 that the count is
  inside the link, which is also what makes a screen reader announce "Inbox 1"
  as one row rather than a name and a loose number beside it. AC-173 reads the
  count off the row and is satisfied either way. Rather than let a green
  criterion go red or edit another role's file, `app-sidebar.tsx` supplies the
  count through the anchor that component already asks the router for and
  passes `pending` as zero so there is exactly one of it. When the badge moves
  inside the link, that wrapper is deleted in one edit and `pending` goes back
  to being the real number. This is the one place this session reached further
  into a ported component than supplying its anchor, and it is written down
  rather than left to be found.
- **Below 768px there is no navigation at all**, and this is a finding rather
  than a request, because it is not obvious who owns it. The vendored `Sidebar`
  switches to an off-canvas sheet under that breakpoint and the only control
  that opens the sheet is inside it. His viewport floor is what hid this, and
  section 13 item 32 forbids the floor, so removing the floor exposes a gap the
  design never had to answer. Measured at 700px: zero navigation landmarks and
  zero sidebar elements on the page. The browser leg runs at 1280 and is
  unaffected, so nothing is red. It wants either a rule in `tokens.css` or a
  ruling on what Dana does on a narrow window; it is not this session's to
  invent.
- **A rail-width token.** His rail is 56px, written here as the sidebar item
  height plus the header's padding on each side so that no raw dimension leaves
  `tokens.css`. A `--shell-sidebar-rail-width` in that file would say it once.
- **The toast region is still P8's markup** against a class vocabulary that no
  longer exists, so toasts render unstyled. His `SystemToast` takes a `kind`
  and this client's toasts carry the server's own 409 message verbatim (9.1
  requires 5.1's copy), so the two do not meet without a decision about that
  case. R11's copy sweep is where it belongs, and every criterion that reads a
  toast reads its text rather than its treatment.
- **R6 renders into this shell and owes it one thing**: the designer's screens
  each carry their own centring-and-padding wrapper because they have no shell
  to put it in, and ours has the measure. A screen ported with its wrapper
  intact is padded twice.
- `SESSION-LOG.md` was deliberately not written to; it is the co-lead's.
  Nothing was merged and nothing irreversible was done.

---

## Phase 4 — Frontend Architect, R6

Branch `p8d-design`, commit **`3741669`**, pushed. Twelve files, 1067 insertions
and 422 deletions, all inside `app/src/client/pages/`, `app/src/client/states/`,
`app/src/client/main.tsx` and `app/src/client/README.md`. Nothing under
`app/tests/`, `app/src/server/**`, `app/db/**`, `app/src/shared/**`,
`app/src/client/api/**`, `app/src/client/components/**`, `app/src/client/parts/**`
or `docs/` was touched. Nothing was merged.

### The prototype was run first, and this is what running it changed

`docs/design/prototype` was started on port 5199 from its `.claude/launch.json`
entry and all six list screens were opened before a line was written. Three
things came out of it that reading the files would not have given:

1. **His Planned list labels its quick-add "Add scheduled task"** and his Tasks
   groups label theirs "Add task". 9.1's control table fixes one name across
   both states, "Add a task", and AC-166 addresses both by it exactly. The port
   passes no `label`, so the component's 9.1 default stands on every page.
2. **His important-only switch has no accessible name at all.** Measured on the
   running prototype: the switch reads as `switch` with an empty name, its words
   living in a `label` that names nothing a screen reader can reach. AC-167
   addresses it as `switch` with a name matching `/important/i`, and 9.1's
   addressing sentence requires a name whatever the criterion says. The port
   spells `aria-label="Important only"`, which is the label he already draws.
3. **His Done rows and his My Day recap** were read for their structure rather
   than guessed: the recap is a disclosure whose trigger carries the count, and
   his Done groups are day-labelled sections, which is what 9.1's regions table
   already required of ours. His empty groups are absent rather than a heading
   over nothing, which the port adopted after seeing an empty "Carried over"
   band in the built client.

The built client was also run, at `http://localhost:3100` from
`npm run e2e:app`, and all six ported screens were opened in it. Two things were
found that way and fixed: that empty "Carried over" band, and the abandon
confirmation's shape, verified in the DOM as one `h2` reading "Abandon this
task? It stops appearing in My Day but stays everywhere else." with `Cancel` and
`Continue` beneath it.

### What was ported, and where

| Screen | File | Notes |
| - | - | - |
| My Day | `pages/MyDayPage.tsx` | header with the date, the important-only switch, "Carried over", "Today", the "Done today (N)" disclosure |
| Tasks | `pages/TasksPage.tsx` | the ungrouped Inbox block and the folder groups, each with his quick-add; `TasksGroups` still exported for All |
| Planned, list only | `pages/PlannedPage.tsx` | his header, his list/calendar segmented switch, his list. **The calendar mount is untouched and still `components/calendar/PlannedCalendar`, which is R9's** |
| Important | `pages/ImportantPage.tsx` | one list, Q4's outward star tooltip passed down from the page layer |
| All | `pages/AllPage.tsx` | his two titled bands, "Planned" then "Tasks", the second rendering Tasks' own regions inside it |
| Done | `pages/DonePage.tsx` | his header and day groups; the row is composed here, for the reason under Escalation 5 |
| shared page states | `states/PageStates.tsx`, `states/PageSection.tsx` | restyled onto his `SkeletonList`, `InlineError` and `Empty`, and onto his group heading |
| new | `pages/task-rows.tsx` | one run of rows plus the two confirmations, written once instead of six times |
| new | `pages/page-heading.tsx` | the glyph, name and subtitle all six of his screens open with |
| changed | `main.tsx` | mounts `TooltipProvider`, which his `main.tsx` does and the port had missed |

**R5's three leads, each checked against the branch rather than taken on
report.** The shell does own the measure: `shell/app-shell.tsx` wraps the
`Outlet` in `mx-auto w-full max-w-[var(--shell-content-max)] px-10 py-6`, so
every one of his per-screen wrappers is dropped, verified by reading that file.
AC-097's single red case did close on mounting the ported row, and it closed for
the reason R5 gave. The two `z-50` wrappers around the overlay mounts were left
exactly as they are.

### What was consumed from `parts/presenters.ts`, and what was not there

Consumed: `presenterToday`, `taskRowDisplay` (through `TaskRows`), `dueDisplay`
and `folderDisplay` (in the Done row), `folderDisplay` again for the folder
glyph on a Tasks group heading, and `formatDueDate` for My Day's header date.
`RowContext` is built once per page by `useRowBasis()` in `pages/task-rows.tsx`,
which reads `useMe()` and `useFolders()` and calls `presenterToday()`.

**No date and no ordering is computed anywhere in this phase.** Rows are mapped
in the order section 6 returned them; `presenterToday()` is the only clock read;
`formatDueDate` is the only formatter. Two things were deliberately not built
because either would have been a second clock or a second rule:

- **A long-form header date.** 9.4 heads My Day with the date and the design
  writes it "Monday, 10 August". `presenters.ts` offers "10 Aug" and no weekday
  or long form. The page renders the presenter's format, and a
  `formatHeaderDate(today)` in R4's file is the request rather than a formatter
  here. This is the one presenter that was wanted and missing.
- **The repeat glyph.** `taskRowDisplay` sets `recurrence: undefined` and its own
  comment explains why; nothing was added on this side to fill it.

### How the normative copy was verified, character for character

Section 6's eight empty strings already live in `pages/empty-states.ts`, one per
query, and were compared against `docs/spec/06-*.md` rather than re-typed: the
six this phase renders, Q1 to Q6, are identical to the section and to
`tests/e2e/harness.ts`'s own restatement of them. They are passed to `PageBody`
as `emptyCopy` and rendered as one child of one `EmptyDescription`, so each is
one text run. AC-158's three cases confirm it from the outside.

9.1's three inline state strings are `states/PageStates.tsx` and
`components/ui/copy.ts`: the failed-read line is `READ_FAILED`, rendered through
his `InlineError` with the "Try again" control beside it; the 404 line and the
truncation notice are spelled in `PageStates.tsx`, each as one child of one
element. AC-171 and AC-183's first case both pass, and that case asserts the
failed-read line and the 404 line as single runs.

The two confirmations this phase renders are `ABANDON_CONFIRM` and
`DELETE_TASK_CONFIRM` from `components/ui/copy.ts`, and Done's G-SERIES confirm
is spelled in `DonePage.tsx`. All three go into an `AlertDialogTitle` whole, with
no description, because the prototype's title-plus-description shape is exactly
what AC-183 refuses. Verified in the running client's DOM, not inferred. The two
controls are "Continue" and "Cancel", 9.1's names, and no caller can rename them.

### The gate, every leg measured

Run from `D:\dana\app`, in CI's order, at `3741669`.

| Leg | Command | Result |
| - | - | - |
| lint | `npm run lint` | clean |
| typecheck | `npm run typecheck` | clean, all three projects |
| vitest, Postgres | `npm test` | **189 files, 1530 tests, all passing**, 51.9s |
| vitest, PGlite | `env -u TEST_DATABASE_URL npm test` | **189 files, 1530 tests, all passing**, 202.0s |
| build | `npm run build` | clean, 11 precache entries |
| browser | `env -u TEST_DATABASE_URL npx playwright test` | **135 cases: 102 passed, 33 failed**, 4.9m |

`AC-086` did not fail on either vitest leg in this session. The two legs were
selected explicitly and each was run once.

### The browser leg, and exactly which cases moved

Baseline measured at the head of this session, before any edit: **109 passed, 26
failed**. After: **102 passed, 33 failed**.

**Closed by this phase, four cases:**

- `AC-166` — enter on Tasks saves immediately, undated, in that group's folder
- `AC-166` — enter on the Planned list saves the task dated today
- `AC-166` — escape clears the box, collapses the control and creates nothing
- `AC-097` — an abandoned row renders faded and struck with a Restore control

`AC-166`'s fourth case, the folder page, is R8's surface and is still red.

**Went red, eleven cases, none of them by a weakened test.** Every one is
escalated below with the repair it needs.

- `AC-093`, all four cases — the star's `aria-label`
- `AC-099`, two cases — the star's tooltip
- `AC-157`, "completing a task another member abandoned" — the row checkbox
- `AC-091`'s second case, `AC-096`'s second case, `AC-157`'s third case and
  `session-path.spec.ts`'s CSRF case — the quick-add disclosure

**Unchanged and confirmed still green:** AC-095, AC-096's first and third cases,
AC-100, AC-155, AC-156, AC-158 (all three), AC-159, AC-160, AC-161, AC-162 (all
five, the My Day abandon and the Done un-complete included), AC-163, AC-165 (all
three), AC-167 (both), AC-169, AC-170, AC-171 (all three), AC-173, AC-183's
first case, AC-097's second and third cases, AC-099's third case, and AC-172's
second case.

**Unchanged and still red, none of it this phase's surface:** AC-172 x2,
AC-174 x2, AC-176 x2, AC-177 x2, AC-178 x4, AC-179 x3, AC-180 x4, AC-181 x1,
AC-182 x1.

### ESCALATION

Five. The first three are one file, `app/src/client/components/task-row.tsx`,
which `docs/team/08-component-and-design-system.md` owns outright
(`app/src/client/components/**` excluding the calendar, task-form and search
directories). All three are defects that only appear once a page mounts that
component, which is why R3's own gate was green and this phase's is not.

**1. The star is named with `aria-label`, which takes all four AC-093 cases red.
To role 08, then the Steward.** `components/ui/StarButton.tsx` carries the whole
argument in its own header, measured at P8 and lost in R3's port: an
`aria-label` is a *label* to the acceptance suite's `formField` helper, which
addresses 9.3's ten fields by accessible name across roles because those fields
are ten different roles. 9.3's own "important" field is one of them, so any page
holding a starred row with the task form open has two elements answering to
"Important". Measured from the failure: `getByLabel(/^\s*important\s*$/i)`
resolves to the row's star button and to the form's checkbox. **Options
considered:** drawing no starred row on the pages AC-093 opens the form from
(absurd), or asking the tester to scope `formField` to the open dialog (changing
the contract to match the implementation, which protocol section 8 forbids).
**Recommendation:** carry the star's name as `sr-only` content exactly as
`StarButton.tsx` does. The accessible name is unchanged, `getByRole('button',
{ name })` still finds it, and AC-055 and AC-099 are unaffected. One element, in
role 08's file.

**2. The same star has no `title`, and AC-099's two outward cases cannot read
the tooltip. To role 08, then the Steward.** `tooltipText` in
`tests/e2e/harness.ts` names three faithful mechanisms, `title`,
`aria-describedby` and `role="tooltip"`, and reads them immediately after a
hover; the distribution's tooltip supplies the last two only while it is open.
Measured twice: with `TooltipProvider` mounted at zero delay, which this session
added to `main.tsx` because his own `main.tsx` has it, the popup is still absent
at the instant of the read and the tip resolves to the `aria-label` alone,
"Important". **Options considered:** having the harness wait for
`[role="tooltip"]` (the tester's file, and a real alternative), or keeping the
tooltip mounted (nothing in section 9 asks for that). **Recommendation:** add
`title={starTooltip}` beside the existing name in `task-row.tsx`. It is one of
the three mechanisms the harness already declares faithful, it is what the P8
star did, and it costs nothing anywhere else.

**3. The same file's completion checkbox is controlled by `status` alone, so
`locator.check()` fails when the server refuses the transition. To role 08.**
AC-157's first case abandons a row under the viewer from a second session and
then completes it from the first; 5.1 answers 409, the status never changes, and
Playwright's `check()` reports "Clicking the checkbox did not change its state"
before the criterion's own assertion is reached. The P8 row held an `asked`
state until the answer arrived, and its header gives the product reason rather
than the test one: a controlled box that snaps back while the request is in
flight tells the person their click did nothing, and is indistinguishable from a
click that missed. **Recommendation:** restore that optimistic state in
`task-row.tsx`; 8.3's refetch is what replaces it either way.

**4. Four browser cases reach for the quick-add's text box without opening the
disclosure 9.1 now specifies. To the Adversarial Test Engineer, then the
Steward.** 9.1 made the inline quick-add a disclosure at the RFC 0002 change
control of 2026-08-13, and AC-166 was rewritten to assert both of its states,
including that escape leaves no text box on the page at all. Four cases written
before that amendment reach for `quickAddInput` directly: `AC-091`'s second
case, `AC-096`'s second case, `AC-157`'s third case, and `session-path.spec.ts`'s
CSRF case. They and AC-166 cannot both pass: a page whose box is present without
activation has no collapsed state, and AC-166's escape case asserts a page-wide
count of zero. **Options considered:** shipping the quick-add as a permanently
open row, which is a knowing deviation from 9.1 and leaves this row's own named
acceptance red; or auto-expanding it under some condition, which is a
client-side rule no numbered section carries and 7.11 forbids.
**Recommendation:** the implementation follows the specification, and each of
the four cases takes one added line, pressing `quickAddControl(page).first()`
before reaching for the box, or reading `quickAddControl` where AC-096 reads
`quickAddInput`. No criterion text moves and nothing is weakened; all four
sentences are about something other than the control's resting state.

**5. AC-162's Done case addresses "Mark as not done" as a `button`, and 9.1's
names table makes it the row's completion checkbox. To the Adversarial Test
Engineer, then the Steward.** The P8R change control of 2026-08-13 gave the
row's completion checkbox two names, "Complete task" when open and "Mark as not
done" when complete, which makes the affordance 9.5 names on Done a checkbox.
The designer's Done screen renders exactly that, and the distribution's checkbox
exposes `role="checkbox"`; AC-162 has addressed it as a button since P8 and is
green today. **What this session did rather than choose:** `pages/DonePage.tsx`
composes its own row from the same primitives his row is composed from, in his
class strings, so the named control stays a button and nothing goes red. The row
still opens its task on a click, which 9.4 gained at the same change control and
which AC-178 and AC-179 reach through. That is a divergence from the prototype
and it is recorded in the file and here rather than hidden.
**Recommendation:** settle which of the two the criterion means. If it is the
checkbox, AC-162's Done case changes role and `DonePage` drops its own row for
`components/task-row.tsx` in one edit; if it is a named button, 9.5's sentence
should say so beside 9.1's table.

### What remains for R7 to R12

- **R7**, the task form: AC-093 x4, AC-178 x4, AC-179 x3 are red and are its
  surface. Escalation 1 is a precondition for AC-093, whose four cases fail on
  the page behind the form rather than on the form.
- **R8**, the search overlay and the folder page: AC-176 x2 and AC-166's
  folder-page case. The folder page will want `pages/task-rows.tsx`'s `TaskRows`
  and `ConfirmDialog`, which are exported for it, and `CollapsibleSection` still
  carries AC-058's `aria-expanded` untouched.
- **R9**, the calendar: AC-177 x2. `PlannedPage` keeps the existing
  `<PlannedCalendar />` mount and its list mode is done; only the mount changes.
- **R10**, the public pages, the dialogs and the invite gate: AC-172 x2,
  AC-174 x2, AC-180 x4, AC-181 x1. **`MyDayPage` still renders
  `PendingInviteList`** and 9.8 as amended says no page inside the application
  carries one. It was kept because AC-172's second case is green on it today,
  and removing it early would have taken a passing criterion red and left an
  account holding an invite with no surface at all to answer it. It goes with
  the gate.
- **R11**, the copy sweep: AC-183's remaining cases, the toast region's markup,
  and the three repairs of escalations 1 to 3 if role 08 carries them there.
- **R12**: the human visual review of section 13 item 33. Two things from this
  phase to look at specifically: My Day's header renders `13 Aug` where the
  design reads "Monday, 10 August", which is the missing presenter above, and
  Done's row is composed rather than his, which is escalation 5.

Nothing was merged, nothing irreversible was done, `SESSION-LOG.md` was not
written to, and `docs/` was not touched.

---

## Final block — all four phases

### Branch state

`p8d-design` at `3741669`, working tree clean, local and `origin/p8d-design` at the
same sha. Four commits, one per phase, each pushed by the phase that made it:

| Sha | Phase | What it landed |
| - | - | - |
| `b5eec9f` | 1 | RFC 0002's re-acceptance on the three amendments, and the changelog entry |
| `6432abc` | 2 | Four control names corrected to 9.1's amended table |
| `eebed3f` | 3 | R5: the designer's shell and sidebar on our router; TopBar retired |
| `3741669` | 4 | R6: the six list screens on our view hooks through the presenters |

Nothing was merged. Nothing irreversible was done. No phase wrote to
`SESSION-LOG.md` or touched `app/tests/`.

### What each phase landed

**Phase 1, Integration Steward.** RFC 0002 back to Accepted, with both round-trip
lines kept so a later reader finds the trip rather than a status that appears never
to have moved. The no-numbers-move claim was confirmed rather than accepted: the
tail of the file from `### Append to section 12` and from `## Implementation plan`
hashes identically before and after, which is stronger than the claim. Two figures
did move, neither cited by anything: sixteen delta units rather than fifteen, and
9.4 added to the touched-sections line.

**Phase 2, Component and Design System.** The two named corrections, both at line
numbers that had drifted from the briefing, plus two more of the same class its
sweep found: `TaskRow.tsx` announcing `Complete` in both states, and the vendored
`sidebar.tsx` rail at `Toggle Sidebar` where the table rules `Collapse sidebar` and
`Expand sidebar`. Three names in R5's territory were reported across the boundary
rather than reached into.

**Phase 3, R5.** The shell and sidebar ported on our router, our chrome reads and
R4's presenters. `AppLayout`, `Sidebar`, `TopBar` and `pwa/UpdatePrompt` deleted.
Both view preferences in `localStorage`, not the cookie the shadcn primitive writes,
because nothing on our server reads it, it would ride every API request, and 11.6
leaves exactly one readable cookie that `harness.ts` identifies by being the only
one. The 1180px floor proved absent against `dist/` rather than the source: `1180`
occurs zero times in the built stylesheet and the bundle. Running the prototype
changed what got built twice — his folder directory hides in the icon rail, which
9.1 and AC-182 forbid, and his width transition animates the very property both
preferences set, which is what three AC-182 cases were failing on.

**Phase 4, R6.** The six list screens plus the shared page states, Planned in list
mode only with the calendar mount untouched for R9. No date and no ordering computed
anywhere: the only clock read is `presenterToday()`.

### Gate, measured

Every leg run from `D:\dana\app`, each database leg selected explicitly rather than
by habit. The browser leg at head was re-measured by the co-lead after Phase 4
rather than taken on report.

| Leg | After P1 | After P2 | After P3 | After P4 |
| - | - | - | - | - |
| `npm run lint` | clean | clean | clean | clean |
| `npm run typecheck` | clean | clean | clean | clean |
| Postgres, `npm test` | 1530/1530 | 1530/1530 | 1530/1530 | 1530/1530 |
| PGlite, `env -u TEST_DATABASE_URL npm test` | 1530/1530 | 1530/1530 | 1530/1530 | 1530/1530 |
| `npm run build` | clean | clean | clean | clean |
| Browser, `env -u TEST_DATABASE_URL npx playwright test` | 103/32 | 103/32 | **109/26** | **102/33** |

189 files and 1530 tests on both database legs at every phase, green throughout.

**The browser leg ends one worse than the run started.** 32 red at `daf7e9b`, 33 red
at `3741669`. R5 closed six and regressed nothing. R6 closed four and opened eleven.
No test was weakened by any phase to reach any of those numbers, and no phase touched
`app/tests/`, so the count is honest in both directions.

Closed across the run: AC-174's banner case, AC-181's dialog half, four of AC-182's
five, three of AC-166's cases, and AC-097's fade case.

Opened by R6: AC-093 x4, AC-099 x2, AC-157 x2, AC-091, AC-096, and `session-path`.

### What remains

R7 to R12 as the plan has them, and R7 and R8 also retire the two dated `z-50`
wrappers R5 left around the P8 overlay mounts. Ahead of any of that, the eleven
regressions want a role 08 session: seven of them are three one-line defects in a
file R6 was right not to reach into.

### ESCALATION

Seven, none resolved inside this run, each routed rather than worked around.

1. **`task-row.tsx` names the star with `aria-label`**, which reads as a *label* to
   the harness and collides with 9.3's "Important" field. Takes all four AC-093 cases
   red. `components/ui/StarButton.tsx` documents this exact fix as measured at the P8
   change control on 2026-08-11, in a paragraph headed that the name is carried by
   content and not by `aria-label`; the port lost it. Role 08. Verified at source by
   the co-lead: `task-row.tsx:202` is `aria-label={name}`.
2. **The same star has no `title`**, so AC-099's outward tooltip is unreadable by the
   harness even with the provider mounted. Two cases. Role 08.
3. **Its completion checkbox is purely controlled**, so `check()` fails on a refused
   transition. Two AC-157 cases. Role 08. Each of these three is one line, and each
   is invisible until a page mounts the component, which is why R3's own gate was
   green.
4. **AC-174's second and third cases address the avatar menu as `/Hassan/`**, on the
   ground that 9.1 named it nowhere. True when R1 wrote it, false since the change
   control four commits later gave it the fixed string "Account" in a paragraph
   refusing exactly a name built from the display name. R5 implemented the table and
   left the criterion red. Adversarial Test Engineer, then Steward. If the ruling
   stands, those two cases take `{ name: 'Account', exact: true }`.
5. **Four cases reach for the quick-add's text box without opening the disclosure**
   that 9.1 now specifies and AC-166 asserts. AC-166 and those four cannot both pass.
   R6 built the specification. Adversarial Test Engineer.
6. **AC-162 addresses Done's "Mark as not done" as a button** where 9.1's names table
   makes it the row's checkbox. `DonePage` composes its own row so both stay true
   today; recorded as a divergence from the prototype rather than hidden.
7. **`AC-086` fails intermittently on the Postgres leg at default parallelism**, green
   in isolation, green at `--maxWorkers=1`, green on PGlite, and green on three of the
   four phases' runs. It predates this branch's client work, no `app/` file differing
   from the sha the baseline was measured at. **CI runs `npm test` with no worker
   flag, so CI is exposed.** Adversarial Test Engineer, to decide between a real
   recompute race and missing test isolation. Do not add a retry and do not weaken the
   case.

Two smaller items, non-blocking, recorded in Phase 3's section: below 768px the
vendored sidebar becomes an off-canvas sheet whose only trigger is inside it, so
removing item 32's floor leaves a narrow window with no navigation (measured at
700px; the browser leg runs at 1280 and nothing is red); and `folder-row.tsx` renders
the pending count beside the link where AC-155 asserts it inside, worked around with
a wrapper that deletes itself when role 08 moves the badge.

# The component set

Written by the Component and Design System engineer at P8. `../README.md` is
the client's conventions ledger and this file does not restate it; what is
here is what a component in this directory may assume, what section 9 decided
about the pieces in it, and what the set still owes.

Marked **Settled** or **First pass** in that file's sense: settled is the
specification's or a criterion's and changing it is a Steward escalation;
first pass is one engineer's answer to something nothing has ruled on.

## Where things live

| Path | What it is |
| - | - |
| the seven lower-case files in this directory | The designer's presentational components, copied from `docs/design/prototype/src/components/` at P8R session R3, relabelled to section 9's names and corrected to 9.1's roles table |
| `index.ts` | The ported set's entry point, and the second import of `styles/tokens.css` |
| `ui/`, the lower-case files | The shadcn primitives of 11.4: twenty copied from `docs/design/prototype/src/components/ui/` at P8R session R2, re-ported and joined by six more from `docs/design/prototype-v2/src/components/ui/` at S8. Behaviour under them is @base-ui/react |
| `../lib/icons.tsx`, `../lib/time-format.ts` | The animated icon module of DES-125 and the time-format store it and the calendar read, ported at S8. Every icon Dana uses is an export of that module and nothing imports `lucide-react` directly; the v1 files still doing so are the named exemption lists in `ui/foundation.test.ts`, shrinking to empty as S9 to S13 land |
| `ui/utils.ts`, `ui/use-mobile.ts` | The designer's `cn` and his viewport predicate, which those primitives import |
| `ui/copy.ts` | The strings section 9 writes word for word and a component renders |
| `ui/index.ts` | The P8 set's entry point, and the first import of `styles/tokens.css` |
| `ui/LegacyButton.tsx` and the five P8 files beside it | The hand-rolled set, retiring as R5 to R10 replace what calls them |
| the calendar, task form and search directories | Complex Interaction's, and not this role's |

The seven ported files keep his file names, `task-row.tsx` and its six siblings,
so that a reader can put each beside the prototype file it came from. That is
11.13 as RFC 0002 amends it: his prototype is the source this client is built
from rather than a reference it is compared against, so a difference between
the two files is a defect in the port unless a numbered section says otherwise.
Each departure is therefore named in the file that makes it, at the top, with
the numbered sentence that forced it. His `task-form`, `search-overlay`,
`sharing-panel`, `app-shell` and `app-sidebar` are not here: the first three
are Complex Interaction's and the last two are the Frontend Architect's, and
they arrive at R5 to R9.

**`styles/tokens.css` is now imported twice, from `ui/index.ts` and from
`index.ts`, and that is deliberate.** `ui/index.ts`'s export list shrinks to
nothing as the P8 markup retires, so a page importing only from the new barrel
would otherwise have built a client with no tokens at all and nothing saying
so. Vite emits one stylesheet for the entry chunk, so the second import costs
nothing. Both come out on the day the line lands in `main.tsx`, which is the
request at the end of this file.

`../styles/tokens.css` is the single token file of 11.4 and has one owner.
**Since P8R session R2 it is the designer's `tokens.css` and his `app.css`
carried in as one file**, which is what RFC 0002 means by making his prototype
the source the client is built from rather than a reference it is compared
against. The two became one because 11.4 says tokens live in exactly one file
and that this is the only place raw values may appear, and his `app.css`
carries a sheet width, four type sizes and a selection colour.

Three departures from his two files are recorded in that file's own header,
beside the values each affects: his `min-width` floor is absent because
section 13 item 32 forbids it, `Inter Variable` leads the sans stack because
that is the family @fontsource-variable/inter registers and his stack never
reached the face he loaded, and one em dash is a comma.

## What a component here may and may not do

**Settled.** A component takes its card and its callbacks as props and reads
nothing. That is the ledger's rule and this role's hard boundary, and 9.5's
All page is why: it renders the Tasks page's own regions inside itself, so a
component that fetched could not be rendered twice on one page.

**First pass, and the one departure.** `ui/QuickAddRow.tsx` calls
`useCreateTask` itself. It is 9.1's own control, appears in four places that
would otherwise wire the identical mutation, and takes no row. What the rule
protects is that nothing below a page *reads*; a mutation observes no query,
so the component is still renderable many times over. The argument is at the
file.

**Settled.** No component spells a colour, a size, a radius or a type scale.
Every class is a token utility from `tokens.css`, and a raw value appearing
here is a defect fixed by moving the value into that file (11.4).

**Settled.** Copy comes from `ui/copy.ts`, transcribed character for character
from the section named beside it. Section 9's rule is "design may restyle, not
reword", and a paraphrase here is a specification change nobody recorded.

## The names section 9 fixes, and where they are

**Settled**, from 9.1's control table and 9.5. Each is exact, because four of
that table's names begin with "add" and four of them are "More actions".

| Control | Name | Role | Where |
| - | - | - | - |
| A row's overflow menu | `More actions` | button, `aria-haspopup`, `aria-expanded` | `ui/OverflowMenu.tsx`, `task-row.tsx` |
| A sidebar folder row's menu | `More actions` | button | `folder-row.tsx` |
| Every confirmation's two controls | `Continue` and `Cancel` | button | `ui/ConfirmDialog.tsx` |
| Inline quick-add input | `Add a task` | textbox | `ui/QuickAddRow.tsx`, `quick-add.tsx` |
| The quick-add's escalation control | `Open full form` | button | `quick-add.tsx` |
| A row's completion checkbox, open | `Complete task` | checkbox | `ui/TaskRow.tsx`, `task-row.tsx` |
| A row's completion checkbox, complete | `Mark as not done` | checkbox | `ui/TaskRow.tsx`, `task-row.tsx` |
| A row's star, starred | `Important` | button, `aria-pressed` | `ui/StarButton.tsx` |
| A row's star, not starred | `Mark as important` | button, `aria-pressed` | `ui/StarButton.tsx` |
| The un-pull control | `Remove from My Day` | button | `ui/TaskRow.tsx` |
| An abandoned row's restore | `Restore` | button | `ui/TaskRow.tsx` |
| The sidebar's rail control, expanded | `Collapse sidebar` | button | `ui/sidebar.tsx` |
| The sidebar's rail control, collapsed | `Expand sidebar` | button | `ui/sidebar.tsx` |
| The "New folder" dialog's field | `Folder name` | textbox | `new-folder-dialog.tsx` |
| A folder-group dialog's field | `Group name` | textbox | `folder-group-dialog.tsx` |

Every string above is a constant in `ui/copy.ts` or, for the two dialog
fields, the `label` element beside the input. None of them is interpolated
with the object the control acts on, and that is the rule rather than a habit:
9.1's names table says in its own words that a name there is a fixed string
and its region rule is what tells two instances apart.

**What R3 corrected in the ported set, and where each name came from.** His
prototype satisfies every name in 9.1's control table nowhere and four of them
wrongly, measured against the running application on 2026-08-13. The owner
ruled on that date that his design wins on structure and section 9 wins on
labels, so nothing but the text moved.

| Control | His string | Section 9's | Fixed by |
| - | - | - | - |
| A row's overflow menu | `More task actions` | `More actions` | 9.1's control table, "A task row's overflow menu (9.4)" |
| A row's star, starred | `Remove from Important` | `Important` | 9.5 |
| A row's star, not starred | `Mark important` | `Mark as important` | 9.5 |
| An abandoned row's restore | `Restore task` on an element already reading "Restore" | `Restore` | 9.5, and the `aria-label` is gone rather than reworded |
| The quick-add, collapsed | `Add task`, which is the floating button's name | `Add a task` | 9.1's control table, "collapsed and expanded alike" |
| The quick-add, expanded | `Task title for {folder}` | `Add a task` | the same row, one name across two states |
| The inline retry control | `Retry` | `Try again` | 9.1's control table |
| The failed-read line | the global error toast | `Couldn't load this. Nothing was changed.` | 9.1's inline state copy, and AC-183 reads it as one text run |

**What the P8R naming change control corrected after R3 had shipped, and the
one fault both corrections share.** 9.1's names table gained eleven rows at the
mid-package change control of 2026-08-13, on the Adversarial Test Engineer's
escalation, and the owner re-accepted RFC 0002 on that amendment the same day.
R3 had already shipped four of the controls it names, checked before the ruling
rather than after. Three agree and stand: the quick-add's two states are
"Add a task", the completion checkbox is "Complete task" and "Mark as not
done", and a task row's overflow is "More actions". Two disagreed, and both
disagreed the same way, by interpolating the object the control acts on.

| Control | What R3 shipped | The ruled name | Where |
| - | - | - | - |
| The quick-add's escalation control | `Open full task form for {folder}` | `Open full form` | `quick-add.tsx` |
| A sidebar folder row's menu | `Manage {folder} folder` | `More actions` | `folder-row.tsx` |

Two more sites were corrected in the same sweep, neither of them R3's and both
inside this directory. The P8 client's own row, `ui/TaskRow.tsx`, named its
completion checkbox `Complete` in both states, so a completed row announced a
transition it had already made; it now carries the same two names the ported
row does. And `ui/sidebar.tsx`, copied in from the shadcn distribution at R2,
names the rail control `Toggle Sidebar` in both states where 9.1 now gives it
two; that is the one string in the twenty vendored primitives this client
changes, and the file says so where it changes it.

**The general lesson, stated because it outlives these four sites.** A name in
9.1's table is a fixed string. A control that appears once per folder, once per
row or once per group is separated from its siblings by the region it sits in,
which is 9.1's sections rule, and never by folding the folder's name into the
control's. An interpolated name also puts fixture data into the one namespace a
criterion has to know before it reads the fixture. The exceptions in this
directory are the controls section 9 does not name at all, `Add task to
{folder}` on a folder row and `Open task: {title}` on a task row, which are the
designer's own strings on controls no table reaches; inventing fixed names for
those would be the unrecorded deviation, not the fix.

**The star's name and its tooltip are two attributes and his component drove
them off one string.** That is settled and is restated here because it is the
correction most easily undone: 6 Q4 turns the tooltip outward on Important
while AC-055 and AC-099 both address the star by the name `Important` exactly,
so a component that pointed the tooltip outward by renaming the control would
lose the name on the one page the outward tooltip exists for. `task-row.tsx`
takes `importantTooltip`, which moves the tooltip alone, and the page layer
decides which way a page's stars point.

**Roles, and the one this port had to add.** 9.1's roles table was written at
the RFC 0002 change control precisely because his markup diverges from it.

| Element | Role | State in his prototype | State here |
| - | - | - | - |
| Each folder row | link | `button` with `aria-current`; the only anchor in his sidebar is the brand | `folder-row.tsx` renders an anchor carrying `href`, and takes a `render` element so the router can supply its own |
| A task row | list item, or row | `role="listitem"`, measured carrying | unchanged; the list around it is the page's |

**And the departure a reader will see, recorded because it is a real
difference from his files.** His star, overflow and un-pull controls animate
from zero width and are revealed by hover or by focus within the row, so at
rest each has a bounding box of 0 by 40. Four criteria act on those controls
from a page they have just loaded, without hovering: AC-157, AC-162 and AC-183
open a row's "More actions", and AC-165 asserts the un-pull control on My Day.
9.1's addressing sentence is what settles it rather than the tests, every
control section 9 names being reachable by its role and its name, and 9.4
listing all three as row elements. So the reveal is opacity alone and the box
is always reserved, in `task-row.tsx` and in `folder-row.tsx`'s action cluster
alike. The visible cost is that a row's metadata sits a fixed distance from its
right edge instead of sliding as the controls grow, which also removes the
layout jitter that sliding produced. It is flagged for the visual review of
section 13 item 33, which is the surface that can rule on it.

**Settled.** `ConfirmDialog` takes neither name as a prop. 9.1 assigns
"Continue" and "Cancel" to *every* confirmation of 9.3 to 9.9, and its
paragraph gives the reason: the destructive verb is already in the message,
so naming it on the button costs four more strings to keep in step with four
messages. Uniform means no caller may rename either.

**Settled, and the least obvious thing in this directory.** The star's
accessible name and its tooltip are different attributes and come apart on
exactly one page. Q4 turns the tooltip outward on Important ("Also in Planned,
due ..."), while the name has to keep saying what pressing the control does,
because AC-055's un-star asks for it by name. Which way a page's stars point
is decided by the page layer, in `parts/useRowActions.ts`, and arrives as a
plain prop: a component that read the route itself would behave differently
depending on where it was mounted.

## The states, and the cue beside each colour

**Settled**, section 6's state table and the brief's accessibility floor:
never colour as the only signal.

| State | Colour | The cue beside it |
| - | - | - |
| Abandoned | faded | struck (`s`), an "Abandoned" chip, a Restore control |
| Completed | faded | the checkbox is checked |
| Overdue | the alert chip | the badge reads "Overdue" before the date |
| Important | the filled glyph | the button's own name and `aria-pressed` |
| Repeating | none | a glyph plus screen-reader text |

**Settled, and it is a measurement rather than a preference.** The fade is set
on the element carrying the title and not on the row, because `opacity` does
not inherit: a row-level fade leaves every descendant computing 1, so the page
looks faded and the title is not. AC-097 reads the computed value off the
title and compares it with a pending row's title on the same page. Colour is
set with it so the pair holds whichever property is read. The rest of the row
is quieted by colour instead, through `task-row-completed` and
`task-row-abandoned`, which reaches the design's whole-row fade without
compounding two opacities on the title.

**Settled, DES-044.** A checked control is `accent-600`, which is the
foundation board's own answer in the sentence that also gives the accent to
links and the focus ring. The completed task row's checkbox is the one named
exception and is a neutral monochrome fill: a finished list should not be a
column of blue, the accent meaning "you can act here" and a completed row not
asking. It is `checkbox-neutral`, applied beside `checkbox`.

## The class vocabulary is gone, and what replaced it

**Superseded at P8R session R2, and this section is kept rather than deleted
because the vocabulary it indexed is what every P8 page still writes.** Until
that session this client styled itself by naming things: `tokens.css` held 94
`@utility` definitions and a component wrote `className="button-base"` and
never a colour. That file is now the designer's, so those 94 definitions no
longer exist, and a class name from the old index resolves to nothing.

RFC 0002 is why, and it is a change of idiom rather than a change of rule.
That RFC makes his prototype the source the client is built from, and he
composes Tailwind utility strings in the `.tsx` files where this client wrote
named classes. Its own reasoning: a restyle would have had to re-derive every
composition decision from his files into the naming idiom, by hand, with
nothing checking the derivation. Taking his files removes the derivation step,
and taking his files means taking the idiom they are written in.

**What this costs in the interim, so that nobody reports it as a defect.**
Every page, shell and state P8 built writes those names, so that markup
renders unstyled until R3 to R10 replace it. The old definitions were not kept
beside his values: they are written against token names his file does not
define, so a retained utility would resolve half its `var()` references and
produce a broken layout rather than an unstyled one, which is harder both to
look at and to diagnose.

**What a session writes now.** Tailwind utility classes in the component,
composed through `ui/utils.ts`'s `cn`, with variants expressed as
class-variance-authority definitions the way the twenty primitives express
theirs. `tokens.css` remains the single file of 11.4 and the only place a raw
colour, type size, spacing step or radius may be written; what changed is that
utilities now reach those values through Tailwind's `@theme` namespace rather
than through a named class. So the rule this role exists to hold is unchanged
and its enforcement moved: a raw value in a `.tsx` is still a defect, and
`bg-primary` is not one.

**The exception worth stating, because it is the one thing an arbitrary value
looks like.** Tailwind's bracket syntax spells a raw value directly in markup,
`w-[37px]` and its kind. A component needing one has found either a missing
token or an escalation.

**And one trap that cost R2 a rebuild, because documenting a prohibition can
enact it.** Tailwind's automatic source detection scans this markdown file. A
bracket utility written here is therefore a class the build finds and emits,
so naming the forbidden `min-w-` floor of section 13 item 32 in its literal
form put a real `min-width` rule at that value into the built stylesheet, from
prose whose whole point was that it must not exist. CSS comments are not
scanned and markdown is. So describe such a utility, never spell it, and check
the built output rather than the source: the grep that decides item 32 is
against `dist/`.

Two things that were true of the old vocabulary and stay true. There is no
`min-width` anywhere, per section 13 item 32, which now covers the bracket
form as well as the declaration. And a name that section 9 fixes is still
fixed: the tables above this section are section 9's contract and no change of
styling idiom touches them.

**Icons come from `../lib/icons.tsx`, the animated icon module, since S8.**
DES-125 rules that `@animateicons/react/lucide` is the family and that one
module owns it: every icon is an export of that file, nothing imports
`lucide-react` directly, and where the animated set lacks a drawing the
substitution and its reason are written on the line that makes it.
`ui/foundation.test.ts` holds the rule, with an exact list of the v1 files
still importing per icon; each leaves with the package that replaces it.
The stroke idiom is unchanged: call sites pass `strokeWidth={1.75}` and the
animated wrapper accepts and ignores it, which the module's own header
explains. A decorative glyph is always `aria-hidden`, unchanged and
unrelated, because the accessible name belongs to the control around it.

The open question this section used to carry, whether the global `.lucide`
stroke rule should be restored, is closed by the family change: the
animated wrapper hardcodes its stroke and the prop survives only as call
site idiom, so there is no longer a rule to restore.
## Owed, and by whom

Each of these is a control section 9 names that this package cannot finish
inside this role's paths. They are requests in the sense
`src/server/routes/README.md` established: named, reasoned, and executed by
the role that owns the file.

- **The row's overflow menu is missing Edit and Delete.** 9.4 gives it "edit,
  abandon, delete"; abandon is implemented with its confirmation. Edit needs
  an edit arm on the overlay seam (`shell/overlays.ts` carries
  `openTaskForm(defaults)` and no task identity), which `../README.md` marks
  as the Complex Interaction engineer's call. Delete needs a `useDeleteTask`
  hook in `api/mutations.ts`, which is the Frontend Architect's directory and
  which the task form of 9.3 needs anyway for its own delete. `TaskRow` takes
  `onOpenTask` and `onDelete` today and renders each entry only when its
  callback is supplied, so both arrive by passing them through
  `parts/useRowActions.ts` and nothing in this directory changes.
- **9.5's "click on any row opens the task"** waits on the same edit arm, and
  for the same reason: a row that opened the create form would be a row that
  makes a second task.
- **The folder header's overflow menu (9.6) and the Done row's G-SERIES
  confirm (9.5)** are `OverflowMenu` and `ConfirmDialog` applied to markup
  that lives in `pages/FolderPage.tsx` and `pages/DonePage.tsx`. The two
  components are here and take the copy as a prop; the pages are the Frontend
  Architect's.
- **`parts/TaskRow.tsx` and `parts/QuickAddRow.tsx` are now one-line
  re-exports** of this directory, because the five pages that import them are
  not this role's to edit. Repointing those imports at `components/ui` deletes
  both files, and `parts/` then holds only the row callbacks, which are the
  data layer's and belong in `api/`.
- **`styles/tokens.css` is imported by `ui/index.ts` and, since R3, by
  `index.ts` beside it**, which is what puts it in the built stylesheet at all.
  The tidier arrangement is one line in `main.tsx` beside the query client and
  the router; that file is the Frontend Architect's. If the line lands there,
  both imports here come out.
- **`page-bar.tsx` must be rendered inside `main`, and R5 owns where it goes.**
  A `header` element maps to the `banner` landmark unless it is inside
  `article`, `aside`, `main`, `nav` or `section`, and AC-174 asserts the removal
  of 9.1's top bar as the absence of a banner on every page. Measured against
  the running prototype on 2026-08-13: his shell renders it inside `main` and
  exposes zero banners. The component cannot hold this on its own, so it is a
  request rather than a note.
- **`page-bar.tsx` takes `onUpdate` and falls back to reloading the window.**
  His prototype has no service worker to activate, so it reloads directly.
  10.6's non-forcing update wants the waiting worker applied on the click, which
  is the registration's own path and lives in the shell.

## One escalation open against this directory

**AC-180 cannot address the move-to-group submenu that `folder-row.tsx`
carries, and the component is right.** A folder holds exactly one personal
label, so choosing its group is a single-valued choice and his submenu builds
it as a radio group. Measured against the running prototype on 2026-08-13, its
entries render `menuitemradio`, which is the accurate role and is what
announces to a screen reader which group a folder is already in. AC-180 reaches
for `getByRole('menuitem')` or `getByRole('option')`, and Playwright matches
roles exactly rather than by superclass, so neither resolves.

9.1's roles table fixes six elements and this is not one of them, and that
section's own sentence says a control it does not list is reached by its role
in the ordinary sense of the word. So the criterion's locator is narrower than
the specification, rather than the component being wrong. It was not degraded
to plain menu items to make the locator resolve: that is writing the
implementation from the test, which protocol section 8 exists to prevent, and
it would cost a real accessibility property to buy nothing. Raised to the
Adversarial Test Engineer and then the Integration Steward at R3, with the
recommendation that AC-180 admit `menuitemradio` beside the two roles it
already admits. AC-180 is red until R10 either way, so nothing turns green or
red on the timing.

## The browser leg needs one environment fact, or it reports a false red

**Measured at P8D session 1 on 2026-08-12, and it supersedes the two criteria
this section used to report as unable to pass.** They pass. So does everything
else: 97 of 97, exit 0, on both the pre-session tree and the restyled one.

What made them look broken is that `npm run e2e:app` was seeding one database
and serving another. `db/client.ts` prefers `TEST_DATABASE_URL` when it is set,
which is right for a test process and is what `db/seed.ts` is; but
`src/server/index.ts` deletes that variable at line 291, per 11.10's rule that
server entrypoints never inherit it, and falls back to the `.data` PGlite
directory. With `TEST_DATABASE_URL` set in the ambient environment, which it is
on this machine, the seed therefore truncates and fills `dana_test` on Postgres
while the browser is shown `.data`, which nothing truncates and which has been
accumulating every fixture every previous run created. The symptom is a strict
mode violation naming two or three identical rows, and a `409` saying two
accounts are already connected: it reads exactly like a rendering defect and is
not one. It also drifts, which is why the count differs from run to run.

Run the leg with the two agreeing:

```bash
env -u TEST_DATABASE_URL npx playwright test
```

If `.data` has already accumulated, move it aside first and let the seed build
a fresh one. Both vitest legs are unaffected: they are test processes, so the
variable selects which database they measure, which is the seam working as
11.10 intends.

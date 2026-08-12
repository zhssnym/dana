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
| `ui/`, the twenty lower-case files | The shadcn primitives of 11.4, copied from `docs/design/prototype/src/components/ui/` at P8R session R2. Behaviour under them is @base-ui/react |
| `ui/utils.ts`, `ui/use-mobile.ts` | The designer's `cn` and his viewport predicate, which those primitives import |
| `ui/copy.ts` | The strings section 9 writes word for word and a component renders |
| `ui/index.ts` | The P8 set's entry point, and the one import of `styles/tokens.css` |
| `ui/LegacyButton.tsx` and the five P8 files beside it | The hand-rolled set, retiring as R3 to R10 replace what calls them |
| the calendar, task form and search directories | Complex Interaction's, and not this role's |

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

**Settled**, from 9.1's control table and 9.5. Each is exact, because three of
that table's eight names begin with "add" and two of them are "More actions".

| Control | Name | Role | Where |
| - | - | - | - |
| A row's overflow menu | `More actions` | button, `aria-haspopup`, `aria-expanded` | `ui/OverflowMenu.tsx` |
| Every confirmation's two controls | `Continue` and `Cancel` | button | `ui/ConfirmDialog.tsx` |
| Inline quick-add input | `Add a task` | textbox | `ui/QuickAddRow.tsx` |
| A row's star, starred | `Important` | button, `aria-pressed` | `ui/StarButton.tsx` |
| A row's star, not starred | `Mark as important` | button, `aria-pressed` | `ui/StarButton.tsx` |
| The un-pull control | `Remove from My Day` | button | `ui/TaskRow.tsx` |
| An abandoned row's restore | `Restore` | button | `ui/TaskRow.tsx` |

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

**Icons come from `lucide-react`, imported per icon, and the stroke rule
inverted at R2.** The P8 client set the design's 1.75 once, in a `.lucide`
rule in `tokens.css`, and this file told every session never to pass
`strokeWidth`. That rule left with the old token file. His prototype does the
opposite and passes `strokeWidth={1.75}` at the call site, which is the idiom
his components arrive in, and his `tokens.css` carries `--icon-stroke-width`
as a value that nothing currently reads. So an icon ported from his files
keeps the explicit prop it came with, and an icon written fresh should match
it. A decorative glyph is always `aria-hidden`, unchanged and unrelated,
because the accessible name belongs to the control around it.

Whether the global rule should be restored, at the cost of departing from his
files in a way none of them expects, is a real question and is left open here
rather than decided by this session: it is one line in `tokens.css` against an
explicit prop on every glyph, and the argument for the prop is that it is what
the source says. R11's copy sweep is the natural place to settle it if the
visual review of item 33 raises a stroke difference.

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
- **`styles/tokens.css` is imported by `ui/index.ts`**, which is what puts it
  in the built stylesheet at all. The tidier arrangement is one line in
  `main.tsx` beside the query client and the router; that file is the Frontend
  Architect's. If the line lands there, the import here comes out.

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

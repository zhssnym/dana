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
| `ui/` | The library of 11.4: rows, chips, buttons, the overflow menu, the confirmation |
| `ui/copy.ts` | The strings section 9 writes word for word and a component renders |
| `ui/index.ts` | The entry point, and the one import of `styles/tokens.css` |
| the calendar, task form and search directories | Complex Interaction's, and not this role's |

`../styles/tokens.css` is the single token file of 11.4 and has one owner.
**Its values are the design's, and since P8D session 1 it also carries the
layout layer and the class vocabulary the rest of the client applies.** The
colours, type roles, spacing and radii were transcribed from the foundation
board at P8; what P8D added is the half no artifact had ever put in this
client, the dimensions (`--shell-sidebar-width`, `--control-height`,
`--task-row-height` and their neighbours) whose absence is the recorded reason
P8 shipped a full-width sidebar, and the four motion durations that existed
only as prose in `docs/design/notes.md`.

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

## The class vocabulary

**Settled**, landed by P8D session 1, and the reason that session goes first
and alone: this client puts every visual value in `tokens.css` and writes
`className="button-base"`, so a role that owns markup and owns no colour cannot
restyle anything at all until the names exist. The index below is the contract.
The definitions, with the artifact each was read from, are in `tokens.css`
itself; nothing here repeats a value, because a value written twice is a value
that will one day disagree with itself.

A name applies rather than describes: write `task-row`, never a colour. Where a
class has variants, the base class is always applied with them
(`chip chip-alert`, `task-row task-row-completed`).

| Group | Classes | Who applies them |
| - | - | - |
| Buttons | `button-base` with `button-default`, `button-primary`, `button-danger`, `button-quiet` | anyone |
| Icon controls | `icon-control`, `icon-control-active` | anyone |
| Checkbox | `checkbox-target` wrapping `checkbox`, plus `checkbox-neutral` for DES-044's completed row | 08, 09 |
| Switch | `switch-track` containing `switch-thumb` | 07 (9.4's important-only filter) |
| Inputs | `input-base`, `input-invalid`, `textarea-base`, `field-hint`, `field-error`, `quick-add` | 07, 09 |
| Chips | `chip` with `chip-alert`, `chip-success`, `chip-info`, `chip-outline`; `avatar`, `avatar-chip`, `folder-dot` | anyone |
| Menus | `menu-panel`, `menu-item`, `menu-item-danger`, `menu-separator`, `popover-panel` | 08, 09 |
| Dialogs | `dialog-scrim`, `dialog-panel`, `dialog-title`, `dialog-actions`; `sheet-scrim`, `sheet-panel` | 08, 09 |
| The row | `task-row` with `task-row-completed`, `task-row-abandoned`; `task-title` with `task-title-overdue`, `task-title-completed`, `task-title-abandoned`; `meta` | 08 |
| The shell | `app-shell`, `shell-sidebar`, `shell-sidebar-section`, `shell-sidebar-row`, `shell-sidebar-row-active`, `shell-main`, `shell-topbar`, `shell-brand`, `shell-pagebar`, `shell-pagebar-tab`, `shell-scroll`, `shell-content`, `shell-fab` | 07 |
| Feedback | `banner` with `banner-offline`, `banner-update`; `toast` | 07 |
| Page furniture | `page-header`, `page-title`, `section-heading`, `day-heading`, `list-card`, `link` | 07 |
| Shared states | `skeleton`, `skeleton-row`, `empty-state`, `empty-state-media`, `empty-state-text`, `inline-error` | 07 |
| The task form | `form-title`, `form-row`, `form-label`, `form-value`, `select-trigger` | 09 |
| Search | `search-scrim`, `search-panel`, `search-input`, `search-group-heading`, `search-result`, `search-result-active`, `search-footer`, `kbd` | 09 |
| Calendar | `calendar-surface`, `calendar-event` with `calendar-event-overdue`, `calendar-event-completed`, `calendar-event-ghost` | 09 |

Three things that are deliberately not in the list, so no session looks for
them. There is no class for the folder page's due-presence filter, the
sidebar's collapse rail or resize handle, the task form's resize handle, or the
five-second completion confirmation: none of those ships in P8D and each is
named with its reason in the RFC's P8D row. There is no sidebar brand header,
because 9.1 puts the app name, the search control and the avatar menu in the
top bar and that is structure rather than skin, so the mark renders through
`shell-brand` inside `shell-topbar`. And there is no `min-width` anywhere, per
section 13 item 32.

**A missing name is a scheduled session, not a mid-session escalation.** The
RFC's P8D row keeps a second 08 session after roles 07 and 09 have run, to
close whatever they found missing, and asks the four sessions before it to
batch their requests to the Steward rather than raise them one at a time. Write
the request down; do not invent a class in a `.tsx`, and do not spell a value
there, because either one puts the design somewhere it cannot be changed from.

Icons come from `lucide-react`, imported per icon. **Never pass `strokeWidth`.**
The design's 1.75 is set once in `tokens.css` on the package's own `.lucide`
class, so an icon is written `<Star aria-hidden="true" />` and nothing more; a
decorative glyph is always `aria-hidden`, because the accessible name belongs
to the control around it.

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

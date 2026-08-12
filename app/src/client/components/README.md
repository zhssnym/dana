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
**Its values are provisional and its own header says so at length.** The shape
is settled, the numbers are not, and the transcription session the P8 change
control made required is what replaces them. If that session does its job, no
file in this directory changes.

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
set with it so the pair holds whichever property is read.

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

## Two acceptance criteria that cannot pass as written

Reported rather than worked around, and neither is a defect in this client.
Both are one-line fixture changes in `app/tests/`, which no implementing phase
may edit for any reason.

- **AC-097's first case.** It asserts `getByText('Abandoned')` inside a row
  whose fixture title is `ac-097 overdue assigned abandoned`. Playwright
  matches text by case-insensitive substring, so the title's own element
  matches beside the chip and the locator resolves to two elements. No
  rendering avoids it: the same case reads the computed style off
  `getByText(<the whole title>)` two lines later, so the title must be exactly
  one text node. This is AC-047's pattern with a different word.
- **AC-099's third case.** It creates a task with the title its own first case
  already created, against a database the runner seeds once, so two rows carry
  it and the star locator resolves to two. Measured: run alone against a fresh
  seed, the case passes. This is AC-165's and AC-167's pattern.

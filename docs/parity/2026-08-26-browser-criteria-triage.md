# The browser criteria triage: 223 cases, three piles

- **Date:** 2026-08-26
- **Package:** RFC 0004's **S20**, written under
  `docs/team/11-adversarial-test.md`, in its own commit and before the
  Steward's, which is item 15's discipline.
- **Scope:** every case in `app/tests/e2e/`. **72 spec files, 223 cases**,
  collected rather than counted by hand: `npx playwright test --list`
  answers "Total: 223 tests in 72 files" against `v2-build` at `3e001e1`,
  and the per-file counts below are that listing's.
- **Companions:** the ledger at
  `docs/parity/2026-08-26-prototype-v2-behavioural-ledger.md`, whose L-nnn
  entries are cited here, and the rulings sheet at
  `docs/parity/2026-08-26-lift-rulings-sheet.md`.

## The discipline this file keeps

**It writes no criterion and edits none.** Protocol section 8 puts the
acceptance tests with this persona and forbids editing one so an
implementation passes; nothing here is weakened, and nothing here is
rewritten. What it does is sort, and name the package that will rework each
case it puts in the rework pile.

**A rework lands red first in the package that lifts its surface**, which is
what makes this pile useful rather than a wish. A criterion moved without
being made red first is a criterion nobody has proved measures anything.

**The precedent, read first.** SESSION-LOG and RFC 0005 change control item 8
record the twenty v1 browser criteria found at S9: 91 passed, 59 failed, and
every one of the twenty failing files addressed something RFC 0005 had
deliberately changed. The lesson that matters here is the distinction that
package turned on. **A criterion that was green and goes red because the
contract moved under it is a different animal from a criterion planted red
awaiting its package.** The first kind, merged unannounced, is a false green
across several packages. The three piles exist so that the second S9 does not
happen in the middle of S23, when eight sessions are in flight.

## The piles, defined

| Pile | Definition |
| - | - |
| **Survives** | The case asserts the specification and addresses the thing by the role and the name section 9 fixes. It passes after the lift, and where the lifted component would not answer to that address, **the lift owes the address at a named seam** rather than the criterion owing a rewrite |
| **Rework** | The case addresses a control whose role or name the lift changes. Persona 11 rewrites it red first in the package that lifts the surface, and no text is weakened in the move |
| **Retire** | The case asserts a surface or an absence the lift removes. It goes with the thing it asserts, in the amendment's own commit |

---

## The four measured facts that decide the sort

Everything below rests on these, and each was checked in the source rather
than reasoned from the shape of the problem.

### F1. The prototype's task row carries no `listitem` and no `row` role

9.1's roles table fixes "A task row: a list item, or a row", and the
harness's `taskRow` helper addresses exactly that
(`app/tests/e2e/harness.ts:944-956`, `getByRole('listitem').or(getByRole('row'))`
filtered by the title). The prototype's row is a `<div>`:
`docs/design/prototype-v2/src/components/task-row.tsx:2526` is
`"group/row grid w-full grid-cols-[40px_minmax(0,1fr)_auto] …"`, the whole
file carries two `role=` attributes and neither is the row's, and the client's
row carries `role="listitem"` at `app/src/client/components/task-row.tsx:457`.

**Consequence.** A verbatim lift of `task-row.tsx` turns **49 cases** red at
once, and none of them would be measuring a defect. 11.13 makes 9.1 the
winner here without a ruling: the role is the section's, so the lift owes it
at a named seam. **This is the single most important sentence in this file
for S23.**

### F2. The prototype's card chips are named by their value; 9.3 names them by their field

The harness reads a chip as a button whose accessible name is the field and
then the value ("Due date 3 Sep"), and its own comment argues that from 9.3,
which makes "that name the field's, because a strip whose chips did not say
which field they were would be five values and no questions". The prototype's
`PropChip` renders a button whose only text is the **value**
(`task-card.tsx:191-231`), and its `PickerChip` carries the field name in a
**tooltip** ("Due date and time", "Reminder", "Repeat"), which is not an
accessible name.

**Consequence.** **50 cases** reach the task surface through
`taskSurface`, `taskChip`, `formField`, `openChipPicker` or `setReminderTime`.
They survive the lift only if the seam gives the chips 9.3's field names. Same
ruling as F1: the section wins, the lift owes the name.

### F3. Seven of the prototype's accessible names disagree with 9.1's names table

Swept across `src/components/` and `src/screens/`, outside the two axes item
39 makes mandatory:

| 9.1's name | The prototype's |
| - | - |
| "Search" | "Search Dana", and "Search Dana. Keyboard shortcut Control K or slash." |
| Every overflow menu: "More actions" | "More task actions", "More folder actions", "More actions for {folder}", "Manage {shelf} shelf" |
| "Important" / "Mark as important" | "Remove from Important" / "Mark as Important" (`task-row.tsx:1254`) |
| "Resize panel" | "Resize task panel" |
| "Collapse sidebar" / "Expand sidebar" | "Toggle Sidebar" |
| "Account" | "Open Imran Wafa's account menu" |
| 9.3's "title" | "Task title", "Task name", "New task name" |

**Consequence, and it is a ruling rather than a fact.** These are outside item
39's two axes, so 11.13 governs and the section wins until amended. The
recommendation this file routes to the rulings sheet is that **9.1's names
stand and the lift transcribes them at the seam**: they are the addressing
contract the whole browser leg is built on, they are invisible on screen, and
the prototype's variants are longer strings rather than different behaviour.
Under that recommendation these cases **survive**. Under the opposite ruling,
AC-099 (3), AC-174 (1), AC-182 (2), AC-242 (1) and every case that opens an
overflow menu move to rework, and this file's counts change by about thirty.

### F4. The view strip's options stop being buttons

Item 39 rules the strip becomes the prototype's collapsing icon radiogroup
(ledger L-028 to L-033). Its options then carry `role="radio"` inside a
`role="radiogroup"`, their labels move into tooltips, and every option but
the current one sits at **zero width** until hover or focus.

Seven spec files reach a view by `getByRole('button', { name: /^calendar$/i })`
or `/^Board$/i`. Every one of them breaks on all three counts: wrong role,
name in a tooltip, and a target with no width to click.

**These are the rework pile's core**, and AC-093 is the first of them by
number, which is what item 39 already predicted.

---

## The sort, file by file

Every one of the 72 files appears. A file whose cases split is split, and the
split is stated.

### Rework: 19 cases across 9 files

| File | Cases | Reworked | Why | Package |
| - | - | - | - | - |
| `ac-093-entry-point-defaults.spec.ts` | 7 | **1** ("a calendar cell captures with that cell's date", line 299) | F4: reaches the calendar by a button named "Calendar" at line 305. The other six capture points are untouched | **S24** |
| `ac-098-ghost-opens-occurrence.spec.ts` | 3 | **3** | F4: the calendar toggle is in a module-level helper at line 112, above the first test at 136, so every case traverses it | **S24** |
| `ac-158-empty-states.spec.ts` | 3 | **1** ("the recap is hidden and the calendar is a bare grid") | F4: the toggle is inside that case at line 141. The other two are page copy and survive | **S24** |
| `ac-177-calendar-grid-and-overflow.spec.ts` | 3 | **3** | F4: the toggle is in a helper at line 100, above the first test at 115 | **S24** |
| `ac-221-board-capture.spec.ts` | 2 | **2** | F4: the Board button is in a helper at line 66, above the first test at 72 | **S24** |
| `ac-228-board-drop.spec.ts` | 2 | **2** | F4: the Board button is in a helper at line 149, above the first test at 214 | **S24** |
| `ac-259-board-two-columns-per-row.spec.ts` | 3 | **3** | F4 twice: a helper at line 135 for two cases, and case 2 asserts the strip itself at line 248, "the folder page carries the view strip" | **S24**, with S26 for the folder page's own board |
| `ac-217-folder-menu-by-role.spec.ts` | 3 | **2** (the member's menu and the owner's) | Ledger L-009 and rulings sheet A1: if the ellipses are taken, AC-217's "Leave folder" moves to "Leave folder…". Case 2, the page title, is untouched | **S24**, conditional on A1 |
| `ac-246-object-menu-contract.spec.ts` | 2 | **2** | Same ruling: both cases enumerate the acts by their labels | **S24**, conditional on A1 |

### Retire: 1 case

| File | Cases | Retired | Why | Package |
| - | - | - | - | - |
| `ac-262-trash-rows.spec.ts` | 3 | **1** ("the page offers nothing that deletes permanently") | It asserts an **absence** that Imran's ruling at RFC 0005 change control item 36 removes: Trash gains the permanent delete control, and it clears the attachments too. Item 36 already records that this arm moves in the amendment's own commit, red first. The other two cases, the countdown and the glyph, survive | **S28** |

### Survives: 203 cases across 67 files

The remainder. Listed by file with its count, so that "the triage covers
every one" is checkable rather than asserted. **S** marks the cases that
survive only if the lift carries F1's role or F2's names across the seam;
they are not rework, and the work they imply is the lifting session's, not
persona 11's.

| File | Survives | Seam |
| - | - | - |
| `ac-091-offline-shell.spec.ts` | 3 | |
| `ac-092-clear-date-warning.spec.ts` | 4 | **S** F2 |
| `ac-093-entry-point-defaults.spec.ts` | 6 | **S** F2 |
| `ac-094-assignee-visibility.spec.ts` | 4 | **S** F2 |
| `ac-095-hidden-pages-still-render.spec.ts` | 5 | |
| `ac-096-done-has-no-add.spec.ts` | 3 | |
| `ac-097-abandoned-row-and-restore.spec.ts` | 3 | **S** F1 |
| `ac-099-star-tooltip.spec.ts` | 3 | **S** F1, and F3 if the star's names are ruled the prototype's |
| `ac-100-update-affordance.spec.ts` | 1 | |
| `ac-155-sidebar-folder-list.spec.ts` | 4 | |
| `ac-156-search-overlay.spec.ts` | 4 | **S** F2 (the "enter opens the first result" case) |
| `ac-157-conflict-copy.spec.ts` | 3 | **S** F1 |
| `ac-158-empty-states.spec.ts` | 2 | |
| `ac-159-landing-page.spec.ts` | 3 | |
| `ac-160-shell-fallback-scope.spec.ts` | 2 | |
| `ac-161-form-validation-copy.spec.ts` | 3 | **S** F2 |
| `ac-162-destructive-confirms.spec.ts` | 4 | **S** F1 |
| `ac-163-pwa-manifest.spec.ts` | 2 | |
| `ac-165-un-pull-control.spec.ts` | 3 | **S** F1 |
| `ac-166-quick-add-row.spec.ts` | 4 | **S** F1 |
| `ac-167-important-toggle-is-local.spec.ts` | 2 | **S** F1 |
| `ac-169-reminder-saved-on-create.spec.ts` | 3 | **S** F2 |
| `ac-170-reminder-saved-on-edit.spec.ts` | 3 | **S** F2 |
| `ac-171-inline-page-states.spec.ts` | 3 | |
| `ac-172-invite-surface.spec.ts` | 3 | |
| `ac-173-sidebar-colour-dot.spec.ts` | 3 | |
| `ac-174-sidebar-is-the-only-chrome.spec.ts` | 4 | F3 if "Search" and "Account" are ruled the prototype's |
| `ac-175-sidebar-entries-are-links.spec.ts` | 3 | |
| `ac-176-folder-single-open-list.spec.ts` | 3 | |
| `ac-178-task-history-block.spec.ts` | 4 | **S** F2 |
| `ac-179-form-completion-control.spec.ts` | 3 | **S** F1 and F2 |
| `ac-180-folder-groups.spec.ts` | 4 | |
| `ac-181-folder-dialogs.spec.ts` | 1 | |
| `ac-182-view-preferences-persist.spec.ts` | 5 | **S** F2, and F3 for "Resize panel" and the rail's two names |
| `ac-183-normative-copy-restored.spec.ts` | 7 | **S** F1 and F2 |
| `ac-214-v2-sidebar-order.spec.ts` | 3 | |
| `ac-215-retired-path-redirects.spec.ts` | 2 | |
| `ac-216-tab-strip.spec.ts` | 4 | |
| `ac-217-folder-menu-by-role.spec.ts` | 1 | |
| `ac-218-notifications-bell.spec.ts` | 1 | |
| `ac-219-day-level-pickers.spec.ts` | 2 | **S** F2 |
| `ac-220-assignee-menu.spec.ts` | 1 | **S** F2 |
| `ac-222-filter-belongs-to-the-page.spec.ts` | 1 | |
| `ac-223-shelf-page.spec.ts` | 2 | |
| `ac-224-trash-restore.spec.ts` | 1 | |
| `ac-225-undo-within-five-seconds.spec.ts` | 1 | **S** F1 |
| `ac-226-starter-workflows.spec.ts` | 4 | |
| `ac-227-sidebar-drag.spec.ts` | 2 | |
| `ac-229-done-row-drops-the-due-echo.spec.ts` | 2 | **S** F1 |
| `ac-239-signed-out-app-redirects.spec.ts` | 3 | |
| `ac-240-public-legal-pages.spec.ts` | 3 | |
| `ac-241-settings-pin-list.spec.ts` | 5 | |
| `ac-242-help-sheet.spec.ts` | 3 | F3 if "Account" is ruled the prototype's |
| `ac-243-folder-mark-travels.spec.ts` | 4 | **S** F1 |
| `ac-244-person-tint.spec.ts` | 2 | **S** F1 |
| `ac-245-sections-collapse.spec.ts` | 2 | **S** F1 |
| `ac-246-object-menu-contract.spec.ts` | 0 | both cases are in the rework pile |
| `ac-247-v2-page-head.spec.ts` | 8 | |
| `ac-257-shelves-reach-the-library.spec.ts` | 4 | |
| `ac-258-search-finds-four-kinds.spec.ts` | 4 | |
| `ac-260-right-edge-takes-room.spec.ts` | 1 | |
| `ac-261-appearance-section.spec.ts` | 4 | |
| `ac-262-trash-rows.spec.ts` | 2 | |
| `ac-263-completed-foot.spec.ts` | 4 | |
| `ac-264-sidebar-footer.spec.ts` | 3 | |
| `rendered-halves.spec.ts` | 4 | **S** F1 |
| `session-path.spec.ts` | 3 | **S** F1 |

---

## The count

| Pile | Cases | Files touched |
| - | - | - |
| **Survives** | **203** | 67; the other five are wholly reworked |
| **Rework** | **19** | 9, of which 6 split |
| **Retire** | **1** | 1, split |
| Total | **223** | 72 |

**Of the 203 that survive, 89 carry a seam** — 50 through the task surface
(F2), 49 through the task row (F1), with ten cases in both files
(`ac-179`, `ac-183`). Those 89 are the number S22 and S23 should be told
before they estimate anything: they are green today, they assert nothing
about the v1 shape, and a lift that forgets one line of markup turns all 89
red in one commit.

**The rework pile is small, and that is a finding rather than a relief.**
S9's twenty and S17b's three already moved the criteria that asserted v1
shapes; section 9 was folded whole at S-fold; and the criteria written since
S15 address v2 surfaces by role and name. What is left is not "criteria
written against the old client" but "criteria written against a control this
ruling changes the role of", which is nineteen cases and one ruling.

---

## Three things this triage found that are not a sort

Routed rather than fixed, per protocol section 6, each with a
recommendation.

### T1. Six of RFC 0005's Replace units were never folded into section 12

`docs/spec/12-acceptance-criteria.md` still carries the **superseded** text
for **AC-005, AC-014, AC-025, AC-042, AC-066, AC-093 and AC-094**, while the
tests carry the replacement: `app/tests/ac-014-delete-cascade.test.ts:1`
opens "AC-014 (as replaced by RFC 0005)", `ac-042` the same, and
`app/tests/e2e/ac-093-entry-point-defaults.spec.ts:10` says outright that the
RFC's sentence "becomes section 12's own text when the delta folds; until
then a reader comparing the two reads the RFC as the authority".

This is the same class of defect as change control item 20 and item 28, one
section over: a unit written, accepted, and never folded, so the
specification and the suite disagree in writing. Item 8's three units *were*
folded, which is why this is easy to miss.

**Recommendation: S29 folds them, and its RFC 0004 row should name them**,
because that row currently names 01-scope, the v1-name debt and 8.8's
contradiction and does not mention section 12. Nothing in the code changes;
the specification catches up with the tests it already has.

### T2. 9.1's names table is the lift's largest hidden collision, and it needs one ruling

F3 above. It is not a criteria question, which is why it is routed rather
than sorted: it decides how many criteria this triage's successor has to
move. **Recommendation: 9.1's names stand.** Routed to the rulings sheet as
a new row for the Steward to place.

### T3. AC-099 asserts a tooltip no folded section carries

AC-099 reads "the tooltip names the task's home page with its date or
folder; on any other page it confirms importance", and the folded 9.5 says
only that on Important "the star rests unfilled" and that "the star's two
names are 9.1's". The outward tooltip traces to 6 Q4 rather than to section 9,
and the client's own `task-row.tsx` header records the distinction it had to
draw between the star's *name* and its *tooltip* to satisfy both.

**Recommendation: no change now.** The criterion is not wrong and the client
passes it; what is missing is the sentence in 9.5 that would let a lifting
session know the tooltip is required. **S29 should add it** when it folds,
and this file records it so the sentence is not invented from the criterion
alone.

---

## What this triage does not do

- **It moves no criterion.** Every rework above lands in the package named
  beside it, red first, under this persona, and the text moves only in that
  commit.
- **It ran nothing.** The 223 are collected, not executed: this checkout
  sits under `.work`, where CLAUDE.md records the browser leg cannot pass
  for a reason that is not the code. Every verdict above is a reading of the
  spec files, the harness and the two implementations, and the seam counts
  are the strongest claim in it precisely because they were derived from
  locators rather than from behaviour.
- **It weakens nothing.** No case is marked retire to avoid reworking it:
  the retire pile is one case, and it is one Imran's own ruling already
  overturned.

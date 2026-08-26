# The behavioural ledger: what `prototype-v2` decides, and where each decision stands

- **Date:** 2026-08-26
- **Tree read:** `v2-build` at `3e001e1`, which is `4dbe6fb` plus five
  documentation commits. Nothing under `app/` moved between them.
- **Package:** RFC 0004's **S20**, the first row of "The prototype lift: S20
  to S30". Written under `docs/team/07-frontend-architect.md`.
- **Governing rulings:** RFC 0005 change control **item 37** (Dana 2.0 is the
  exact `prototype-v2`, and the client arm is a lift rather than a patch),
  **item 39** (every element's overflow list and every element's view types
  are the prototype's exactly), **item 20** (the artefact that binds a build
  session is `docs/design/prototype-v2/`), and **item 19** (parity with that
  directory is the 2.0.0 release gate). Spec **11.13** stands: a numbered
  section wins where the two disagree, and the disagreement is an escalation.
- **Companions:** the rulings sheet at
  `docs/parity/2026-08-26-lift-rulings-sheet.md` and the browser criteria
  triage at `docs/parity/2026-08-26-browser-criteria-triage.md`.
- **Predecessor, not replacement:** `docs/parity/2026-08-25-prototype-v2-parity-audit.md`
  measured 31 surfaces for appearance and structure. This file measures
  behaviour, decision by decision, and it **supersedes that file's verdicts
  wherever the two disagree**, because eleven of its rows were closed by
  S17a, S17b and S19 after it was written and one of them was wrong when it
  was written (entry L-042).

## Why this file exists, in one paragraph

11.13's mechanism is the fault this package exists to defeat: *a design
decision reaches Dana only by being read into a numbered section*, so every
prototype decision that never reached a section was never handed to any
session and was never going to be built. The 2026-08-25 audit could not see
that class of miss, because it compared surfaces rather than decisions: it
can mark a task card ported without ever noticing that the prototype's card
carries a comment thread. This file is the enumeration that instrument
lacked. S21 to S28 lift against this list; S30 reads it closed or exempted
line by line.

**Nothing here is fixed by this package.** Every verdict below that reads
*no* or *partial* belongs to a later row of RFC 0004's table, named in the
last column. A finding fixed here is a finding nobody else can see.

## How to read a row

| Column | What it says |
| - | - |
| # | The entry's address. The rulings sheet and the triage cite these |
| The decision | One capability, interaction or decision the prototype makes. Its own words where it has them |
| Client | **yes** (built and behaving as the prototype does), **partial** (some of it, with what is missing named), **no** (nothing does this), with the built file as evidence |
| Section | The numbered section that carries it, or *unspecified*, or **conflict** where a section says something else |
| Criterion | The acceptance criterion that asserts it, or *none* |
| Owed to | The RFC 0004 row that lifts it, or *closed* where the client already carries it, or *ruling* where the rulings sheet must answer first |

Two words are used precisely. **Unspecified** means no numbered section
carries the decision, which is 11.13's mechanism firing and is why the row
is on the rulings sheet. **Conflict** means a numbered section carries a
different decision, which item 37's standing direction resolves by amending
the section toward the prototype, frozen sections 4 and 7 excepted and ruled
one at a time.

## Method, and its limits stated first

Every header comment in `docs/design/prototype-v2/src/` was read, then the
rendered structure of the screens, then the `lib/` modules. The prototype
records its reasoning in prose above its code, and that prose is the design
record for decisions no `DES` number covers; roughly 41,000 lines of
TypeScript were read that way rather than uniformly. Client verdicts were
taken from `app/src/client/` by reading the counterpart, not by trusting the
earlier audit. Section verdicts were taken from `docs/spec/09-ui.md` as
folded at S-fold (change control item 28) and from sections 4, 7, 10 and 11
where the decision is not section 9's.

**Three limits, so a reader does not over-read this file.**

1. **It is a reading, not a run.** The browser leg was collected but not
   executed (`npx playwright test --list`, 223 tests in 72 files); this
   checkout sits under `.work`, where CLAUDE.md records the leg cannot pass
   for a reason that is not the code. Verdicts of *no* rest on a counterpart
   being absent from the source, which is a claim about the tree rather than
   about a running screen.
2. **A verdict of *yes* is a verdict about behaviour, never about pixels.**
   Pixel fidelity is entry L-284 and is deliberately one entry rather than a
   column: it cannot be measured by reading and needs Imran's eye at S30.
3. **Counts are of entries, not of work.** One entry can be an afternoon
   (L-021) or a package (L-101). The count at the foot is a measure of
   coverage, not of effort.

---

# A. The two axes item 39 makes mandatory

Item 39 is Imran's ruling of 2026-08-26, given at this package's opening:
**the overflow lists for every element and the view types for every element
must be exactly the prototype's.** Both are declared contracts in the
prototype and both were treated as component-local detail in the client,
which is the class of decision 11.13's mechanism loses. They are carried
here as columns rather than discovered as findings.

## A.1 The act contract itself

`docs/design/prototype-v2/src/lib/object-acts.ts`, 226 lines, against
`app/src/client/lib/object-acts.ts`, both read in full. The client's file is
the designer's, ported at S17a, and its header says so.

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-001 | Three object kinds take acts, and only three: task, folder, shelf. A system view is deliberately absent, because a person did not make Today and cannot duplicate or delete it | yes, `lib/object-acts.ts:96` | 9.3 (the task's footer list), 9.6 (the folder role matrix), 9.10 (the shelf's contract) | AC-246 | closed |
| L-002 | The acts are declared once per kind and drawn by one component, so where you stand does not decide what you can do to a thing | yes, `components/object-menu.tsx` | 9.1 names every overflow menu "More actions"; the contract itself is *unspecified* | AC-246 | closed |
| L-003 | Five groups in a fixed order: reach it, change it, copy it, stop it, destroy it. Destructive last and behind a separator, everywhere | yes, `lib/object-acts.ts:112-133` | *unspecified* | AC-246 asserts relative order | ruling (ratify as built) |
| L-004 | Stopping and destroying are two groups and not one: Abandon says "I am not doing this", Delete says the task should not exist | yes, same file | *unspecified* | AC-246 | ruling (ratify as built) |
| L-005 | An act with no handler does not appear. A surface says what it can do by supplying it, and cannot accidentally offer what it cannot | yes, `actsFor` in both files | *unspecified*; 9.6's "a surface offers exactly the acts the viewer's role permits" is the same rule stated for one axis | AC-217, AC-246 | closed |
| L-006 | A surface may add **rendered** extra items above the contract's acts, and only rendered ones, so an act belonging to the object cannot be smuggled in and diverge | yes, `object-menu.tsx` takes `extra` | *unspecified*; AC-246 enumerates the four surface-only items the client draws | AC-246 | closed |
| L-007 | **make-folder exists on a task**: "Make this a folder…", group 2, the `Folders` glyph | **no**, absent from the client's task acts, `lib/object-acts.ts:136-143` | 9.3 names it in the footer's More actions list | *none* | S23 |
| L-008 | The task's `open` act carries the `Fullscreen` glyph, the key having been renamed from `open-tab` when a task gained four ways in | **no**, the client carries `OpenInNewTab`, the glyph of a different act, `lib/object-acts.ts:136` | *unspecified* | *none* | S23 |
| L-009 | Five labels end in an ellipsis, which promises a further step: "Move to folder…", "Delete task…", "Delete folder…", "Leave folder…", "Delete shelf…" | **no**, all five are ellipsis-free in the client, `lib/object-acts.ts:138,143,156,157,170` | **conflict**: 9.1's names table fixes the member exit as "Leave folder" exactly | AC-217 asserts "Leave folder"; AC-183 asserts section 9's strings character for character | ruling |
| L-010 | `leave` and `delete` are never offered together: the surface supplies the one the viewer's role permits, through `lib/folder-ownership` | yes, and honoured on both folder surfaces: `components/folder-row.tsx:320` and `pages/FolderPage.tsx:665` supply one or the other by role | 9.6's role matrix, in terms | AC-217, AC-246 | closed |
| L-011 | "Label and colour" left the contract on Imran's word, its name having collided with a shelf and its remaining half being the mark on the page | yes, absent from the client and the removal is recorded in its header | 9.6 retires the dialog in terms | *none* | closed |
| L-012 | A shelf takes Copy link because a page has an address the moment it has a route, and an address is not an invitation | yes, `lib/object-acts.ts:166` | 9.10, in terms | AC-246's shelf half is `ShelfPage`'s menu | closed |
| L-013 | "Move to shelf" is supplied as a **submenu**, not a press, because the shelves are few and naming them inline is shorter than a dialog | yes on both folder surfaces | 9.6 fixes the string | AC-180, AC-246 | closed |
| L-014 | The client's file adds `ACT_EXTRA_ICONS`, a glyph for a surface's own extra item, which the prototype has no equivalent of | client-only addition, `lib/object-acts.ts` | *unspecified* | *none* | ruling (keep or drop at the lift) |
| L-015 | The prototype's own header prose names four groups where its type names five, a staleness inside the source itself | n/a | n/a | *none* | noted for S21; the type is the authority |

## A.2 Every menu on every surface

Item 39's instruction read literally: for every element that has an overflow
menu, the acts it offers in the prototype, in order. A surface whose menu is
hand-written rather than drawn from the contract is itself the entry.

| # | Surface | The prototype's menu | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - | - |
| L-016 | Sidebar folder row (`components/folder-row.tsx:249`) | the folder contract: `open`, `rename` (owner), `move` as a shelf submenu, `history`, `copy-link`, `duplicate`, `workflow`, `leave` (member) or `delete` (owner); plus one **extra**, "Add task" | yes, `components/folder-row.tsx:320` | 9.1, 9.6 | AC-246, AC-217 | closed |
| L-017 | Sidebar shelf heading (`components/folder-directory.tsx:320`) | the shelf contract; its comment argues Copy link away and the handler supplies it anyway, so the item draws | yes, `shell/app-sidebar.tsx:745` | 9.10 | AC-257 | closed |
| L-018 | Folder page's window bar (`screens/folder-page-v2.tsx:1344`) | the folder contract, `rename` opening the title editor, `move` as a shelf radio group, `duplicate` and `move` withheld on the default folder | yes, `pages/FolderPage.tsx:665` | 9.6 | AC-246 | closed |
| L-019 | Shelf page's bar (`screens/shelf-page.tsx:297`) | the shelf contract | yes, `pages/ShelfPage.tsx:284`, drawn from the contract since S17b | 9.10 | AC-223 | closed |
| L-020 | **The task row** (`components/task-row.tsx:1304`) | the whole task contract: `open` as an **ActionStrip of three modes**, `history`, `move` as the real folder library ending in "New folder…", `make-folder`, `copy-link`, `duplicate`, `abandon` **or** `restore`, `delete` | **no**: the client's row draws a hand-written three-item menu, Edit / Abandon… / Delete…, `components/task-row.tsx:405-448`, and reaches `lib/object-acts.ts` not at all. **No surface in the client passes kind="task"** | 9.3 names the footer list; the row's own menu is 9.1's "More actions" | *none* asserts the task's act set | S23 |
| L-021 | The task card's footer toolbar | the completion control, the star, and "More actions" carrying the contract | **no**: there is no v2 card; `components/task-card/` holds `chips.tsx` and `copy.ts` alone | 9.3, in terms | AC-179 asserts the completion control on the surface | S23 |
| L-022 | The tab strip | the strip offers a "+" opening any shelf or folder; a tab carries no overflow of its own | yes, `shell/TabStrip.tsx` | 9.1 | AC-216, AC-243, AC-257 | closed |
| L-023 | Trash rows | no overflow: Restore and Delete for ever are the row's own controls | partial: Restore is built; "Delete for ever" is absent by AC-262's own assertion, and Imran's ruling at change control item 36 puts it back | 9.11; items 36 and 38 | AC-262 asserts the absence today | S28 |
| L-024 | A comment (`components/comments.tsx`) | per-message actions as an icon row rather than an overflow: reply, like, and the author's own edit and delete | partial: `components/page/ConversationThread.tsx` carries the thread on a folder; a task's thread has no mount at all | 9.6 | AC-204 to AC-207 (server side) | S26 |
| L-025 | The notifications bell | no per-row actions at all, deliberately: a notification is a pointer, and "Mark all read" is the surface's only other verb | yes, `shell/NotificationsBell.tsx` | 9.12, in terms | AC-218 | closed |
| L-026 | The account menu | Settings, Help, Sign out | yes | 9.1 | AC-242 | closed |
| L-027 | A board column heading | the folder page's columns are sections and carry a grip rather than a menu; a place page's columns carry neither | yes | 9.1: a board column is a named region | AC-228, AC-259 | closed |

## A.3 The view types: the strip's own behaviour

`docs/design/prototype-v2/src/components/view-strip.tsx`, 154 lines, read in
full, against `app/src/client/views/ViewStrip.tsx`.

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-028 | The options for where a thing lives are a horizontal row of **small icons, never written labels**; the words appear on hover (DES-137, Imran 2026-08-18) | **no**: `views/ViewStrip.tsx:69` renders `{face.label}` beside each icon as text | *unspecified*: 9.1 fixes what the strip offers and says nothing about its form | AC-093's replacement text addresses a calendar cell rather than a control named "Calendar"; the client's own header argues from AC-093 | ruling, then **S21/S24** |
| L-029 | It is a **radiogroup**: `role="radiogroup"`, each option `role="radio"` with `aria-checked` | **no**: `views/ViewStrip.tsx:49` is `role="group"` with `aria-pressed` buttons | *unspecified*; 9.1's roles table does not name the view strip | *none* | S21/S24 |
| L-030 | `collapse` is the resting behaviour: **show only the view you are in, widen to the rest on hover or focus** | **no**: every option is drawn at rest | *unspecified* | *none* | S21/S24 |
| L-031 | Every option stays in the DOM at zero width rather than being removed, so the keyboard and a screen reader always see the whole group | **no**: nothing collapses, so nothing is hidden either; the property is untested rather than broken | *unspecified* | *none* | S21/S24 |
| L-032 | Only the current option holds the tab stop, which is the radiogroup convention | **no** | *unspecified* | *none* | S21/S24 |
| L-033 | The border arrives with the expansion rather than boxing one icon all day | **no** | *unspecified* | *none* | S21 |
| L-034 | A disabled option carries a `disabledLabel` in its tooltip instead of its name | not reachable: the client offers no disabled option, which is DES-144 honoured by another route, `views/place-pages.ts` omitting rather than disabling | *unspecified* | *none* | closed by omission |
| L-035 | `ActionStrip` is the same shape where picking does something once instead of switching a standing state, and the task row's "Open in…" popover uses it | **no**: no client surface offers a task open mode | 9.3: "a row offers the choice and remembers it" | *none* | S23 |

## A.4 The view types: each surface's option set

| # | Surface | The prototype's set | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - | - |
| L-036 | The task's open modes | `TASK_OPEN_OPTIONS` at `components/task-row.tsx:1774`: Dialog, Sidebar, New tab | **no**: the client opens one overlay form; `components/task-form/open.ts` carries no mode | 9.3, in terms | *none* | S23 |
| L-037 | The surface's own strip filters `tab` out unless the surface can hand the task to the page bar, because a tab is an action rather than a state | **no** | *unspecified* | *none* | S23 |
| L-038 | `lib/task-surface-preference.ts` remembers the choice and deliberately does **not** remember `tab`; a one-off choice is not a preference, but switching from inside an open surface is the same decision made later and is remembered | **no reader**: `task_open` is written by 9.7's Appearance control since S17b and read by nothing | 9.3 and 9.7 both name the preference | AC-261 asserts the control | S23 |
| L-039 | The task surface's header prose names five modes (dialog, full screen, either edge, floating card) and `TaskSurfaceMode` resolves to **two**, dialog and right, plus the tab that is the strip's | **no** | 9.3 names three: dialog, panel, tab | *none* | ruling, then S23 |
| L-040 | The place pages offer list and board everywhere, **calendar only on Scheduled**, from a stated two-part rule: a view must be able to draw everything the page holds, and must not collapse to one group | yes in the table, `views/place-pages.ts`, and the rule is quoted in its header | 9.1, in terms | AC-093, AC-221, AC-259 | closed |
| L-041 | The board's default axis is people on Assignments and the folder everywhere else | yes, `views/place-pages.ts` boardAxis | 9.1: a board column captures with its own value | AC-221, AC-228 | closed |
| L-042 | The **conversation's homes are two**, `page` (inline at the end of the page) and `panel` (side panel), declared at `screens/folder-page-v2.tsx:179` and drawn through the collapsing strip | yes, two homes, `pages/FolderPage.tsx:598` | 9.6: "two homes, a closed section at the page's foot, or the side panel" | AC-260 | closed. **The 2026-08-25 audit's "four homes reduced to two (DES-135)" is wrong twice over**: the prototype declares two, and DES-135 is the 800px reading measure. The ruling behind the two is **DES-142**, "the conversation has two homes; the page's is a closed section", approved by Imran on 2026-08-18 |
| L-043 | The folder page offers list and board and **no calendar, stated as a decision** (DES-177): a folder holds undated tasks by definition, so a calendar would hide part of the page it claims to show; it previously stood there disabled and that was removed for promising a thing that is never coming | yes, `views/place-pages.ts` folder row | 9.6 with 9.1's view strip sentence | AC-259 | closed |
| L-044 | The folder page's **board columns are its sections**, movable by a grip, and column order **is** page order | **no**: the client's folder board groups by **date**, `views/place-pages.ts` `boardAxis: 'date'`, with its own reasoning recorded | *unspecified*; 9.6 fixes the page's blocks and their arrangement but not the board's axis | AC-259 asserts the board's geometry, not its axis | ruling, then S26 |
| L-045 | A folder board carries a **Done column that is not a section**: dropping a card there completes it | **no** | *unspecified* | *none* | S26 |
| L-046 | Assignments' spine is a **whose-assignments strip in the window bar**: Everyone, each person, Unassigned | **no**: `pages/AssignmentsPage.tsx` groups by person with no scope control | 9.5 fixes the grouping and not a scope control | AC-245 asserts the per-person section | S25 |
| L-047 | `?mode=` names the view in the URL on **any** page, deliberately general, because a view reachable only by pressing something is a view nobody can be sent to | yes, `views/view-mode.ts` treats it as a seed and says why | 9.1: "`?mode=` names a view in the URL" | AC-182 | closed |
| L-048 | One remembered view across pages, falling back to list where a page cannot draw it **without forgetting it** | yes, `views/view-mode.ts` effectiveMode | 9.1, in terms | AC-182 | closed |
| L-049 | Done offers list and board like every other page | **partial**: the client offers **list alone**, a dated omission its own comment ties to the two row implementations | 9.1's rule would offer board | *none* | S23 |

---

# B. `src/lib/`: the thirty-three modules where the decisions live

The prototype states its reasoning in prose above its code, and for the
decisions no `DES` number covers that prose **is** the design record. Every
header in this directory was read. `object-acts.ts` and
`task-surface-preference.ts` are above, at A.1 and A.4, and are not repeated.

## B.1 The folder family

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-050 | `folder-acts.ts` An act belongs to the object, so Copy link and Duplicate live in a module rather than in a screen; the moment one lives in one screen the next screen either goes without it or writes a second copy that drifts | yes in effect: the client's handlers are the query layer's mutations, supplied at each surface, and both surfaces supply the same ones | 9.6's role matrix | AC-246 | closed |
| L-051 | `folder-acts.ts` Everything an act writes announces itself on the same events, so a folder made by one appears without anybody being told | yes, by another mechanism: TanStack Query invalidation is 8.3's policy and 11.4 fixes it as the only one | 8.3, 11.4 | *none* directly | closed |
| L-052 | `folder-duplicate.ts` **A grant is not a thing**: members, sharing, the conversation and **the assignee** do not travel, because copying would hand somebody eight tasks they never accepted | yes, server-side | 9.6's Duplicate paragraph, in terms | AC-200 | closed |
| L-053 | `folder-duplicate.ts` A grant not travelling is not the work becoming nobody's: the copy's tasks are the duplicator's, never empty, or the copy appears in nobody's Assignments including the copier's | server behaviour to confirm at the lift; 9.6 says grants do not copy and does not say who the copy's work is assigned to | *unspecified* on the assignee's destination | AC-200 | ruling |
| L-054 | `folder-duplicate.ts` A duplicate arrives **unstarted**: completed and abandoned both reset, and so do the steps inside a task | yes | 9.6: "never the grants or the progress" | AC-200 | closed |
| L-055 | `folder-duplicate.ts` Due dates are **shifted, not copied, and only when they are spent**: the intervals are kept and the plan re-anchors on today, only where the folder's earliest date has already passed, and the bar says which happened | yes on the rule | 9.6: "spent due dates re-anchor on today and future ones keep" | AC-200 | closed. The **bar saying which happened** is *unspecified* and unbuilt |
| L-056 | `folder-layout.ts` A section is a person's arrangement of their own folder and survives leaving the page; sections living in component state died at the first click on the sidebar | yes, and better: 4.17 page blocks are shared by every member rather than personal | 9.6, 4.17 | AC-197, AC-199, AC-248 | closed |
| L-057 | `folder-layout.ts` Which section each task sits in is part of that arrangement | yes since S18's `section_block_id` | 9.6, 7.10 | AC-248 | closed |
| L-058 | `folder-library.ts` Every folder a person actually has, in one list, in the sidebar's own order: Desk first, then the labelled shelves in order, then the unlabelled, with renames applied and deletions removed | yes: the client holds `GET /folders`, which 7.4 already sorts default-first then by name | 7.4, 9.1 | AC-155 | closed |
| L-059 | `folder-library.ts` The folder chip's menu offers that library and **ends in "New folder…"**, because "none of these" is a real answer to "where does this go" | **partial**: the chip strip's folder picker is `components/task-card/chips.tsx`; 9.3 requires the "New folder…" entry and section 13 item 42 records it as absent and owed to the chrome's owner | 9.3 | AC-093, AC-220 (assignee half) | S23 with S24's dialog |
| L-060 | `folder-membership.ts` A folder's shelf and its colour are the **viewer's own**, stored per person and never on the folder | yes: `folder_members.label` is 4.18's shelf membership, and 9.6 records that 4.4's per-member colour is no longer written by any v2 surface | 4.18, 9.6 | AC-023, AC-257 | closed |
| L-061 | `folder-order.ts` The alphabet is the **seed, not the rule**: nothing is stored until somebody drags, and from the first drag the stored list is the authority for the entries it names while the alphabet places the rest | yes, `shell/library-order.ts` | 9.1: "the order is the viewer's own, seeded alphabetically and rearranged by dragging" | AC-227 | closed |
| L-062 | `folder-order.ts` Two levels, because the sidebar has two: the directory itself, holding shelves and loose folders in **one sequence**, and each shelf's own folders | yes, and S17b's row records the model correction underneath it | 9.1 | AC-227, AC-257 | closed |
| L-063 | `folder-order.ts` The arrangement is a person's, not the folder's: two people sharing a folder must never move it in each other's sidebar | yes | 9.6's last matrix row | AC-155 | closed |
| L-064 | `folder-ownership.ts` Delete and Rename are the owner's; Leave is the member's; everything else is any member's; arrangement is always personal and never gated | yes | 9.6's role matrix, which is this module read into a section | AC-217, AC-246 | closed |
| L-065 | `folder-ownership.ts` Leaving **confirms** while deleting no longer does, DES-200's logic pointed the other way: the way back from a leave is an invitation rather than a Trash row | yes | 9.6, in terms, with the confirm's copy | AC-162, AC-183 | closed |
| L-066 | `folder-presentation.ts` A folder's glyph, colour, cover and description are its identity and persist | yes: 4.3 carries icon and colour, `cover_file_id` the cover, and `IdentityHead` draws them | 4.3, 9.6 | AC-193, AC-243 | closed |
| L-067 | `folder-presentation.ts` An **uploaded cover is honestly ephemeral** in the prototype, because persisting image bytes into `localStorage` invents a worse version of the storage problem the real feature must solve | superseded: the client has 4.16 files and a real upload path, which is the answer the prototype was standing in for | 4.16, 10.3 | AC-194 to AC-196 | closed |
| L-068 | `folder-presentation.ts` A photographic cover stores a **vertical crop** per folder; gradients have none | **no**: the client stores `cover_file_id` and no crop | *unspecified* | *none* | ruling, then S26 |
| L-069 | `folder-threads.ts` A fixture only one screen can see is one the rest of the product cannot use: the conversation moved out of the page so search could see it | yes and better: 7.18's search reads pages, and the conversation is 4.15's rows | 9.9, 7.18 | AC-210, AC-258 | closed |

## B.2 The task family

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-070 | `task-model.ts` One definition of what a task is, and one set of rules for turning its fields into words, so the row and the card cannot disagree; they had disagreed twice while each place wrote its own copy | **partial**: `parts/presenters.ts` is the client's one place for row words, and there is no card to agree with it | *unspecified* as a rule; 9.3 and 9.5 fix the words themselves | AC-099, AC-229 | S23 |
| L-071 | `task-model.ts` A person's tint is deterministic and comes from the model, so one person is one colour on every surface | yes, `parts/person-tint.ts` | *unspecified*; the rule reached the client through the parity audit rather than a section | AC-244 | closed |
| L-072 | `task-acts.ts` A task's menu is drawn in a row, a card, a dialog, a tab and on a board, so its acts belong to the object | **no**: only the row draws a menu, and it is hand-written (L-020) | 9.3 | *none* | S23 |
| L-073 | `task-writer.tsx` **One write path out of a card, wherever that card is**: dialog, sidebar and inline are views of one task and their data must update together | **no**: no card exists; the client's single overlay form is the only editor and TanStack Query is the shared state | 9.3: "create and edit are one artifact" | *none* | S22 (the adapter), S23 (the surfaces) |
| L-074 | `task-writer.tsx` A row still wins if it is given its own handler, because a lab or a preview may have a different idea of where an edit goes | n/a until the card lands | *unspecified* | *none* | S23 |
| L-075 | `shell-task.ts` The record the form used to carry outlived the form: DES-093 put the whole of a task inside the row that owns it, so the prototype has no sheet to open | **no**: `components/task-form/` is 14 files and is the sheet | 9.3: "There is no task form" | AC-161, AC-179 assert the surface by role rather than by shape | S23 |
| L-076 | `row-density.ts` Whether a task row is one line or two is a **preference**, two lines being the default because the failure modes are not symmetric: seeing fewer tasks announces itself, a truncated title does not | **partial**: the preference is stored and drives list spacing; the row has **one shape** | 9.7 names the control; the two **shapes** are *unspecified* | AC-261 asserts the control | S21 writes it, S23 gives the row its two shapes |
| L-077 | `row-density.ts` The rule that keeps two densities affordable: they may differ in height and in where the details sit, **and in nothing else** | not yet applicable | *unspecified* | *none* | S23 |
| L-078 | `time-format.ts` 12-hour is the default and the setting decides how a time is written, never which times can be reached: the picker offers both regardless | yes, `lib/time-format.ts`, reconciled at S17b when a fresh account read 17:30 on its rows and 5:30 PM in its pickers | 9.7 | AC-261 | closed |
| L-079 | `theme.ts` **Three states, not two**: system is the honest default, because a two-way switch makes Dana disagree with every other window for half the day | yes, `shell/appearance.ts`, and `system` is resolved in JavaScript rather than by a media query so a stored value can override it | 9.7 | AC-261 | closed |
| L-080 | `theme.ts` The choice is applied to the document, not passed down, and is set from storage **before React mounts** so the theme survives a reload without a flash | to verify at S21: the client writes the attribute from the settings bundle, which arrives after mount | *unspecified* | AC-261 asserts survival, not the absence of a flash | S21 |
| L-081 | `undo.ts` Undo is **a transient bar naming the act**, one shortcut rather than a control per surface, and **no redo**: redo is a text-editor idea that nobody reaches for after un-completing a task | yes, `shell/UndoBar.tsx`, `shell/undo.ts` | 9.1, in terms | AC-225 | closed |
| L-082 | `undo.ts` The entries come from the shell's **mutators**, never from screens, so every page gets undo without knowing it exists and a page written next year gets it too | yes, `shell/undo.ts` registers inverses at the mutation layer | 9.1: "acts register their own inverse" | AC-225 | closed |
| L-083 | `undo.ts` Expiring hides the bar and does not clear the stack: the timer governs the furniture and never the capability | to verify at S24 | 9.1 fixes five seconds and the shortcut, and is silent on what expiry does to the stack | AC-225 | S24 |
| L-084 | `trash.ts` **Deleting stops being an act and becomes a state**: the thing moves, and the array it was in is one of the places it can be | yes, 7.13's soft delete | 7.13, 9.11 | AC-189, AC-190, AC-191 | closed |
| L-085 | `trash.ts` Tasks go to Trash too, and the asymmetry is why: a deleted folder is a container you can rebuild in a minute, a deleted task is a sentence nobody can reconstruct | yes | 7.13 | AC-189 | closed |
| L-086 | `trash.ts` Undo comes first and Trash second; they answer different questions and having both is not redundancy | yes | 9.1 and 9.11 | AC-225, AC-224 | closed |
| L-087 | `trash.ts` The thirty days are **counted, not enforced by a timer**: anything past its day is treated as gone on read | yes: the 11.7 pass purges and the read filters | 11.7, 4.3/4.5 | AC-191 | closed |
| L-088 | `history.ts` **The record is written by the act, never by the screen**, and the same call that logs pushes the undo entry, so the bar's sentence is derived from the event and the two can never disagree | **partial**: 4.13's events are written at the 10.2 chokepoint, which is the same discipline one layer down; the undo bar's sentence is the client's own and is not derived from the event | 4.13, 9.1 | AC-184, AC-225 | ruling (is the bar's sentence owed the event's words?) |
| L-089 | `history.ts` History **survives a reload**, which undo deliberately does not | yes | 4.13 with 9.1 | AC-185, AC-186 | closed |
| L-090 | `use-sortable-list.ts` Pointer-driven sorting replaces HTML5 drag and drop, whose faults were its own: an unstylable drag image, a flickering `dragleave`, no auto-scroll, nothing on touch | yes, `lib/use-sortable-list.ts` is the ported engine | *unspecified* as a mechanism; 9.1 fixes the gestures | AC-227, AC-228 | closed |
| L-091 | `use-sortable-list.ts` **The list moves rather than a row being outlined**: the carried row follows the pointer, the rows it passes slide out of its way by its own height, and nothing is outlined because the space is the answer | yes | *unspecified* | AC-227, AC-228 | closed |
| L-092 | `use-sortable-list.ts` **Stillness separates two gestures**: moving means reorder, resting on a row for `dwellMs` means make a folder of the two, and while that arms the list relaxes back to its resting order | **partial**: the sidebar's 1.5 second hold that makes a shelf is built (`shell/library-drag.ts`); the **task-level** hold that makes a folder of two tasks is not, and the prototype parks it as Lane 2 needing a backend | 9.1 for the sidebar; the task-level hold is *unspecified* and has no endpoint | AC-227 | ruling (task-level hold is scope, not a port) |
| L-093 | `use-sortable-list.ts` Keyboard sorting is here too, since a gesture only available to a mouse is not finished: the handle is a real button, arrows move the item, focus follows it | yes, ported with the engine | 9.1 does not name it; *unspecified* | AC-227 addresses pointer drag | closed |
| L-094 | `task-model.ts`, `people-library.ts` **Unassigned is a member of the set, not the absence of one** | yes | 9.3's assignee row, closing section 13 item 28 | AC-094, AC-220 | closed |
| L-095 | `people-library.ts` The roster is the viewer first, then the connections in the People screen's order, because a list of collaborators that omits you is a list you have to translate | yes: the client reads the folder's members from 7.4 | 9.3 | AC-094, AC-220 | closed |
| L-096 | `people-library.ts` Nothing in the roster says **human**: an agent arrives as another entry, in the same slot, with the same treatment, and the absence of a notion of kind is the point | n/a to the client today, and worth keeping in the record: `docs/design/vision.md` is where it is going | *unspecified* | *none* | noted, no owner |

## B.3 The page, shelf and chrome modules

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-097 | `nav-model.ts` **One page per question**, six pages, each locking its own axis and freeing the others, so no page can be turned into another by adjusting controls; only All locks nothing | yes, `views/place-pages.ts` and `routes.ts` | 9.1's page block and routes table | AC-214, AC-215 | closed |
| L-098 | `nav-model.ts` **Names never change; scope controls do.** A sidebar entry is the navigation anchor and the value it is showing lives in a scope control in the window bar | **partial**: the client has no scope control on any page, Assignments' spine being the one the prototype draws (L-046) | 9.1 names the entries; the scope-control rule is *unspecified* | *none* | S25 |
| L-099 | `nav-model.ts` Done ships **unpinned**, reachable from Settings and absent from the sidebar | yes | 9.1, 9.7 | AC-095, AC-214, AC-241 | closed |
| L-100 | `page-pins.ts` **Settings is a pin list, not a page list**: one list of every view a person has, each with a pin toggle, which is what stops the sidebar sprawling as views multiply | yes, `pages/SettingsPage.tsx` since S17b | 9.7 | AC-241 | closed |
| L-101 | `page-pins.ts` A page that cannot be unpinned is **not in the map**: `hideable: false` is declared on the page, and asking here would put one rule in two places | yes: Desk is locked with 9.7's note | 9.7 | AC-241 | closed |
| L-102 | `page-filters.ts` A filter **does not cross to another page and does survive returning to this one**, and the test that separates them is visibility: the active filter is removable chips in the window bar | yes, `views/filter-store.ts` | 9.1, in terms | AC-222 | closed |
| L-103 | `page-filters.ts` Session storage rather than local, because a filter is working state and not a preference: closing the tab ends the session of looking | yes, and the client draws the same split between `filter-store.ts` and `preferences.ts` | 9.1: "belongs to the page and to the session" | AC-222 | closed |
| L-104 | `page-images.ts` A page can hold a picture, and it is also the answer to "how does the first user get an idea of what to do here", because a page that can hold a picture can hold a worked example | yes, 4.17's image blocks | 4.17, 9.6 | AC-197, AC-198 | closed |
| L-105 | `page-images.ts` Images have **their own store**, not the layout's, because they are three orders of magnitude larger and one shared key means the first person with two photographs loses their sections | yes and better: 4.16 files with an object store | 4.16, 10.3 | AC-194 | closed |
| L-106 | `page-images.ts` Downscaled on the way in, 1600px at JPEG 0.72, because an image block is content rather than decoration and one that vanished on refresh makes the page a worse demo than no picture | **partial**: the client re-encodes uploads (AC-231's polyglot arm) and caps size; the downscale-on-the-way-in rule is *unspecified* | 10.3 caps; the downscale is *unspecified* | AC-231, AC-233 | ruling |
| L-107 | `viewer.ts` The viewer's face is a **store**, not a Settings detail, because four surfaces draw it and a picture only Settings knew about would be one you could see nowhere else | yes: 7.15's avatar and the query layer | 9.7, 7.15 | AC-196 | closed |
| L-108 | `viewer.ts` Google's account picture is the honest ported default, with an upload as the override | to confirm at the lift: the client provisions `avatar_url` at sign-in and takes an upload | 7.1, 9.7 | AC-005, AC-196 | closed |
| L-109 | `notifications.ts` **A notification is a pointer, not a task**: one sentence, pressing it goes to the thing and marks it read, no per-row actions, and invites never appear here | yes | 9.12, which is this module read into a section | AC-218 | closed |
| L-110 | `notifications.ts` **Unread is told by tone, never by hue**, DES-143's rule generalised; the accent stays interaction's | yes | 9.12 | AC-218 | closed |
| L-111 | `notifications.ts` **Nothing here is deleted by hand**: rows age out with the retention, and the only verbs are read and read-all | yes | 9.12, 4.13's retention | AC-213, AC-218 | closed |
| L-112 | `workflow.ts` **A workflow is a shape, not a copy**, and the line is drawn at people and dates rather than at structure: it carries the folder's identity, its sections, paragraphs and images, and each task's title, notes, star, repeat, reminder, steps and state | **partial**: 7.16's import exists and the starters use it; **export** is the act `Save as workflow` supplies, and its contents are 7.16's schema rather than this list | 7.16, 9.13 | AC-201, AC-226, AC-237 | ruling (does the export carry notes, steps and state?) |
| L-113 | `workflow.ts` It carries **no assignee, no due date or time, no conversation, and no completion stamp**, because a file leaves the account and a grant in a file is somebody's name on a stranger's machine | yes: 7.16's schema has no key for any of them, which 9.13 records as why the format forbids them | 7.16, 9.13 | AC-201, AC-237 | closed |
| L-114 | `workflow.ts` Imported as a **new folder, never merged** into an existing one, because merging raises a question with no good answer | yes | 7.16 | AC-201 | closed |
| L-115 | `workflow.ts` A folder saved half-finished imports half-finished: a workflow is a **save** of the folder where a duplicate is a fresh **run** of it | conflicts with L-113 as the prototype states both; the schema settles it by carrying no completion | 7.16 settles it | AC-201 | closed, and recorded because the prototype's own prose disagrees with itself |
| L-116 | `shelf-acts.ts` The third of the family beside `folder-acts` and `task-acts`, for the same reason | yes, `ShelfPage` and the sidebar heading both draw the contract | 9.10 | AC-223, AC-257 | closed |
| L-117 | `icons.tsx` The icon family is **animated Lucide** (DES-125): a glyph draws, wiggles or pops on the hover of its enclosing control, walked up from the icon rather than wired per call site | **no**: `lib/icons.tsx` in the client is a re-export module with no animation | *unspecified* | *none* | S21 |
| L-118 | `icons.tsx` A folder's forty-two glyphs are none of them an icon Dana's own chrome uses, so a folder's mark can never be mistaken for a control | yes: `components/page/icon-manifest.ts` carries the forty-two by key | 4.3 | AC-193, AC-243 | closed |
| L-119 | `utils.ts` `cn` is the one class composer, which 11.4 fixes as clsx plus tailwind-merge | yes, `components/ui/utils.ts` | 11.4 | *none* | closed |

---

# C. `src/components/`: the thirty-eight, by name

`object-menu.tsx` and `view-strip.tsx` are at A and are not repeated.
`task-row-baseline.tsx` is the frozen v1 row the concept lab keeps as its
control; it is named here so its absence from `app/` is a verdict rather than
an omission (L-160).

## C.1 The shell and its chrome

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-120 | `app-shell.tsx` One shell wraps every screen and hosts the task surface, so any screen's row can open a task without the screen knowing how | **partial**: `shell/app-shell.tsx` hosts the overlay form, which is the v1 artefact rather than the surface | 9.1, 9.3 | AC-174 | S23 |
| L-121 | `app-shell.tsx` The floating capture button sits bottom-right and the undo bar bottom-left, deliberately, because a transient bar landing on the control people press most is a worse fault than the one it fixes | yes, `shell/FloatingAddButton.tsx` and `shell/UndoBar.tsx` | 9.1 fixes the bar bottom-left and the button's three pages | AC-096, AC-225 | closed |
| L-122 | `app-sidebar.tsx` The sidebar header carries the mark, the bell and Search, because awareness is global chrome | yes, `shell/app-sidebar.tsx` | 9.1 | AC-174, AC-218 | closed |
| L-123 | `app-sidebar.tsx` The footer is New folder, then the row of three (New shelf, Import, Trash), with width-aware label dropping | yes since S17b | 9.1 | AC-264 | closed |
| L-124 | `folder-directory.tsx` The directory is **one list rather than two**, so a loose folder can sit above a shelf; a model keeping them apart would refuse the obvious drag for a reason that exists only in the code | yes, `shell/library-order.ts`, and S17b's row records the deeper model correction | 9.1 | AC-227, AC-257 | closed |
| L-125 | `folder-directory.tsx` Three gestures are one gesture seen from three angles: reorder, in and out of a shelf, and **two folders held together become a shelf** at a 1.5 second hold | yes, `shell/library-drag.ts` | 9.1, in terms | AC-227 | closed |
| L-126 | `folder-directory.tsx` A closed shelf is **never sprung open** by a drag hovering it, and the carried row says "Into {shelf}" | yes | 9.1, in terms | AC-227 | closed |
| L-127 | `folder-row.tsx` The proposal pill rides the **carried** row rather than the row underneath, because the carried row sits under the pointer and would paint over a badge drawn on the target | yes, ported with the drag | *unspecified* | AC-227 | closed |
| L-128 | `folder-row.tsx` The hold is drawn as a closing ring that starts from empty every time | to verify at S24; the client's drag draws its own affordance | *unspecified* | AC-227 asserts the naming, not the ring | S24 |
| L-129 | `page-bar.tsx` **Every tab is the same tab**: one width, one anatomy, one close control, and the place you stand on is simply the active tab | yes, `shell/TabStrip.tsx` | 9.1 | AC-216 | closed |
| L-130 | `page-bar.tsx` Closing the active tab lands on the neighbouring place and an emptied strip lands on Desk; the shell owns that rule and the strip only reports the close | yes | 9.1 | AC-216 | closed |
| L-131 | `page-bar.tsx` Tabs reorder by a **horizontal, bespoke** drag with a 5px arming threshold so a click is never eaten | yes, `shell/TabStrip.tsx` uses the one engine with its own axis | 9.1 | AC-216 | closed |
| L-132 | `page-bar.tsx` The strip can **open** things: a "+" at the row's end, because a tab strip that can only close tabs is half of one | yes, and it offers folders and shelves | 9.1 | AC-216, AC-243, AC-257 | closed |
| L-133 | `page-bar.tsx` Tabs are session state and a fresh visit starts clean | yes, `shell/tabs.ts` | 9.1: "session-scoped working state, never stored server-side" | AC-216 | closed |
| L-134 | `window-bar.tsx` The bar belongs to the **window rather than the page**: chrome does not live inside the scroll area, which is what the folder page's own docking control row got wrong | yes, `shell/WindowBar.tsx` | 9.1 | AC-259 (the folder page carries the strip) | closed |
| L-135 | `window-bar.tsx` **Left is deliberately empty**, reserved for the breadcrumb that arrives with nested folders; inventing something there would be inventing a hierarchy | **conflict in emphasis**: 9.1 puts the filter's removable chips at the left end, which is the client's behaviour | 9.1 | AC-222 | closed; 9.1 wins under 11.13 |
| L-136 | `window-bar.tsx` A screen fills the bar by **portalling** into a registered container, so a page keeps its own state and still renders into shell chrome | yes, `shell/window-bar.ts` is the same module-store shape | *unspecified* | *none* | closed |
| L-137 | `window-bar.tsx` The Activity line reads "{verb} {ago}" and opens the recent events of the thing shown | yes, `shell/WindowBar.tsx:100` | 9.1 | *none* asserts it | closed |
| L-138 | `right-edge.tsx` A panel **takes room from the page rather than covering it**, and the width is a number in a store read by the shell, not a CSS variable, because a layout that cannot be explained cannot be relied on | yes, `shell/right-edge.ts`, and S17b's row records the two corrections the designer's header could not have anticipated: a margin rather than padding, and non-modal with no backdrop | *unspecified* as a mechanism; 9.3 says "the side panel makes the page narrower rather than covering it" | AC-260 | closed |
| L-139 | `right-edge.tsx` **One number for both panels**, because they share one edge and two open at once would overlap long before the page noticed | yes | *unspecified* | AC-260 | closed |
| L-140 | `undo-bar.tsx` The bar is rendered once by the shell and never by a screen | yes | 9.1 | AC-225 | closed |
| L-141 | `dana-mark.tsx` The mark is **drawn rather than fetched**, because a file cannot be animated and an `<img>` is opaque to the document | **no**: the client draws `<img src="/dana-mark.svg">` in five places, `pages/dana-identity.tsx:22`, `pages/InviteGate.tsx:73,78`, `pages/LandingPage.tsx:914`, `shell/app-sidebar.tsx:1023` | *unspecified* | *none* | **S21** |
| L-142 | `dana-mark.tsx` The pen is a **mask**: a wide stroke along the ribbon's own centreline, 150 units butt-capped, uncovering the mark as it travels, verified to reveal 100.00% of its 62,385 pixels | **no** | *unspecified* | *none* | S21 |
| L-143 | `dana-mark.tsx` The **rest state is fully drawn**, so a mark that never animates, or animates with scripting off, is simply the logo | n/a until L-141 | *unspecified* | *none* | S21 |
| L-144 | `dana-mark.tsx` The mask id is unique per instance, because two marks on one page sharing an id means the second steals the first's mask | n/a | *unspecified* | *none* | S21 |
| L-145 | `dana-mark.tsx` It plays on the hover of the enclosing link, button or menu item, finishes once started rather than snapping back, and `prefers-reduced-motion` turns it off entirely | **no** | 10.6 and 9.1 are silent; *unspecified* | *none* | S21 |
| L-146 | `help-sheet.tsx` Help lists **shortcuts that are wired today**, read off the handlers rather than remembered, because "Help" is the easiest control in any product to fill with a plausible lie | yes, `components/help-sheet.tsx` | 9.1's account menu | AC-242, whose third case presses the shortcut the sheet names | closed |
| L-147 | `notifications-bell.tsx` The badge is monochrome, a graphite disc with a white count capped at 9+ | yes | 9.12 | AC-218 | closed |

## C.2 The task surfaces

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-148 | `task-row.tsx` **Two densities, one component**, two lines the default | **no**: one shape | 9.7 names the setting; the shapes are *unspecified* | *none* | S23 |
| L-149 | `task-row.tsx` **It expands in place**: the chevron opens `TaskCard` inside the row rather than sending anybody to a sheet, which is why the prototype has no task form at all | **no**: the row opens the overlay form | 9.3, in terms | AC-093, AC-161, AC-179 address the surface | S23 |
| L-150 | `task-row.tsx` **A bare task costs one line, not two** (DES-111) | **no** | *unspecified* | *none* | S23 |
| L-151 | `task-row.tsx` **The details are the controls that change them**: the due and repeat chips open the same pickers the card opens | **partial**: the client's row draws due and repeat as read-only badges; the pickers exist on the form's chip strip | 9.3 for the card; the row's chips are *unspecified* | AC-219 | S23 |
| L-152 | `task-row.tsx` **Renaming happens in the row** (DES-095) | **no** | *unspecified*; 9.3 puts inline rename on the card's title | *none* | S23 |
| L-153 | `task-row.tsx` A row carries its **section** after its folder chip and reads as a path, absent where the row already sits under that section's heading | **no**: `section_block_id` rides the card since S18 and no row draws it | 9.3's field table does not name a section chip; *unspecified* | AC-248 asserts the field, not the chip | S23 |
| L-154 | `task-row.tsx` Dragging to reorder, the 1.5 second hold that makes a folder, press-and-hold selection and the bulk bar are **Lane 2 and deliberately not wired into the screens** | matches: the client has none of them either | *unspecified*, and no endpoint exists for a task order | *none* | ruling: this is the one place the owner's "task drag as the prototype does it" and the prototype disagree |
| L-155 | `task-card.tsx` The card is one header strip of **five chips** carrying every short value, then Steps, Notes and Attachments as collapsible blocks, then a shaded footer band | **partial**: `components/task-card/chips.tsx` is the five-chip strip built at S11 and it stands on the v1 form | 9.3, in terms | AC-219, AC-220 | S23 |
| L-156 | `task-card.tsx` **No Save button**: every edit commits as it is made, and the footer is a toolbar rather than a form's foot | **partial**: S15 retired the Save control and the ten labelled fields; the surface is still the form's | 9.3: "no Save control and no draft state" | AC-179 | S23 |
| L-157 | `task-card.tsx` **An empty block draws the control that fills it** instead of drawing nothing (DES-115) | **no** | *unspecified* | *none* | S23 |
| L-158 | `task-card.tsx` Comments are pinned **after** the content blocks and outside their order, because Steps, Notes and Attachments are what the task **is** and the conversation is what people **say** about it | **no**: no task thread is mounted anywhere | 9.3 puts Comments after the blocks | *none* | S26 |
| L-159 | `task-card.tsx` The card renders Lane 2 proposals so they can be judged rather than imagined: attachments have no storage, block order has nowhere to live, moving steps between levels needs endpoints | **half superseded**: 4.16 gives attachments storage and 4.17 gives blocks an order; **step promotion still has no endpoint** | 4.16, 4.17 | AC-194, AC-197 | ruling for step promotion |
| L-160 | `task-row-baseline.tsx` A frozen copy of the v1 row, the concept lab's control, which nothing but the lab may import | correctly absent from `app/` | n/a | *none* | closed by exclusion |
| L-161 | `task-surface.tsx` **A task in a surface is a page, not a row**: what leaves is the row, what stays is the card | **no** | 9.3, in terms | *none* | S23 |
| L-162 | `task-surface.tsx` The surface composes its own header: the title at page scale renaming in place, a deliberate completion control, the star | **partial**: the form has a title field and a completion control | 9.3 | AC-179 | S23 |
| L-163 | `task-surface.tsx` Escape closes and the chrome closes; the card's own footer offers neither, because two closes in one surface is one too many | to verify at S23 | *unspecified* | *none* | S23 |
| L-164 | `task-surface.tsx` The side panel's width is **remembered and clamped** between 360 and 720 | yes for the form's width, `components/task-form/width.ts` | 9.1 names "Resize panel" | AC-182 | closed |
| L-165 | `task-pickers.tsx` The three time pickers are **one component wherever they appear**, because a picker copied into a second place is one that will one day disagree with itself | yes, `components/task-card/chips.tsx` holds one set | 9.3: "one shape at one width" | AC-219 | closed |
| L-166 | `task-pickers.tsx` The shape they share: the answers somebody probably wants, a hairline, then one option that opens everything exact; and choosing commits, there being no Save and no Done | yes | 9.3, in terms | AC-219 | closed |
| L-167 | `task-pickers.tsx` The **Due panel has no clock in it** (DES-122) | yes | 9.3's field table | AC-219 | closed |
| L-168 | `task-board.tsx` **A view is a shape, not a question**: the board is the arrangement the page already has, turned ninety degrees, which is why there is one board rather than one per screen | yes, `views/TaskBoard.tsx` | 9.1 | AC-221, AC-228, AC-259 | closed |
| L-169 | `task-board.tsx` **Geometry here, meaning at the call site**: the board hit-tests and reports the column, and the page decides what landing there means | yes | 9.1 | AC-228 | closed |
| L-170 | `task-board.tsx` **Two columns per row**, because Imran ruled the one-row board too short | yes since S17b | *unspecified* in section 9 | AC-259 | closed |
| L-171 | `task-section.tsx` **Every section collapses**, computed or hand-made; the only differences between kinds are capabilities | yes since S17a/S17b | 9.1's regions rule | AC-245 | closed |
| L-172 | `task-section.tsx` A section may carry a **mark**, a folder's glyph or a person's face, **inline in the heading** so a section without one simply starts its name earlier and nothing is waiting to be filled | yes, `views/group-mark.tsx` | *unspecified* | AC-243, AC-244 | closed |
| L-173 | `task-section.tsx` The count is quiet beside the name | yes | 9.4 names "Done today (N)"; the general rule is *unspecified* | AC-263 | closed |
| L-174 | `task-filters.tsx` The filter model lives once and every page reads the same one: same variables, same wording, wherever you are | yes, `views/filter.ts` | 9.1 | AC-222 | closed |
| L-175 | `task-filters.tsx` **More than one value per axis**; empty means anyone, so "Anyone" is the absence of a choice rather than a choice | yes | 9.1 | AC-222 | closed |
| L-176 | `task-filters.tsx` Real date ranges, six named plus a custom one on the shared calendar, keeping presence as a separate question | yes | 9.1 | AC-176 | closed |
| L-177 | `task-filters.tsx` **Created by**, which is Assignments' second half: Dana records a creator and not an assigner, so "from A" is a filter and never a spine | **no**: `views/filter.ts:17-23` records the axis as the one missing, its blocker removed by S18 | 9.1 names it in the filter's list | *none* | **S25** |
| L-178 | `task-filters.tsx` Active state is **chips on the page**, each removable on its own, because a count you must open a panel to read is not a readout | yes | 9.1 | AC-222 | closed |
| L-179 | `task-filters.tsx` Group by and Sort by, neither of which existed | yes, `views/grouping.ts` and the sort in `filter.ts` | 9.1 | AC-222 | closed |
| L-180 | `task-filters.tsx` **Save as view** turns a filter state into a page, and the prototype keeps saved views in `localStorage` and says so | yes and better: 4.19 `user_views` with 7.17 | 4.19, 9.1 | AC-209, AC-241 | closed |

## C.3 The page surfaces

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-181 | `page-head.tsx` One head for every place: cover, mark, Add cover, title with its fact on the same line, description under it | **partial**: `pages/page-heading.tsx` draws mark, title, fact and description and **no cover band and no "Add cover"**, its own header recording that no column holds a native page's cover | 9.4 names the head's parts and no cover | AC-247 | ruling (does a place page get a cover?), then S25 |
| L-182 | `page-head.tsx` A system page's mark is **not pickable** and a folder's is: same geometry, no popover, so the two read as one family without either telling a lie | yes | 9.6 for the folder's mark | AC-247, both halves | closed |
| L-183 | `page-head.tsx` The **fact rides the title's line** and prose sits under it; a page with nothing to count leaves the slot empty rather than inventing a number | yes | 9.4 | AC-247 | closed |
| L-184 | `page-cover.tsx` A cover is native to **every page except a task's**, because a cover is how a place announces itself and a task is a thing inside one | **partial**: folders and shelves carry covers; no place page does | 9.6 and 9.10 give the folder and the shelf a cover; section 9 gives a place page none | AC-247 | ruling, then S25 |
| L-185 | `page-cover.tsx` The controls stay minimal: a joined Change and Reposition group in the band's corner, 28px, on hover, never a toolbar | to verify at S26 | *unspecified* | *none* | S26 |
| L-186 | `folder-cover.tsx` Four cover tiers, each honest about what it is: colour and gradient from the token palette's own hexes, six covers drawn from Dana's own ribbon geometry, photos from a free source, and upload | **partial**: the client takes an uploaded cover through 4.16 and offers no gallery, no gradients and no mark covers | *unspecified* | *none* | ruling, then S26 |
| L-187 | `folder-cover.tsx` **No colour enters the product here that the tokens do not already own** | yes by construction in the client | 11.4's single tokens file | AC-261 | closed |
| L-188 | `folder-icon-picker.tsx` Forty-two glyphs, seven columns, six full rows, so there is no orphan cell; adding a glyph means adding seven | yes, forty-two keys in `icon-manifest.ts` | 4.3 | AC-193 | closed |
| L-189 | `folder-mark.tsx` **One resolver, every surface asks it**: a folder with no chosen glyph answers the plain folder, which is why the resolver can replace the literal safely | yes since S17a | 4.3, 9.1 | AC-243 | closed |
| L-190 | `person-face.tsx` One disc for the whole product, two sizes and no more, the tint deterministic so one person is one colour on every surface | yes, `components/person-face.tsx` | *unspecified* | AC-244 | closed |
| L-191 | `viewer-face.tsx` The viewer's own face drawn once, because four surfaces show it and adding a picture to four spellings means forgetting one | yes | 9.7 | AC-196 | closed |
| L-192 | `icon-action.tsx` An icon that does one thing, **always with a tooltip, never a bare glyph**, because an icon-only button with no accessible name is unusable by a screen reader and unguessable by everyone else | yes in effect: 9.1's addressing rule makes every named control announce itself, and AC-264 records the cost of a dropped label | 9.1's names table | AC-264 | closed |
| L-193 | `page-image.tsx` **Width, and only width**: the handle changes width, the block stays centred, there is no left, no right and no wrap, because alignment is what causes the trouble rather than size | **no**: the client's image block has no width control | 4.17 carries no width; *unspecified* | *none* | ruling, then S26 |
| L-194 | `page-image.tsx` A **drag, not a menu of sizes**, clamped at a quarter of the column and at full width, stored as a **percentage** so a picture keeps its proportion of the page at any window | **no** | *unspecified* | *none* | S26 |
| L-195 | `page-image.tsx` The caption is prose on DES-148's tier and is **optional, absent rather than a placeholder** | to verify at S26 | 4.17 allows a caption | AC-197 | S26 |
| L-196 | `page-image.tsx` **The space is reserved before the picture loads**, the block knowing its aspect ratio from the moment the file is chosen, because a page jumping by the height of an image is the single most noticeable thing a page of text can do wrong | **no**: the client stores no ratio | *unspecified* | *none* | S26 |
| L-197 | `page-image.tsx` Three ways in, because people reach for different ones: choose, drop, or **paste**, and paste is the gesture that matters for a worked example | **partial**: the client offers choose | *unspecified* | *none* | S26 |
| L-198 | `history-sheet.tsx` The footer's Activity control answers "is this fresh?" and the sheet answers "what happened to this?"; the shape follows the question | **partial**: the client has both, `shell/WindowBar.tsx:100` and `pages/FolderPage.tsx:1013` | 9.1 for the line; the sheet is 9.6's History act | AC-178 for a task's own history | closed |
| L-199 | `history-sheet.tsx` The sheet **groups by day** and shows the actor on **every** line rather than only where it changes, because a record you are reading to settle a question should not make you look upwards | **no**: `pages/FolderPage.tsx:1019-1034` is a flat list with a relative time under each line | *unspecified* | *none* | S26 |
| L-200 | `history-sheet.tsx` Both draw the same events through one `lineFor`, so the popover's sentence and the sheet's are one string | **no**: the client's two readers format independently | *unspecified* | *none* | S26 |
| L-201 | `comments.tsx` **One conversation surface wherever a conversation happens**: the card renders it as a block, the folder page as a block or a panel, and the differences are layout, never behaviour | **partial**: one component exists, `components/page/ConversationThread.tsx`, and only the folder page mounts it | 9.6, and 9.3 applies 9.6's rules to a task | AC-204 to AC-207 | S26 |
| L-202 | `comments.tsx` A comment can be **words, files riding along, or a voice note** | **no**: 4.15 and 4.16 carry files and `comment_files` binds them, and no client surface offers either; voice has no kind | 4.15, 4.16 | AC-194 | ruling for voice, then S26 |
| L-203 | `comments.tsx` Replies nest **one level, and one level is a decision rather than a limit**, because unbounded nesting is how a card grows a forum inside it | yes, server-side | 9.6 and 4.15 | AC-204 | closed |
| L-204 | `comments.tsx` Likes are the whole reaction set | yes | 9.6 | AC-206 | closed |
| L-205 | `sharing-panel.tsx` The panel is the folder's members, the roster picker, the email invite and the pending list | yes, `pages/FolderSharingPanel.tsx` | 9.6 | AC-172, AC-183 | closed |
| L-206 | `quick-add.tsx` One inline capture control per page, collapsed to a single control and expanding to a focused box of the same name | yes, `components/quick-add.tsx` | 9.1 | AC-166 | closed |
| L-207 | `search-overlay.tsx` **Four kinds, which is every kind Dana has that you can go to**, grouped by kind with status deciding the order **within** Tasks, because two classification schemes as peers is the fault DES-152 took out of the sidebar | yes since S17b | 9.9 | AC-258 | closed |
| L-208 | `search-overlay.tsx` The places are offered **before anything is typed** | yes | 9.9 | AC-258 | closed |
| L-209 | `state-patterns.tsx` The shared page states draw the shipping row's own shape rather than a second set of numbers | yes, `components/state-patterns.tsx`, recorded at section 13 item 41 | 9.1's inline state copy | AC-171, AC-158 | closed |
| L-210 | `new-folder-dialog.tsx`, `folder-group-dialog.tsx` A folder is made by naming it; a shelf is made from the dialog the sidebar's hold hands to | yes, both files exist under `components/` | 9.1 | AC-181, AC-180 | closed |

## C.4 `src/components/ui/`: the twenty-six primitives

The set is identical: every one of the prototype's twenty-six exists in
`app/src/client/components/ui/`, and the client carries three more of its own
(`ConfirmDialog`, `copy.ts`, `native-select`). **S21's diff is per primitive
and not per set**, so this is one grouped entry plus the four that carry a
decision of their own.

| # | The decision | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - |
| L-211 | The twenty-six shadcn primitives over @base-ui, composed with cva, clsx and tailwind-merge, animated with tw-animate-css | yes, all twenty-six present by name | 11.4 fixes the stack | AC-183's copy cases run through them | S21 diffs their bodies |
| L-212 | `bubble.tsx` A message's shape: the author's words in a container told apart by **tone rather than hue** | yes, `components/ui/bubble.tsx` | 9.6: "a message is told apart by tone, never hue" | *none* | S21 |
| L-213 | `inline-field.tsx` A value that becomes its own editor in place, which is what "editable in place" means on a title and a description | yes, `components/ui/inline-field.tsx` | 9.3, 9.6 | AC-217's title case | S21 |
| L-214 | `item.tsx` The one row primitive the menus, the lists and the pickers share | yes | *unspecified* | *none* | S21 |
| L-215 | `message.tsx` One comment's composition, drawn once for the card and the page | yes | 9.6 | AC-204 | S21 |
| L-216 | `calendar.tsx` One calendar, shared by the due picker, the reminder picker and the filter's custom range | yes | 9.3, 9.5 | AC-177, AC-219 | closed |

---

# D. `src/screens/`: all twenty-three by name

"Every prototype screen and component appears by name" is this package's
acceptance, so the four design labs are **named and given a verdict** rather
than excluded the way the 2026-08-25 audit excluded them. An unexplained
absence is what the last instrument did.

## D.1 The nineteen product screens

| # | Screen | What it decides, beyond what C and B already carry | Client | Section | Criterion | Owed to |
| - | - | - | - | - | - | - |
| L-217 | `shell-page.tsx` (3,481 lines) The shell that hosts every place: the page set, the tabs, the filters, the surface host, the mutators that register undo, and the board's drop-to-act mapping | **partial**: `shell/app-shell.tsx` plus nine page files carry all of it except the task surface | 9.1 | AC-174, AC-214 | S24 |
| L-218 | `shell-page.tsx` A drop is **decided once and performed once**, so it can be undone and so a future history has one place to write | yes, `parts/useRowActions.ts` and `shell/undo.ts` | 9.1 | AC-228 | closed |
| L-219 | `shell-page.tsx` Overdue **refuses a drop**, because it is a relation to today rather than a value, and "make this overdue" is not something anybody means | yes, `views/TaskBoard.tsx` refuses a column with no value to write | *unspecified* | AC-228's second case | closed |
| L-220 | `shell-page.tsx` `?mode=`, `?view=`, `?state=important`, `?folder-action=appearance`, `?role=member` and the rest: every instrument this plan reaches is reachable by link, because a review is done by clicking links | **partial**: `?mode=` is honoured; the preview parameters are the prototype's own and do not port | 9.1 names `?mode=` | AC-182 | closed |
| L-221 | `my-day-screen.tsx` Today: the three normative groups, the recap collapsed at the foot, the un-pull control, the carried row keeping its words and dropping the red | yes, `pages/TodayPage.tsx` | 9.4 | AC-045 to AC-050, AC-165, AC-158 | closed |
| L-222 | `planned-screen.tsx` Scheduled: the ladder of headings, the three calendar zooms, the six-week Monday grid, "+N more", the ghost banner, the dated quick-add | yes, `pages/ScheduledPage.tsx` with `components/calendar/` | 9.5 | AC-052, AC-082, AC-098, AC-177 | closed |
| L-223 | `assignments-screen.tsx` It **defaults to everyone, grouped by person, the viewer first**, rather than to the viewer's own list, because the value of a shared to-do app is seeing the whole household's load at a glance | yes | 9.5 | AC-245 | closed |
| L-224 | `assignments-screen.tsx` The "from A to B" framing is honest only halfway, Dana recording a creator and not an assigner, so the assignee is the spine and the creator is a filter | **no** on both halves: the from-half is undrawn and the created-by axis is unbuilt, both unblocked by S18 | 9.5 names the from-half in terms | *none* | **S25** |
| L-225 | `important-screen.tsx` Important: one list, un-star removes immediately, and **the star rests unfilled on this page** because a filled star on every row distinguishes nothing | **partial**: the page and the completed foot are built; the resting-unfilled star is the row's, and the row is v1's | 9.5 | AC-055, AC-099, AC-263 | S23 |
| L-226 | `all-screen.tsx` All: the union rendered whole with completed work in a collapsed section at the foot, and static section labels | yes, `pages/AllPage.tsx` | 9.5 | AC-070, AC-263's grammar | closed |
| L-227 | `tasks-screen.tsx` The v1 Tasks page, folded into v2 as **Anytime**, undated open work ungrouped | yes, `pages/AnytimePage.tsx`, and `/app/tasks` redirects | 9.5, 9.1's redirects | AC-215 | closed |
| L-228 | `done-screen.tsx` Done: day groups, the un-complete confirm, no capture anywhere, rows dropping the spent due echo | yes, `pages/DonePage.tsx` | 9.5 | AC-056, AC-096, AC-229 | closed |
| L-229 | `grouped-screen.tsx` **Grouping replaces a page's arrangement rather than decorating it**, because teaching seven pages to also group would mean headings inside headings | yes, `views/grouping.ts` | 9.1 | AC-222 | closed |
| L-230 | `folder-page-v2.tsx` (2,434 lines) The folder page as a page: cover, mark, description at the title, thin control strip, real filter variables, a two-column board with movable sections, positional inserts | yes since S17b | 9.6 | AC-259, AC-260, AC-176 | closed except L-044 and L-045 |
| L-231 | `folder-page-v2.tsx` Tasks drag **between sections**, the engine asking the page where the release landed, and dragging out of a section is the same gesture as dragging in | **partial**: the client writes `section_block_id` and its drag is the board's; the in-list section drag is unverified in this reading | 9.6: "ordering within sections and the block arrangement are the folder's" | AC-199, AC-248 | S26 |
| L-232 | `folder-screen.tsx` The **v1 folder page**, kept at `?folder-page=v1` as the superseded screen | correctly absent | n/a | *none* | closed by exclusion |
| L-233 | `shelf-page.tsx` A shelf is the folder page one level up, its folders' **presence derived and their place arranged**, private by construction, no views and no filter | yes, `pages/ShelfPage.tsx`, keyed by id rather than by name | 9.10 | AC-203, AC-223, AC-257 | closed |
| L-234 | `trash-screen.tsx` One list, not a list per kind; each row says where it goes back to; the countdown is on the row; Delete for ever asks first | **partial**: the first three are built at S17b; "Delete for ever" is absent and AC-262 asserts the absence, which items 36 and 38 now overturn | 9.11, items 36 and 38 | AC-262 | **S28** |
| L-235 | `settings-screen.tsx` Settings: the pin list, Appearance's four controls, the account row whose **picture is the control** | yes since S17b, and the picture-as-control is `pages/SettingsPage.tsx`'s avatar | 9.7 | AC-241, AC-261, AC-196 | closed |
| L-236 | `people-screen.tsx` The roster, the remove confirm, the bare invite refused when already connected | yes, `pages/PeoplePage.tsx` | 9.8 | AC-141, AC-183 | closed |
| L-237 | `landing-screen.tsx` The public landing: one Continue with Google, the product described without an AI claim, privacy and terms linked | yes, `pages/LandingPage.tsx`, adopted 2026-08-24 with its departures named | 9.2 | AC-159 | closed |
| L-238 | `public-legal-screen.tsx` Privacy and Terms as the public family's quiet light page, their **facts re-verified at the port** | yes, `pages/LegalPage.tsx` since S16 | 9.2 | AC-240 | closed |
| L-239 | `public-auth-screen.tsx` The signed-out and refused states of the public family | yes since S19 | 9.2 | AC-239 | closed |
| L-240 | `transactional-email-screen.tsx` Three designed HTML cards | ruled: item 32 gave every email an HTML part **and** a required text/plain alternative, which is neither the prototype's nor 10.7's first reading, and S19 built it | 10.7 as amended | AC-251 to AC-256 | closed |

## D.2 The four design labs, named and given their verdict

| # | Screen | Verdict | Why |
| - | - | - | - |
| L-241 | `row-lab.tsx` | **Ships nothing, deliberately** | It is the concept lab where treatments compete before one becomes the row. Dana has no surface for it and section 9 names none. Its content is a review artefact and `docs/design/` is a directory every role reads and no agent writes |
| L-242 | `row-concepts.tsx` | **Ships nothing, deliberately** | Every concept renders its own markup precisely so nothing in it can change a screen by accident. What did ship out of it is `lib/task-model.ts`, `components/task-card.tsx` and `components/task-pickers.tsx`, extracted on 2026-08-18, and those are lifted on their own entries |
| L-243 | `states-page.tsx` | **Ships nothing, and section 13 item 41 already records why** | Section 9 names no states page, `screen-registry.csv` carries none, and building one would be inventing product. What the app owes the design record instead is that its shared page states draw the shipping row's own shape, which `components/state-patterns.tsx` does (L-209) |
| L-244 | `swatch-options.tsx` | **Ships nothing; it is a question, and the question is answered** | It exists to let Imran rule between three treatments of the ten folder swatches on a dark ground, having measured that the palette reads **better** on dark (4.47 to 5.19) than on light (3.42 to 3.97). The measurement is worth keeping; the page is not a surface. **Whether a ruling was recorded is not visible from the repository**, so S21 must read the design contract's DES-205 and DES-214 before it touches the dark colourway, and this entry is the pointer |

---

# E. The owner's named list, answered item by item

RFC 0004 carries this list "so no item of it is lost to a ledger", which
means each is answered by name here rather than absorbed into a table above.

| # | The item | Where it stands | Owed to |
| - | - | - | - |
| L-245 | **The v2 task row and its two shapes (DES-113)** | Not ported. `app/src/client/components/task-row.tsx` is 636 lines and the prototype's is 2,867; the client's is the v1 row with a chip strip above it, and `density` drives list spacing rather than the row's shape. Entries L-020, L-076, L-077, L-148 to L-154 | S23, with S21 for the density token work |
| L-246 | **The thread inside a task** | No mount exists. `components/page/ConversationThread.tsx` is rendered by `pages/FolderPage.tsx:598` alone, and the server side has answered `?task=` since S5. Entries L-158, L-201 | S26 |
| L-247 | **A shelf's page** | Built and faithful, keyed by id rather than by the prototype's name, reachable from the Library since S17b. Entry L-233. **What is still open is what a shelf's page is where 9.10 and the prototype differ**, which is a rulings-sheet row rather than a build | closed, minus the rulings |
| L-248 | **The tab strip's fidelity** | Ported in full at S13 and asserted: every tab equal and closable, one anatomy, pointer drag, keyboard reorder, the "+" opening folders and shelves. Entries L-129 to L-133 | closed |
| L-249 | **Task drag as the prototype does it** | Half of it is a **question, not a port**. The folder page's section drag is real in the prototype and lifts at S26 (L-231). The *list* reorder, the 1.5 second hold that makes a folder of two tasks, press-and-hold selection and the bulk bar are drawn only in the concept lab and are **deliberately not wired into the prototype's own screens**, because they need a persisted task order and endpoints nobody has written. There is no `tasks.position` column and no section 6 order to write. Entries L-092, L-154 | **ruling**, then S23 or S26 |
| L-250 | **Sidebar drag as the prototype does it** | Ported at S17b in all three gestures, including the hold that makes a shelf and the closed-group rule. Entries L-124 to L-128 | closed |
| L-251 | **The animated mark** | Not ported at all: the client draws `<img src="/dana-mark.svg">` in five places and the prototype's mark is an inline SVG whose pen is a mask. Entries L-141 to L-145 | **S21** |
| L-252 | **Dark mode quality** | The colourway exists in `tokens.css` and is reached by the theme control since S17b, so dark mode **works**; whether it is the prototype's dark mode is a value-by-value diff nobody has run, and the swatch question (L-244) sits under it | **S21** |
| L-253 | **Pixel fidelity throughout** | Not measurable by reading, and deliberately one entry rather than a column on every row. What can be said: the token vocabulary agrees, 11.13 records the three vocabulary differences and no value disagreements, and the layout dimensions the board never carried are the ones the client's tokens file lacked. The verdict is Imran's eye at S30 against the running dana.so, which is item 31's review | S21 measures, S30 judges |
| L-254 | **Assignments' from half** (row 33's residue) | Unbuilt, blocker removed. `created_by` rides TaskCard since S18 and `pages/AssignmentsPage.tsx:25-30` records that drawing it is the parity work rather than that file's | **S25** |
| L-255 | **The created-by filter axis** (row 33's residue) | Unbuilt, blocker removed, and `views/filter.ts:17-23` says so in the same terms. 9.1 already names the axis in the filter's list, so this is a gap against a numbered section as well as against the prototype | **S25** |
| L-256 | **The conversation's attachments** (row 33's residue) | Unbuilt. 4.15 and 4.16 carry comments and files, change control item 1 added `comment_files` for exactly this binding, and no client surface offers a file on a comment. Voice notes have no kind at all and are a scope question rather than a port | **S26**, with a ruling for voice |

---

# F. Section 13 item 42, reconciled rather than repeated

Item 42 named four pieces of 9.3 built nowhere and said whose each was. Each
is checked against today's tree.

| # | Item 42's piece | Where it stands now | Owed to |
| - | - | - | - |
| L-257 | **Attachments** on the task card | Still absent from the client. 4.16 and 7.15 are built and asserted (AC-194 to AC-196), so the block would no longer be "the control that leads nowhere" it was written to prevent | S23 draws the block; the storage is done |
| L-258 | **Comments** on the task | Still absent, and it is L-246 and the owner's own list item | S26 |
| L-259 | **The folder picker's "New folder…" entry** | Still absent. It opens 9.1's New-folder dialog, which is the chrome's, and reaching across for it is what protocol section 3 forbids. The lift resolves the ownership by moving both surfaces in the same arm: S23 draws the picker and S24 owns the dialog, so the seam is a package boundary rather than an escalation | S23 with S24 |
| L-260 | **"More actions" carries Delete alone** | Still true, and it is now the sharpest instance of item 39: the client's row menu is Edit, Abandon…, Delete… where 9.3 names seven acts and the prototype's contract declares nine. Entry L-020 | S23 |

Items 40 and 41 are closed and were read rather than re-raised: item 40's
two-controls-for-one-field interim went with S15, and item 41 records why
Dana ships no states page, which is L-243's verdict.

---

# G. What the ledger counts to

**260 entries**, addressed L-001 to L-260.

**The client column**, counted over the 213 entries that carry one in the
yes/partial/no vocabulary:

| Verdict | Entries |
| - | - |
| yes, the client does what the prototype does | 146 |
| partial, with what is missing named on the row | 25 |
| no | 42 |

The remaining 47 entries are the four design labs, the owner's named list,
section 13 item 42's reconciliation, and the dozen rows whose client column
reads *n/a*, *superseded*, *matches* or *to verify at S2x* because the
decision is not yet reachable in the client at all.

**The section column.** **66 entries read *unspecified***, which is 11.13's
mechanism measured: sixty-six decisions the prototype makes that no numbered
section carries, so no session was ever handed them. **Three entries carry a
conflict**, and only one of them is live:

- **L-009**, the five ellipsis labels, against 9.1's names table fixing
  "Leave folder" exactly with AC-217 and AC-183 over it. This one needs a
  ruling and is the rulings sheet's first row.
- **L-115** is the prototype disagreeing with itself about whether a workflow
  carries completion; 7.16's schema settles it and nothing is owed.
- **L-135** is an emphasis difference the folded 9.1 already decides, and
  11.13 makes the section the winner without a ruling.

**Where the work lands**, by the entries that name a package: **S21** on 25,
**S23** on 37, **S25** on 8, **S26** on 21, **S28** on 2, with S22 and S24
carrying the adapter and the shell rows named inline. **152 entries read
closed**, which is the honest good news in this file: S15 to S19 closed a
great deal, and the remaining distance is concentrated in one surface, the
task row and the card it opens.

**The one-sentence reading.** The client's chrome is the prototype's; the
client's task is not. Of the 42 entries that read *no*, **18 belong to S23**,
the task surface lift, and **10 to S21**'s foundation, with 10 to S26, 5 to
S24 and 3 to S25; the task row, the card it should open and the act contract
that should draw its menu are the single largest concentration in this file.
That is why RFC 0004 puts S23 immediately after the adapter, and why nothing
downstream of it should be started ahead of it.

## What is deliberately not here

- **`src/fixtures.ts` ships nothing, ever.** It was read to understand the
  shapes the components take and **nothing in it crosses**. That half of RFC
  0004's close is explicitly unamended by item 37, and this file amends it
  no further.
- **No criterion is written, edited or weakened by this file.** Sorting them
  is the triage's, at
  `docs/parity/2026-08-26-browser-criteria-triage.md`.
- **No file under `app/` is touched by this package.** Every *no* and every
  *partial* above is somebody else's row of RFC 0004's table, named in the
  last column of its own entry.

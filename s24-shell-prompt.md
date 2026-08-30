# S24: the shell lift

You are opening a Dana build session. Read these before your first line of
code, and say so and stop if you were not given them:

- `docs/team/_shared-protocol.md`, the operative rulebook
- **The personas, and read the Owns sections before you accept the list.**
  RFC 0004's S24 row names `07-frontend-architect.md` with criteria from
  `11-adversarial-test.md`. Read both. Then read
  `docs/team/08-component-and-design-system.md`, because its Main jobs name
  **the sidebar** outright and its Owns line takes
  `app/src/client/components/**` excluding the calendar, task-form and
  search directories, which is where `app-sidebar`, `folder-row`,
  `folder-directory`, `undo-bar` and the view strip all sit. **The owner
  column has now been wrong five times** (RFC 0005 change control items 12,
  34, 46 and 47(c), plus S21's), so settle it at your opening and record the
  answer rather than discovering it at the merge. S23 found it was three
  roles where its row named one
- `docs/spec/11-architecture.md`, including 11.4, 11.13 and the 11.15
  hazards
- **RFC 0004's S24 row and the prototype-lift section above it**, especially
  the lift discipline: a lifted file diffs empty against its prototype
  original except at named seams, and every seam carries a comment saying
  which adapter it crosses and why. A session that finds itself rewriting a
  component's body has left the strategy and found an escalation
- **RFC 0005 change control item 44**, and specifically **A1 and A2**, which
  are the two this row carries and which no earlier row was allowed to land
- **RFC 0005 change control item 47**, which is S23's close. Read (e) in
  full: it is the most useful paragraph anybody has written for the four
  rows that follow it, and it is about what the criteria triage cannot see
- **S20's three documents** under `docs/parity/`, all dated 2026-08-26: the
  behavioural ledger, the rulings sheet, and the browser criteria triage.
  **The triage's F4 is yours**, and it is the rework pile's core

## What you are building

RFC 0004's S24 row: **the shell lift.** `app-shell`, the sidebar with
DES-171's drag, the tab strip, the window bar, the Library and groups, the
undo bar and `right-edge` cross from
`docs/design/prototype-v2/src/components/`.

**This row is much smaller than S23 and the ledger says why in its own
words**, so do not size it from the row before you. Its one-sentence reading:
*"The client's chrome is the prototype's; the client's task is not."* Of the
42 ledger entries that read *no*, **five belong to this row**. `L-248`, the
tab strip's fidelity, reads **closed**: "ported in full at S13 and asserted,
every tab equal and closable, one anatomy, pointer drag, keyboard reorder".
`L-250`, sidebar drag as the prototype does it, reads **closed**: "ported at
S17b in all three gestures, including the hold that makes a shelf and the
closed-group rule". Verify both against the files rather than trusting this
sentence, but do not plan a rebuild of either before you have.

Sizes, so nothing is a surprise: the prototype's `app-shell.tsx` is 834
lines, `app-sidebar.tsx` 866, `folder-directory.tsx` 942, `folder-row.tsx`
417 and `undo-bar.tsx` 103. `screens/shell-page.tsx` is 3,481 lines and is
**the prototype's own wiring rather than a screen**; change control item 45
measured that the prototype's screens are presentational and its wiring is
in its shell, which is the same architecture this client has.

## What S23 left you, and three of your files are already lifted

Merged at `102e855`, which is also `origin/v2-build` read through
`git ls-remote --heads origin v2-build`. CI's verdict on that sha is the
first thing to read.

- **`components/window-bar.tsx`, `components/right-edge.tsx` and
  `components/view-strip.tsx` are lifted already.** They are your row's by
  RFC 0004's table and they crossed early because the task surface needed
  them: 9.3 gives a task opened as a tab its own window-bar controls, and
  writing a second set would have been the duplicate implementation protocol
  section 3 forbids in the same breath as the boundary. Each carries its lift
  note. **Do not lift them again**; read them and check the shell you bring
  across expects what they export
- **`shell/app-shell.tsx` carries three mounts S23 added**, each commented:
  `TaskSurfaceHost` where the retired `TaskFormOverlay` was, `FolderLibraryMemory`
  which publishes the folder table for the lifted pickers' bare
  `folderLibrary()` call, and a `TaskWriter` provider at the root which is
  the one write path out of a card. **The third is load-bearing and is the
  fault S23 found latest**: without it, a row expanded on a page opens a real
  card whose every edit goes nowhere. If your lift replaces that file, carry
  all three across and keep their comments
- `views/ViewStrip.tsx` is the client's own place-page strip and is **still
  the v1 shape**, plain buttons carrying their names as text. It is F4's
  subject and it is yours to retire in favour of `components/view-strip.tsx`
- `components/task-form/**` is gone. `openTask` is now
  `components/task-open.ts` and its copy is `components/task-copy.ts`;
  `shell/overlays.ts`'s `openTaskForm` is unchanged and every caller still
  calls what it called

## The criteria, and F4 is the whole of your pile

**The triage puts eighteen of its nineteen rework cases on this row**, and
they are the only rework cases in the whole lift outside S28's one retirement.
Read the triage's own sort rather than this list, and note that **a rework
lands red first under persona 11 in the package that lifts its surface**,
which is you, and that no text is weakened in the move.

- **F4: the view strip's options stop being buttons.** Item 39 rules the
  strip becomes the prototype's collapsing icon radiogroup: `role="radio"`
  inside `role="radiogroup"`, labels in tooltips, and every option but the
  current one at **zero width** until hover or focus. Seven spec files reach
  a view by `getByRole('button', { name: /^calendar$/i })` or `/^Board$/i`
  and break on all three counts. That is `ac-093` (1 case), `ac-098` (3),
  `ac-158` (1), `ac-177` (3), `ac-221` (2), `ac-228` (2) and `ac-259` (3,
  the last with S26 for the folder page's own board)
- **A1's five ellipsis labels land here and nowhere else.** "Move to
  folder…", "Delete task…", "Delete folder…", "Leave folder…" and "Delete
  shelf…". `ac-217` (2 cases) and `ac-246` (2) enumerate the acts by label
  and are the triage's rework pile for them. **S23 deliberately landed only
  the seventh**, "Make this a folder…", which arrives declared and unsupplied
  so no menu renders it; landing any of the other five there would have
  turned a green case red in a package that did not own its rework. They are
  yours, red first
- **9.1's names table changes for "Leave folder"**, which is A1's own
  sentence and is the one names-table edit the ruling makes

## The ledger's entries for this row

Five read *no* and they are one subject. `L-028` to `L-032` are the view
strip: small icons and never written labels (DES-137), a radiogroup rather
than a group of pressed buttons, `collapse` as the resting behaviour, every
option kept in the DOM at zero width so the keyboard and a screen reader see
the whole group, and only the current option holding the tab stop. `L-083`
is the undo bar's rule to verify here: "expiring hides the bar and does not
clear the stack, the timer governs the furniture and never the capability".
`L-128` is the sidebar hold's closing ring, to verify rather than to build.

## What S23 learned that will save you a night

Change control item 47(e) is the record; this is its practical half.

- **The criteria triage swept the harness's locators, and that sweep has a
  blind spot.** It predicted two addressing seams for S23 and both were right
  and both worked first time. **Eleven more were found by driving the leg.** A
  seam is invisible to a locator sweep whenever the disagreement is a default
  in a migration, a computed style, a role the prototype *adds* rather than
  omits, or a context nobody provides. Every one of those four classes is
  live in your row too
- **Three of S23's faults would have shipped looking correct**, and each was
  the same species: behaviour that costs nothing where everything is local
  state and becomes a real fault the moment a server is behind it. A card
  that wrote nowhere because no page provided the write path; a picker that
  wrote the words a chip says and never the value; a completion written twice
  with 9.5's confirmation asked after the act it gates. **When you lift
  something whose prototype counterpart reads or writes local state, ask what
  it costs over the seam before you ask whether it renders**
- **A locator that names a control by substring inside a row is ambiguous the
  moment a row carries the task's own words.** S23 lost two criteria to
  seeded titles containing "restore" and "assigned", and the cause was a
  control named `Restore ${task.title}` where 9.5 names it "Restore". Read
  every `aria-label` you lift against 9.1's names table before you run
  anything
- **A modal dialog must make the page behind it inert**, which S23 added at
  `components/right-edge.tsx`'s `HoldsTheDocument` and the shell consumes.
  **Your lift replaces the consumer**, so carry it

## What is not yours

- **The places lift is S25's**, the folder page and the conversation S26's,
  the remainder S27's. `page-head.tsx` is the first line of S25's row and is
  309 lines; it is why S23 declined item 45's proof screen
- **Change control item 45 is open and is the Steward's.** S23 declined the
  proof with a measurement item 45 did not carry and did not close it
- **Section 13 item 46 is answered and open**: Imran ruled a task's Duplicate
  in scope on 2026-08-26 and deferred the build to the close in the same
  exchange. S28 is recommended over S30, S30 being the close and carrying no
  build. Nothing about it is yours
- **Section 13 item 48 is S27's trigger**, not yours: 4.19's `task_open`
  default is `'panel'` where Imran ruled the dialog, and correcting it is a
  frozen section 4 change. S23 ships the preference in the browser, which is
  9.3's own word, and routed the column

## Numbers, read at your opening and again at your merge

At this writing, on `v2-build` at `102e855`:

- next free acceptance number **AC-274**
- next free SESSION-LOG row **39**
- next free change control item **48**
- next free section 13 item **49**

**Read every one of them from the file at your merge, not from this list.**
Items 13 and 25 exist because sessions have drawn a number another had
already taken. `git fetch origin <branch>` does not update
`refs/remotes/origin/<branch>` on this machine; `git ls-remote --heads` is
the authority.

## Environment

Read CLAUDE.md's "Commands and this machine" in full. Beyond it: work in your
own worktree at a **dot-free path** with its own `npm ci`, this checkout
living under `.work` where the browser leg 404s by Express's dot-segment
rule.

**Four machine facts S23 measured the hard way, all of them costly:**

- **Killing a browser leg's server does not kill the leg.** The parent
  `playwright test` process survives, and starting the next run puts two runs
  on one port writing into one results directory. S23 did this to itself and
  spent an hour reading contaminated counts. Kill by command line, not by
  port: every `node.exe` whose command line matches `playwright` or
  `e2e:app`, then poll until nothing answers on your port at all
- **Take your own port through an untracked config copy** (`sed 's/3100/3124/'
  playwright.config.ts > s24.config.ts`, never committed, deleted at the
  close), and check nothing holds 3100 either
- **`rm -rf app/.data` before a run you intend to trust.** The seed truncates
  application rows, so this is belt and braces rather than the S17b failure
  mode, and it costs nothing
- **A whole-leg red of one or two cases is unmeasured rather than broken**:
  re-run the case alone before believing it. S23 had two files fail in a full
  run and pass alone, and they were never defects. **A red of a whole file's
  worth is real**

The PGlite leg is currently **263 files and 1839 tests**; the browser leg is
**228 cases in 73 files** and S23 merged it at 228 of 228. Read the file
count, not the exit code, and never pipe `npm test`. **Commit charge rather
than free RAM is the ceiling**: S23 ran with 2.9 GB free of 34.7 while Chrome
held 13.4 GB, which is below the line S22 recorded, and browser windows are
worth more than every test process put together.

## Closing

SESSION-LOG row at the next free address, read from the file at your merge
moment. Merge, push, and read CI's verdict rather than waiting on it; if it
is red, check free memory before believing the red. Render deploys `v2-build`
during this arm, so say what Imran can see at dana.so the same day. S23 put
the v2 task row on every page that lists tasks, in both densities, expanding
in place into the v2 card and opening as the dialog he ruled; **your row is
the frame around it**, and the two together are the first time the
application looks like `prototype-v2` rather than resembling it. Then tell
him to open a new chat for S25 rather than starting it.

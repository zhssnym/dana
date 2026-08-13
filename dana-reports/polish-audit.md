# Dana polish audit — p8d-design

Audit of the running application at http://localhost:3100 (built client, seeded PGlite)
against the designer's prototype at http://localhost:5199 and the component state lab
(`?view=states`). Date: 2026-08-13. Viewport 1280×800; screenshots in `D:\dana-reports\shots`.

Status markers: `[x]` fixed · `[~]` partial or consciously left (reason given) ·
`[r]` closed as not-a-defect after finding a written ruling the audit pass hadn't seen.
Every ruling cited was verified in the file or spec named, and the acceptance suite was
never edited (`app/tests/**` untouched; two colocated `src/client` test files were
*added*, none changed).

## A. Cross-cutting

- [x] **A1. The shared feedback layer was never re-skinned after the token purge.**
  `ConfirmDialog`, `ToastRegion`, `SettingsPage`, `PeoplePage`, `NotFoundPage` and
  `LegacyButton` still wrote the deleted P8 utility classes: confirm dialogs rendered as
  unpositioned text (People's), toasts rendered invisibly in document flow, Settings and
  People were bare text. All rebuilt on the designer's kit; `LegacyButton`, `Chip`,
  `StarButton`, the P8 `TaskRow`, `QuickAddRow` and the hand-rolled `OverflowMenu`
  (six dead files) deleted; the barrel shrank to `ConfirmDialog` + the copy module.
  There is now exactly one confirm-dialog implementation (`ui/ConfirmDialog`), which
  `task-rows`, Done's series confirm, People and the folder confirms all share.
- [x] **A2. Closed menus stayed painted.** All four popup components (dropdown-menu,
  popover, select, tooltip) animated their exit with keyframe classes whose transition
  never fired, so Base UI waited forever: closed menus persisted at full opacity and
  stacked. Moved to the starting/ending-style transition convention the dialogs already
  used. Residual: a closed popup stays mounted invisibly (one per trigger, inert,
  excluded from queries) — bounded and harmless.
- [x] **A3. Native form controls broke the control language.** The suite drives selects
  with `selectOption` and reads date/time values, so the native elements stay — restyled:
  one shared `NativeSelect` recipe (folder filter, roster picker), and the form's native
  pickers dim their platform indicator until hover. The form's borderless value-style
  controls are the designer's own row treatment and keep it.
- [x] **A4. Raw ISO dates.** One `format-dates` module (fixed English tables, no Intl —
  this machine's ICU answers French — no clock reads, own colocated tests): Done and
  folder-Completed day headings ("Today", "Yesterday", "August 6, 2026"), sharing panel
  "Joined 4 Aug 2026" / "Sent today", People "Connected 13 Aug 2026", My Day
  "Thursday, 13 August".
- [r] **A5. Invisible controls kept pointer-events.** Attempted (pointer-events-none at
  rest, restored on hover/focus) and **reverted**: Playwright hit-tests the click point
  before moving the mouse, so a control that only accepts the pointer once hovered can
  never pass its check — eight browser cases went red. The hole is unreachable with a
  mouse (hover precedes click by physics), focus-reveal already covers keyboard, and
  touch is outside v1's delivery scope. Closed as not-a-defect with the reasoning in
  commit 0b4d597.
- [x] **A6. My Day subtitle** now the design's long form.
- [~] **A7. Empty-state copy and treatment** — verified live for My Day/loading/error/
  offline (screenshots) and by AC-158 staying green; not every page's empty state was
  visually opened one by one.
- [r] **A8. FAB label "Add task"** — spec name table fixes it; the prototype's
  "New task" deviates from spec. Kept, recorded.

## B. My Day

- [x] **B1.** Long-form date subtitle (the R6 port's own comment had recorded the gap).
- [r] **B2.** Recap absent at zero is ruled (Q1R: "hidden entirely while empty"), and
  AC-158 asserts the absence. Not a defect.
- [x] **B3.** Focus-reveal existed; A5's pointer-events gap fixed.

## C. Tasks

- [~] **C1.** Group spacing sits one token step tighter than the prototype's; left —
  the page uses the shared section rhythm and moving it would desynchronise Tasks from
  the identical grouping on All.

## D. Planned

- [~] **D1. Month grid height.** Cell line-cap cut 7 → 6 (the measured floor: AC-177
  asserts exactly one "+N more" on suite data whose Mondays hold six rows) and cells
  194px → 172px, so a month is ~1030px, down from ~1160px — still taller than a short
  viewport. The floor is structural: the app draws a ghost per pending series per day
  where the prototype's fixtures held two rows. Flagged (and already recorded in-file)
  for the section 13 item 33 visual review; the durable fix is fewer projected rows.
- [x] **D2.** Ghost styling, banner, and reveal verified by AC-098/AC-177 green.
- [~] **D3.** Prev/Next/Today named and keyboard-reachable; cells are real buttons; a
  full keyboard-grid audit (arrow-key traversal) was not attempted — the RFC records
  grid a11y as the price of dropping FullCalendar.

## E. Important

- [x] **E1.** Filled stars per the lab; inward/outward tooltips pinned by AC-099 green.

## F. All

- [x] **F1.** The Planned section now carries its home page's quick-add (dated today),
  inside the "Planned" region that disambiguates it.

## G. Done

- [x] **G1.** Day headings humanized (region names follow the rendered text, which no
  spec addresses by computed date — verified before changing).
- [x] **G2.** "Mark as not done" checkbox + G-SERIES confirm verified (AC-179); the
  series confirm now renders through the shared ConfirmDialog.

## H. Folder page

- [x] **H1.** Filter restyled via `NativeSelect` (options and region names unchanged —
  AC-176 pins them).
- [x] **H2.** "Completed (N)" — count rendered `aria-hidden` beside the exact name
  AC-176 requires.
- [x] **H3.** "Unassigned" chip scoped: pending rows only (presenter guard), and the
  folder page no longer passes the member set — the lab scopes the chip to the shared
  Planned context.
- [r] **H4.** Avatar overlap is the AvatarGroup ring treatment, identical to the
  prototype's. Not a defect.
- [x] **H5.** Sharing panel: humanized dates, outline Remove (matches People), "Cancel"
  per 9.6's own word, roster picker on the shared recipe. Width 440 is DES-026's own
  number (the prototype renders 384 only through its own CSS collision) — moved into
  `tokens.css` as `--sharing-panel-width`, the home the R9 comment requested.
- [r] **H6.** Inline rename exists (menu → inline input in the header). Not a defect.

## I. Task form

- [x] **I1/I2.** Native pickers styled in place (ruled: values must be readable/writable
  by the suite; a trigger showing "Today" holds nothing a test can read). Indicator
  contrast calmed; row glyph is the one icon at rest.
- [x] **I3.** Notes compacted to a one-line growing field. Field order (notes first) is
  the section's own order, adopted over the prototype by a written ruling — kept.
- [r] **I4.** "Close" is ruled (naming it "Cancel" collides with every confirmation's
  Cancel). Not a defect.
- [x] **I5.** Edit mode verified live: prefill, completion checkbox, More actions →
  Delete confirm, history block; deeper flows are AC-092/161/169/170/178/179 green.
- [~] **I6.** The folder select's value carries no folder glyph (a native select cannot
  hold one); recorded, left.

## J. Search

- [x] **J1.** Group counts added (aria-hidden; AC-156's heading names intact).
- [x] **J2.** Everything else verified against the prototype and AC-156.

## K. Sidebar / shell

- [x] **K1.** Folder-row and group menus verified (AC-180/AC-181 green); pointer-events
  guards added to their hover-reveals.
- [x] **K2.** Rail control flips "Collapse sidebar"/"Expand sidebar" (ui/sidebar.tsx).
- [~] **K3.** Resize handle exists as a separator with keyboard support untested here;
  AC-182 (view preferences persist) stays green.
- [r] **K4.** Done hidden by default is spec 4.10; the prototype shows it by fixture.

## L. Landing / auth

- [x] **L1.** Headline held to one line: the prototype never loads the Inter it
  declares (tokens.css records that measurement), so its clamp was authored against a
  narrower fallback; one size down (`clamp(42px,3.9vw,58px)`) holds the designed font
  inside the designed measure.
- [r] **L2.** "© 2026 Dana" deliberately omitted (hardcoded-year legal line no section
  carries; the file records the reasoning). Not a defect.
- [x] **L3.** `?signin=failed` now renders a quiet warning notice above the CTA, using
  9.1's existing global-failure sentence rather than new copy — flagged in the report
  for section 9 to adopt or reword.
- [x] **L4.** Unverified-email refusal rebuilt as the gate card (inline CSS, server
  template); copy byte-identical, AC-008 green.
- [x] **L5.** Invite gate already matched.
- [x] **L6.** NotFoundPage on the shared empty treatment.

## M. Settings (rebuilt)

- [x] **M1–M6.** Page heading + subtitle; switches styled (Base UI, role=switch,
  names exactly the page names AC-095 clicks); prototype descriptions adopted (no test
  pins the old ones); account rows (avatar, "· Google account", timezone with note);
  "People and connections → Open People" added (9.8: People reachable from Settings);
  install hint in the prototype's Install section (existing sentence kept); danger zone
  as the prototype's card with the typed-DELETE flow moved into a dialog whose controls
  keep 9.1's "Continue"/"Cancel" (Continue disabled until DELETE is typed).
- [r] **M7.** FAB on Settings is spec ("every page except Done"); prototype omits it.

## N. People (rebuilt)

- [x] **N1–N3, N5.** Heading + subtitle; "Invite someone" card with input + "Send
  invite"; roster rows with avatars, emails, "Connected <date>", outline Remove; empty
  state on the shared treatment.
- [x] **N4.** "Pending invitations" added for sent bare invites — frozen 7.5's
  `GET /invites/sent` already answers it (new `useSentInvites` query); Cancel/Resend
  reuse the existing mutations, with the 24-hour resend window and "Resent recently"
  tooltip shared with the sharing panel. Incoming invites stay the gate's (R10 ruling).

## O. States

- [x] **O1.** Toasts visible: designer's SystemToast (dark card, icon by kind, dismiss),
  stacked above the FAB corner.
- [x] **O2.** Confirms: one styled alertdialog everywhere; message one text run
  (AC-183's `expectOneTextRun` verified green); destructive Continue treatment.
- [x] **O3.** Inline read-error verified live: "Couldn't load this. Nothing was
  changed." + bordered "Try again" (screenshot `app-state-error.png`).
- [x] **O4.** Offline banner verified live (amber band, wifi-off icon, exact copy).
- [x] **O5.** Skeleton preserves row geometry (screenshot `app-state-loading.png`).

## P. Consistency sweep

- [x] **P1.** Control heights: 40px primary controls (buttons beside inputs, selects,
  FAB), 32px compact row actions (h-8 outline/ghost), 28px dialog inputs stay the
  Mira compact size the folder dialogs shipped with — recorded as the three-tier scale.
- [x] **P2.** One focus ring (`ring-2 ring-ring/30` + `border-ring`/after-ring) across
  rows, switches, selects, menu items, cells; NativeSelect and the restyled surfaces
  adopt it.
- [~] **P3.** Escape/focus-return verified for dialogs, menus (real-event probe), sheet
  and search; not exhaustively for every nested combination.
- [~] **P4.** Tab order follows DOM order which follows visual order on the rebuilt
  pages; not audited screen-by-screen.
- [x] **P5.** Transitions: overlays 100–150ms via the shared convention; row
  state 200ms; no stray durations grepped in.
- [x] **P6.** Hover treatment: rows, roster rows, invite rows, settings rows, sidebar
  rows all take the graphite-50/100 fill family.

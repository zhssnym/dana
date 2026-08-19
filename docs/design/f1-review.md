# The F1 concepts, reviewed hard

Status: **the review is final; the F2 plan it ends in is DRAFT, awaiting
Imran.** Recorded 2026-08-18, session F1's own second half, after Imran's
verdict on the first: *"they feel really under-refined and underpolished."*

He is right, and this document says precisely where and why, in the manner of
the 2026-08-17 frontend review: findings with IDs, severity, and a
classification — **polish** (free to change, no ruling needed) or **ruling**
(Imran decides something first). Every measured number below was read off the
running prototype, not estimated. The findings are on work I drew twelve hours
ago, which is the point: a concept sprint buys speed by borrowing against
refinement, and this is the loan being called.

## The diagnosis, in one paragraph

**F1's features are complete, but they speak four dialects where Dana has one
voice.** The cluster invented floating-pill chrome at 28px in a product whose
contract says primary controls are 40px. The composer invented an 18px radius
in a token system that has 6, 10, 14 and full. The comments thread invented a
24px avatar in a product with a 28px token and a 16px face. Sections invented
a third section-heading style. The conversation badge invented a filled-black
count in a product whose badges are quiet grey pills. Each invention is small
and defensible alone; together they are exactly what "under-refined" feels
like, because polish is not an effect you add — it is the absence of foreign
vocabulary. The refinement plan is therefore not "make it prettier": it is
**translate everything back into Dana's own language, then deepen the three
interactions that are currently sketches** (positional insertion, board drag,
the section gesture family), **then lay the brand on top** (covers from the
mark's own geometry, a motion pass). In that order, because polish applied to
an untranslated surface has to be redone.

## Findings

Severity: **H** high (reads as broken or contradicts the contract), **M**
medium (reads as unfinished), **L** low (worth a pass, not worth a session).

### The header and cover (H-series)

- **H1 · H · polish — The hover ghosts sit beside the title, fighting it.**
  "Add cover" and "Add description" appear at the right end of the H1's own
  line, disconnected from what they create and colliding with the title's
  space. Notion puts this row *above* the title, in the icon's band, where it
  reads as scaffolding rather than as a peer of the name. Move it there, and
  make it visible once for a first-run folder rather than hover-only —
  **discoverability of the whole page concept currently depends on an
  accidental hover** (see also Y6).
- **H2 · H · polish — The identity mark is timid.** A 28px glyph in a 48px
  tile is a control, not an identity. The mark is the one thing on the page
  that is unmistakably *this folder's*; it should hold the corner the way
  Notion's 78px emoji does. Direction: bare mark at 40px on the plain page,
  56–64px on a plate over a cover, and the plate only exists over a cover
  (measured today: 48px tile in both states, border always on, which reads as
  a button).
- **H3 · M · polish — The cover has no relationship to the page below it.**
  It is a flat 176px band that stops. No bottom scrim for the overlapping
  controls, no tonal handoff into the page, and the "Change cover" affordance
  floats free on hover with no resting hint. One 24px soft gradient at the
  band's foot and a resting-state affordance solve it.
- **H4 · H · ruling — The illustration covers are off-brand and should be
  replaced by the mark's own geometry.** The four generated landscapes
  (dusk, sea, meadow, night) read as clip-art and import colours the tokens
  do not have (`#2b3350` navy is nowhere in the palette). Dana already owns a
  distinctive drawing: the mark's ribbon spiral, whose centreline DES-126
  measured to build the reveal. **Generate the cover set from that geometry**
  — the spiral's path, sliced, scaled and tinted by the folder's own colour
  at graphite-band opacities. Self-contained, unmistakably Dana, and the
  cover then *answers* the folder's colour instead of competing with it.
  Ruling because it deletes a drawn tier and commits the brand's geometry to
  a second use.
- **H5 · L · polish — "2 of 6 done · shared" is two facts, one redundant.**
  The cluster's faces already say shared. Keep the count; consider making it
  the row's one quiet progress affordance instead of prose.
- **H6 · M · ruling — The page ignores the open measure question (L1/V1).**
  The folder page shipped at the old 1120px measure while V1 — the refresh's
  first unfinished session — exists to decide whether lists live at ~800px.
  Every layout judgement on this page is provisional until that ruling, which
  is why the plan below puts V1 first. This is the same mistake V3 made and
  the plan already documents; F1 repeated it and should say so plainly.

### The control cluster (K-series)

- **K1 · H · polish — 28px controls in 40px chrome.** Measured: every
  cluster control including Share is 28px tall against
  `--control-height: 40px`, the contract's size for primary desktop controls
  (the v1 header's filter, Share and overflow all honoured it). Dense
  exceptions exist in Dana, but page-level chrome is the opposite of dense.
  The cluster rebuilds on the 40px rhythm, or it is a contract deviation
  needing its own DES entry — and it does not deserve one.
- **K2 · H · polish — The floating pill is foreign chrome.** A rounded,
  blurred, shadowed pill hovering over content exists nowhere else in the
  product; Dana's chrome is flat bands and hairlines. Direction: the cluster
  is a real header row inside the content column — title left, controls
  right — that **docks** against the top edge on scroll (background and
  hairline arrive only when stuck). Same steadiness, native language.
- **K3 · M · polish — Six kinds of thing at one weight.** View mode, filter,
  navigation, people, a primary action and a menu all render as identical
  icon squares. Group them: views as one segmented control with a genuinely
  selected state; people + Share as the social group; filter showing its
  active state as a chip (today an active filter is a barely-visible tint);
  overflow last. The order is right; the grouping is missing.
- **K4 · M · polish — The count badge is off-vocabulary.** Measured: filled
  graphite-800 disc, 10px white numeral. Dana's counts (sidebar) are
  graphite-200 pills with graphite-600 text. Use the product's badge.
- **K5 · L · ruling — Rename left the menu.** The ⋯ menu lost Rename when the
  title became editable in place; a keyboard or screen-reader user now has no
  discoverable rename path, and v1 had one. Put Rename back in the menu as a
  second route (DES-109's pattern: discoverable in the menu, fast in place).
  Ruling only because menu contents are close to normative copy.

### Sections, paragraphs, and the board (S-series)

- **S1 · H · polish — A third section-heading style.** Measured: section
  names are 14px/600 with a 24px chevron; the shell's list headings are
  16px/600 on a hairline; the Completed collapsible is 12px/500. Three
  surfaces, three answers to "what does a section look like." Sections adopt
  the shell's existing heading pattern — 16px on the hairline band — which
  also fixes their current problem of being visually weaker than the rows
  they contain.
- **S2 · H · ruling — Capture multiplied against W5.** Measured: three
  visible "Add task" rows on the seeded Wedding page (one per section plus
  the page's own), four the moment a third section exists. W5 demands one
  always-visible capture point per page; DES-133 retired the FAB *on that
  argument*. The design contradiction is real and mine. Direction to rule
  on: the page keeps **one** resting quick-add (bottom of the unsectioned
  list); a section's own add-row exists only while that section is hovered
  or focused, in the L4 reveal pattern V2 will design anyway. One capture
  point at rest, capture-in-context on intent.
- **S3 · H · polish — Structure can only be appended, never placed.** "Add
  section" and "Add a paragraph" only append at the bottom, and nothing can
  be reordered — in a product that already owns a pointer sort engine used
  at three levels. The Notion feeling the concept chases *is* positional
  insertion. Direction: an insertion affordance between blocks on hover (the
  quiet `+` line), and sections/paragraphs joining `use-sortable-list` so
  one gesture keeps meaning one thing.
- **S4 · M · polish — Deleting a section is silent.** One click, no undo
  toast, in an app whose completion flow modelled exactly this courtesy.
  Tasks surviving the delete makes it safe, not legible. Add the undo notice.
- **S5 · H · polish — The board is a sketch wearing a view's name.** No drag
  between columns (the one thing boards are for, and the engine exists);
  cards abandon the row's vocabulary (no checkbox, star, or overflow — so a
  task can be completed in list view but not board view); the ghost adds a
  task literally titled "New task" with no input, which will scatter junk
  tasks on every second click; Done is a *status* column standing among
  *section* columns without saying it is a different kind of thing. Either
  the board reaches feature honesty in F2b — drag via the engine, cards as
  compact TaskRow kin, per-column quick-add with a real input, Done visually
  distinct — or it demotes to a disabled control like Calendar. A view that
  half-works teaches distrust of every view.
- **S6 · L · polish — "Tasks" is a vague name for the unsectioned column.**
  "No section", set in the metadata voice, says what it is.

### Comments and conversation (M-series)

- **M1 · H · ruling — The thread cannot decide if it is comments or chat.**
  Rows are flat and Notion-like; the voice note is a pill bubble from a
  messenger; the composer is a rounded-full chat field (measured 18px radius
  — a value the token system does not contain). This is the visual echo of
  DES-134's open question, and the surface should commit *after* Imran rules
  commentary-versus-chat. Whichever way: **one metaphor.** As comments, the
  voice note flattens into a row (play control, inline wave, duration — no
  pill) and the composer becomes Dana's quiet field at radius-md; as chat,
  the page-end placement dies and bubbles own the panel.
- **M2 · M · polish — A new avatar scale nobody approved.** Measured: 24px
  thread faces, 20px replies, against the 28px token and the card's 16px
  `Face`. Pick from the system: 24 goes to the token's neighbours (16 in
  dense rows, 28 for identity) or earns a documented step. Fold into the
  same pass as DES-116's icon-scale discipline.
- **M3 · M · polish — Hover actions cover the content they act on.** The
  Reply/Delete overlay sits on top of the timestamp, so hovering to act
  hides *when*. Reserve the trailing slot the way the task row does; nothing
  in Dana's rows covers its own text on hover.
- **M4 · M · polish — The reply rail contradicts the card's no-rules
  ruling.** DES-099 removed every hairline from the card; the 2px reply rail
  reintroduces one inside it. Indent and the smaller face already say
  "belongs to" — DES-099's own mechanism. Drop the rail in the card; the
  folder page may keep it if the chat ruling lands that way.
- **M5 · M · polish — Recording wears the danger palette.** The recording
  bar is danger-tinted end to end, in a palette whose accessibility
  guardrails reserve danger for loss. Recording is not an emergency: keep
  the one universal red dot, set the bar in graphite, let the timer be the
  signal.
- **M6 · L · polish — Comment files are a third file-row style.** The
  Attachments block already renders files well (32px thumb, name, meta,
  action). Comment attachments reuse that row at thread scale instead of
  their own chips.
- **M7 · M · polish — Page-scale heading in card clothes.** The folder
  page's "Comments" heading is the card's 12px block label on a page whose
  sibling headings are 16px. Same fix as S1: the page's own heading tier.
- **M8 · L · polish — The panel covers the page bar and ignores Escape.**
  It should sit under the bar, close on Escape, and animate with
  `--duration-slow`/`--ease-enter` like every arriving surface.

### System, motion, and access (Y-series)

- **Y1 · H · polish — The token audit is the pass, not a footnote.** Every
  measured deviation in one sweep: 28px cluster controls, 18px composer
  radius, 24/20px avatars, 14px section heads, the filled badge, off-palette
  illustration colours. One session, zero new vocabulary at the end of it.
  This is F2a entire.
- **Y2 · M · polish — Motion is unevenly applied.** The panel slides, but
  covers pop, section collapse snaps, and the pickers appear at library
  defaults. Everything that arrives or changes size takes the motion tokens
  (DES-097); reduced-motion already collapses them for free.
- **Y3 · M · polish — Selection states disagree inside one popover.** The
  icon grid marks selection with a square border; the colour row with a
  ring; the cover grid with border-plus-ring. One selection language per
  popover.
- **Y4 · M · polish — Focus order and semantics on the new surfaces.** The
  view switcher is three loose buttons, not a radiogroup; the description
  editor has no announced state; the panel does not trap or return focus.
  The card earned these details in V3; the page inherits the standard.
- **Y5 · L · ruling — Board "Add task" and DES-095.** Even once S5 gives the
  board a real input, decide whether a board-created task opens renaming in
  place (the row's rule) or stays quiet. Small, but it is the kind of seam
  two surfaces drift apart on.
- **Y6 · M · polish — First-run invisibility.** A brand-new folder shows no
  hint that covers, icons, descriptions, sections or paragraphs exist; every
  affordance hides behind hover. The empty state advertises the page's own
  capabilities once — the DES-115 principle applied at page scale.

### Process (P-series)

- **P1 — F1 ran ahead of V1 again**, exactly as V3 did, and the plan already
  named that pattern. Recorded so the third session does not make it a
  tradition: **the measure ruling now blocks all F2 layout work.**
- **P2 — Concept sprawl was the right choice for one night and is the wrong
  place to stop.** DES-124's lab-then-extract rule applies from here:
  nothing in `folder-page-v2.tsx` graduates to `components/` until it
  survives this review's fixes and Imran's verdict.

## The shell sweep — added 2026-08-18, after Imran widened the lens

*"The shell still has missing and redundant things that need proper work."*
He was right, and the sweep found the shell's biggest defect hiding in plain
sight: **since V3 deleted the task form, most of the shell's openings opened
nothing.** Every finding below is fixed in the same round it was found, except
where marked.

- **SH1 · H — Dead interactions everywhere.** Clicking a row's body, a search
  result, the floating New task button, the sidebar's "Add task to folder",
  the calendar's cells and ghosts, and the card's full-screen icon all set
  state that nothing rendered. *Fixed:* the row's body now toggles its own
  card (DES-093 taken at its word — with a guard that skips clicks landing on
  real controls); every row-less path opens the task surface, and creation
  paths create-then-open; the card's full-screen icon is real where a surface
  host exists and honestly disabled in the lab.
- **SH2 · H — My Day had no capture.** The one list page a task could not be
  typed into; its capture was the dead button. *Fixed:* My Day and Important
  gained quick-add rows (Important's creates the task starred, which is what
  the page means), and the floating button retired everywhere except
  Planned, whose calendar has no blank row to stand in for it. W5 holds: one
  capture point per page, and now it works on every page.
- **SH3 · M — The heavy New folder button (review L7, standing).** *Fixed:*
  dropped to the ghost action tier — a quiet row, not a filled button
  shouting over the folders it serves.
- **SH4 · M — The approved preferences had no controls.** DES-113 (row
  density) and DES-121 (the clock) both say "a control in Settings"; neither
  existed. *Fixed:* Settings gained Appearance with both, as segmented
  groups wired to the real stores.
- **SH5 · M — Direct lucide-react imports.** DES-125's one-module rule,
  violated by seventeen files. *Fixed in three* (settings, My Day,
  Important, found while editing them); the remaining fourteen are a
  mechanical chore, enumerated and handed off rather than half-done —
  `task-row-baseline.tsx` stays exempt as the lab's frozen control.
- **SH6 — Still open, for V2 (Chrome):** the collapsed sidebar rail hides
  folder rows entirely (the pre-existing fault — worth solving *with* the
  new folder glyphs, which would make a collapsed rail genuinely legible);
  the page-bar strip's L3 ruling — note that the strip has since **earned a
  job as the tab strip**, which changes that conversation; and the
  main-page headers still wear the v1 composition beside the folder page's
  new one, which is the coherence pass V2 exists to make.

## The F2 plan — how these become a strong brand

Four passes, strictly ordered, each ending with Imran looking. Estimated as
one focused session each.

**First, V1's measure ruling (one sitting, not a session).** Build the two
candidates on My Day exactly as the plan's V1 already specifies, Imran picks,
the `--content-list`/`--content-form` tokens land. Everything below lays out
against the answer. *(Unblocks: H6, and every spacing decision in F2a.)*

**F2a — One voice.** The translation pass: every F1 surface rebuilt inside
Dana's existing vocabulary, adding nothing new. The cluster becomes a docked
40px header row in flat chrome (K1–K4); sections take the shell's heading
tier (S1, M7); avatars, radii, badges and selection states return to the
tokens (M2, Y1, Y3); recording de-escalates to graphite-plus-dot (M5);
comment files reuse the attachment row (M6); the header recomposes with
ghosts above the title and the mark at identity scale (H1, H2, H5); Rename
returns to the menu (K5). **Exit test: a diff of computed styles against the
tokens shows zero unexplained values.**

**F2b — Structure that works.** The interaction pass, where the sketches
become mechanisms: positional insertion between blocks (S3); sections and
paragraphs on the sort engine (S3); the capture consolidation W5 demands
(S2, with Imran's ruling); section-delete undo (S4); the board reaches
feature honesty or demotes (S5, S6, Y5) — drag between columns rides
`use-sortable-list`, cards become compact kin of `TaskRow`, per-column
capture gets a real input. **Exit test: every gesture that exists in the
list exists on the board, and nothing can be created that cannot be named.**

**F2c — The brand layer.** The pass that makes it *Dana's*: the cover system
regenerated from the mark's ribbon geometry in folder-colour tints, replacing
the clip-art tier (H4, with Imran's ruling); the cover's scrim and resting
affordances (H3); the motion sweep on every arriving surface (Y2, M8); the
first-run empty state that advertises the page (Y6, H1's visible-once rule);
the thread committed to one metaphor per DES-134's ruling (M1, M3, M4).
**Exit test: cover the text and the page still looks like the product that
drew the mark.**

**F2d — The verdict pass.** Imran walks all of it against this document,
finding by finding. What survives is extracted into `components/` under
DES-124 and its DES entries move to APPROVED; what does not is recorded and
reverted — the commit layering (`3b1f34a` → `d8cc803` → onwards) was built
for exactly that.

The rulings F2 needs from Imran, gathered in one place: **commentary or chat
(M1/DES-134) · whose identity a folder's look is (DES-130) · covers from the
mark's geometry (H4) · one capture point's shape (S2/W5) · the measure (V1)
· Rename's second route (K5) · board task naming (Y5).** Everything else is
polish and needs no permission.

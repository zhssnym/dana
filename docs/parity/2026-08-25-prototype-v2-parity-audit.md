# Design parity audit: prototype-v2 against the built client

- **Date:** 2026-08-25
- **Tree audited:** `v2-build`, at the S14 remainder's merge (`50a4298`) plus
  the Steward's `b2140fd` and `edb3c71`.
- **Governing rule:** RFC 0005 change control **item 19** makes parity with
  `docs/design/prototype-v2/` the release gate for 2.0.0, and **item 20**
  makes that directory the named source 11.13 binds every build session to.
  Where a numbered spec section and the prototype disagree, the section wins
  and the disagreement is an escalation, not a defect.
- **Location:** **ratified 2026-08-25 by the Integration Steward**, at
  `docs/parity/<date>-<subject>.md`, on the `docs/security/` precedent: a
  dated file so a second audit appends rather than overwrites, pointed at
  from RFC 0004's S17 rows so the next session finds it by protocol section
  2's rule rather than by luck. Recorded as RFC 0005 change control item 23.
- **Spot-checked before ratification**, this role never ratifying a record it
  has not tested: the search finding was re-derived independently and holds,
  `views/search.ts:146` returning `rows`, `folders`, `shelves` and `pages`
  while `SearchOverlay.tsx:159` consumes `results.data?.rows` alone and
  groups it by status. The `useFolders()` call at its line 160 is the
  sidebar's own folder list and is not the search response's folders, which
  is the one thing about that finding a reader is likely to misread.

## Why this file exists

The owner ruled on 2026-08-25, after seeing the v2 deploy at dana.so, that
every feature and frontend interaction designed in prototype-v2 must be
exactly the same in Dana v2. Item 20 records the mechanism that let the
client drift: no artifact ever named `prototype-v2/`, so sessions building
correctly from the rulebook were pointed at the v1 prototype. This file is
the measurement of the resulting distance, surface by surface, so the
remaining work is a checklist rather than an argument.

**What it is not.** It is not a judgement of any session's work: every
verdict below traces to a rulebook that did not name the source, and the
sessions that built these surfaces met the contract they were given.

## Method

Each product screen in `docs/design/prototype-v2/src/screens/` and each
significant component in `.../src/components/` was read for its header
(which names the DES decisions behind it) and its rendered structure, then
matched to its built counterpart in `app/src/client/` by concept rather
than filename. Verdicts: **PORTED** (built from prototype-v2, structure
matches), **PARTIAL** (some designed behaviours present, named ones
missing), **V1-ERA** (the built file ports the old prototype or predates
v2), **MISSING** (no counterpart). Design labs (`row-lab`, `row-concepts`,
`swatch-options`, `states-page`) are excluded: they are review surfaces,
not product.

## Findings, worst first

| Surface | Verdict | Missing behaviours (with DES refs) | Evidence |
| - | - | - | - |
| task-row | **V1-ERA** | Two densities (DES-113); expand-in-place opening the card (DES-093); a bare task costing one line (DES-111); due and repeat chips opening the shared pickers (DES-096, DES-123); rename in the row (DES-095); the "Open in" mode picker (DES-138); the row menu from the object contract (DES-201); the folder chip drawing the folder's chosen mark (DES-130); the star resting unfilled on Important (9.5 v2) | built `components/task-row.tsx:1-7` ("ported at P8R session R3"), :296-299, :281; proto `components/task-row.tsx:11-27`, :1754-1774 |
| task-card + task-surface | **MISSING** (v1 form survives) | The v2 card: five-chip header, collapsible Steps, Notes and Attachments, footer band, no Save, commit-as-made (DES-093/099/109/115). The surface's five homes: dialog, full screen, either edge, floating card, tab (DES-117, DES-136, DES-186). The task's conversation block (DES-129), whose server side already answers `?task=`. The footer Activity control and the full history sheet | built `components/task-card/chips.tsx:27-38` (names itself an interim), `components/task-form/`, `pages/TaskPage.tsx:9-11`; section 13 item 40 |
| Settings | **MISSING surface** | The pin list, "every view Dana has, native and saved alike, each with a pin switch", Desk locked (DES-153, DES-170, DES-222). Theme, density, clock and task-open controls. The machinery is live end to end (4.19 columns, server, sidebar honours pins); only the control surface is unbuilt | built `pages/SettingsPage.tsx:70-81` (three toggles); `shared/bundle.ts:38`; proto `screens/settings-screen.tsx:242-289`; RFC 0005 item 9 ("no package") |
| page-head, six place pages | **V1-ERA** | The v2 head: mark at identity scale above the title, an Add cover affordance, description as prose (DES-149's F3 rework). Today, Scheduled, Assignments, Important, All and Anytime still wear the composition the prototype retired, one click from the folder page that already wears the v2 one | built `pages/page-heading.tsx:1-9`, :55-71; proto `components/page-head.tsx` header |
| search-overlay | **V1-ERA client over a v2 server** | Results in four kinds, tasks, folders, shelves and page prose, plus step-title matching (7.18, 9.9 v2); the places offered as rows before anything is typed (DES-203). The server implements all of it; the overlay renders task rows only | built `components/search/SearchOverlay.tsx:158-176`; server `views/search.ts:79-94` |
| folder-page | **PARTIAL** | The board view entirely: no view strip, no window-bar filter, DES-132's two-column board with movable sections and per-column capture. Tasks drawn loose rather than under their sections (blocked on `section_block_id`). The conversation's four homes reduced to two (DES-135). A board card opening the task surface (DES-117) | built `pages/FolderPage.tsx:1-67`; proto `screens/folder-page-v2.tsx:1-25` |
| right-edge | **MISSING** | The panel that takes room from the page rather than covering it (DES-154, DES-186). Built conversation and sharing panels are overlay sheets; the published-width mechanism was never ported | built `pages/FolderPage.tsx:750-761`; proto `components/right-edge.tsx` header |
| folder-mark | **MISSING** | One resolver for a folder's chosen glyph and colour, everywhere it appears. Built: identity renders on the folder page and shelf rows only; the sidebar draws a colour dot, the task row a generic glyph, the tab menu a generic icon | built `components/folder-row.tsx:3`, `task-row.tsx:296-299`, `shell/TabStrip.tsx:211-224`; proto `components/folder-mark.tsx` |
| object-menu | **MISSING component, PARTIAL acts** | DES-201's contract that a folder's menu is the same menu wherever it is drawn. Built sidebar menu lacks Open in new tab, Copy link, Duplicate, Save as workflow, History, Add task; the group menu lacks History, Copy link, Duplicate, Save as workflow (DES-207). The folder page rebuilt most acts bespoke, so the two have already diverged | built `components/folder-row.tsx:293-318`, `shell/app-sidebar.tsx:607-624`; proto `components/object-menu.tsx` |
| shelf pages, reachability | **PARTIAL** | The page is a faithful S12 port, but nothing in the chrome reaches it: the sidebar group heading is a collapse trigger rather than a link (DES-207), the New-tab menu offers folders only against 9.1's "any shelf or folder", and there is no New shelf control | built `shell/app-sidebar.tsx:570-584`, `shell/TabStrip.tsx:211-224`; proto `components/folder-directory.tsx:205` |
| sidebar footer | **PARTIAL** | DES-209's ruled composition: New folder, then the row of three, New shelf, Import, Trash, with DES-216's width-aware label dropping. Built: New folder, then Trash, People and Settings as nav rows; New shelf and Import absent though shelves shipped at S12 | built `shell/app-sidebar.tsx:1175-1216`; proto `components/app-sidebar.tsx:699-828` |
| task-section | **PARTIAL** | Every section collapses (owner's ruling, 2026-08-22): built computed sections are non-collapsible. Section marks, a folder's glyph or a person's face inline in the heading, and the quiet count beside the name, are absent everywhere; `headingMedia` exists and nothing passes it | built `states/PageSection.tsx:72-100`; proto `components/task-section.tsx` header |
| trash | **PARTIAL** | The per-row countdown, who deleted it and when, the restore-destination sentence for a home that no longer exists, "Delete for ever" with its confirm, and kind as a glyph rather than as text | built `pages/TrashPage.tsx:98-141`; proto `screens/trash-screen.tsx` |
| conversation | **PARTIAL** | File attachments and voice notes on a comment (4.15, 4.16 kinds), and any client mount of a task's thread, whose server side is ready | built `components/page/ConversationThread.tsx:1-45` |
| task-board | **PARTIAL** | Geometry: the prototype is two columns per row, the owner having ruled the one-row board too short; built is a single horizontal scrolling row | built `views/TaskBoard.tsx:103`; proto `components/task-board.tsx:413` |
| Important | **PARTIAL** | The completed section that closes every page that lists tasks (owner, 2026-08-22); the star resting unfilled, deferred to the row work | built `pages/ImportantPage.tsx:18-21`; proto `screens/important-screen.tsx:21-25` |
| Scheduled | **PARTIAL** | The same completed foot. Otherwise ported: ladder headings, calendar zooms, view strip, dated quick-add | built `pages/ScheduledPage.tsx:1-29` |
| Assignments | **PARTIAL** | Person faces and counts on the group headings; the "from {creator}" half, blocked on the `created_by` widening | built `pages/AssignmentsPage.tsx:87-96` |
| transactional email | **V1-ERA, and a conflict rather than a port** | Three designed HTML emails against a built plain-text `{subject, text}`. **10.7 fixes "plain, short, one action link each"**, so this is a prototype-versus-numbered-section disagreement and needs a ruling, not a session | built `server/notify/templates.ts:30-33`; proto `screens/transactional-email-screen.tsx`; section 13 item 34 |
| help-sheet | **MISSING** | The account menu's Help entry and the shortcuts sheet behind it. Every shortcut it would list is already wired in the built client, so its content would be true today | built `shell/app-sidebar.tsx:945-962`; proto `components/help-sheet.tsx` |
| public legal pages | **MISSING, and live-broken** | `/privacy` and `/terms` are linked from the production landing footer and have no route on either side, so both render Dana's own not-found page. Copy approved at review B1 (DES-032), with the note that its facts are re-verified at port | built `pages/LandingPage.tsx:949-962`, `Router.tsx`; proto `screens/public-legal-screen.tsx:1-10` |
| person-face | **MISSING** | The deterministic per-person tint, one person one colour everywhere, over the ten token swatches. Built avatars are neutral initials | built `components/task-row.tsx:310-317`; proto `components/person-face.tsx` |
| grouped surfaces | **PORTED** | DES-156's grouping replacing a page's arrangement, `?view=` seeding, the board reading the same groups. Only the heading marks are missing, with task-section above | built `views/grouping.ts:1-27` |
| task-filters | **PORTED** | The whole rebuilt model: multi-value assignee including Unassigned, due presence, ranges and custom, repeating, group-by, sort-by, removable chips, Save as view writing 4.19, which is better than the prototype's localStorage. Created-by alone is absent, blocked on the widening | built `views/filter.ts:1-31`, `views/FilterControl.tsx:1-23` |
| tab strip | **PORTED** | DES-217 in full: every tab equal and closable, drag on the one engine, keyboard reorder, New tab. The v1 `components/page-bar.tsx` survives as a dead export and is a deletion candidate | built `shell/TabStrip.tsx`, `shell/tabs.ts:8-13` |
| window bar | **PORTED** | DES-139's shape, chips at the left, the portal at the right end, the Activity line | built `shell/WindowBar.tsx:1-33` |
| sidebar directory and drag | **PORTED** | DES-171's three gestures including the 1.5 second hold handing to the group dialog, the one-list directory, pinned saved views, the bell beside Search (DES-226) | built `shell/app-sidebar.tsx:660-700`, `shell/library-drag.ts` |
| Desk, Today, All, Anytime, Abandoned, Done | **PORTED** structurally | The v2 place-page model complete: spine, grouping, board, filter, the fact, the recap; Done's day groups, the G-SERIES un-complete confirm, the no-capture rule; All's two halves. Their visible deficits are the shared ones above, the row, the head and the sections | built pages' own headers |
| landing, invite gate, unverified email | **PORTED** | Adopted 2026-08-24 from `landing-screen.tsx` with its departures named | built `pages/LandingPage.tsx:1-60`, `pages/InviteGate.tsx:1-12` |
| people, sharing panel, quick-add, dialogs, state patterns, undo bar, notifications bell, blocks editor, icon picker, calendar | **PORTED** | The blocks editor covers 4.17 in full; block pointer-drag was deliberately parked for the one drag engine and recorded | respective files |

## The five gaps that most change what a person sees on first open

1. **Every task, everywhere, is the v1 row, and opening one gets the v1
   form.** The most repeated element in the product and its most used
   surface are both the old design with a chip strip grafted above. Already
   ruled release-blocking (item 19, section 13 item 40).
2. **The six system pages open on the v1 header**, one click from the folder
   page that already wears the v2 identity head, which is exactly the
   inconsistency the F3 rework existed to remove.
3. **Folder identity does not travel.** A person picks a house for Home and
   a car for Travel and then meets generic glyphs in the sidebar, in every
   task row and in the tab menu. This is the owner's own recorded complaint,
   fixed in the prototype by `folder-mark` and unfixed in the build.
4. **Search finds only tasks**, while the server already answers folders,
   shelves, page prose and step titles. The one control whose job is finding
   things cannot find most things.
5. **The folder page has no board and its panels cover it** rather than
   taking room at the right edge, and its tasks ignore their sections.

## What blocks whom

- **Two frozen section 7 widenings**, `section_block_id` on the folder read
  and `created_by` on TaskCard, are approved by item 19 and not enacted.
  Until the Steward writes their Replace units, the folder page cannot draw
  tasks under their sections and Assignments cannot carry its "from" half.
- **The email row is a conflict, not a port.** 10.7's "plain, short, one
  action link each" and the prototype's designed HTML cards disagree, and
  DES-034 is still OPEN in the design contract. It needs a ruling before any
  session can start.
- Everything else on this list is client-only work against endpoints that
  already exist and pass their criteria.

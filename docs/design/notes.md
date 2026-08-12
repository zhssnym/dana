# Dana desktop UI implementation notes

Status: **Session 8 approved final handoff, 2026-08-11**  
Audience: **Hassan — production frontend integration**  
Scope: **desktop at 1440px; mobile application UI deferred**

## Package purpose

The prototype is a visual and interaction contract built with hardcoded fixtures.
It demonstrates how the authoritative Dana v1 product specification should be
assembled with shadcn/ui. It does not contain API calls, authentication, email
delivery, persistence, service-worker logic or backend architecture.

Run it from `prototype/` with `npm install` and `npm run dev`. The production
build check is `npm run build`.

## Implementation foundation

- React 19, TypeScript, Vite, Tailwind CSS 4.
- shadcn `base-mira`, using Base UI primitives and CSS variables.
- Lucide is the only interface icon set.
- Inter is locally packaged through `@fontsource-variable/inter`; do not fetch a
  font from a third-party CDN.
- `prototype/src/styles/tokens.css` is the single visual-token source. Do not
  replace its values with shadcn preset defaults.
- Light theme only in this handoff. Dark mode remains outside the approved scope.
- The supplied Dana Mark is locked. Do not redraw it or add an outline, ring,
  stroke, shadow or decorative container.

## Desktop shell and scrolling

- Target viewport: 1440px. The prototype intentionally has an 1180px desktop
  minimum and is not a mobile implementation.
- Sidebar default width is 256px, resizable from 224px to 360px, persisted on the
  client, and collapses to a 56px rail.
- The page shell is fixed to the viewport. The main page region owns vertical
  scrolling; the page bar, sidebar, banners and floating New task action remain
  fixed in their shell positions.
- TaskForm owns its own vertical scroll and may be resized horizontally on edit.
- Search results, sharing content, selects and menus scroll inside their bounded
  floating surfaces.
- The 24px page strip is a static current-page indicator, not a tab system.

## Density and repeated behavior

- Sidebar navigation, group and folder rows are 32px high. Their hover/selected
  surface is 30px high with no structural row gap, leaving exactly 2px of visible
  separation between adjacent surfaces.
- Sidebar functional glyphs use one 16px Lucide box and a 1.75px stroke. The
  collapsed rail centers complete 32px cells on the Dana Mark axis; the 24px Mark
  and 20px account avatar are deliberate identity exceptions.
- `Folders` is an 11px semibold section label. Navigation and group labels are
  13px semibold; folder labels are 13px medium and become semibold when selected.
  The New folder action uses the same explicit 13px semibold action tier.
- TaskForm property controls and step rows are 36px high. Its editable title is
  20px/28px semibold, property labels are 13px medium, and values/actions are
  14px. Standard buttons and major controls remain 40px high. TaskRow is the
  deliberate 44px exception.
- TaskRow uses a full-row Graphite 100 hover/focus surface. Its title never moves.
  The important star and overflow menu reveal at the far-right edge after
  metadata; an active important star remains visible.
- Completed tasks use a filled neutral checkbox, quieter text and metadata, with
  no strike-through or extra status chip. Abandoned tasks retain the specified
  strike-through, chip and Restore action.
- Folder and group glyphs default to neutral graphite. A member-selected personal
  folder color remains supported. A group glyph stays Graphite 500 when expanded
  or collapsed and becomes Graphite 900 only when that group or one of its child
  folders is current. Expand/collapse state alone never implies selection.
- Empty states use one restrained contextual Lucide icon. The empty calendar is
  the exception and remains a bare grid.

## Motion

Motion confirms state change and never decorates idle content:

- Menus, selects and popovers: approximately 100ms fade/scale.
- Dialog overlays and dialogs: 150ms.
- Sidebar, sheets and TaskRow layout transitions: 200ms.
- Folder task completion: checkbox confirmation and fade, then a 240ms collapse.
  The monochrome completion confirmation remains available for five seconds and
  provides Undo.
- Avoid spring, bounce, parallax and continuous animation. Production should
  suppress nonessential transitions when the user requests reduced motion.

## Important product-to-UI mappings

- Dana folders are flat. Sidebar “parents” are the current member's personal
  `folder_members.label` values, not folder records.
- `Move to group` is a fast surface for that existing membership preference. It
  sends `PATCH /api/v1/folders/:id/my-membership` with
  `{ label: destination-or-null, color: current-my_color }` and uses the returned
  Folder object as truth. It changes no tasks, sharing or other member's labels.
- Folder-group create, rename and delete use the same endpoint per affected
  folder. A new group must start with at least one folder; rename rewrites the
  child labels; delete clears them and never deletes folders or tasks. There is
  no empty or independently stored parent-group object. If a production batch
  partly fails, refresh `GET /folders` and use the approved failed-write feedback.
- A Folder page has one open-task list with a due-presence filter rather than
  permanent Scheduled/Unscheduled layout sections. This approved presentation
  amendment is DES-062 and requires Hassan's acknowledgement during integration.
- Search remains the v1 task-title-and-notes endpoint. Folder, label and step
  search is the future proposal DES-073.
- Task and step drag reordering is not v1. Preserve server-defined task ordering
  and the specified step up/down controls; see DES-071.
- Edit-mode Task history may show creation and current completion provenance from
  existing fields. Immutable reopen/delete history requires the future audit model
  in DES-076.
- Offline mode is read-only feedback, not queued mutation support.

## PWA and assets

- `theme_color`: `#FFFFFF`.
- `background_color`: `#FFFFFF`.
- Approved icon exports are `prototype/public/dana-icon-192.png` and
  `prototype/public/dana-icon-512.png`, rendered directly from the locked SVG.
- Use the browser's native install affordance. Do not add a custom install flow.
- The prototype intentionally does not implement the production manifest, service
  worker, caching strategy or `/app` launch routing.

## Approved reference exports

`docs/design/screens/` contains sixteen 1440×900 reference images covering the
approved core, secondary, public/auth and system language. The reusable
foundation, component-state and shell references remain alongside them in
`docs/design/`.

The runnable prototype is authoritative for interaction. Static images are
comparison references, not separate specifications.

For deterministic comparison exports, append `handoff=clean` to a prototype
URL without an `explore` parameter. This ignores fixture-only sidebar width,
created-folder and folder-group overrides without clearing the browser's saved
prototype state. Interactive review URLs include `explore`, so created groups
continue to exist after navigating or opening a folder.

## Items Hassan and Imran must still resolve

- DES-032: real Privacy and Terms destinations.
- DES-033: product location for sent bare and historical invitations.
- DES-034: exact transactional-email subjects, bodies and action destinations.
- DES-035: list-truncation notice copy and placement.
- DES-084: whether owners receive Leave/ownership-transfer UI in addition to the
  currently specified owner Delete action.

Do not silently decide these during frontend integration. The future proposals
DES-054, DES-055, DES-071, DES-073, DES-076 and DES-089 are not v1
implementation work.

## Session 8 QA record

- Production build: passed.
- Automated 1440px sweep: 32 representative routes passed with visible content,
  no broken images and no horizontal overflow.
- Approved exports: sixteen clean PNGs verified at exactly 1440×900; Dana PWA
  icons verified at 192×192 and 512×512 RGBA.
- Session 7 interaction checks remain valid for completion/Undo, folder creation,
  Search keyboard entry, TaskForm steps, typed account deletion, connection
  removal, recurring un-complete confirmation, permission variants, live folder
  deletion counts and profile-menu Settings navigation.
- Session 8 additionally verified `Move to group` updates the sidebar immediately
  and persists through reload in the fixture-only prototype.
- Folder-group follow-up QA verified create-with-folder, rename-across-children
  safe delete-to-ungroup and persistence after opening a child folder; the
  production build passed afterward. Screenshot-only clean mode remains isolated
  from interactive exploration state.
- Final sidebar QA verified the 32px/30px row geometry, exactly 2px between
  adjacent hover surfaces, Graphite 500/900 group state rule, consistent 16px
  functional icons and zero horizontal center offset for every collapsed-rail
  cell against the Dana Mark axis.
- Extracted handoff package: fresh `npm install` completed with zero reported
  vulnerabilities and `npm run build` passed. Vite's chunk-size warning is
  non-blocking for this design prototype.

Production API, auth, reminder delivery, PWA installation and email-client behavior
must still be verified in Hassan's implementation environment.

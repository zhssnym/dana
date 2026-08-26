# Dana UI design contract

Status: **v1 Sessions 1-8 APPROVED and shipped; v2 refresh register folded 2026-08-24, approved through DES-222**  
Scope: **desktop UI design and handoff at 1440px; mobile UI deferred**  
Implementation status: **v1 IN PRODUCTION AT 1.0.0; v2 EXISTS AS `prototype-v2` ON FIXTURES; THE v2 PORT AWAITS THE SPEC RFC AND RFC 0004**

## Current delivery scope

Imran approved the product contract on 2026-08-10 and limited the active UI
delivery to desktop at 1440px. Mobile application UI, phone navigation and
detailed responsive transformations are deferred until a later phase. They
remain product requirements in `screen-registry.csv`; this decision changes the
current design workload, not Dana's authoritative specification.

Transactional emails remain responsive because that is part of their delivery
requirement, but no separate mobile application screens or 390px exports will be
created in the current handoff.

## Product summary

Dana is an installable, online-only collaborative task application. Google
sign-in creates one non-deletable Inbox. Every task lives in exactly one flat
folder, and folders are the only shareable unit. Undated tasks belong to Tasks;
dated tasks belong to Planned. My Day, Important, All and Done are views over the
same task rows.

My Day contains assigned tasks due today or overdue plus tasks the viewer manually
pulls in. Unfinished items carry forward. Tasks can have notes, steps, importance,
an assignee, recurrence and one email reminder. Sharing uses connections and email
invites. Dana v1 has no AI, chat, integrations, realtime collaboration,
notification center or offline editing.

## Authority

1. Current human-approved decisions lock Dana's name, shadcn/ui foundation, Dana
   Mark geometry and dark monochrome direction.
2. `docs/spec/` defines product behavior. Section 9 contains normative UI copy;
   sections 4 and 7 are frozen.
3. Section 12 is the definition of done and currently ends at AC-132.
4. Accepted RFC 0001 is delivery history and planning, not current product authority.
5. `brief.md` is the designer-facing summary; deeper specification detail wins.
6. No implementation status is inferred without the implementation repository.

## Approved brand assets

Imran supplied `Dana_Mark_v1.zip` on 2026-08-10 and confirmed that the mark is
final. The package contains two approved 100pt SVG masters:

- `Dana_Mark_Primary_Dark.svg` - default on white and light neutral surfaces.
- `Dana_Mark_Reverse_Light.svg` - use on dark and near-black surfaces.

The two files match the previously reviewed master geometry byte for byte. The
logo-family note records the assets as finalized and approved for Dana v1. The
geometry, internal symbol, monochrome colors and proportions must not be changed.
Render the supplied asset cleanly: do not add a decorative outline, ring, stroke
or shadow around the mark on application, public, invitation or email surfaces.

## Reusable component contract

| Component | Required variants or responsibilities |
| --- | --- |
| AppShell | desktop sidebar now; mobile navigation later; online/offline and update states |
| Sidebar | 3 to 6 system pages, Inbox, labeled/unlabeled folder groups and counts |
| SidebarHeader | locked Dana Mark, product name, search entry and collapse control; collapsed order stays Mark, collapse, Search |
| PageBar | one static current-page label with its approved icon treatment; not a multi-tab system |
| TaskRow | pending, overdue, completed, abandoned, important, other assignee, unassigned, pulled, invite pending, steps and recurring; stable title alignment with right-edge hover/focus actions per DES-085 |
| TaskForm | create/edit, collapsed/expanded, dependencies disabled, single/shared folder, validation and invitation state |
| QuickAdd | Inbox, folder group, Planned date, folder scheduled and unscheduled contexts |
| DueTreatment | undated, future, today, overdue, all-day and timed |
| AssigneeTreatment | viewer, other member, unassigned, hidden single-member and pending invite |
| RecurrenceTreatment | configured rule, current occurrence, future ghost, exhausted rule and successor warning |
| ReminderControl | disabled, date-only time, timed offset and validation states |
| StepEditor | empty, populated, done, reorder and 50-step cap |
| FolderRow | Inbox, labeled, unlabeled, shared, selected and count/no-count |
| MemberList | owner, member, removable, self/leave and pending invite |
| EmptyState | page-specific normative copy and bare calendar grid |
| SkeletonList | grouped and ungrouped page loading |
| SearchResult | pending, abandoned, completed, dated and undated |
| CalendarTaskEvent | all-day, timed, completed, abandoned, overdue and ghost |
| FeedbackMessage | offline banner/toast, generic failure, update and truncation notice |
| ConfirmDialog | task, folder, member/connection and account variants |
| TransactionalEmail | invite, share grant and reminder |

## High-risk interaction rules

| Rule | Required UI behavior | Authority |
| --- | --- | --- |
| Due time, reminder and repeat require a due date | Remain visible but disabled with `Set a due date first`; enable immediately when dated | 9.3; AC-092 |
| Clearing a date with a rule or reminder | Warn first; clear due time, repeat and reminder together | 8.4; 9.3; AC-028; AC-092 |
| Single-member folder | Hide assignee; server forces the sole member | INV-5; 9.3; AC-094 |
| Multi-member folder | Show only folder members plus Invite by email | 9.3; AC-094 |
| Move loses assignee | Show named warning before the move | 7.6; 9.3; AC-030 |
| Inaccessible resource | Never reveal existence; use the same 404 as a missing resource | 5.4; 7.0; 10.2; AC-102 |
| Owner-only folder action | Hide unavailable client controls; server remains authoritative | 5.4; 9.6 |
| Default Inbox | Never share or delete; rename remains allowed | INV-2; INV-3; 5.4 |
| Completed task | Faded and checked; appears in Done and calendar, not open lists | Q3C; Q6 |
| Abandoned task | Faded, struck, labelled Abandoned and restorable; absent from My Day and Done | Q1; Q6; AC-097 |
| Recurring un-complete/restore with successor | Confirm successor and its edits will be deleted | 5.1; 9.5; AC-079 |
| Pulled My Day task | Show remove treatment only when the pull is why it appears | Q1; 9.4; AC-047 |
| Assignment to a non-member | Connected target joins and is assigned; unconnected target receives invite while assignment stays unchanged | 8.7; AC-061; AC-065; AC-066 |
| Invite resent within 24 hours | Disable Resend and show `Resent recently` | 5.2; 9.6; AC-068 |
| Loading | Skeleton rows, never page spinner | Section 9; brief section 4 |
| Empty | Use normative page copy; calendar uses a bare grid; empty recap hides | Q1-Q7; section 9 |
| Offline | Shell remains; banner persists; reads require network; writes fail and are not queued | 9.1; 10.6; AC-091 |
| Truncated open list | Show a visible notice for the response-level 1000-row cap | Section 6; AC-129 |
| Hidden optional page | Remove it from navigation only; direct URL still works | 7.2; 9.1; AC-095 |
| Status meaning | Never communicate overdue, completed or abandoned using only color | Brief section 4; AC-097 |

## Design decision register

Statuses: `OPEN`, `PROPOSED`, `APPROVED`, `LOCKED`, `SUPERSEDED`.

| ID | Decision | Status | Source or gate |
| --- | --- | --- | --- |
| DES-001 | Product name is Dana | LOCKED | Imran; specification |
| DES-002 | shadcn/ui is the UI component foundation | LOCKED | Imran; 11.4 |
| DES-003 | Prototype uses Vite, React, TypeScript and Tailwind CSS 4 | LOCKED | 11.4; brief 3 |
| DES-004 | Dana Mark geometry cannot be redrawn or altered | LOCKED | Imran; master assets |
| DES-005 | Dana Mark direction is dark monochrome | LOCKED | Imran |
| DES-006 | The logo is not reopened during application design | LOCKED | Imran |
| DES-007 | Dana v1 has no AI/chat surface | LOCKED | 1.3; 9.2 |
| DES-008 | Dark mode is out of scope for v1 | LOCKED | Brief 2 and 8 |
| DES-009 | Desktop sidebar is persistent; phone navigation collapses | LOCKED | 9.1; brief 4 |
| DES-010 | Product review widths are 390px and 1440px; the current delivery uses only 1440px | LOCKED | Brief 3, 4 and 9; Imran deferred mobile on 2026-08-10 |
| DES-011 | Accessibility floor: 4.5:1 text contrast, visible focus, 44px targets and non-color cues | SUPERSEDED | Superseded by DES-050 for the desktop-only handoff |
| DES-012 | Loading uses skeleton rows rather than spinners | LOCKED | Section 9; brief 4 |
| DES-013 | Prototype uses fake data and no backend/API/auth implementation | LOCKED | Brief 3 |
| DES-014 | Compact, content-first Notion-inspired hierarchy with ChatGPT-like calmness and restraint, without copying either brand | APPROVED | Imran; Session 2 direction decision, 2026-08-10 |
| DES-015 | Inter Variable with 400/500/600 weights; 24/32 page title, 16/24 section heading, 14/20 task/body and controls, and 12/16 metadata | APPROVED | Imran; Session 2 approval, 2026-08-10 |
| DES-016 | Graphite neutral ramp plus restrained cobalt interaction accent; accent is reserved for actions, links, selection, focus and checked controls | APPROVED | Imran; `tokens.css`; Session 2 approval, 2026-08-10 |
| DES-017 | Separate success, warning, danger/overdue and information palettes; status always has a non-color cue; warning is never an amber button with white text | APPROVED | Imran; `tokens.css`; Session 2 approval, 2026-08-10 |
| DES-018 | Ten folder swatches: clay, ochre, olive, fern, teal, sky, cobalt, violet, plum and rose; every swatch travels with a visible folder name | APPROVED | Imran; `tokens.css`; Session 2 approval, 2026-08-10 |
| DES-019 | Compact 4px-base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 and 64px; standard interactive targets remain 44px | SUPERSEDED | Superseded by DES-050 for the desktop-only handoff |
| DES-020 | Radius scale 4/6/10/14px plus full; borders structure pages; elevation 1 is for menus/popovers/toasts and elevation 2 for dialogs/confirms | APPROVED | Imran; `tokens.css`; Session 2 approval, 2026-08-10 |
| DES-021 | Lucide is Dana's single application icon family: 16px for metadata/chips, 20px for controls/navigation/actions, 1.75 stroke, round caps and joins, no library mixing | SUPERSEDED | v2: animated Lucide via one icon module, DES-125/DES-162; sizes and stroke survive |
| DES-022 | Dana motion confirms state change without decorating idle content: menus/selects/popovers approximately 100ms; dialogs 150ms; sidebar/sheet/TaskRow layout 200ms; folder completion collapses after 240ms and keeps Undo for five seconds; no spring, bounce, parallax or continuous motion; production suppresses nonessential transitions for reduced-motion users | APPROVED | Consolidated from the approved prototype in Session 8; implementation reference in `notes.md` |
| DES-023 | The desktop shell uses a Graphite 50 sidebar with the Dana Mark, Search and collapse controls in its header; a single-current-page 40px page bar; a maximum 1120px content area; and a scrolling folder region while New folder and the footer stay available. Active navigation keeps the Graphite 100 row surface and changes its label/icon to Graphite 900 without an accent stripe | SUPERSEDED | v2: the 800px reading measure (DES-135), the window bar (DES-139) and the tab strip (DES-217); the sidebar's resize range survives as DES-053 |
| DES-024 | Mobile navigation pattern | OPEN | Deferred beyond the current desktop handoff |
| DES-025 | The reusable desktop TaskForm uses a resizable shadcn right-side `Sheet` (480-720px, 540px default) for both create and edit; the title is the editable heading, Important stays inline at the right, edit-only destructive actions live in overflow, properties use compact rows, Notes is last, and Cancel/Escape replace a competing close icon. Phone presentation remains deferred | SUPERSEDED | v2: the form is deleted — a task is its row, card and page (DES-093, DES-136); the card carries the fields (DES-118) |
| DES-026 | Desktop sharing uses a 440px shadcn Sheet with member, connection, email-invite and pending-invite states; phone presentation remains deferred | APPROVED | Imran continued beyond the Folder/sharing review in Session 6, 2026-08-11 |
| DES-027 | Detailed responsive transformations | OPEN | Deferred beyond the current desktop handoff |
| DES-028 | Rich empty-state illustration approach beyond restrained contextual icons | SUPERSEDED | DES-048 approved the restrained contextual Lucide treatment; no illustration system is required for this handoff |
| DES-029 | PWA theme and background colors are both `#FFFFFF` for the v1 light shell | APPROVED | Imran; Session 2 approval, 2026-08-10; verify manifest in Session 8 |
| DES-030 | 192px and 512px RGBA PWA icons are direct raster exports of the locked primary Dana Mark SVG; geometry, path proportions and monochrome fills remain unchanged | APPROVED | Session 8 exports visually inspected and dimension-verified on 2026-08-11 |
| DES-031 | People is reached from the sidebar footer immediately above Settings | APPROVED | Imran; Session 4 approval, 2026-08-11 |
| DES-032 | Privacy and terms destinations | OPEN | Before Session 7 |
| DES-033 | Location of sent bare and historical invites | OPEN | Before Session 7 |
| DES-034 | Subjects, bodies and action destinations for transactional emails | OPEN | Before Session 7 |
| DES-035 | List-truncation notice copy and placement | OPEN | Before Session 6 core task-list screens |
| DES-036 | Failed writes use one compact elevated Graphite 900 toast with a restrained Lucide cue, exact specification copy and dismiss control; rate limits use the same treatment and display the server-provided Retry-After duration. Page-load errors pair the exact generic message with an inline Retry control | APPROVED | Imran accepted the Session 7 system/PWA group on 2026-08-11; exact-copy and dismiss behavior passed |
| DES-037 | Current UI delivery and Hassan handoff are desktop-only at 1440px; mobile UI is deferred, not removed from Dana v1 | APPROVED | Imran, 2026-08-10 |
| DES-038 | TaskRow uses a minimum 72px row with a two-line title/metadata layout | SUPERSEDED | Rejected during Session 3 shadcn/Notion audit |
| DES-039 | Inactive star and overflow actions appear inline after the title on hover or focus; active importance and Restore remain visible; My Day removal is revealed on hover, focus or overflow | SUPERSEDED | Star and overflow placement superseded by DES-085; persistent-state and My Day removal behavior remain applicable |
| DES-040 | Abandoned rows use a status glyph, strike-through, `Abandoned` chip and persistent `Restore` action | APPROVED | Imran; Session 3 approval, 2026-08-10 |
| DES-041 | Dana's fresh frontend setup uses shadcn `base-mira` with Base UI primitives, CSS variables and Lucide; approved Dana tokens replace preset theme values | APPROVED | Imran; Session 3 approval, 2026-08-10 |
| DES-042 | TaskRow is a 44px compact single-line row with full-row hover/focus; optional metadata forms one automatic group anchored to the right and grows leftward; star and overflow utilities appear inline after the title | SUPERSEDED | Superseded by DES-085 after the final TaskRow action-placement comparison, 2026-08-11 |
| DES-043 | The Session 3 Notion references inform only list rhythm, automatic trailing metadata and action disclosure; Dana does not copy Notion's shell, tabs, typography, colors, icons, branding, drag handle or unrelated surfaces | APPROVED | Imran, 2026-08-10 |
| DES-044 | Completed TaskRow uses a neutral monochrome filled checkbox, graphite-600 title, quieter metadata, no strike-through and no extra status chip | APPROVED | Imran selected Option D2, 2026-08-10 |
| DES-045 | TaskRow hover and focus background use the existing Graphite 100 (`#EBECEE`) token for clearer contrast from the white row | APPROVED | Imran, 2026-08-10 |
| DES-046 | Inline TaskRow actions use Graphite 200 (`#DDDEE2`) on hover/expanded state | SUPERSEDED | Rejected during Session 3 final review |
| DES-047 | Inline TaskRow actions have no separate pointer-hover fill; the Graphite 100 full-row hover carries the pointer state, while individual keyboard focus rings remain visible | APPROVED | Imran; Session 3 approval, 2026-08-10 |
| DES-048 | Reusable empty states may use one restrained contextual Lucide icon in Graphite 400; the icon supports rather than replaces the authoritative copy, and the calendar empty state remains a bare grid | APPROVED | Imran; Session 3 approval, 2026-08-10 |
| DES-049 | The desktop floating add action is a labelled 40px Graphite 900 `New task` button at bottom right with elevation 1; it is absent on Done | SUPERSEDED | v2: the button retires wherever a capture row or column exists and survives on exactly three pages (DES-133, DES-182) |
| DES-050 | The desktop handoff uses the approved 4px-base spacing scale and 40px compact control targets; TaskRow retains its separately approved 44px row geometry; 4.5:1 text contrast, visible focus and non-color cues remain required | APPROVED | Imran; Session 4 refinement, 2026-08-11 |
| DES-051 | The Folders category uses the Lucide `Folders` icon and folder rows use the colored Lucide `Folder` icon | APPROVED | Imran; Session 4 approval, 2026-08-11 |
| DES-052 | The persistent New folder action is a centered 40px soft Graphite 100 button with 10px radius and Lucide `FolderPlus`; it has no adjacent separators and uses no unreliable browser-reserved shortcut | SUPERSEDED | v2: one primary New folder over a row of three placed by role — New shelf, Import, Trash (DES-209, DES-221) |
| DES-053 | The desktop sidebar may be resized from 224px to 360px, defaults to 256px, remembers the chosen width locally, and preserves it through collapse/expand; the 56px collapsed rail is unchanged | APPROVED | Imran; Session 4 approval, 2026-08-11 |
| DES-054 | A user-selectable per-folder Lucide icon or emoji picker is a future proposal, not Dana v1 scope; it requires data-model and API support for persistence before design or implementation | PROPOSED | Deferred for a later version; discuss with Hassan before reopening |
| DES-055 | Notion-like custom task fields, file or image attachments, and arbitrary content blocks are a future product proposal, not Dana v1 scope; they require explicit product rules plus data-model, API, storage, permission and security support | PROPOSED | Imran idea recorded during Session 5; discuss with Hassan before any design or implementation |
| DES-056 | Labeled folder-group parents use a 14px semibold label and Graphite 700 emphasis; their 13px child rows use compact indentation and rounded 1px Graphite 400 elbow connectors visible only while the parent is expanded. Child hover, focus and active surfaces begin after the connector instead of extending to the parent edge. The approved 40px sidebar rhythm remains unchanged | APPROVED | Imran; Session 5 shell refinement, 2026-08-11 |
| DES-057 | Labeled folder-group parents use a larger Lucide `FolderOpen` icon while expanded and `Folder` while collapsed, with each group assigned a distinct existing Dana folder-palette color in the UI fixture; production persistence or customization is not implied | APPROVED | Imran; Session 5 shell refinement approval, 2026-08-11 |
| DES-058 | My Day uses a quiet date header, an `Important only` switch, separate `Carried over` and `Today` groups, and a collapsed `Done today (N)` recap. It reuses the approved 44px TaskRow and does not introduce card containers around task groups | APPROVED | Imran; Session 6 My Day approval, 2026-08-11 |
| DES-059 | Tasks follows Q2 directly: Inbox rows come first without a heading, remaining non-empty folders appear as alphabetized folder-headed groups, and each group ends with a quiet inline QuickAdd that creates an undated task in that folder or escalates to the full TaskForm | SUPERSEDED | v2: the Tasks page is retired by the navigation model — Desk and Anytime absorb it (DES-152); spec RFC owed |
| DES-060 | A shared Folder page uses permanent Scheduled and Unscheduled visual sections with separate contextual QuickAdds | SUPERSEDED | Superseded by DES-062 after Imran rejected the permanent section hierarchy |
| DES-061 | Completing a task on a Folder page checks and fades the row before a 240ms collapse, immediately updates the header ratio, briefly emphasizes the collapsed Completed count, and shows a five-second monochrome `Completed: [task]` confirmation with Undo. Completed remains collapsed by default as required by Q7 | APPROVED | Imran continued beyond the Folder completion review in Session 6, 2026-08-11 |
| DES-062 | Replace the permanent Scheduled and Unscheduled visual sections on every Folder page with one open-task list and a compact filter offering `All open tasks`, `With due date`, and `Without due date`. The default concatenates the API's scheduled and unscheduled arrays without client re-sorting; Completed remains separate and collapsed. This deliberately amends Q7 and 9.6 presentation and reduces their two contextual QuickAdds to one context-aware QuickAdd | SUPERSEDED | v2: the folder page rebuilt whole — cover, mark, sections, blocks, one shared filter (DES-130-133, DES-140, DES-165-169) |
| DES-063 | Planned uses a persistent List/Calendar switch. List is the server-ordered Q3 TaskRow sequence with one dated QuickAdd. Calendar defaults to month and offers day/week/month zoom, previous/next/today controls, a bare grid, all-day-before-timed event ordering, truthful completed/abandoned records, and outlined recurrence ghosts that open the current task with the normative banner. Month cells show at most two events plus a `+N more` control that opens Day view, preserving a clear bottom safe area above the floating New task action | APPROVED | Imran; Session 6 approval, 2026-08-11 |
| DES-064 | The persistent `New folder` sidebar button opens a focused shadcn dialog containing only the v1 API-supported folder name field, validates the 1-100 character contract, adds the created folder to the alphabetized unlabeled folder list, and immediately opens its reusable empty Folder screen with an inline QuickAdd. Label, color and sharing remain post-creation actions | APPROVED | Imran; Session 6 approval, 2026-08-11 |
| DES-065 | Edit-mode TaskForm places the standard completion checkbox immediately left of the editable title for pending and completed tasks; create mode has no completion control, completed uses the normative `Mark as not done` label, and abandoned tasks continue to use Restore instead. Recurrence successor warnings remain governed by G-SERIES | APPROVED | Imran; Session 6 approval, 2026-08-11 |
| DES-066 | Important is one ungrouped Q4 server-ordered list with dated tasks before undated tasks. Every row keeps the active star, including abandoned tasks; its tooltip points to Planned or Tasks using the normative examples, and un-starring removes the row immediately. No page-specific filter or card treatment is added | APPROVED | Imran; Session 7 Important approval, 2026-08-11 |
| DES-067 | Replace the approved 40px static current-page bar in DES-023 with a 24px non-interactive Graphite 25 strip and an attached square white active tab extending through the strip edges with a 1px sidebar-seam overlap. Interactive update presentation retains a 40px target | SUPERSEDED | v2: the strip is a real tab strip over a window bar (DES-139, DES-217) |
| DES-068 | All renders exactly two static sections in one scroll: Planned first in Q3 order, then Tasks using Q2 Inbox/folder grouping. Each section reuses its approved TaskRow and contextual QuickAdd behavior; no third ordering, cards or linked headings are added | APPROVED | Imran; Session 7 All approval, 2026-08-11 |
| DES-069 | Done is one completion-history scroll grouped by completion day in Q6 server order. Completed rows retain folder, original due treatment and important star, expose `Mark as not done`, and never expose New task, QuickAdd or Abandon. Repeating un-complete with a successor uses the normative confirmation before mutation | APPROVED | Imran; Session 7 approval, 2026-08-11 |
| DES-070 | TaskRow folder metadata uses the same Lucide `Folder` glyph as sidebar folders, scaled to the approved 16px metadata size and colored with the folder token, instead of a colored circle. The adjacent visible folder name remains the non-color cue | APPROVED | Imran; Session 7 approval, 2026-08-11 |
| DES-071 | Drag-and-drop reordering of task rows and task steps is a future product proposal, not Dana v1 scope. V1 task rows retain the server-authoritative orders in specification section 6, and steps retain their specified up/down reorder controls. Task dragging requires a persisted task-position model, API contract and ordering rules for every affected view; step dragging requires an approved UI-contract amendment and verified position-update behavior | PROPOSED | Imran idea recorded during Session 7; do not design or implement without Hassan's backend review and an explicit scope decision |
| DES-072 | Planned calendar uses one restrained bordered surface with an integrated Graphite 25 navigation toolbar, compact day/week/month controls, quiet grid lines, distinct today and outside-month treatment, and compact events using their actual colored folder icons. Completed, abandoned, timed and recurring-ghost states preserve the Q3C behavior and the grid keeps a clear safe area above New task | APPROVED | Imran; Session 7 calendar refinement approval, 2026-08-11 |
| DES-073 | Expand global Search beyond the v1 task-title-and-notes query to find folder names, personal folder-group labels and task step titles, with entity filters for All, Tasks, Folders and Steps | PROPOSED | Future product proposal from Imran, 2026-08-11. Current Q8 and `GET /search` do not support these entities or filters. Hassan must define mixed-result shapes, permissions, ordering, pagination and indexes before UI design or implementation. Dana folders remain flat; “parent folders” in the prototype are the per-member `folder_members.label` groups, not nested folder records |
| DES-074 | Dana v1 Search uses a centered shadcn dialog opened from the sidebar header, Ctrl+K or slash; it searches accessible task titles and notes after a 300ms debounce, groups results Pending, Abandoned and Completed, and supports arrow navigation plus Enter/click to open the task. Folder and step search remain the DES-073 future proposal | SUPERSEDED | v2: the expanded overlay reaches tasks, folders, pages, steps and prose (DES-203, drawing DES-073); backend remains Lane 2 |
| DES-075 | Edit-mode TaskForm shows a quiet read-only Task history area below the editable fields: exact viewer-local creation date/time and creator, plus completion date/time and completing actor when present. Create mode shows no empty history. Removed accounts render the specification fallback `Deleted user`. Updated-at is not shown as an actor event because the contract has no `updated_by` field | APPROVED | Requested by Imran and retained through the Session 7 integrated review, 2026-08-11; supported by task `created_at`, `created_by`, `completed_at` and `completed_by`; durable reopen/delete history remains the separate DES-076 proposal |
| DES-076 | Retain an immutable task audit trail with exact event time and actor for creation, completion, reopening and deletion, and expose it through Task history | PROPOSED | Important requirement from Imran, 2026-08-11. Current un-complete clears `completed_at`/`completed_by`, and delete hard-deletes the row, so neither event remains as durable history. Requires Hassan to approve an audit/activity data model, retention and permission rules, API shape and product-scope amendment before production UI implementation; the current specification places Activity log in v2 |
| DES-077 | People uses the approved secondary-page language for connection management: a focused email invitation action, quiet connection and pending-invitation rows, explicit cancel/resend states, and the normative removal confirmation without implying that a connection automatically shares a folder | APPROVED | Imran; Session 7 People approval, 2026-08-11 |
| DES-078 | Settings uses restrained sectioned rows for optional page visibility, account identity and device timezone, People navigation, sign out, native PWA installation guidance, and a separated danger zone with the normative typed account-deletion confirmation | APPROVED | Imran; Session 7 Settings approval, 2026-08-11 |
| DES-079 | The desktop public landing page uses a high-contrast split composition: concise no-AI product copy and the single Google action on the light left field, plus a dark monochrome Dana brand field containing one focused shared-folder object assembled from approved folder, member and TaskRow language. The headline is deliberately composed as two parallel lines. It uses the authentic multicolor Google G asset and no decorative gradient, testimonial, pricing, secondary CTA or invented feature claim | APPROVED | Imran accepted the refined landing page on 2026-08-11; desktop overflow, asset-load and console QA passed at 1280 x 720 |
| DES-080 | The unverified-email refusal uses one restrained elevated shadcn-style surface: a dark monochrome Dana identity field with a low-contrast locked-mark watermark, and a light explanation field with one MailWarning status icon, the exact normative heading and body, and only the `Back to Dana` action. The state remains calm and neutral rather than using destructive styling | APPROVED | Imran accepted the refined unverified-email refusal on 2026-08-11; exact-copy, single-action, asset-load, overflow and console QA passed at 1280 x 720 |
| DES-081 | The incoming-invite gate reuses the approved public/auth frame at a compact application-UI scale, shows the pending count in the dark Dana identity field, and renders folder and connection invitations as quiet shadcn-style rows with small inviter avatar, exact invite pattern, type context and paired Decline/Accept actions. Accepting a folder invite opens that folder; other resolved rows leave the remaining invitations visible | APPROVED | Imran accepted the compact hierarchy on 2026-08-11; default/multiple, decline update, folder-accept destination, 1280 x 720 overflow and console QA passed |
| DES-082 | PWA/system feedback remains inside the approved product shell: the persistent offline warning sits directly below the page bar; update availability is an unobtrusive user-triggered reload action in the page bar; failed writes use DES-036; and Settings explains the browser-native install affordance without presenting a custom install button or intercepting the native flow | APPROVED | Imran accepted the Session 7 system/PWA group on 2026-08-11; offline, offline-plus-update, dismissal, Settings hint, overflow and console QA passed |
| DES-083 | Dana's three transactional email families share one disciplined 600px text-first template mapped to the approved shadcn language: a thin Graphite 950 brand edge; a clean white Dana header with a quiet purpose Badge; one Lucide purpose-icon tile; compact title/body rhythm; a single shadcn Item-like context row for sender, folder or due information; exactly one standard Graphite Button action; and a quiet `Sent by Dana` footer. The locked mark has no added ring, outline or shadow. Invite supports folder and bare-connection copy; reminder supports timed and date-only copy. No marketing modules, social links or secondary actions are added | APPROVED | Imran approved the refined email visual system on 2026-08-11. All five variants pass one-link, destination, 600px-card, no-overflow, clean-mark and console QA at 1280 x 720. Production email HTML must translate these primitives into email-safe inline/table markup rather than importing interactive shadcn components. Exact body and action copy remains an OPEN product decision for Imran and Hassan because the specification leaves it unresolved |
| DES-084 | Current desktop folder menus follow UI section 9.6: owners see Rename, Label and color, and Delete; non-owners see Label and color and Leave; Inbox exposes Rename and Label and color but never Share or Delete. Whether an owner should also receive a Leave/ownership-transfer UI remains OPEN because 5.3 and API 7.4 permit it while 9.6 assigns Leave only to non-owners | SUPERSEDED | Closed by v2's DES-225: an owner with members leaves only via ownership transfer (successor chosen, oldest member default per 8.9); a sole owner deletes instead per 5.3. Spec text rides the v2 RFC |
| DES-085 | TaskRow keeps the approved 44px full-row hover. The important star and overflow menu form a compact trailing action group at the far-right edge, after automatically sized metadata, and reveal from the full-row hover or keyboard focus. An active important star remains visible as persistent task state. This preserves stable checkbox/title alignment; the rejected before-title variation is not retained | SUPERSEDED | v2: the row rebuilt at two densities with declared chip and assignee sets (DES-113, DES-194); trailing-action placement survives in spirit |
| DES-086 | Custom-folder overflow menus expose `Move to group` as a focused submenu of the existing personal-label capability. Destinations are the viewer's existing labels plus `No group`; selection moves the sidebar row immediately without changing the folder, its tasks, sharing or other members' organization. The production mutation is `PATCH /api/v1/folders/:id/my-membership` with `{ label: destination-or-null, color: current-my_color }`, followed by the returned Folder object as truth. Inbox remains pinned and has no Move item. This is not nested folders | APPROVED | Requested by Imran, 2026-08-11; supported by 7.4 and AC-023 without backend or data-model expansion |
| DES-087 | Folder-group management remains an orchestration of the current member's `folder_members.label`, not a new parent-folder resource. The collapsible Folders directory overflow exposes the fully labelled `New folder group` action instead of giving it a competing permanent button or an ambiguous icon-only plus. Creation requires selecting at least one non-Inbox folder because the current model cannot persist an empty group. A parent-group overflow exposes Rename group and Delete group. Rename applies the new 1-40 character label to every child membership; Delete clears those labels so every folder and task remains visible in the ungrouped list. Production uses one `PATCH /api/v1/folders/:id/my-membership` per affected folder, preserves each `my_color`, treats returned Folder objects as truth, and refreshes plus shows the standard failed-write feedback if a multi-folder operation only partly succeeds | APPROVED | Revised with Imran and approved with the final Session 8 handoff on 2026-08-11; prototype create, open-child persistence, rename and safe-delete interaction QA plus production build passed. Supported by 4.4, 7.4, 9.1 and AC-023 without backend or data-model expansion |
| DES-088 | Sidebar folder utilities are contextual and capability-specific. `Folders` is a title-case collapsible directory heading led by typography rather than a decorative icon; its disclosure chevron appears directly after the text on hover/focus, and its directory overflow holds the fully labelled creation actions. Labeled groups use the simpler neutral Lucide `Folders` cue so a closed group cannot be mistaken for a single folder, and hovering or focusing a group replaces that cue with its left-side disclosure chevron. Folder glyphs are slightly quieter and smaller than navigation icons. The group row reveals `+` for creating a folder already labeled into it plus its overflow. Inbox and custom folders reveal `+` for a folder-scoped TaskForm; their overflow mirrors permitted folder management: Rename, Label and color, Move to group for non-Inbox folders, and owner-only Delete. Sidebar rows update immediately after personal label/color changes or a shared rename. Broad horizontal sidebar separators are omitted in favor of spacing and behavioral grouping. The production UI must continue to permission-gate owner/member actions per DES-084. None of this changes Dana's flat-folder model, and labels have no independent backend color field | APPROVED | Refined with Imran and approved with the final Session 8 handoff on 2026-08-11; build and browser QA passed for directory collapse, group/folder distinction, folder-scoped creation, full folder menu, live rename, live label/color movement and Move-to-group destinations |
| DES-089 | A future controlled comparison may evaluate Phosphor Icons against the approved Lucide treatment for Dana's application iconography | PROPOSED | Imran idea recorded on 2026-08-11; explicitly outside the current Session 8 refinement. Lucide remains authoritative under DES-021 unless Imran deliberately reopens and supersedes that decision after a direct comparison |
| DES-090 | Use a denser desktop information rhythm without shrinking primary actions: 32px sidebar navigation, group and folder rows with 16px Lucide row glyphs, no structural sibling-row gap and a centered 30px hover/selected surface, producing exactly 2px visible separation between adjacent surfaces; 36px TaskForm property controls and step rows; primary buttons, dialogs and major actions remain 40px, while TaskRow remains 44px. The `Folders` directory heading is a quiet 11px semibold section label; navigation and group labels are 13px semibold; normal folder labels are 13px medium and selected folders become semibold. Groups and folders share Graphite 600 normal/hover behavior, while the active folder and its parent group become Graphite 900. TaskForm preserves a distinct 20px/28px semibold editable title above 13px medium property labels and 14px values/actions | APPROVED | Requested, directly reviewed and approved by Imran for the final Session 8 handoff on 2026-08-11. A 20-25px control height was rejected because it would produce undersized text/icon targets and conflict with the approved desktop accessibility floor |
| DES-091 | Folder and folder-group glyphs default to neutral graphite rather than an accent color. A member may still choose a personal folder color through the existing Label and color control; that selected folder color follows the folder into its supported metadata surfaces. Expand/collapse is structural, not selection: a group glyph stays Graphite 500 whether collapsed or expanded and becomes Graphite 900 only while one of its child folders is the current page. Hover/focus may swap the group glyph to its disclosure chevron but does not change the tone. Label groups remain neutral because Dana v1 stores a personal label string rather than an independently colorable group entity | APPROVED | Requested, reviewed and approved by Imran for the final Session 8 handoff on 2026-08-11. Independent group-color customization would require a separate product/backend decision |
| DES-092 | Sidebar functional glyphs use one 16px Lucide box with a 1.75px stroke across navigation, folders, groups, disclosure controls, search, collapse, creation and contextual actions. The collapsed rail centers every complete 32px cell and its visible child on the same axis as the Dana Mark rather than aligning either to the left edge of shadcn's fractional inner/content columns, so state changes never alter geometry. The Dana Mark is the deliberate 24px collapsed identity exception and the account avatar is the deliberate 20px collapsed identity exception; neither is application iconography. The persistent New folder action uses the explicit 13px semibold action tier rather than inheriting the generic 12px menu default | APPROVED | Requested, reviewed and approved by Imran for the final Session 8 handoff on 2026-08-11; browser measurements confirmed zero horizontal center offset for every collapsed-rail cell |

## Known document gaps to preserve, not guess

- `brief.md` still gives the designer ownership of the app icon, while the Dana
  Mark is now locked.
- Privacy and terms destinations are not defined.
- Bare/historical sent-invite management is not clearly placed in the UI.
- Transactional email exact copy and action destinations are not specified.
- Truncation, 429 and most generic page-error presentations lack normative copy.
- RFC 0001 explanatory counts are stale; the current specification has AC-132
  and 21 section-13 entries.

These gaps are recorded as OPEN decisions above. Claude Design must not resolve
them silently.

## Golden screens

1. My Day desktop - core hierarchy, groups, task states and recap.
2. Tasks desktop - grouping, quick-add and repeated task-list behavior.
3. Task form desktop - the main input and dependency system.
4. Folder desktop plus sharing panel - collaboration and permissions.
5. Planned calendar - the most constrained layout and recurrence states.

## Session 1 approval

**APPROVED by Imran on 2026-08-10.** The approval includes the desktop-only
current delivery scope recorded above.

- Dana v1 summary and authority are correct.
- Screen registry contains every required v1 surface.
- Component and interaction rules cover the reusable product language.
- Locked decisions match Imran's instructions.
- Open choices remain open.
- Golden screens and session order are accepted.
- Docs-only implementation status is accepted.

## Session 3 approval

**APPROVED by Imran on 2026-08-10.**

- The compact 44px TaskRow anatomy and automatic right-side metadata are approved.
- The original after-title action placement was approved during Session 3 but is
  superseded by the final right-edge placement in DES-085; D2 completed-task
  treatment remains approved.
- Full-row Graphite 100 hover is approved; inline actions have no separate hover fill.
- Required task, interaction, loading, offline, error and empty-state patterns are covered.
- Contextual Lucide empty-state icons are approved, including the reusable folder state.
- Session 4 is unlocked; complete product screens remain outside Session 3 approval.

## Session 4 approval

**APPROVED by Imran on 2026-08-11.**

- The desktop shell, navigation hierarchy and compact 40px chrome are approved.
- The sidebar uses its reviewed Graphite 50 depth, selected-row treatment, denser
  typography, colored Lucide folder icons and persistent footer actions.
- Search and collapse live in the sidebar header; the Dana Mark remains first in
  the collapsed rail, followed by collapse and Search.
- The single-current-page bar is a static presentation layer, not a browser-like
  multi-tab system.
- The centered soft New folder action and bottom-right Graphite New task action
  are approved.
- People is placed directly above Settings in the sidebar footer.
- The desktop sidebar is resizable from 224px to 360px, defaults to 256px,
  persists locally and restores its chosen width after collapse.
- Custom per-folder icons or emoji remain a later-version proposal because the
  current backend contract has no persistence field for them.
- Mobile shell design remains deferred under DES-037. Session 5 is unlocked.

## Session 5 approval

**APPROVED by Imran on 2026-08-11.**

- Create and edit use the same resizable right-side TaskForm sheet.
- The editable task title is the form heading; Important remains an inline star.
- Compact property rows cover folder, assignee/invite pending, due date/time,
  reminder and the readable recurrence builder required by the specification.
- Steps support add, complete, reorder and delete; Notes remains last.
- Clear-date, move-unassign and delete warnings preserve normative copy.
- The seven task-form entry defaults, validation limits, keyboard opening,
  Escape closing and focus return were checked in the desktop prototype.
- Custom fields, attachments and arbitrary content blocks remain a future product
  proposal under DES-055. Session 6 is unlocked.

## Session 6 approval

**APPROVED by Imran on 2026-08-11.**

- My Day, Tasks, Folder/sharing and Planned establish the approved desktop
  golden-screen language.
- Planned list and day/week/month calendar behavior, recurrence ghosts and the
  floating-action safe area are approved.
- The New folder dialog creates and immediately opens a reusable empty folder.
- Edit-mode TaskForm includes the approved completion checkbox treatment.
- Folder pages use one open-task list with a due-date-presence filter under the
  approved DES-062 specification amendment; Hassan must acknowledge it before
  production implementation.
- Mobile remains deferred. Session 7 is unlocked.

## Session 7 completion

**COMPLETED after Imran approved every visible Session 7 surface and requested
the integrated QA pass on 2026-08-11.**

- Important, All, Done, Search, People and Settings retain their approved
  desktop compositions and permissions.
- Public/auth, incoming invitations, system/PWA feedback and all transactional
  email variants are approved at handoff fidelity.
- Folder management now covers owner, member and default-folder visibility;
  rename, personal label/color, Move to group, member removal, leave and
  live-count deletion use existing API-supported behavior without adding folder
  nesting or a new backend concept.
- The integrated 1440px route and interaction pass recorded in `workflow.md`
  passed with no browser-console errors, broken assets or horizontal overflow.
- Mobile remains deferred. Session 8 handoff packaging is unlocked.

## Session 8 approval

**APPROVED by Imran on 2026-08-11.**

- The final desktop prototype, reusable tokens/components, reference exports,
  implementation notes and clean Hassan-facing ZIP are the approved v1 UI
  handoff.
- Folder-group management and sidebar utilities are approved without changing
  Dana's flat-folder backend model.
- The final dense sidebar rhythm, neutral folder/group state rules, consistent
  Lucide sizing and collapsed-rail centering are approved under DES-090 through
  DES-092.
- DES-089 remains a future icon-system comparison, not part of this handoff.

---

# Dana UI v2 refresh (2026-08-17 to 2026-08-24)

The v2 refresh redesigned the desktop application over the shipped v1, on the
`design/v2-refresh` branch in `docs/design/prototype-v2/`, governed by
`docs/design/v2-refresh-plan.md`. This part of the contract is the durable
index of its decisions; **the long-form reasoning for every row lives in
`docs/design/v2-decisions.md`, which remains part of the record** — unlike v1,
where this file is the sole register, the v2 register and this index are read
together, and the register wins on detail.

**Approval basis.** V3's row and card were accepted 2026-08-18; the F1-F2
concept work was approved whole on 2026-08-18; the navigation model was ruled
2026-08-21; and everything from F5 through the close-out — **DES-155 through
DES-222 — was approved in one click-through pass with zero findings on
2026-08-24**, through the thirteen-station instrument. Lane 2 rows remain
PROPOSED regardless of how finished they look on screen: they reach `app/`
only through an accepted RFC, never on a design session's say-so.

**Precedence.** Where a v1 row and a v2 row disagree, the v2 row wins. The
fully superseded v1 rows are flipped in the v1 table above with a pointer;
the partially amended ones are listed here so the port meets them as a list:

| v1 decision | What v2 changed | By |
| --- | --- | --- |
| DES-016 accent reservation | Kept; accent lifted to 85% vividness, tints re-derived | DES-214 |
| DES-018 ten swatches | Kept; all ten lifted ~30 points chroma at held contrast; cobalt re-hued 224 → 242 off the accent | DES-215 |
| DES-022 motion | Kept; tiers became tokens with global reduced-motion suppression | DES-097 |
| DES-053 sidebar resize | Kept unchanged (224-360px, 256 default) | — |
| DES-058 My Day composition | My Day is Today; the important-only switch moved into the bar's shared filter (spec 9.4 edit owed as B3); Carried over / Today grouping survives | DES-149; DES-150; DES-152 |
| DES-063 Planned | Planned is Scheduled; the calendar's chrome joined the shell's grammar; a time ladder of headings replaced the scope control; Q3C behavior survives | DES-152; DES-164; DES-177 |
| DES-066/068/069 Important, All, Done | Pages survive under DES-152; compositions took the shared page head, group headings and row-emphasis rules | DES-149; DES-151; DES-183 |
| DES-084 owner-leave question | Still OPEN, unchanged by v2 | — |
| DES-090-092 density and glyph rules | Kept; extended by the icon module, default sizes and the animated family | DES-125; DES-162 |

## The v2 decision register

Statuses as in v1: `OPEN`, `PROPOSED`, `APPROVED`, `LOCKED`, `SUPERSEDED`.
"Pass 2026-08-24" means Imran's zero-findings click-through of that date.

| ID | Decision | Status | Source or gate |
| --- | --- | --- | --- |
| DES-093 | A task expands in place, inside its TaskRow; nothing opens a sheet | APPROVED | Imran, 2026-08-17 |
| DES-094 | One icon vocabulary shared by the row and the form | APPROVED | V3, 2026-08-17 |
| DES-095 | A task renames in place, in its row | APPROVED | Imran, 2026-08-17 |
| DES-096 | Details sit on a second line beneath the title | APPROVED | V3, 2026-08-17 |
| DES-097 | A motion scale lives in the tokens; reduced motion zeroes it globally | APPROVED | V3, 2026-08-17 |
| DES-098 | Custom tags or labels on a task | PROPOSED | NEEDS BACKEND; deliberately not drawn |
| DES-099 | The expanded card: one header strip, then Steps and Notes as blocks | APPROVED | V3, 2026-08-17 |
| DES-100 | A step as a first-class object: its own menu, promote to task | PROPOSED | NEEDS BACKEND; not drawn in the shipping prototype |
| DES-101 | Notes that can contain check items | PROPOSED | NEEDS BACKEND; not drawn |
| DES-102 | The card body as movable blocks, and an Attachments block | PROPOSED | NEEDS BACKEND; drawn on fixtures |
| DES-103 | Drag a row; a 1.5s dwell on another folds both into a folder | PROPOSED | NEEDS BACKEND for persistence; drawn |
| DES-104 | Make this task a folder; its steps become the tasks | PROPOSED | NEEDS BACKEND; drawn in the lab |
| DES-105 | What an attachment may be, and which ones can be viewed | PROPOSED | NEEDS BACKEND; storage question carries DES-130's covers too |
| DES-106 | Five verbs for moving things between levels, not one generic Move | APPROVED | Imran, 2026-08-18 |
| DES-107 | A fifth type size (13px) the v1 contract did not name | APPROVED | Imran, 2026-08-17 |
| DES-108 | The control-font reset lives in @layer base so utilities win | APPROVED | Imran, 2026-08-17; applied |
| DES-109 | The card has no Save button; every edit commits as made; the footer is a toolbar | APPROVED | Imran, 2026-08-17 |
| DES-110 | The V3 question reduced to one-line-or-two | SUPERSEDED | By DES-113 |
| DES-111 | A row is as tall as it needs to be | APPROVED | Imran, 2026-08-17 |
| DES-112 | What a selection can do, at both levels | APPROVED | V3, 2026-08-17 |
| DES-113 | Row density is a setting; two lines is the default; the row rebuilt | APPROVED | Imran, 2026-08-17; control built at DES-189 |
| DES-114 | Every folder list ends in "New folder…" | APPROVED | V3, 2026-08-17 |
| DES-115 | An empty block is the control that fills it | APPROVED | V3, 2026-08-17 |
| DES-116 | The card's metadata icons are 14px | APPROVED | Imran, 2026-08-17 |
| DES-117 | One form, two presentations; the freed right panel's tenant question | APPROVED | Answered by DES-142 and DES-186; settled at DES-222 |
| DES-118 | The card carries the form's nine missing fields | APPROVED | Imran, 2026-08-17; header revised |
| DES-119 | What the V3 port left behind, recorded not hidden | OPEN | Card collapse animation now in the Codex lane |
| DES-120 | The three pickers open on the answer, not the instrument | APPROVED | Imran, 2026-08-18 |
| DES-121 | The clock is a preference; 12-hour default | APPROVED | Imran, 2026-08-18; account sync is Lane 2 |
| DES-122 | A due date is a day, not a moment | APPROVED | Imran, 2026-08-18; spec ruling closed by DES-178 |
| DES-123 | One picker, wherever it is opened from | APPROVED | Imran, 2026-08-18 |
| DES-124 | Concepts compare in a lab; the winner is extracted the moment it wins | APPROVED | Imran, 2026-08-18; standing process rule |
| DES-125 | The icon family is animated Lucide, one module, no direct imports | APPROVED | Imran, 2026-08-18; supersedes DES-021 |
| DES-126 | The logo is a component; the mark draws itself on hover | APPROVED | Imran, 2026-08-18 |
| DES-127 | The mark has two colourways, for light and dark panels | APPROVED | Imran, 2026-08-18 |
| DES-128 | A step is a label; a note is a field | APPROVED | Imran, 2026-08-18 |
| DES-129 | Comments on a task: threads, replies, likes, files, voice notes | PROPOSED | NEEDS BACKEND; drawn; polish in the Codex lane |
| DES-130 | A folder wears an identity: icon, colour, cover, description | PROPOSED | NEEDS BACKEND; drawn; draws v1's DES-054 |
| DES-131 | The folder page's controls as one steady cluster | SUPERSEDED | By the window bar, DES-139; settled at DES-222 |
| DES-132 | Sections and paragraphs organise a folder page | PROPOSED | NEEDS BACKEND; drawn; behavior at DES-165-169 |
| DES-133 | The floating New task button retires where a quick-add row lives | APPROVED | Imran, 2026-08-18; amends W5's reading; extended by DES-182 |
| DES-134 | A folder's conversation, and where it lives | PROPOSED | NEEDS BACKEND; drawn; homes ruled at DES-142 |
| DES-135 | The list measure is a reading measure: 800px, tokenized | APPROVED | Provisional from F2a; every station of the pass 2026-08-24 reviewed at this measure; supersedes DES-023's 1120px in part |
| DES-136 | A task in a surface is a page, not a row | APPROVED | Imran, 2026-08-18 |
| DES-137 | A view switcher is a strip of icons; labels live in tooltips | APPROVED | Imran, 2026-08-18 |
| DES-138 | Where a task opens is a preference, not a window manager | APPROVED | Imran, 2026-08-18; account sync is Lane 2 |
| DES-139 | The window bar: chrome belongs to the window, not the page | APPROVED | Imran, 2026-08-18; supersedes DES-067 |
| DES-140 | One filter, every place-page | APPROVED | Imran, 2026-08-18 |
| DES-141 | A cover is native to every page except a task's | APPROVED | Imran, 2026-08-18 |
| DES-142 | The conversation has two homes; the page's is a closed section | APPROVED | Imran, 2026-08-18 |
| DES-143 | A message is told apart by tone, never by hue | APPROVED | Imran, 2026-08-18 |
| DES-144 | Every menu item is real; an act with no handler does not draw | APPROVED | Imran, 2026-08-18; made structural by DES-197 |
| DES-145 | A paragraph belongs between a heading and its first row | APPROVED | Imran, 2026-08-18 |
| DES-146 | Three homes for a task; a like is the whole reaction set | APPROVED | Imran, 2026-08-18 |
| DES-147 | A popover is as wide as what it holds | APPROVED | Imran, 2026-08-18 |
| DES-148 | An affordance may not charge rent for unused space | APPROVED | Imran, 2026-08-18 |
| DES-149 | One page head for every place; a system page's mark is not pickable | APPROVED | Pass 2026-08-24 |
| DES-150 | A place-page's controls leave the content column for the bar | APPROVED | Imran, 2026-08-19; spec 9.4 edit owed as B3 |
| DES-151 | A group heading is the section tier on every page that has one | APPROVED | Pass 2026-08-24 |
| DES-152 | The navigation: Desk · Today · Scheduled · Assignments · Important · All, Done unpinned | APPROVED | Imran, 2026-08-21; spec RFC owed before the port |
| DES-153 | A page is a view; the filter is the instrument that makes one | APPROVED for the filter; PROPOSED for custom views | Custom saved views are NEEDS BACKEND; Save as view drawn |
| DES-154 | A settled behaviour belongs to the mechanism, not each screen | APPROVED | Imran, 2026-08-22; standing process rule |
| DES-155 | A mark stands on ground, not in a box; one resolver | APPROVED | Pass 2026-08-24 |
| DES-156 | Grouping replaces a page's arrangement; it never nests inside it | APPROVED | Pass 2026-08-24 |
| DES-157 | Every rule proves it still bites, or it fails as BLIND | APPROVED | Standing gate discipline; both tools carry probes |
| DES-158 | Undo is an act with a name — one bar, Ctrl+Z, no redo | APPROVED | Pass 2026-08-24 |
| DES-159 | One drawing, one name; one field, one glyph | APPROVED | Pass 2026-08-24 |
| DES-160 | A control comes from the system or it becomes one | APPROVED | Pass 2026-08-24 |
| DES-161 | A link is a link, not a file with an address | APPROVED | Pass 2026-08-24; kinds are Lane 2 under DES-105 |
| DES-162 | An icon has a size before anyone chooses one | APPROVED | Pass 2026-08-24 |
| DES-163 | Making a task means making it, from every door | APPROVED | Pass 2026-08-24 |
| DES-164 | The calendar's chrome is the shell's chrome | APPROVED | Pass 2026-08-24; amends DES-063/072 presentation |
| DES-165 | A section somebody made is the same section component | APPROVED | Pass 2026-08-24 |
| DES-166 | A section is a place a task can be moved to; the section rides the row | APPROVED | Pass 2026-08-24 |
| DES-167 | The way in stays until it has been used | APPROVED | Pass 2026-08-24 |
| DES-168 | A block earns the top of the page by having something in it | APPROVED | Pass 2026-08-24 |
| DES-169 | An arrangement is a person's, so it is kept | APPROVED | Pass 2026-08-24; persistence is Lane 2 |
| DES-170 | Settings is a pin list; Completed is Done; Abandoned and Anytime ship unpinned | APPROVED | Pass 2026-08-24 |
| DES-171 | The alphabet is a seed; the sidebar reorders by drag, one column | APPROVED | Pass 2026-08-24; persistence is Lane 2 |
| DES-172 | A task tab's controls live in the window bar; its folder is the breadcrumb | APPROVED | Pass 2026-08-24 |
| DES-173 | A page description Dana wrote is a first draft, editable | APPROVED | Pass 2026-08-24 |
| DES-174 | A board column is a place; Done is a status — drop completes | APPROVED | Pass 2026-08-24 |
| DES-175 | People is a roster; Assignments is work; each wears its own mark | APPROVED | Pass 2026-08-24 |
| DES-176 | The shell has no hairlines left; tone separates | APPROVED | Pass 2026-08-24 |
| DES-177 | A view is a shape, not a question — offered when it can draw everything | APPROVED | Pass 2026-08-24 |
| DES-178 | A due date is a day; due-time and start date deferred, not dropped | APPROVED | Imran, 2026-08-22; spec RFC owed; reminder question is DES-224 |
| DES-179 | A filter belongs to the page and to the session | APPROVED | Pass 2026-08-24 |
| DES-180 | An arrangement is a person's, not the folder's | APPROVED | Pass 2026-08-24; preference bundle for Hassan |
| DES-181 | Desk is where the lamp is | APPROVED | Imran, 2026-08-22 |
| DES-182 | A task made on a page belongs to that page; a column captures with its value | APPROVED | Pass 2026-08-24 |
| DES-183 | A row says what its page does not — emphasis decided per list | APPROVED | Pass 2026-08-24 |
| DES-184 | The states sheet is drawn by the shipping row | APPROVED | Pass 2026-08-24 |
| DES-185 | One task, one copy — every surface writes through the shell's path | APPROVED | Pass 2026-08-24 |
| DES-186 | The page makes room for the panel rather than being covered | APPROVED | Pass 2026-08-24 |
| DES-187 | An icon animates as itself; a tenth audit rule renders both and compares | APPROVED | Pass 2026-08-24 |
| DES-188 | The star is graphite everywhere; the fill is the whole difference | APPROVED | Pass 2026-08-24 |
| DES-189 | Row density has its control in Settings | APPROVED | Pass 2026-08-24 |
| DES-190 | A group moves like anything else in its column | APPROVED | Pass 2026-08-24 |
| DES-191 | A caveat belongs in the register, not in the panel | APPROVED | Imran, 2026-08-23 |
| DES-192 | Keep the animation where the animated drawing is the better one; nine restored, twenty stay plain with reasons beside the code | APPROVED | Imran, 2026-08-23; CircleAlert moot — ships nowhere |
| DES-193 | Prose runs on; blocks get air — the gap knows what it separates | APPROVED | Pass 2026-08-24 |
| DES-194 | The row's chips and its assignee are open sets, declared as data | APPROVED | Pass 2026-08-24; closes W2 |
| DES-195 | A Shelf holds folders and is yours — Option A, personal, no members | APPROVED | Imran, 2026-08-23; Option B deferred, not rejected |
| DES-196 | Arrangement is cheap; inherited permission is the expensive part | APPROVED | Imran, 2026-08-23; the analysis behind DES-195 |
| DES-197 | An object declares what can be done to it; one contract, one menu | APPROVED | Pass 2026-08-24; server half is Lane 2 |
| DES-198 | A copy takes the structure, never the grants or the progress | APPROVED | Pass 2026-08-24; endpoints are Lane 2 |
| DES-199 | The act writes the record — one event log behind Activity and History | APPROVED | Pass 2026-08-24; answers v1's DES-076; audit model is Lane 2 |
| DES-200 | Deleting moves a thing to Trash (30 days) rather than ending it | APPROVED | Pass 2026-08-24; deleted_at and purge are Lane 2 |
| DES-201 | A task is an object with an address: ?task=<id> | APPROVED | Pass 2026-08-24; real route is Lane 2 |
| DES-202 | A page holds headings, prose and pictures; images survive reload | APPROVED | Pass 2026-08-24; object storage and quota are Lane 2 |
| DES-203 | Search finds everything you can go to — tasks, folders, pages, steps, prose | APPROVED | Pass 2026-08-24; draws v1's DES-073; backend is Lane 2 |
| DES-204 | The profile picture is the control | APPROVED | Pass 2026-08-24; storage is Lane 2 |
| DES-205 | The theme control lives under Appearance; a first-pass dark sits behind it | APPROVED for placement | The dark ramp itself is the later colourway session with Imran |
| DES-206 | A workflow is a shape, not a copy — structure and titles travel, people and time do not | APPROVED | Pass 2026-08-24; import endpoints are Lane 2 |
| DES-207 | A shelf is the folder page one level up | APPROVED | Pass 2026-08-24 |
| DES-208 | Folder acts raised from the sidebar actually happen; checks operate, not read | APPROVED | Pass 2026-08-24 |
| DES-209 | The second review pass: footer by role, image blocks fold, search reaches prose, History opens, panel makes room | APPROVED | Imran's pass of 2026-08-23-24 |
| DES-210 | The shelf page earns its place: address, Copy link, workflow round-trip | APPROVED | Imran, 2026-08-23 |
| DES-211 | An instruction that has been carried out is no longer an instruction | APPROVED | Pass 2026-08-24 |
| DES-212 | A layout that cannot be explained cannot be relied on; measure animated things with a driven browser | APPROVED | Standing process rule |
| DES-213 | Desk's glyph stays still; the swatches were never the problem | APPROVED | Imran, 2026-08-23 |
| DES-214 | The accent lifted to 85% vividness at held contrast; tints re-derived | APPROVED | Imran, 2026-08-23 |
| DES-215 | All ten swatches lifted at held contrast; folder cobalt re-hued 224 → 242 off the accent | APPROVED | Imran, 2026-08-23; hue delegated and ruled 2026-08-24 |
| DES-216 | The third review pass: six faults in places nothing had pressed, each now an operation in the sweep | APPROVED | Imran, 2026-08-24 |
| DES-217 | The tab strip has no special first tab: equal, closable, reorderable, a "+", neighbour-then-Desk on close | APPROVED | Pass 2026-08-24 |
| DES-218 | A shelf's name is its label; renaming rewrites members and moves the page's stores | APPROVED | Pass 2026-08-24 |
| DES-219 | The shelf page takes the folder page's grammar whole; folder rows are arrangeable blocks | APPROVED | Pass 2026-08-24 |
| DES-220 | The sidebar's folder block is labelled Library | APPROVED | Imran, 2026-08-24 |
| DES-221 | Whose footer label survives narrowing is arithmetic; New shelf keeps its word | APPROVED | Pass 2026-08-24 |
| DES-222 | The last drawing pass: C4, S1-S5, W1, P1, the nativeButton mechanism, the stress block | APPROVED | Pass 2026-08-24 |
| DES-223 | Notifications: assignment and conversation events reach the person | PROPOSED | NEEDS BACKEND; deliberately not drawn; price with DES-129/134 |
| DES-225 | The role axis: Rename and Delete are the owner's, Leave is the member's (confirming, no Trash row, verb "Left"), everything else is any member's, arrangement always personal; closes v1's DES-084 via ownership transfer, oldest member default | APPROVED | Imran's question and delegation at the pricing session, 2026-08-24; built, gated and probed the same day |
| DES-224 | A v2 reminder is the reminders table's time-of-day mode: "remind me at HH:MM on that day" | APPROVED | Answered by section 4 at the pricing session, 2026-08-24; folds into DES-178's spec RFC |

## v2 approval

**DES-155 through DES-222 APPROVED by Imran on 2026-08-24** — the
thirteen-station click-through, zero findings — on top of the explicit
per-entry approvals of 2026-08-17 to 2026-08-23 recorded above. Standing
gates at approval: 12 audit rules and a 31-route driven sweep, both green,
every rule carrying a probe it must catch (DES-157). Remaining before the
phase closes: the reference exports (after the Codex landing pass), the two
SESSION-LOG verdicts of V10, and the S5 landing-headline pick. The spec RFC
(DES-152, DES-178, B3) and the Lane 2 pricing session follow the close.
- Mobile remains deferred and the explicit open decisions remain unresolved.

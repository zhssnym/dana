# Dana naming map

One vocabulary for the interface, so a session, a review comment and a
decision can all point at the same thing. Opened 2026-08-17 at Imran's
request during the v2 refresh, after a width discussion stalled on having no
word for the cluster of details at the right of a task row.

**These names are collected, not invented.** Where the specification, the
design contract or the prototype's own code already names something, that name
wins and appears here unchanged. Names appear here for the first time only
where all three were silent, which was almost entirely inside `TaskRow`.

The annotated picture is `v2-refs/naming-map.png`, generated from the running
prototype and regenerated at session V9.

## How a name is settled

1. **Spec section 9** names controls normatively (the "Names" table in 9.1)
   and names regions ("Carried over", "All open tasks", "Danger zone"). Those
   are contract. A design session may restyle them and may never rename them.
2. **`design-contract.md`'s component contract** names the reusable pieces:
   AppShell, Sidebar, SidebarHeader, PageBar, TaskRow, TaskForm, QuickAdd,
   FolderRow, MemberList, EmptyState, SkeletonList, SearchResult,
   CalendarTaskEvent, FeedbackMessage, ConfirmDialog, TransactionalEmail, and
   the five treatments (Due, Assignee, Recurrence, Reminder, Step).
3. **`screen-registry.csv`** gives every surface an ID: `SCR-` screens, `PNL-`
   panels, `OVL-` overlays, `FRM-` forms, `DLG-` dialogs, `MNU-` menus,
   `BAN-` banners, `TOAST-`, `PWA-`, `EML-` emails.
4. **The prototype's code** names the parts: `CompletionControl`,
   `ImportanceControl`, `FolderMeta`, `AssigneeMeta`, `FolderGroup`,
   `SidebarResizeHandle`, and the `data-` hooks `data-task-metadata`,
   `data-task-actions`, `data-sidebar-tier`.

A name new to this file is marked **(new)**.

## Screens

| Name | Registry ID | What it is |
| - | - | - |
| Landing | SCR-LANDING-001 | The public page at `/` |
| SignInRefusal | SCR-AUTH-001 | The unverified-email page |
| InviteGate | SCR-INVITES-001 | Pending invites, in place of the app |
| AppShell | SCR-SHELL-001 | Sidebar plus page frame, every signed-in route |
| MyDay | SCR-MYDAY-001 | `/app` |
| Tasks | SCR-TASKS-001 | `/app/tasks` |
| PlannedList | SCR-PLANNED-001 | `/app/planned`, list mode |
| PlannedCalendar | SCR-CALENDAR-001 | `/app/planned`, calendar mode |
| Important | SCR-IMPORTANT-001 | `/app/important` |
| All | SCR-ALL-001 | `/app/all` |
| Done | SCR-DONE-001 | `/app/done` |
| FolderPage | SCR-FOLDER-001 | `/app/folders/:id` |
| People | SCR-PEOPLE-001 | `/app/people` |
| Settings | SCR-SETTINGS-001 | `/app/settings` |
| SearchOverlay | OVL-SEARCH-001 | The Ctrl+K dialog |
| TaskForm | FRM-TASK-001 | The create/edit sheet |
| SharingPanel | PNL-SHARE-001 | A folder's members and invites |
| Privacy, Terms | **(new)** | The two public pages drafted in v2 |

## The shell

| Name | What it is |
| - | - |
| Sidebar | The whole left column. Dana's only chrome |
| SidebarHeader | Mark, Search, collapse control |
| SidebarNav | The six page links |
| FolderDirectory **(new)** | The "Folders" heading and everything under it |
| FolderGroup | One personal label group. A membership label, never a real folder |
| FolderRow | One folder: glyph, name, pending count |
| SidebarFooter **(new)** | New folder, People, Settings, Account |
| SidebarResizeHandle | The drag edge, 224 to 360px |
| PageBar | The thin strip carrying the current-page tab and the update affordance |
| PageHeader **(new)** | Page icon, title, subtitle, and page-level controls such as My Day's Important-only switch |
| ContentColumn **(new)** | How wide page content may be. The subject of session V1 |
| SectionHeading | A named region's heading. Fixed by spec 9.1 |
| FloatingAddButton | The "New task" button, bottom right, absent on Done |

## Inside a TaskRow

Left to right. Everything except `TaskTitle` and `CompletionControl` is
optional and appears only when the task has it.

| Name | What it is |
| - | - |
| TaskRow | The whole line |
| CompletionControl | The checkbox; the slash glyph when abandoned |
| TaskTitle | The task's name |
| **MetaGroup (new)** | The cluster of details. The thing this file was written for |
| StatusChip **(new)** | Abandoned, Unassigned, Invite pending |
| FolderMeta | Folder glyph plus folder name |
| PulledMeta **(new)** | The pin plus "Pulled", My Day only |
| RecurrenceMeta **(new)** | The repeat glyph |
| StepsMeta **(new)** | The step count, "2/4" |
| AssigneeMeta | Avatar plus name, when not the viewer |
| DueMeta **(new)** | The due date or overdue treatment. The slot whose alignment V1 decides |
| **RowActions** | The trailing controls, revealed on hover or focus |
| ImportanceControl | The star |
| OverflowMenu | The "More actions" menu |

The order above is the canonical one, applied in session V1: chips, folder,
pulled, recurrence, steps, assignee, due, then actions.

## Inside the TaskForm

| Name | What it is |
| - | - |
| TaskFormSheet | The right-side panel, 480 to 720px |
| TaskFormTitle | The editable title, doubling as the heading |
| MoreOptions | The expander holding the seven secondary fields |
| PropertyRow **(new)** | One label-and-value line: Folder, Assignee, Due time, Reminder, Repeat |
| StepsEditor | The step list and its controls |
| NotesField **(new)** | The notes area, always last |
| TaskHistory | The read-only creation and completion record |
| TaskFormResizeHandle | The drag edge |

## Repeated pieces elsewhere

`QuickAdd`, `EmptyState`, `SkeletonList`, `ConfirmDialog`, `SearchResult`,
`CalendarTaskEvent`, `MemberList`, `OfflineBanner`, `Toast`, and the five
treatments (`DueTreatment`, `AssigneeTreatment`, `RecurrenceTreatment`,
`ReminderControl`, `StepEditor`) keep the names `design-contract.md` gives
them.

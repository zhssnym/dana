# Dana design brief

> **For:** Imran
> **From:** Hassan
> **Status:** Ready to design against. If anything here is unclear or seems wrong, ask before designing around it.

This brief is everything you need to design Dana's first version. You do not need to
read the technical specification; everything design-relevant from it has been pulled
in here. Where this brief quotes text in a "Copy" box, that text is final and must
appear word for word. Everything visual is yours.

## 1. What Dana is

Dana is a shared to-do app that people install like a regular app on their phone or
computer. You sign in with Google, you get folders, and every task lives in exactly
one folder. Sharing a folder with someone gives them full access to everything in
it, so a couple, a family, or two friends can run shared lists together.

The scheduling idea is the heart of it: you never file a task on a page. A task
without a due date lives on the Tasks page. Give it a date and it moves to Planned.
My Day collects what needs attention today and keeps unfinished things visible until
someone deals with them. Important, All, and Done are different views of the same
tasks.

Version 1 is deliberately simple and manual: no AI, no chat, no integrations, no
offline editing. It should feel calm, fast, and trustworthy.

## 2. What is fixed and what is yours

**Fixed (do not change):**

- Page structure: which pages exist, what sections they contain, what each row shows.
- All copy in the "Copy" boxes below: button labels, warnings, empty states, tooltips.
  The rule in the spec is "design may restyle, not reword."
- Behavior: what happens on click, what confirms, what warns.

**Yours (full freedom):**

- Color system, typography, spacing, corner radius, shadows, iconography.
- The visual treatment of every state: overdue, faded, selected, hover, focus.
- The folder color palette: users pick a color per folder, so design a preset set of
  swatches (any number from 8 to 16) that look good as small dots and chips.
- App icon, and the splash/theme colors the installed app uses.
- Empty-state illustration style, if any. Illustrations are optional; the copy is not.
- Motion, within reason: this is a utility, not a showcase.

**Not required for v1:** dark mode. Do not design it, but avoid choices that would
make it impossible later (for example, do not bake text into images).

## 3. How we will work

You design in Figma on your own account. What reaches the build is only what gets
exported into the project, so the handback convention matters:

1. **Foundations first.** One page with the design tokens: color palette with names
   and hex values, type scale, spacing scale, radius values, the folder swatch set.
   These get transcribed into code on our side; after that, changing a token is a
   small request, not a redesign.
2. **One PNG per screen**, exported at two widths: phone (390 wide) and desktop
   (1440 wide). File names follow the screen list in section 5, for example
   `my-day-phone.png`, `my-day-desktop.png`. These go into the project folder
   `docs/design/screens/` and are what the builders actually look at.
3. **A short notes file** for anything a flat image cannot say: hover states,
   what animates, what scrolls. Plain sentences are fine.

Expect two rounds: a first pass over the core loop (My Day, Tasks, Planned list,
task form, folder page), feedback, then the rest. Small corrections after that go
through updated exports of single screens.

## 4. Platform constraints

- **Installable web app.** Dana runs in the browser and can be installed to the home
  screen or desktop. When installed it opens without browser chrome, so the top bar
  you design is the only chrome there is.
- **Design phone-first, then desktop.** On desktop there is a persistent left
  sidebar; on phone the sidebar collapses behind a menu control (your choice of
  pattern).
- **Deliverables for install:** an app icon that works at 192 and 512 pixels, plus a
  theme color and background color for the installed shell.
- **Times are 24-hour** everywhere in the product. Dates should be unambiguous;
  the examples in this brief use the 2026-07-28 style, but the display format is
  yours as long as day and month cannot be confused.
- **Accessibility floor:** text contrast at least 4.5:1, visible keyboard focus on
  every interactive element, touch targets at least 44 pixels, and never color as
  the only signal (overdue, abandoned, and completed states need a non-color cue
  too: icon, strike-through, weight, or label).
- **Loading states are skeleton rows**, not spinners, on every page.

## 5. The screens

Every page has up to five states: loading (skeletons), populated, empty (exact copy
below), error, and the global offline banner. Design the populated state fully; show
the empty state for at least My Day, Tasks, and one folder; the rest can reuse the
pattern.

### 5.1 Global chrome

- **Top bar:** app name (click goes to My Day), a global search control, and an
  avatar menu containing Settings and Sign out.
- **Sidebar**, in this exact order: My Day, Tasks, Planned, Important, All, Done,
  then a divider, then the folder list, then a "New folder" action and a Settings
  link. Important, All, and Done can be hidden by the user in Settings, so the
  sidebar must look right with 3 to 6 pages.
- **Folder list:** Inbox always pinned first with a count badge of open tasks. Users
  can give folders a personal label (a grouping word like "Home" or "Uni"); labeled
  folders appear in collapsible groups sorted by label, unlabeled folders after
  them. Each folder row shows its color dot, name, and pending count.
- **Floating add button:** bottom right on every page except Done.
- **Inline quick-add row:** a single-line "add a task" input that sits at the bottom
  of task lists (Tasks groups, Planned list, folder sections). Enter saves, Escape
  clears.
- **Offline banner**, persistent while offline:

> **Copy:** "You're offline. Dana needs a connection; changes can't be saved right now."
> Failed save toast while offline: "Couldn't save. You're offline."
> Generic failure toast: "Something went wrong. Nothing was saved. Try again."
> Update-available affordance (unobtrusive, never forces): "Update available, reload"

### 5.2 Landing and login

One public page: what Dana is (collaborative to-do lists in shareable folders), one
"Continue with Google" button, privacy and terms links. No screenshots required but
welcome. One hard rule: the landing copy must not claim or imply any AI features.

### 5.3 The task form (create and edit are the same surface)

Always visible: title field, an inline quick-set for due date, an important toggle.
Behind a "More options" expander: notes, folder, assignee, due time, reminder,
repeat, steps.

The dependency rule that shapes this form: **due time, reminder, and repeat only
work once a due date is set.** Until then they are visible but disabled, each with
the helper text below. The moment a date is set they enable in place; clearing the
date disables and clears them after a warning.

> **Copy:** disabled helper: "Set a due date first"
> Clear-date warning: "Clearing the date also ends the repeat and removes the reminder."
> Empty title validation: "Give it a title"
> Over-limit validation: "Too long: limit N characters"
> Move warning when the assignee would be dropped: "Moving will unassign Sara; she isn't a member of Home."
> Delete confirm (in the form's overflow menu): "Delete this task? This can't be undone."

Details worth designing carefully:

- The assignee field is hidden entirely when the chosen folder has only one member.
  When shown, its dropdown lists that folder's members plus an "Invite by email"
  option that opens the sharing flow.
- The reminder control has two modes and switches automatically: with a due time it
  is an offset picker ("30 minutes before"); without one it is a time-of-day picker
  ("remind me at 09:00 on the day").
- The repeat control is preset-driven: daily, weekdays, weekly on chosen days,
  every N days or weeks, monthly on a day 1 to 28, yearly, plus an optional
  "Ends on" date. There is never a raw text rule input.
- Steps: a simple checklist editor. Text row, Enter appends the next row, per-row
  checkbox, delete, and up or down reorder controls. Cap notice at 50 steps.
- While an assignment invite is outstanding, the form and the row show a chip:

> **Copy:** "Invite pending: sara@example.com"

### 5.4 My Day

Header with today's date and an important-only toggle switch. Then up to three
sections:

1. **"Carried over"**: unfinished items from previous days. They stay here every
   day until completed or abandoned; nothing disappears just because time passed.
2. **"Today"**: items that qualified today.
3. **"Done today (N)"**: a collapsed recap of tasks completed today, at the bottom.

Task rows here show: complete checkbox, title, folder label, due badge (styled as
overdue when the date is past), assignee chip when the task is someone else's, star,
a "pulled" marker with a remove control when the user added it manually, and an
overflow menu (edit, abandon, delete).

> **Copy:** empty state: "Nothing on your day. Tasks assigned to you appear here on their due date, or pull anything in yourself."
> Remove control on a pulled row: "Remove from My Day"
> Abandon confirm from this page: "Abandon this task? It stops appearing in My Day but stays everywhere else."

### 5.5 Tasks

Undated tasks only. The user's own Inbox tasks appear first as a plain list with no
heading, then one group per other folder that has undated tasks, each with a folder
heading. Quick-add at the bottom of each group adds into that folder.

> **Copy:** empty state: "No undated tasks. Anything you capture without a date lands here."

### 5.6 Planned (list and calendar)

A mode toggle switches list and calendar; the choice persists.

**List:** every dated task, soonest first, overdue items naturally at the top. Rows
show folder label, assignee chip, star, and an "unassigned" chip when a task in a
shared folder has no assignee.

> **Copy:** empty state: "Nothing scheduled. Give any task a due date and it moves here."

**Calendar:** day, week, and month zooms with previous, next, and today controls.
Each day cell layers, in order: all-day banner tasks, then timed tasks, then ghost
markers. Completed tasks render faded with a check, abandoned tasks faded and struck
through: the calendar is an honest record, not just a plan. Ghost markers are
future occurrences of repeating tasks: visually distinct (outlined or dimmed, your
call), clearly not real yet. Clicking an empty cell opens the task form with that
date pre-filled. Clicking a ghost opens the underlying task with a banner:

> **Copy:** ghost banner: "Upcoming occurrence of a repeating task"

The calendar empty state is just the bare grid, no message.

### 5.7 Important

One list of every starred task: dated ones first (soonest first), then undated ones
(newest first). Un-starring a row removes it from this page immediately. The star's
tooltip here tells the user where the task lives:

> **Copy:** tooltip examples: "Also in Planned, due 2026-07-28" and "Also in Tasks, in Work"
> Empty state: "Nothing marked important. Star any task and it shows up here."

### 5.8 All

Two stacked sections in one scroll: "Planned" (rendered exactly like the Planned
list) then "Tasks" (rendered exactly like the Tasks page). Section headers are
static labels, not links.

> **Copy:** empty state: "Nothing here yet. Add your first task with the + button."

### 5.9 Done

Completed tasks, grouped by day, most recent first, loading more as you scroll.
Rows show folder name, the due date it had, a star if important, and an un-complete
control. No add button and no quick-add anywhere on this page.

> **Copy:** un-complete control: "Mark as not done"
> Confirm when un-completing a repeating task whose next occurrence already exists: "This removes the next scheduled occurrence (including any edits to it). Continue?"
> Empty state: "Nothing completed yet. Finished tasks build your history here."

### 5.10 Folder page

Header: folder name (inline rename for the owner), a completion ratio like "12 / 30",
overlapping member avatars, a Share button, and an overflow menu (Rename for the
owner, Label and color for anyone, Leave for non-owners, Delete for the owner).

Body: a Scheduled section, an Unscheduled section, and a collapsed Completed
section, with quick-add in both open sections and the floating add button present.

> **Copy:** delete confirm pattern (numbers are live): "Delete Work? This permanently deletes 28 open, 12 completed, and 3 abandoned tasks for every member."
> Empty state when both open sections are empty: "No tasks yet. Add one below."

**Sharing panel** (opened from the Share button): the member list with joined dates
and remove controls, a picker of people you are already connected to, an email
invite field, and the list of pending invites, each with the exact email, sent time,
Cancel, and Resend. Resend is disabled for 24 hours after sending.

> **Copy:** roster picker label: "Share with someone you're connected to"
> Email field label: "Invite by email"
> Disabled resend tooltip: "Resent recently"

### 5.11 Settings

Three sections:

- **Pages:** toggles for Important, All, and Done, each with a one-line description,
  and a note below the trio.
- **Account:** the Google identity, the detected timezone, and Sign out.
- **Danger zone:** Delete account. It explains the consequences in two sentences and
  requires typing DELETE to confirm.

> **Copy:** pages note: "My Day, Tasks, and Planned are always shown."
> Timezone note: "Dana follows your device's timezone automatically"
> Deletion explanation: "Folders you share will be handed to their longest-standing member. Private folders and their tasks are permanently deleted."

Also include a short "Install Dana" hint section explaining how to install the app
from the browser.

### 5.12 People and invites

A People screen: the list of people you are connected to, each removable, plus a
bare invite-by-email field for connecting without sharing a folder yet.

> **Copy:** remove confirm: "Remove connection? You can still see shared folders; you'll just need a fresh invite to share new ones."

**Login surface:** when the user signs in and has pending invites, those render
before anything else as a list of rows with Accept and Decline:

> **Copy:** row patterns: "Hassan invited you to Wedding" and "Hassan invited you to connect"

### 5.13 Search

An overlay opened from the top bar or by keyboard (Ctrl+K or /). An input with
results appearing as you type, grouped under Pending, Abandoned, and Completed
headings. Each result shows title, folder, a status chip, and the due date if any.

> **Copy:** footer: "Showing matches from every folder you can access."
> Empty state: "No matches for that search."

## 6. The task row, in all its states

The task row is the single most repeated element; design it once, thoroughly:

| State | Treatment |
| - | - |
| Pending | Normal |
| Pending, overdue | Due badge styled as overdue (non-color cue too) |
| Completed | Faded, checked; appears in Done and on the calendar |
| Abandoned | Faded and struck through, with an "Abandoned" chip and a "Restore" control |
| Important | Star filled |
| Assigned to someone else | Small avatar chip with their name |
| Unassigned in a shared folder | "unassigned" chip (Planned and calendar only) |
| Pulled into My Day | Pulled marker with "Remove from My Day" on hover or overflow |
| Invite pending | "Invite pending: email" chip |
| With steps | Progress indicator, for example "2/5" |
| Repeating | A small repeat glyph |

## 7. Emails

Three transactional emails, plain and short, one action link each: an invite email,
a "folder shared with you" email, and a task reminder email. A simple text-first
template with the Dana wordmark is enough; no marketing layout.

## 8. Out of scope for v1

Do not design: AI or chat anything, drag-and-drop reordering, a year calendar view,
attachments, comments or activity feeds, multiple reminders per task, permission
levels beyond member, native app chrome, offline editing, dark mode, a stats page.

## 9. Deliverables checklist

1. Foundations page: tokens with names and values, folder swatch set, app icon,
   theme and background colors.
2. Phone and desktop PNGs for: My Day, Tasks, Planned list, Planned calendar
   (month and week at minimum), Important, All, Done, folder page, sharing panel,
   task form (collapsed and expanded, plus the disabled-dependents state), Settings,
   People, login surface with pending invites, search overlay, landing page.
3. State examples: one screen showing skeleton loading, the offline banner over any
   screen, the My Day and Tasks empty states, an overdue row, an abandoned row.
4. The notes file.

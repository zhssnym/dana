# Place pages and Trash — adversarial user round, 2026-08-30

**Verdict in one line.** The list pages read well and the Trash is safe and honest, but three of the nine places (Done, Anytime, Abandoned) have no door, the controls that switch a page's mode and Assignments' scope are invisible until you hover one tiny icon, "put this on Today" and "drag a task to a day" do not exist, and the phone is unusable: no navigation and a task panel that runs off the screen.

Driven with Playwright at 1440x900 and 390x844 as `adv-places`: three folders, 18 tasks, one trashed task. Screenshots in `adv-places/`.

## Findings

### F1. On the phone there is no way to go anywhere — severity: blocker
- Where: every page at 390x844
- What I did: opened Today, Scheduled, Assignments and Trash on a phone viewport and looked for the sidebar, a menu button, anything.
- What I expected: a hamburger, or a bottom bar with Desk / Today / Scheduled / folders.
- What happened: the sidebar is gone and nothing replaces it. The page has a tab strip, a mode icon and a filter icon, and that is all. From Trash there is not even a tab title, just an "×". A phone user who lands on Today can never reach Scheduled or a folder except by typing a URL. (screenshot: adv-places/30_m_today.png, adv-places/30_m_trash.png)
- Suggested fix (one line): a sidebar toggle in the top bar under 768px, or a bottom tab bar with the six places.

### F2. On the phone the task panel runs off the right edge, close button included — severity: blocker
- Where: any task row, phone viewport
- What I did: tapped "Call mum" on Today.
- What I expected: a full-width sheet with a visible close.
- What happened: the panel opens at desktop width; the close "×", the "…" menu and the end of the chip row are cut off beyond the screen. Escape closes it, which a phone does not have. (screenshot: adv-places/31_m_tap_row.png)
- Suggested fix (one line): make the task surface a full-screen sheet below 640px with the close pinned top-left.

### F3. Done, Anytime and Abandoned exist but nothing points at them — severity: unintuitive
- Where: sidebar, every page
- What I did: tried the jobs "find something I finished last week" and "find the tasks nobody has dated". Read the sidebar, opened the Library "…" menu, the page "…" menu, the "+" new-tab menu and the account menu.
- What I expected: the finished pile and the undated pile one click away, next to Important and All.
- What happened: none of the four menus lists them. The only door is the Search overlay, where "PAGES 9" quietly shows Done, Abandoned and Anytime under the six the sidebar has. I found them by dumping the DOM; a person would not. Finished work is also a collapsed "Completed" group at the bottom of All and Important, so it is reachable two different ways, both hidden. (screenshot: adv-places/08_search_empty.png, adv-places/10_all_completed.png)
- Suggested fix (one line): list all nine places in the sidebar, or a "More…" row under All that expands to the three.

### F4. There is no way to put a task on Today — severity: unintuitive
- Where: Scheduled, Desk, any task row "…" menu; the task panel
- What I did: the job "plan tomorrow / pull this into Today". Opened the row "…" on "Water the plants" (Due 1 Sep): Open in…, History, Move to folder…, Make this a folder…, Copy link, Duplicate, Abandon, Delete task…. Right-clicked the row: nothing. Opened the task panel: folder, due date, reminder, repeat.
- What I expected: "Add to Today" somewhere in that list, a sun icon on hover, or dragging the row onto "Today" in the sidebar.
- What happened: nothing on the client offers it. Today's subtitle says "What I am doing today" but the only things on it are tasks that happen to be due today plus the "Carried over" overdue one. The only way to get a task onto Today is to change its due date to today, which is a different thing. (screenshot: adv-places/23_row_menu.png)
- Suggested fix (one line): an "Add to Today" item in the row menu and on the task panel, and let rows drop on the Today sidebar entry.

### F5. The List / Board / Calendar switch is one icon you have to hover — severity: unintuitive
- Where: top-right of every place page
- What I did: on Scheduled, looked for a way to see a calendar. The toolbar shows a list icon and a filter icon. Only when the mouse passes over the list icon do two more icons slide out, and a tooltip says "Calendar".
- What I expected: three visible segments, or at least a dropdown arrow on the icon.
- What happened: it took a DOM dump to learn the page has a calendar at all. Same pattern on Assignments, where the "Everyone / You" scope is a single people icon that only reveals "You" on hover. (screenshot: adv-places/01_scheduled.png at rest, adv-places/02_mode_hover.png hovered, adv-places/24_assign_strip.png)
- Suggested fix (one line): keep the strip expanded whenever a page offers more than one view; collapse only under a narrow width.

### F6. Dragging a task to another day on the calendar does nothing — severity: clunky
- Where: Scheduled, Calendar mode, Month view
- What I did: pressed on "Water the plants" (1 Sep), dragged it slowly to 8 Sep, released.
- What I expected: the task to move to 8 Sep, or at least a "can't do that" hint.
- What happened: nothing moved, no toast, no cursor change. A calendar that shows events but will not let you move them feels broken rather than read-only. Clicking a day cell does work (it opens a blank task dated that day), so there is an editing story, just not the one people try first. (screenshot: adv-places/22d_before_drag.png, adv-places/22e_after_drag.png)
- Suggested fix (one line): enable event drag to reschedule, or show a read-only cursor and tooltip so the silence is not mistaken for a bug.

### F7. Calendar opens on August with today three weeks below the fold — severity: clunky
- Where: Scheduled, Calendar mode, Month view, first open
- What I did: switched to Calendar on 30 Aug.
- What I expected: to see today and what is coming this week.
- What happened: the grid starts on 27 Jul and rows 1 to 3 of August are empty. Today (Sun 30) is in the last row, below the screen, with every task I have. Week view is right there but Month is the default. On the phone the grid is the same and nothing at all is visible. (screenshot: adv-places/01_scheduled_mode_calendar.png, adv-places/30_m_scheduled_mode_calendar.png)
- Suggested fix (one line): default to Week view, or scroll the month so today's row is in view.

### F8. The expanded row and the task panel disagree about whether a task repeats — severity: clunky
- Where: Scheduled, "Water the plants"
- What I did: clicked the chevron to expand the row inline, then clicked the title to open the panel over it.
- What I expected: the same task to say the same things.
- What happened: the inline card says "Repeat: Does not repeat"; the panel above it, and the calendar's ghost occurrences on 5 and 12 Sep, say "Weekly on Tuesday". Both are on screen at once in the screenshot. One of them is wrong and I cannot tell which to trust. (screenshot: adv-places/15b_click_title.png)
- Suggested fix (one line): the inline expansion should read the same task record as the panel.

### F9. Assignments for one person is a wall of "From Adv-Places" — severity: cosmetic
- Where: Assignments
- What I did: opened it with no collaborators.
- What I expected: an empty state like "Nobody has handed anything over yet", or the to-me / from-me split the page is meant for.
- What happened: one group, "You 15", every one of my own tasks, each tagged "From Adv-Places", that is, from me to me. The subtitle "Who's carrying what" promises a picture of other people; the page is All with an extra chip. (screenshot: adv-places/01_assignments.png)
- Suggested fix (one line): hide the "From <self>" chip and show an empty state when nobody else is in any folder.

### F10. Trash: Restore and Delete only appear on hover, and the tab has no name — severity: clunky
- Where: Trash
- What I did: opened Trash to recover "Renew the library card". Stared at the row: a title, "30d left", nothing to click. Hovered: "Restore" and "Delete" faded in. Clicked Restore: the row vanished, no toast saying where it went (it went back to Reading; I learned that from the folder count).
- What I expected: visible buttons and a "Restored to Reading — Undo" toast, and the tab at the top to read "Trash" rather than a blank "×".
- What happened: the job took 2 clicks once I knew to hover; the confirmations ("Delete for ever?" / "Keep it") are excellent and honest. (screenshot: adv-places/01_trash.png, adv-places/17_trash_hover.png)
- Suggested fix (one line): always show Restore, name the tab, and toast "Restored to <folder>".

### F11. "Done" and "Completed" are the same word twice — severity: duplicate
- Where: Done page, "Done today (3)" on Today, "Completed" group on All / Important / Scheduled, the "0 of 3 done" count
- What I did: read the labels.
- What happened: the finished pile is called Done in two places and Completed in three others. A first-timer reads them as two states.
- Suggested fix (one line): pick "Done" everywhere.

### F12. All groups undated tasks by folder but labels Desk's group "Anytime" — severity: unintuitive
- Where: All; also Trash copy
- What I did: scrolled to the undated section.
- What happened: after "Scheduled" the groups are "Anytime" (one task, from Desk), "Dana launch" (one), "Reading" (one). Three undated tasks, three groups, two different axes; the Anytime page shows all three together. The Trash likewise has two different 30-day sentences ("Deleted items are kept for 30 days, then removed." when full, "Anything you delete waits here for 30 days." when empty). (screenshot: adv-places/10_all_completed.png)
- Suggested fix (one line): one "Anytime" group for every undated task, and one Trash sentence.

## What is good (keep)
- The Scheduled list's groups (Overdue / Today / Tomorrow / Next week / September) answer "what is due this week" in one click; the calendar's Week view is clean and the repeat ghosts are dotted so they read as "not real yet".
- Today's "Carried over" group is exactly what I want first, and "Done today (3)" collapsed below is a good recap.
- The Trash confirmations are the best copy in the app: "This cannot be undone, and it is the only act in Dana that cannot." and the "Keep it" button.
- The filter panel (Due: today / next 7 days / rest of this month, save as view) is complete and quick.
- Clicking a day in the calendar makes a task dated that day, and the empty states on Abandoned and Trash explain themselves.

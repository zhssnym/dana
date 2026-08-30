# Search overlay and notifications bell — adversarial user round, 2026-08-30

**Search does its one job well (half a name, one click, Enter); the bell does not do its one job: a comment on my task and a task assigned to me produced no notification at all, and on a phone neither control can be reached.**

## Findings

### F1. The bell stays silent for the two things its own empty state promises  — severity: blocker
- Where: sidebar bell, "Notifications" popover
- What I did: had a second account (`adv-search-b`, a member of my "Dana launch" folder) comment on my task "Write the 2.0 release note", create a task assigned to me, reassign "Re-register the CI runner" to me, and also leave a comment on the folder itself.
- What I expected: four notifications, or at least the two that are about me.
- What happened: exactly one arrived, for the folder-level comment. The task comment, the new task assigned to me and the reassignment produced nothing (the API list confirms it: only `commented` events, all folder-level). Meanwhile the bell's empty state reads "Nothing new. When someone assigns you a task or answers you, it lands here", which is precisely what did not land. (screenshots: adv-search/30-B-bell.png for the promise, 31-A-bell-2unread.png for what actually arrives)
- Suggested fix (one line): notify the assignee on assign/reassign and the task's assignee on a task comment, or rewrite the empty state so it does not promise them.

### F2. On a phone there is no search and no bell  — severity: blocker
- Where: 390×844, any page
- What I did: opened `/app` on the phone viewport and looked for the magnifier and the bell; enumerated every visible button.
- What I expected: a menu button or a top bar carrying search and notifications.
- What happened: the sidebar is gone and nothing opens it; the visible controls are the tab strip, list/filter/more, and the task rows. Search opens only with Ctrl+K, which no phone has. The bell is unreachable full stop. (screenshot: adv-search/51-m-shell.png; 53-m-search-rele.png shows the overlay itself is fine once forced open)
- Suggested fix (one line): put search and the bell in the phone top bar, or add a menu button that reveals the sidebar.

### F3. Clicking a notification drops you on the folder page with the comment nowhere in sight  — severity: clunky
- Where: bell popover, notification row
- What I did: clicked "Adv-Search-B created Fourth note from B, folder level., commented".
- What I expected: to land on that comment.
- What happened: the "Dana launch" folder page opened at the top, the unread dot went away, and the comment lives in a collapsed "Conversation" section below the fold that I had to scroll to and would still need to expand. 3 actions to read one comment, after being told about it. (screenshots: adv-search/22-after-click-notif.png, 42-after-notif-scrolled.png)
- Suggested fix (one line): open the folder with Conversation expanded and scrolled to the comment, and open the task itself for a task comment.

### F4. The notification sentence is not a sentence  — severity: unintuitive
- Where: bell popover
- What I did: read a notification.
- What I expected: "Adv-Search-B commented on Dana launch: 'Hey adv-search, can you add…'".
- What happened: "**Adv-Search-B** created Hey adv-search, can you add the covers paragraph?, commented". The verb comes before the quote, the quote is not quoted, and "commented" is tacked on after a comma; nothing says which folder or task it is about. (screenshot: adv-search/31-A-bell-2unread.png)
- Suggested fix (one line): actor + verb + place, then the comment body quoted and truncated on its own line.

### F5. "Pages" are only findable before you type  — severity: unintuitive
- Where: search overlay
- What I did: opened search, saw "PAGES 9" (Desk, Today, Scheduled…), then typed "sched", "today", "done", "abandon".
- What I expected: the matching page to be offered, since the placeholder says "Search the tasks, folders and pages you can access."
- What happened: "No matches for that search" for sched/today/abandon; "done" found only a task with Done in its title. The page list is shown only while the box is empty, where it is a copy of the sidebar six centimetres to the left. (screenshots: adv-search/05-search-empty.png, 37-search-done-page.png)
- Suggested fix (one line): match page names as you type, and drop the empty-state page list or replace it with recent items.

### F6. After Escape, the "Search · Ctrl K or /" tooltip parks itself over the bell  — severity: clunky
- Where: sidebar header, after closing search with Esc
- What I did: opened search from the magnifier, pressed Escape, then went to click the bell next to it.
- What I expected: the tooltip to be gone once I am done with search.
- What happened: focus returns to the magnifier and its tooltip stays open, covering the bell; my click on the bell was swallowed by the tooltip until the mouse moved away. (screenshot: adv-search/43-tooltip-after-esc.png)
- Suggested fix (one line): do not show the tooltip on programmatic focus return, or dismiss it on any pointer move.

### F7. Two close controls, and the one that looks like a button is not one  — severity: duplicate
- Where: search overlay header, "ESC" pill and "×"
- What I did: clicked the "ESC" pill.
- What I expected: it to close the overlay like the × beside it, since it is drawn as a raised key.
- What happened: nothing; only the × and the real Escape key close it. Two affordances for one act, one of them dead. (screenshot: adv-search/06-search-rele.png)
- Suggested fix (one line): keep the ×, and either make the ESC pill click-to-close or move it into the footer hints with ↑↓ and ↵.

### F8. Every result wears a "Pending" chip  — severity: cosmetic
- Where: search results, task rows
- What I did: typed "the" and got 14 tasks.
- What I expected: a status chip only when a task is not simply open.
- What happened: twelve grey "Pending" chips and two green "Completed" ones; the twelve say nothing and push the dates around. (screenshot: adv-search/12-search-the.png)
- Suggested fix (one line): show the chip only for Completed and Abandoned.

### F9. Comments are not searchable  — severity: unintuitive
- Where: search overlay
- What I did: typed "smoke subset", words from a seeded folder comment; then "prototype" (task notes) and "knives" (a step).
- What I expected: all three to hit.
- What happened: notes and steps matched, comments did not. Someone who was just told "X commented" would type the comment's words next. (no screenshot; text results)
- Suggested fix (one line): index comment bodies and show them as a fourth group with the task or folder they belong to.

## What is good (keep)
- Finding a task by half its name is 1 click (or Ctrl+K or /), four letters and Enter; results appear as you type and the tooltip advertises both shortcuts. (adv-search/04-hover-search.png, 06-search-rele.png)
- Folders and shelves come back as their own labelled groups and one click lands on the right page; the arrow on the highlighted row and the ↑↓/↵ footer make keyboard use obvious. (08-search-apart.png, 09-search-home.png)
- Notes and step text match, so "prototype" finds the release note.
- Completed tasks are still found and say so in green. (10-search-boxes-completed.png)
- "No matches for that search" is plain; Esc, ×, and clicking outside all close it. (11-search-nothing.png)
- The bell carries an unread count, "Mark all read" clears it in one click, and the empty state explains itself (once it stops promising what F1 shows it does not deliver). (31-A-bell-2unread.png, 32-A-after-mark-all.png)
- The phone overlay itself lays out fine at 390 wide; it is only unreachable. (53-m-search-rele.png)

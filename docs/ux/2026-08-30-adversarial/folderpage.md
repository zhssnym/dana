# Folder page — adversarial user round, 2026-08-30

**The list, the board and the conversation do their jobs, but half the page's tools only exist while the mouse hovers over them, "who changed what" answers "Edited edited the page" seven times, and "Move to shelf" does not list any shelf.**

Tested at 1440×900 and 390×844 on the seeded "Dana launch" folder, its duplicate, and a fresh empty folder "Garden". Click counts are from the folder page with the sidebar open.

## Findings

### F1. "Move to shelf" offers no shelves  — severity: blocker
- Where: folder page, "..." menu → "Move to shelf"
- What I did: opened the "..." menu at the top right, hovered "Move to shelf". I have two shelves in the sidebar, Home and Work.
- What I expected: Home and Work in the submenu.
- What happened: the submenu contains one row, "No group", already ticked (screenshot: adv-folderpage/35-move-shelf.png). Nothing to pick. And the menu says "shelf" while the only row says "group", so I am not even sure the two words mean the same thing.
- Suggested fix (one line): list the shelves in the submenu and use one word, shelf, everywhere.

### F2. The section, paragraph and image tools are invisible until you hover a blank line, and never appear on a phone  — severity: blocker
- Where: folder page, between the task list and "Completed"
- What I did: looked for a way to add a section. Nothing on the page says section, paragraph or image. Only by dragging the mouse through the empty gap under "Add a task" did a thin line with "Section | Paragraph | Image" chips appear (screenshots: adv-folderpage/03-hover-gap.png, then 09-insert-hover.png).
- What I expected: a visible "+" or an "Add section" line, the way "Add a task" is visible.
- What happened: on desktop it took a lucky hover to discover; at 390 px the chips stay at opacity 0 because there is no hover on a touchscreen, so a phone user cannot add a section, a paragraph or an image at all (adv-folderpage/52-phone-insert.png shows blank space where they sit).
- Suggested fix (one line): show a permanent low-key "+ Add section, paragraph or image" row under the list, always visible on touch.

### F3. History cannot tell me who changed what  — severity: unintuitive
- Where: "..." menu → "History", and the "Edited just now" button in the toolbar
- What I did: after adding a section, renaming it, adding two tasks, writing a paragraph, deleting the section and inviting someone, I opened History.
- What I expected: rows like "Added section Before launch", "Invited ana@example.com".
- What happened: six identical rows "Edited edited the page — Adv-Folderpage" and one "Created" (adv-folderpage/23-history.png). The word "Edited" is printed twice in every row. The invite and the task additions do not appear at all. The "Edited just now" button opens a popover titled "Activity" with the same list, so there are two doors into the same useless room (adv-folderpage/24-edited-popover.png).
- Suggested fix (one line): describe each change ("Added section 'Before launch'", "Sent invite to ana@…") and keep one entry point.

### F4. A new section is called "New section" and typing appends to it  — severity: clunky
- Where: the section title box that appears after clicking the "Section" chip
- What I did: clicked "Section", the box opened with "New section" in it and the cursor at the end; I typed my name for it and pressed Enter.
- What I expected: what I typed to replace the placeholder.
- What happened: the heading became "New sectionBefore launch" (adv-folderpage/10-section-added.png shows the pre-filled text, 11-section-named.png the result). I had to click the title, select all and retype: 5 extra actions.
- Suggested fix (one line): open the box empty with "New section" as a placeholder, or pre-select the text.

### F5. Deleting a section is a bare "×" with no confirmation and no undo  — severity: clunky
- Where: section heading, the small "×" right of the name
- What I did: hovered a section heading; a small "×" appeared next to it; I clicked it to see what it was.
- What I expected: a collapse, or at worst a question first; the "Delete folder…" menu item gets an undo toast, so a section should too.
- What happened: the section vanished at once, its two tasks dropped into the loose list, and no undo toast appeared (adv-folderpage/16-delete-section.png; the page had no "Undo" text anywhere afterwards).
- Suggested fix (one line): use a trash icon or put it in a menu, and show the same "Deleted … Undo" toast the folder gets.

### F6. Tasks typed under a section come out in reverse order  — severity: unintuitive
- Where: "Add a task" under a section
- What I did: typed "Check the domain", Enter, "Tell Ana", Enter.
- What I expected: Check the domain, then Tell Ana, as in the loose list where the seeded tasks are oldest first.
- What happened: Tell Ana above Check the domain (adv-folderpage/13-two-tasks.png). Newest-on-top in sections, oldest-on-top outside them.
- Suggested fix (one line): append new tasks at the bottom of a section, same as the loose list.

### F7. Board view shows the finished tasks twice  — severity: duplicate
- Where: folder page, Board mode
- What I did: switched to Board. Dragged "Try the folder board with a Done column" into the Done column, which worked nicely.
- What I expected: Done to be the only place completed tasks live on the board.
- What happened: the same completed tasks are also under a collapsible "Completed (1)" under the board, so the count moved from 1 to 2 in both places (adv-folderpage/06-board.png, 06c-afterdrag.png). Also the only column is named "No section" when the folder has no sections at all, which reads like something is missing.
- Suggested fix (one line): hide "Completed" in Board mode and call the single column "Tasks" until a section exists.

### F8. The List/Board switch is one icon until hovered  — severity: unintuitive
- Where: toolbar, top right
- What I did: looked for how to get a board. There is one list icon; the board icon is width 0 until the mouse is over it (adv-folderpage/02-folder.png versus 06a-viewhover.png).
- What I expected: two icons side by side, like the phone shows once you know to tap.
- What happened: found by accident; on the phone it works only after a first tap that does nothing visible.
- Suggested fix (one line): keep both icons visible at all times; they are 28 px wide.

### F9. Duplicate reorders the tasks and reopens the finished ones  — severity: unintuitive
- Where: "..." menu → "Duplicate"
- What I did: duplicated "Dana launch" (2 of 9 done).
- What I expected: the same list in the same order, maybe with everything reopened if that is the rule.
- What happened: "Dana launch (copy)" says 0 of 9 done, "Delete the old workflow docs" (completed in the original) is back as an open task in the middle of the list, and "Re-register the CI runner" jumped above "Point Render back at main" (adv-folderpage/34-duplicated.png). Comments were not copied, the paragraph was. No line says what a duplicate keeps.
- Suggested fix (one line): keep the original order and either keep done state or say "Duplicate as a fresh copy" in the menu.

### F10. "Delete folder…" promises a question and does not ask one  — severity: cosmetic
- Where: "..." menu, last item
- What I did: clicked "Delete folder…".
- What I expected: the "…" means a dialog.
- What happened: the folder was gone immediately, replaced by the Desk, with a "Deleted 'Dana launch (copy)' Undo" toast in the bottom left that sits on top of my account name (adv-folderpage/36-delete-confirm.png). The undo is good; the ellipsis is a lie. Restore from Trash worked in one click and the folder reappeared in the sidebar (41-restored.png), though nothing took me to it.
- Suggested fix (one line): drop the "…" and move the toast off the account button.

### F11. Sharing panel is cut off on the phone  — severity: clunky
- Where: "Share" button, 390 px wide
- What I did: tapped Share.
- What I expected: a full-width sheet.
- What happened: the panel's left edge sits off-screen: "re Dana launch", "bers can view", "hoose a person", "ding invites" (adv-folderpage/53-phone-share.png). Everything is reachable, nothing is readable. On desktop the panel is fine: invite by email took 1 click plus Enter and the pending invite appeared with Cancel/Resend (21-share-invited.png).
- Suggested fix (one line): make the panel 100vw at narrow widths.

### F12. Board cards on the phone wrap one word per line  — severity: cosmetic
- Where: Board mode at 390 px
- What happened: two columns of about 140 px each, so "Point / Render / back at / main" takes four lines and the due date wraps too (adv-folderpage/51-phone-board.png).
- Suggested fix (one line): one column at a time with horizontal swipe, or full-width columns.

### F13. Conversation: name on the left, bubble on the right  — severity: cosmetic
- Where: Conversation at the foot of the page
- What happened: every message has the author's name at the far left of the page and the dark bubble at the far right with the avatar after it, so the eye has to cross 700 px of empty space to pair them (adv-folderpage/25-conv.png). A reply's quote shows the quoted text first and the quoted author after it, which reads backwards. Like/Reply/Edit/Delete show only on hover, which on the phone means only after a tap. The comment that was posted on a task shows here with no hint it belongs to a task.
- Suggested fix (one line): put the name above its own bubble and mark task comments with the task's name.

## What is good (keep)
- Adding tasks: "Add a task" is visible, Enter adds, and the box stays open for the next one.
- Drag from a column to Done on the board works on the first try and updates the "x of y done" counter.
- Sharing on desktop: members, "share with someone you're connected to", invite by email, pending invites with Cancel/Resend, all on one panel with one sentence explaining what a member can do.
- Conversation posting, reply, like and "Move to side panel" all work in one click each; the side panel keeps the page usable next to the chat.
- Renaming: both the menu's "Rename" and a click on the title edit in place; two doors, but the same room and no dialog.
- Delete folder has Undo, Trash lists the folder with "9 tasks · 30d left" and one-click Restore.
- The empty folder simply says "No tasks yet. Add one below." with no starter pitch; the "Start with an example" offer appears only on the Desk of a brand-new account, which is the right place for it.

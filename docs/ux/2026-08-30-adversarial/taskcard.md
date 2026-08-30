# The open task (card / task surface) — adversarial user round, 2026-08-30

**Opening a task, setting its date and reminder, writing a note and posting a comment all work in a click or two, but steps are a trap (a blank "New step" is saved the moment you press "Add a step", and Enter on that button keeps making more), the card is unusable on a phone (680 px wide on a 390 px screen, the Close button off-screen), and the "Tab" surface-mode setting does not do what it says.**

## Findings

### F1. "Add a step" saves a blank "New step" before I have typed anything, and Enter makes more of them  — severity: blocker
- Where: open task, Steps section, "+ Add a step"
- What I did: clicked "+ Add a step" and started typing "Buy boxes", then pressed Enter, expecting to type the next one (task "Re-register the CI runner").
- What I expected: an empty text box with the caret in it; type, Enter, next step. One click and three lines of typing for three steps.
- What happened: a step literally called "New step" appeared and was saved to the server immediately; my typing went nowhere because focus stayed on the "Add a step" button, and each Enter pressed that button again. After one attempt at three steps the task had 13 "New step" rows, then 23 (screenshots: adv-taskcard/22-three-steps-added.png, adv-taskcard/42-title-after-enter.png). The real way is click "Add a step", then click the words "New step", then type, then Enter: three clicks per step, and nothing on screen says the second click exists (adv-taskcard/33-typed-into-new-step.png shows the row highlighted but no caret). Removing the blanks with the × did not stick either: after a reload all 23 came back (adv-taskcard/44-reopened.png), while a toast "Something went wrong. Nothing was saved. Try again." sat in the corner for minutes and across page changes (adv-taskcard/42, 43).
- Suggested fix (one line): "Add a step" should open an empty, focused inline input, save only on Enter/blur with non-empty text, and Enter should chain to the next step.

### F2. On a phone the card is wider than the screen and the Close button is off it  — severity: blocker
- Where: open task at 390×844
- What I did: tapped a task in All.
- What I expected: a full-screen sheet with a visible way back.
- What happened: the dialog measures 680 px wide on a 390 px viewport; the title is cut, the chip row ends at "No reminder" with "Does not repeat" and the Dialog/Sidebar/Tab/Close icons all off-screen, and the comment bubble is clipped (screenshots: adv-taskcard/75-phone-open.png, adv-taskcard/67-phone-open.png). The only ways out I found were the keyboard Escape or tapping the sliver of list under the card, neither of which a phone user has or would try.
- Suggested fix (one line): at narrow widths make the card a full-width sheet (max-width 100vw) with the close control pinned in view.

### F3. "Where a task opens: Tab" is accepted but ignored, and the tab page is a dead end  — severity: unintuitive
- Where: Settings › Appearance › "Where a task opens" (Dialog / Panel / Tab); the ↗ "New tab" icon in the card header
- What I did: chose "Tab", saw the caption change to "As a tab of its own", went back to All and clicked a task.
- What I expected: the task to open as a tab.
- What happened: a dialog opened, exactly as before (screenshot: adv-taskcard/92-tab-setting-open.png). Choosing "Panel" did work (adv-taskcard/65-opened-as-panel.png). Separately, the ↗ icon in the card does open a tab at /app/tasks/…, but that page is a read-only sheet titled "Task" with the notes and steps as plain text and one button, "Open editor", which just pops the same dialog over it (adv-taskcard/86-newtab-mode.png, adv-taskcard/91-open-editor.png). Escape does nothing there; the only way back is the tab's ×. So "Tab" is a third, weaker version of the card rather than the card in a tab. The Settings caption "The state sheet draws both, side by side, if you want to compare them before choosing" meant nothing to me.
- Suggested fix (one line): either make the Tab setting open the real card as a tab, or drop the option and the ↗ icon until it does; reword the caption in plain words or remove it.

### F4. Two histories, and the inline one is a wall of near-identical lines  — severity: duplicate
- Where: bottom of the open task; the "Edited N minutes ago" pill in the card footer; the row's "…" menu › History
- What I did: added and renamed three steps, then scrolled to the bottom of the card.
- What I expected: one short "Edited 2 minutes ago" line, with the full history somewhere I can ask for it.
- What happened: the card ends in a list of every micro-change, one per line, "Edited added a step by Adv-Taskcard · 30 Aug 2026 at 16:27" repeated 20-plus times, plus "Edited edited a step by …" and "Edited removed a step …" (screenshots: adv-taskcard/57-history-block-inline.png, adv-taskcard/69-phone-scrolled.png). Renaming one step logs a remove and an add. The footer pill opens an "Activity" popover with the same list again (adv-taskcard/58-history-sheet.png), and the row's menu has a third entry, History. Three places, one content, and the grammar is broken ("Edited edited").
- Suggested fix (one line): keep one collapsed "Edited 2 minutes ago" line that expands to a history grouped by minute ("Added 3 steps"), and drop the inline wall.

### F5. The card's "…" menu has no Delete, but the row's "…" menu does  — severity: duplicate
- Where: open task, "…" (More actions) top right; task row "…" in the list
- What I did: opened the card and looked for a way to delete the task.
- What I expected: Delete at the bottom of the card's menu.
- What happened: the card menu has Move to folder…, Make this a folder…, Copy link, Duplicate (screenshot: adv-taskcard/18-more-menu.png). The row menu, one layer back, has Open in…, History, Move to folder…, Make this a folder…, Copy link, Duplicate, Abandon, Delete task… (adv-taskcard/40-row-more-menu.png). Same icon, same name, different contents; to delete a task I had to close it first. Three clicks instead of two, and I only found it by luck.
- Suggested fix (one line): one menu for a task, wherever it is opened from, with Abandon and Delete task… at the bottom of both.

### F6. "Make this a task" is not discoverable: no menu, no right-click, only a hidden long-press  — severity: unintuitive
- Where: open task, a step row
- What I did: hovered a step (got a drag handle and an ×), right-clicked it (nothing), clicked the handle (nothing), long-pressed it with the mouse (it went into rename mode instead, screenshot: adv-taskcard/54-after-longpress.png).
- What I expected: a small menu on the step with "Make this a task" or similar.
- What happened: I could not find it. The controls that exist ("Leave selection", "Move to") only appear once a selection is started by a press-and-hold, which nothing hints at, and with a mouse the press-and-hold turns into a rename.
- Suggested fix (one line): give each step a "…" on hover with Rename, Make this a task, Remove, alongside the long-press.

### F7. Due date picker: no time, "Custom date…" is a toggle with a tick, and "Next week" equals "Tomorrow"  — severity: unintuitive
- Where: open task, "Due today" chip
- What I did: tried to set "next Tuesday at 9".
- What I expected: pick the day, pick the time, one picker.
- What happened: the panel has Today / Tomorrow / This weekend / Next week / Clear and an always-open calendar, but no time anywhere (screenshot: adv-taskcard/13-due-picker.png). "Custom date…" carries a checkmark and clicking it collapses the calendar (adv-taskcard/37-custom-date.png), which reads as "custom date is on" rather than "show calendar". On a Sunday, "Tomorrow" and "Next week" both say "Mon 31 Aug". The time turned out to live in the Reminder chip (9:00 AM / 12:00 PM / 5:00 PM / a clock field, adv-taskcard/15-reminder-picker.png), so the job took two chips and four clicks, and I only guessed that because rows in the list show "Due 4 Sep 9:00 AM".
- Suggested fix (one line): hide "Custom date…" and show the calendar plainly, make "Next week" land on next Monday rather than tomorrow, and put a "Time…" line under the day so the due chip can carry both.

### F8. The expanded row (chevron) shows different steps from the card  — severity: clunky
- Where: All list, the ⌄ chevron at the right of a row
- What I did: clicked the chevron on "Re-register the CI runner", whose steps are "Download the runner", "Configure as a service", "Push a branch to see a run".
- What I expected: the same card, inline.
- What happened: the row grew into the card, but the steps read "Step 1", "Step 2", … "Step 16" (screenshot: adv-taskcard/11-chevron-expand.png). Clicking the row itself opens the dialog with the real names (adv-taskcard/12-open-task-with-steps.png). Two ways to open a task, one of them wrong.
- Suggested fix (one line): feed the expanded row the real step titles, or drop the inline expansion and keep one way to open.

### F9. A posted comment is drawn as a right-hand bubble with the author's name floating on the left  — severity: cosmetic
- Where: open task, Comments
- What I did: typed a comment, pressed Enter (it posted; Shift+Enter made a new line, which is right).
- What I expected: name, time, then the text under it.
- What happened: "Adv-Taskcard · just now" sits at the left edge, the text is a black bubble against the right edge with an avatar after it, and the hover actions (like, reply, edit, delete) float in the gap between them (screenshot: adv-taskcard/56-comment2-posted.png). It reads as a chat app inside a to-do card and the eye has to travel 400 px from name to text.
- Suggested fix (one line): left-align comments as name + time + text like every other block in the card.

### F10. Escape while typing a note closes the whole card  — severity: clunky
- Where: open task, Notes
- What I did: typed two lines in "Write a note" and pressed Escape to leave the field.
- What I expected: to leave the field and stay in the card.
- What happened: the card closed (the note was saved, which was a relief; screenshot: adv-taskcard/82-note-after-reload.png). Inside a picker Escape correctly closes just the picker, so the two feel inconsistent.
- Suggested fix (one line): first Escape blurs the field, second closes the card.

### F11. The three header icons (Dialog / Sidebar / New tab) are unlabeled and the choice is silently remembered  — severity: cosmetic
- Where: open task, top-right of the card
- What I did: hovered them; tooltips exist ("Sidebar", screenshot: adv-taskcard/83-hover-sidebar-icon.png) but nothing explains why a to-do card has three ways to be drawn, and the choice sticks, so after pressing one by accident every task opened as a side panel until I found the icon again (adv-taskcard/88-reopen-which-mode.png).
- Suggested fix (one line): fold the three into a single "Open in ▾" and keep the remembered default in Settings only.

## What is good (keep)
- Click the row, the card opens; one click, and the title is right there and editable in place.
- The four chips in one strip (folder, due, reminder, repeat) are the right four and each opens with one click; the Folder picker and the Repeat picker are short and plain, and "Custom repeat…" is there without cluttering the list.
- The Reminder picker's three presets plus a clock field is exactly enough.
- Ticking a step is one click and persists; renaming a step by clicking its text and pressing Enter is fine once you know.
- Notes save on their own, no Save button, and survive a reload.
- Comments: Enter posts, Shift+Enter breaks the line, the "+" beside the box offers Add a file / Add a link / Mention someone, and "Add a file" opens the real file chooser.
- Duplicate is one click, names the copy "(copy)", and the toast has Undo.
- Escape closes the card from anywhere except inside a picker, and clicking the dimmed list behind also closes it.
- The Panel mode is genuinely useful: list on the left, task on the right, and the setting for it works.

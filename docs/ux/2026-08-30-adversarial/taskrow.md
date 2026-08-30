# Task row and list — adversarial user round, 2026-08-30

**The row itself is calm and the everyday jobs are fast (five tasks in under two seconds, tick in one click, undo in one), but bulk delete lies to me three different ways, the expanded row names the wrong folder, and the quick-add's "full form" button throws away what I typed.**

Driven headless at 1440×900 in the folder "Apartment move", on Desk and on Today, then at 390×844. Click counts are for a person who has never seen the app.

## Findings

### F1. Bulk delete says "can't be undone", then offers Undo, then Trash has everything  — severity: blocker
- Where: folder page, selection bar, trash-can button → confirm dialog → toast → Trash page
- What I did: press-and-hold "Renew passport", tapped "Dentist next friday 3pm" and "Call mum tomorrow" (bar read "3 selected"), clicked the trash icon, read "Delete these 3 tasks? This can't be undone.", clicked "Continue". Then clicked Undo on the toast. Then opened Trash.
- What I expected: one truth. Either it is gone for good, or it is undoable, and Undo puts back what I deleted.
- What happened: the toast said `Deleted "Call mum tomorrow"` and Undo restored only that one; the other two stayed gone from the folder. Trash then listed both of them as "30d left" with Restore. So the dialog is wrong (it is undoable, and it is in Trash for 30 days), the toast names one of three, and Undo restores one of three (screenshots: adv-taskrow/29-delete-clicked.png, 30-after-delete.png, 31-after-undo.png, 37-trash.png).
- Suggested fix (one line): one toast `Deleted 3 tasks · Undo` whose Undo restores all three, and drop "This can't be undone" from the dialog since Trash keeps them.

### F2. The expanded row says my task lives in "Desk" when it lives in "Apartment move"  — severity: blocker
- Where: folder page, the chevron at the right of a row → inline expanded card, first chip
- What I did: added "Call mum tomorrow" through "Add a task to Apartment move", clicked its chevron.
- What I expected: the folder chip to read "Apartment move".
- What happened: the chip read "Desk". Clicking the title instead opens a dialog for the same task, and that one reads "Apartment move". The API also says Apartment move, so the inline card is the one that is wrong; a person would think their task silently moved (screenshots: 10-expanded.png vs 14-title-click.png).
- Suggested fix (one line): the inline card must read the folder from the same source the dialog does.

### F3. "Open full form" from the quick-add opens an empty form and leaves my text behind  — severity: clunky
- Where: folder page, quick-add input, the sliders icon at its right ("Open full form")
- What I did: typed "Full form test" into "Add a task to Apartment move" and clicked the sliders icon, wanting to add a date.
- What I expected: the form to open with "Full form test" in the title.
- What happened: a dialog opened with a blank title and the cursor in it; my text stayed in the quick-add underneath. Escape did not close the dialog (twice), only the X did. Closing it created nothing, and my text was still sitting in the quick-add (screenshot: 05d-full-form.png).
- Suggested fix (one line): carry the typed title into the form, and let Escape close it.

### F4. Five tasks typed in order come out backwards, and on Desk the new one lands in the middle  — severity: unintuitive
- Where: folder page and Desk, quick-add
- What I did: typed Buy milk, Call mum tomorrow, Pay rent on 5 sept, Dentist next friday 3pm, Renew passport, Enter after each (1 click, 5 Enters, 1.7 s). On Desk added "Desk task one".
- What I expected: to see them under the existing rows in the order I typed them; on Desk, at the bottom.
- What happened: in the folder they sat below the seeded rows but reversed: Renew passport first, Buy milk last. On Desk the new task appeared third of four, above "Think about the shelf pages" (screenshots: 04-after-5-adds.png, 40-desk-added.png).
- Suggested fix (one line): a new task goes to the end of the visible list, in typing order.

### F5. Dates typed in the title stay as words  — severity: unintuitive
- Where: quick-add
- What I did: typed "Call mum tomorrow", "Pay rent on 5 sept", "Dentist next friday 3pm".
- What I expected: at least "tomorrow" to become a date chip, as in every to-do app I have used.
- What happened: all three became plain titles with no date, and nothing hinted that dates go elsewhere (screenshot: 04-after-5-adds.png).
- Suggested fix (one line): parse trailing natural dates and show the chip before Enter, or put a date button in the quick-add bar.

### F6. On Desk, dragging a row never reorders it, it only offers "Hold to make a folder"  — severity: unintuitive
- Where: Desk page, drag a row
- What I did: dragged "Desk task one" upward over "Call mum" exactly as I had in the folder (where it worked and persisted after reload).
- What I expected: the row to move up.
- What happened: the row I passed over collapsed to a sliver and a "Hold to make a folder" pill appeared at once; on release nothing changed, before or after reload. There is no hint that Desk cannot be reordered (screenshots: 41-desk-dragging.png, 42-desk-after-drag.png).
- Suggested fix (one line): either allow reordering on Desk or do not start a drag there, and only offer the folder pill after a deliberate dwell.

### F7. Escape in the quick-add throws my text away, clicking away keeps it  — severity: unintuitive
- Where: folder page, quick-add
- What I did: typed "half typed", pressed Escape; later typed something and clicked the page title.
- What I expected: Escape to leave the box (keeping the text) or at worst clear it; both to behave the same.
- What happened: Escape removed the input and the text; reopening "Add a task" gave an empty box. Clicking away kept the input and its text. Enter on an empty box did nothing silently (screenshots: 05a-half-typed.png, 05c-blur.png).
- Suggested fix (one line): Escape clears only if empty, otherwise blurs; keep it consistent with click-away.

### F8. Three ways to open the same task from one row  — severity: duplicate
- Where: any row
- What I did: clicked the chevron, clicked the title, opened "..." → "Open in…".
- What I expected: one way to open a task.
- What happened: the chevron expands the card inline; the title opens a centred dialog; "Open in…" is a submenu with more targets; and the expanded card's own footer has a fullscreen icon that opens the dialog again. Escape does not collapse the inline card either (screenshots: 10-expanded.png, 12-more-menu.png, 14-title-click.png).
- Suggested fix (one line): one opener on the row (title), the chevron as the only inline expander, and "Open in…" out of the row menu.

### F9. Making a folder from two rows shows two toasts for one action  — severity: duplicate
- Where: folder page, drag one row onto another, hold, "Release to make a folder", name it
- What I did: dragged "Change the address at the bank" onto "Pack the kitchen", held 1.5 s, typed "Chores", Enter. The gesture itself is discoverable and the naming card is clear (4 actions).
- What I expected: one confirmation.
- What happened: bottom-left `Moved "2 tasks" · Undo` (with quotation marks around 2 tasks) and bottom-right `Moved 2 tasks to "Chores"` at the same time (screenshot: 36-folder-made.png).
- Suggested fix (one line): one toast, `Moved 2 tasks to "Chores" · Undo`.

### F10. On a phone the star and the "..." are invisible on a row  — severity: clunky
- Where: 390×844, folder page rows
- What I did: looked for a way to star or open the menu on "Phone task".
- What I expected: a visible star and menu, since there is no hover on a phone.
- What happened: both are drawn at opacity 0 (the chevron at 0.4). Tapping the blank space where "..." would be does open the menu, but nobody will find a button they cannot see; the honest route is chevron → expanded card, two taps. A long press that lands on the date chip also opens the date picker on top of starting a selection (screenshots: 57-m-added.png, 58-m-tap-right-side.png, 53-m-holding.png).
- Suggested fix (one line): show star and "..." at rest on touch devices, and let press-and-hold on a chip select the row without opening the chip.

### F11. The selection bar is icons only and its delete confirm says "Continue"  — severity: unintuitive
- Where: folder page, the bar that appears after press-and-hold
- What I did: held a row (about 0.5 s), read the bar: an X, "1 selected", then six bare icons.
- What I expected: labels, or at least the destructive one named; a confirm button that says "Delete".
- What happened: tick, star, sun, folder-arrow, two-squares, trash with no text; the sun means "Add to My Day" which nothing says. The confirm is "Cancel / Continue" (screenshots: 25-selected-one.png, 29-delete-clicked.png). Press-and-hold itself is fine, Escape and the X both leave, and tapping rows adds them.
- Suggested fix (one line): label the icons (or tooltips on hover) and name the confirm button "Delete".

### F12. Today adds through a floating "Add task" dialog, every other page through an inline "Add a task"  — severity: duplicate
- Where: Today page, bottom-right button
- What I did: looked for the inline "+ Add a task" I had used on Desk and in folders.
- What I expected: the same control.
- What happened: a floating "Add task" (different label) that opens the full dialog with the date pre-set; no inline quick-add (screenshots: 43-today.png, 44-today-add-clicked.png).
- Suggested fix (one line): one quick-add control with one label everywhere; pre-fill the date on Today.

### F13. Small things  — severity: cosmetic
- The undo toast sits over the account name at the bottom of the sidebar (07-ticked-one.png).
- The expanded card's history shows "Edited by Adv-Taskrow · 30 Aug 2026 at 16:22" twice in a row (12-more-menu.png).
- There is a large empty band between the quick-add and "Completed" (08b-completed-open.png).
- On the phone the placeholder reads "Add a task to Apartmen" (57-m-added.png).
- "Set a due date first" floats under the chips with no control near it (10-expanded.png).

## What is good (keep)
- Ticking: one click, the row slides into "Completed" at the bottom grouped by day, a named Undo appears, and un-ticking from there puts it straight back where it was.
- Star on hover is one click with a named Undo; the starred state stays visible at rest.
- Reordering inside a folder works by plain drag and survives reload.
- "..." → "Move to folder…" is three clicks and the submenu lists folders plus "New folder…"; the bulk "Move to a folder" menu explains itself ("Keeps everything else as it is").
- Duplicate makes "Return the keys (copy)" right under the original with Undo.
- Press-and-hold to select, tap to add, Escape or X to leave: discoverable and forgiving. "Hold to make a folder" is a nice gesture once found.
- Row height "One line" in Settings is clear and moves the date chip to the right without losing anything.

# Shelves, folder groups, the new-folder/new-shelf dialogs and the first run — adversarial user round, 2026-08-30

**Shelves work once you find them, but the app calls the same thing "shelf" in one place and "folder group" in the next, a phantom "someone else changed this block" toast sits on every shelf page and never leaves, and on a phone there is no way to open the sidebar at all, so shelves do not exist there.**

## First run, as a brand-new account (`adv-shelves-fresh`, not seeded)

What a person sees on `/app` at 1440x900 (adv-shelves/fresh-01-landing.png): a sidebar with Desk, Today, Scheduled, Assignments, Important, All, then a "Library" holding one entry, also called "Desk", then a "New folder" button and a foot row of "New shelf" plus two unlabelled icons. The main area is a folder page titled "Desk" with an empty-state "No tasks yet. Add one below.", an "Add a task" link, a collapsed "Conversation", and, cut off at the bottom of the viewport, a card "Start with an example". You have to scroll to read the three example cards (fresh-02-scrolled.png): "Plan a trip", "Run a small team", "Learn something new", and a small "No thanks".

Clicking "Plan a trip" (one click) makes a real folder with ten tasks and a page section "Before you book", opens it, and adds it to the Library (fresh-10-after-example.png). A line under the tasks says "This is an example, and it is yours now." That is good and instantly understood.

How long to understand what Desk is: I never did from the screen. It is in the top list with a pen icon and in the Library with a folder icon, both go to a page titled "Desk", and nothing says it is "your folder for tasks that belong nowhere". It reads as the same thing listed twice. A one-line description under the Desk heading on first run ("Tasks that do not belong to a folder land here") would settle it.

Shelves on first run: "New shelf" opens a dialog titled "New folder group" whose folder list is empty, with a bare horizontal scrollbar where the list should be, and the text says Dana cannot save an empty group (fresh-07-newshelf.png). So a newcomer cannot make a shelf at all, and is not told to make folders first. The Import icon opens the operating system file picker with no explanation of what to import (fresh-09-import.png shows nothing changed on screen). Neither icon shows a tooltip after 1.5 s of hovering (fresh-03-hover-import.png).

## Findings

### F1. "New shelf" opens "New folder group", and the word changes at every step — severity: unintuitive
- Where: sidebar foot "New shelf" button; the dialog it opens; the folder menu; the delete confirmation
- What I did: clicked "New shelf" (1 click). Later opened a folder's "More actions" menu, and later "Delete shelf…" on a shelf.
- What I expected: a "New shelf" dialog, and one word for the thing.
- What happened: the dialog is "New folder group" with a "Group name" field and a "Create group" button (adv-shelves/fresh-07-newshelf.png, s-04-newshelf.png). The folder menu has both "New folder group" and "Move to shelf" as separate items (s-03-folder-menu.png); inside "Move to shelf" the way out is called "No group" (m-01-movesub.png). The shelf's menu says "Delete shelf…" and the confirmation says "Delete folder group? 0 folders keep their tasks and move to the ungrouped list." (q-14-deleteshelf.png). Four screens, two names for one object. I spent a good minute wondering whether a group was a lighter thing than a shelf; it is not, "Create group" makes a shelf with a page.
- Suggested fix (one line): pick "shelf" everywhere: "New shelf" dialog, "Shelf name", "Create shelf", "Not on a shelf", "Delete shelf?".

### F2. A phantom "Someone else changed this block. Reload the page to see it." toast on every shelf page, and it never goes away — severity: blocker
- Where: shelf page (Home), bottom right
- What I did: opened the Home shelf, added a folder, clicked "Section". Nobody else is on this account.
- What I expected: no message, or one that disappears.
- What happened: the toast appears on the shelf page and stays through every screenshot afterwards, on the phone too, including after a full reload (p-02-iconpicker.png, q-16-collapsed-reload.png, ph-04-shelfpage.png). Reloading, which it asks for, does not clear it. A newcomer will think their data is being edited by somebody.
- Suggested fix (one line): do not raise the conflict toast for the user's own edits, and auto-dismiss it.

### F3. On a phone there is no way to open the sidebar, so shelves, New shelf and New folder cannot be reached — severity: blocker
- Where: 390x844, any page
- What I did: loaded /app on a phone viewport and looked for a menu button. Tried the top bar, scrolled, then pressed Ctrl+B from the keyboard.
- What I expected: a hamburger or a swipe-in sidebar.
- What happened: the top bar shows only the tab strip, view switch, filter and "…"; the accessibility tree has no navigation at all (ph-01-desk.png). Ctrl+B, which a phone does not have, slides the sidebar in (ph-02-ctrlb.png), and in that view the foot row's icons finally get their names "Import" and "Trash".
- Suggested fix (one line): put a sidebar toggle in the top bar under the desktop breakpoint.

### F4. A shelf with no folders looks exactly like a folder in the sidebar — severity: unintuitive
- Where: sidebar Library
- What I did: read the Library with the seeded shelves "Home" and "Work" beside the folders "Apartment move", "Dana launch", "Reading".
- What I expected: to tell a shelf from a folder at a glance.
- What happened: "Work" has the same folder icon, same indent and same row as "Reading"; the only difference is the missing count badge (s-01-seeded.png, later q-16-collapsed-reload.png where "Side projects" and "Work" sit among folders). The chevron and the "+" appear only on hover or when the shelf is the current page. Home is distinguishable only because the seed gave it a house icon.
- Suggested fix (one line): give shelves a distinct default icon (the stacked-folders glyph the dialog already uses) and always show their chevron.

### F5. The two icon-only buttons beside "New shelf" have no tooltip and one of them opens a bare file picker — severity: unintuitive
- Where: sidebar foot row
- What I did: hovered each icon for 1.5 s, then clicked the first.
- What I expected: a label on hover; on click, a dialog saying what can be imported.
- What happened: no tooltip appeared for either icon (q-12-tip-import.png, q-11-tip-trash.png, and in fresh-03-hover-import.png only a hover background). The first opens the OS file picker straight away with nothing on screen explaining the format. I only learned they are "Import" and "Trash" from the phone-width sidebar where the labels fit.
- Suggested fix (one line): show tooltips on the two icons, and open a small "Import" dialog that names the accepted file before the picker.

### F6. Moving a folder on or off a shelf has no undo and no confirmation — severity: clunky
- Where: folder "More actions" > "Move to shelf" > Home / No group; drag in the sidebar
- What I did: moved "Apartment move" to Home (3 clicks), then back to "No group" (3 clicks), then pressed Ctrl+Z.
- What I expected: a small "Moved to Home. Undo" message like other apps give.
- What happened: the folder jumps in the sidebar and nothing else happens; no toast, and Ctrl+Z does nothing (m-02-moved.png, q-05-ungrouped.png, q-06-ctrlz.png). The only undo is re-doing the three-click move in reverse, and finding the way out means knowing that "No group" at the bottom of a "Move to shelf" list is it.
- Suggested fix (one line): a toast with Undo after every shelf move.

### F7. Dragging a folder onto a shelf also reorders the shelves, and the drag ghost swallows the shelf's name — severity: clunky
- Where: sidebar, drag "Reading" onto "Home"
- What I did: dragged the Reading row onto the Home row.
- What I expected: Reading to land on Home and nothing else to change.
- What happened: while dragging, the Home row itself read "Reading" with Apartment move under it, as if I were replacing the shelf (m-03-dragging.png). After the drop Reading was on Home, but the "Work" shelf had moved from second to last in the Library, below "Dana launch", for no reason I gave it (m-04-dropped.png against m-02-moved.png).
- Suggested fix (one line): keep the drag ghost as a folder row with an insertion line, and never reorder siblings on a drop-into.

### F8. Four ways to put a folder on a shelf, and they do not agree — severity: duplicate
- Where: sidebar "+" on a shelf row, shelf page "Add folder", folder menu "Move to shelf", drag
- What I did: tried each.
- What I expected: one obvious way.
- What happened: the sidebar "+" ("Add folder to Home") only creates a new folder (s-03c-addfolder.png), while the shelf page's "Add folder" is a menu listing existing folders with "New folder…" at the bottom (p-04-addfoldermenu.png). Same label, different behaviour. Then "Move to shelf" and drag do the same as the page menu. The shelf's empty state even lists three of them: "Add a folder below, move one here from its own menu, or drag it here in the sidebar."
- Suggested fix (one line): make the sidebar "+" open the same existing-or-new menu as the page.

### F9. Escape while renaming a shelf neither cancels nor cleanly commits — severity: clunky
- Where: shelf page, the "Shelf name" heading
- What I did: clicked the name, typed "ZZZ", pressed Escape.
- What I expected: the name to snap back to "Home".
- What happened: the field kept "HomeZZZ" while the sidebar still said "Home" (q-02-after-esc.png); in an earlier pass, clicking away afterwards saved "Home sweet home" to the sidebar and the tab (p-08-rename-esc.png, "Renamed just now"). So Escape looks like a cancel, is not one, and the next click saves what you thought you had thrown away.
- Suggested fix (one line): Escape restores the saved name and blurs.

### F10. The shelf's icon picker calls the shelf a "Folder" — severity: cosmetic
- Where: shelf page, click the shelf icon ("Icon and colour for Home")
- What I did: opened the picker.
- What happened: the popover is headed "Folder", and the two lists are named "Folder icon" and "Folder color" (p-02-iconpicker.png). Also, the folder page offers "Add cover" and the shelf page does not, though the shelf page otherwise mirrors it.
- Suggested fix (one line): head the picker with the thing's name, and either give shelves a cover or stop calling that region a page header.

### F11. Clicking "Section" on the shelf page makes a "New section" that is not in edit mode, and the sections pile up below "Add folder" — severity: clunky
- Where: shelf page, the hover-revealed "Section" button between folder rows
- What I did: hovered the gap under a folder, clicked "Section", typed a name.
- What I expected: an editable heading, where I clicked, with the cursor in it.
- What happened: a "New section" heading appeared at the bottom of the page under "Add folder", not where I clicked, and my typing went nowhere (p-07-section-typed.png shows three "New section" rows from three attempts). Note also that the "Section" and "Paragraph" buttons appear on the shelf page but the folder page adds "Image" too; the shelf page has no image block.
- Suggested fix (one line): insert the section at the hovered position with its name field focused.

### F12. A collapsed shelf in the sidebar re-expands on reload — severity: cosmetic
- Where: sidebar, shelf chevron
- What I did: collapsed Home, reloaded.
- What happened: expanded again (q-15-collapsed.png against q-16-collapsed-reload.png).
- Suggested fix (one line): remember the collapsed state per shelf.

## The obvious jobs, counted
- Make a shelf "Home" holding two existing folders: "New shelf", type a name, tick two folders, "Create group": 4 clicks plus typing, quick once you accept that the dialog says "group".
- Find a folder from a shelf: click the shelf's chevron or the shelf link; the shelf page lists its folders with counts. 1 to 2 clicks, fine.
- Undo putting a folder on a shelf: folder "…" > "Move to shelf" > "No group": 3 clicks, no undo offered (F6).
- Make a group instead of a shelf and tell the difference: impossible, because they are the same object under two names (F1); the "New folder group" item in a folder's menu and "New shelf" in the sidebar open the identical dialog.

## What is good (keep)
- "Start with an example" is the best thing on the first run: one click gives a believable folder, opens it, and says in plain words that it is yours to change or delete.
- The "New folder" dialog is one field and one button, with a sentence that says what you get ("Create a private folder in “Home”"); creating from inside a shelf puts the folder there without asking again.
- The shelf page itself is calm: icon, name, description, folder rows with open-task counts, "Add folder" underneath.
- "Move to shelf" as a radio list with the current shelf ticked is a clear picture of where the folder is.
- The "New folder group" dialog validates gently ("Give the group a name", red field) and shows which shelf each folder is already on.

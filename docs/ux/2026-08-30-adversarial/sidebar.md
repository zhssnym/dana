# Sidebar — adversarial user round, 2026-08-30

**Verdict in one line.** On a laptop the sidebar does its main jobs in one or two clicks, but it disappears entirely on a phone, its collapsed rail is unusable, and it says the same thing in too many places (Settings twice, Desk twice, "shelf" under three names, four ways to make a folder).

## Findings

### F1. On a phone there is no sidebar and no way to open one  — severity: blocker
- Where: `/app` at 390×844, and any window narrower than 768 px
- What I did: opened the app on the phone viewport, looked for a menu button, tapped the left edge, swiped from the left edge, pressed Ctrl+B, then loaded `/app/settings` directly
- What I expected: a hamburger or some button that opens the navigation so I can reach Today, my folders, People, Settings and Sign out
- What happened: only the page renders; there is no button anywhere and nothing slides in. The only toggle that exists lives inside the sidebar itself, which is what is hidden. Below 768 px on a desktop the same thing happens (82-w767.png). The only way to change page on a phone is to type a URL (screenshots: adv-sidebar/70-phone.png, adv-sidebar/83-phone-after-swipe.png, adv-sidebar/85-phone-settings.png)
- Suggested fix (one line): put a menu button in the page header when the sidebar is hidden and open it as a sheet.

### F2. The collapsed sidebar shows garbage where the Library was, and clicking a folder opens its menu instead of the folder  — severity: clunky
- Where: sidebar after pressing the collapse button (top row, third icon) or Ctrl+B
- What I did: collapsed the sidebar, looked at it, then clicked the folder icons in the rail
- What I expected: a clean rail of icons; clicking a folder icon opens that folder
- What happened: the Library rows become clipped fragments, half a folder glyph beside a cut-off count badge ("⊐ 3", "⊐ 4"), with dashed tree lines hanging off shelves. Clicking any folder icon in the rail opens its "More actions" menu (New folder group, Rename, Delete folder...) because that button sits on top of the icon; the folder never opens, from the centre or from the left edge. The fixed places and the foot collapse fine (screenshots: adv-sidebar/15-collapsed.png, adv-sidebar/81-collapsed-icon-click.png)
- Suggested fix (one line): in icon mode render one icon per folder with the count as a corner dot and hide the row actions.

### F3. Settings is offered twice, Help only once  — severity: duplicate
- Where: foot of the sidebar ("Settings" row) and the profile row menu at the very bottom ("Settings", "Help", "Sign out")
- What I did: clicked "Settings" in the foot (1 click, lands on /app/settings), then opened the profile row and found "Settings" again right above it
- What I expected: one place to get to Settings
- What happened: two entries four rows apart do exactly the same thing, and the menu that duplicates Settings is also the only place Help lives (screenshot: adv-sidebar/03-account-menu.png)
- Suggested fix (one line): keep Settings and Help in the profile menu only, or keep the foot row and make the profile row just "Sign out".

### F4. "Desk" is listed twice and both open the same page  — severity: duplicate
- Where: fixed places ("Desk", first row) and Library ("Desk 3", first folder)
- What I did: clicked the top Desk, then the Library Desk
- What I expected: two different things, since they are in two different lists
- What happened: identical page, "Desk, 0 of 3 done", the same three tasks; only the URL differs (/app versus /app/folders/...). A new user cannot tell why a folder called Desk exists under the view called Desk (screenshots: adv-sidebar/01-landing.png, adv-sidebar/41-library-desk.png)
- Suggested fix (one line): hide the Desk folder from the Library while the Desk view is pinned, or give the folder a different name.

### F5. A shelf is called a shelf, a folder group, and a label, depending on where you look  — severity: unintuitive
- Where: foot "New shelf" button; the dialog it opens ("New folder group", "Group name", "Groups are personal labels", "Create group"); folder menu ("New folder group" and "Move to shelf" in the same menu); shelf menu ("Rename shelf", "Delete shelf..."); the Library "..." menu ("New shelf")
- What I did: clicked "New shelf", read the dialog, then opened a folder's "..." menu
- What I expected: one word
- What happened: three words for one thing within two clicks, and in the folder menu the first item says "New folder group" while five rows down it says "Move to shelf" (screenshots: adv-sidebar/07-new-shelf.png, adv-sidebar/42-trip-menu.png, adv-sidebar/44-shelf-menu.png)
- Suggested fix (one line): say "shelf" everywhere, including the dialog title and button.

### F6. Shelves look exactly like folders  — severity: unintuitive
- Where: Library list
- What I did: read the list on first load: Desk, Home, Work, Apartment move, Dana launch, Reading, all with the same folder glyph
- What I expected: to tell which rows are containers I can put folders on
- What happened: Home and Work are shelves but carry the same icon as folders (Home even gets a house), the chevron and "+" only appear on hover, and an empty shelf is a flat row indistinguishable from an empty folder. Only after I added a folder did a tree line appear. Empty shelves also sink to the bottom of the list as soon as anything changes, so Home jumped from third row to second-last after one drag (screenshots: adv-sidebar/01-landing.png, adv-sidebar/26-dropped.png)
- Suggested fix (one line): give shelves their own glyph and always show the chevron.

### F7. Four ways to make a folder, three to make a shelf  — severity: duplicate
- Where: foot "New folder" button; Library "..." menu (New folder / New shelf); "+" on each shelf row on hover; "Add folder" on a shelf's page; folder "..." menu "New folder group"; foot "New shelf"
- What I did: hovered the Library heading, hovered a shelf, opened a folder's menu
- What I expected: one obvious button, which the big "New folder" already is
- What happened: the same two actions keep reappearing in menus (screenshots: adv-sidebar/04-library-options.png, adv-sidebar/43-shelf-hover.png, adv-sidebar/42-trip-menu.png)
- Suggested fix (one line): drop "New folder"/"New shelf" from the Library menu and "New folder group" from the folder menu; keep the button and the shelf "+".

### F8. Making a folder does not take you to it  — severity: clunky
- Where: "New folder" button, then the dialog
- What I did: clicked New folder (1), typed a name, pressed Enter (2)
- What I expected: to land in the new folder ready to add tasks
- What happened: the dialog closes and I am still on Desk; the new folder is slotted alphabetically into the middle of the list, so I have to go find it. Three clicks to be inside a folder I just made (screenshot: adv-sidebar/06-new-folder-named.png)
- Suggested fix (one line): open the folder after creating it.

### F9. "New shelf" refuses to work until you have a folder to put on it  — severity: unintuitive
- Where: New shelf dialog
- What I did: typed a name and pressed Enter
- What I expected: an empty shelf I can drag folders onto later
- What happened: red "Select at least one folder"; the dialog explains "Dana cannot save an empty group", yet empty shelves (Home, Work) already sit in my Library, so the rule is contradicted by what I am looking at (screenshot: adv-sidebar/08b-shelf-no-folder-enter.png)
- Suggested fix (one line): allow an empty shelf, or explain how the existing empty ones got there.

### F10. Two unlabelled icon buttons beside "New shelf"  — severity: unintuitive
- Where: foot row "New shelf" plus two icons
- What I did: hovered both, clicked both
- What I expected: a tooltip at least
- What happened: no tooltip on hover; the first opens a file picker (Import), the second is the Trash page. A destination (Trash) sits in a row of creation actions, and both only get labels once the sidebar is dragged past about 300 px wide (screenshots: adv-sidebar/48-import-hover.png, adv-sidebar/20-resized-wide.png)
- Suggested fix (one line): move Trash next to People/Settings and give Import a tooltip.

### F11. Right-click on a folder does nothing  — severity: cosmetic
- Where: any Library row
- What I did: right-clicked a folder
- What I expected: the same menu the "..." button shows
- What happened: nothing at all (screenshot: adv-sidebar/09-folder-rightclick.png)
- Suggested fix (one line): wire the context menu to the existing row menu.

### F12. Closing search leaves a tooltip sitting on the bell  — severity: cosmetic
- Where: top row
- What I did: opened search, pressed Escape
- What I expected: a clean top row
- What happened: focus returns to the search button and its "Search · Ctrl K or /" tooltip stays open covering the bell and the Desk tab until I click elsewhere (screenshot: adv-sidebar/13b-after-search-escape.png)
- Suggested fix (one line): do not show the focus tooltip when focus is returned programmatically.

## What is good (keep)
- Search: one click or Ctrl K, found my folder on four letters, results grouped with a footer that says how to open. Best thing in the sidebar.
- The fixed places: one click each, clear icons, clear names.
- Drag and drop: dragging a folder onto a shelf and reordering top-level folders both worked first try and survived a reload.
- Resize handle: drags between 220 and 356 px, double-click resets, width survives reload; Ctrl+B collapses and restores.
- Sign out is two clicks and lands on the landing page; Settings is one click; the Help sheet in the profile menu is a nice short list.
- The bell's empty state sentence ("Nothing new. When someone assigns you a task or answers you, it lands here.") is exactly the right amount of explanation.

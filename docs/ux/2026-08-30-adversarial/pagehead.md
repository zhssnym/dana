# Page head — adversarial user round, 2026-08-30

**The obvious jobs (cover, rename, describe, filter) each take one or two clicks and stick; what bothers me is that board view is invisible until you hover, "Custom range" filters before you pick a range, a saved view turns up in the sidebar pretending to be a page, and every page draws its head a little differently.**

## Findings

### F1. Board and calendar are hidden until you hover a single icon  — severity: unintuitive
- Where: every page, the view strip at top right (the small list icon left of the funnel)
- What I did: Looked for a way to see the folder as a board. Saw one small icon. Hovered it by accident.
- What I expected: Two or three visible toggles (list, board, calendar) like every other app.
- What happened: At rest only the current mode's icon shows; the strip only widens into "List | Board" on hover, and on Scheduled "Calendar" too. On the phone there is no hover, so the second icon is unreachable until you tap the first one. (screenshot: adv-pagehead/01-_app.png at rest, adv-pagehead/16-strip-hover.png on hover)
- Suggested fix (one line): Show all available mode icons at rest as a segmented control; the hover-expand hides the feature it exists to offer.

### F2. "Custom range" filters the page before I have picked any dates  — severity: clunky
- Where: Filter panel, Due > Custom range
- What I did: Opened Filter, clicked "Custom range" (2 clicks), then pressed Escape without choosing a day.
- What I expected: Nothing to happen until I pick a first and last day, or the panel to stay open until I do.
- What happened: A chip "Due any to any" appeared immediately, the Filter badge went to 2, and the filter stayed applied after Escape with an empty range. The saved view I then made carried this empty range with it. (screenshot: adv-pagehead/27-custom-range.png, adv-pagehead/28-after-custom-escape.png)
- Suggested fix (one line): Do not apply a custom-range filter until both days are chosen; never render an "any to any" chip.

### F3. A saved view is filed in the sidebar as if it were a page, and follows me to other pages  — severity: unintuitive
- Where: Filter panel > "Save as view"; sidebar top group (Desk, Today, ... Big rocks)
- What I did: On the folder "Apartment move" I filtered to Important only, saved it as "Big rocks" (4 clicks: Filter, toggle, Save as view, type name + Enter), reloaded, then went to Today and clicked "Big rocks" in the sidebar.
- What I expected: Either the view to reopen my folder with that filter, or to find it inside that folder's Filter menu only.
- What happened: "Big rocks" sits in the sidebar between "All" and the Library like a fixed page, but clicking it from Today just applies the filter to Today (`/app/today?view=...`) with the title still "Today". It is also listed a second time under "Saved views" inside the filter panel. After "Clear all" the chips vanish but "Big rocks" stays highlighted in the sidebar and `?view=` stays in the URL. (screenshot: adv-pagehead/31-reload-find-view.png, adv-pagehead/50-bigrocks-from-today.png, adv-pagehead/51-clear-all.png)
- Suggested fix (one line): Keep saved views inside the Filter panel only (or open the page they were saved on), and drop the sidebar highlight and `?view=` when "Clear all" is pressed.

### F4. Two doors to the same activity list, and the copy in it reads wrong  — severity: duplicate
- Where: Top strip: the "Edited 2 minutes ago" text button; and "..." > History
- What I did: Clicked "Edited 2 minutes ago" (it looked like a label, not a button), then "..." > History.
- What I expected: One place for history.
- What happened: The first opens an "Activity" popover with four rows; the second opens a "History" dialog with the same four rows in a different layout. Both say "Edited changed the look" for a cover change, which is not a sentence, and the popover truncates it to "Edited changed the look b...". (screenshot: adv-pagehead/22-edited-click.png, adv-pagehead/52-history-menu.png)
- Suggested fix (one line): Make the "Edited ... ago" text open the History dialog (or drop the menu item), and write the row as "Changed the cover".

### F5. Every page draws its head differently  — severity: cosmetic
- Where: Desk / a folder vs Today vs a shelf vs Trash
- What I did: Walked through Desk, Today, Scheduled, "Apartment move", the "Home" shelf, and Trash.
- What I expected: The same head with fewer controls where they do not apply.
- What happened: On a folder the cover sits above the icon (icon at x=412, below the cover, with a white halo blob bleeding into the cover's bottom-left corner); on Today the cover is wider (starts at x=372) and the icon overlaps it. A shelf has no cover, no counter, no Share, no view strip, no filter, and its title is indented differently (x=453) and is not a heading. Trash is indented differently again (x=445), has no icon, and its tab in the tab strip is blank, just an "x". (screenshot: adv-pagehead/03-cover-picked.png, adv-pagehead/55-today-cover.png, adv-pagehead/57-shelf.png, adv-pagehead/01-_app_trash.png)
- Suggested fix (one line): One head layout with one left edge and one cover geometry; give Trash a tab title and an icon.

### F6. On the phone the folder name is cut to "Apart..." so the counter can fit  — severity: clunky
- Where: Folder page at 390 px, title line
- What I did: Opened "Apartment move 2" on the phone viewport.
- What I expected: To read my folder's name; the "1 of 5 done" counter to wrap or shrink instead.
- What happened: The title is truncated to "Apart..." with the counter taking the rest of the line. (screenshot: adv-pagehead/60-phone-folder.png)
- Suggested fix (one line): Let the title wrap and put the counter on its own line below it on narrow screens.

### F7. Removing a cover is buried inside "Change", and I never found "reposition"  — severity: unintuitive
- Where: Folder cover, hover
- What I did: Hovered the cover looking for a way to take it off or slide it.
- What I expected: "Change", "Reposition", "Remove" on hover, as in Notion.
- What happened: Only "Change" appears; "Remove" is a third tab-like button inside the picker. No reposition control anywhere; the gallery colours would not need one but an uploaded photo would. Removing took 3 clicks (hover, Change, Remove). (screenshot: adv-pagehead/05-cover-hover.png, adv-pagehead/20-cover-change.png)
- Suggested fix (one line): Put "Remove" next to "Change" on hover; add reposition for uploaded images or say it is not offered.

### F8. Board view shows the done tasks twice  — severity: duplicate
- Where: Folder page in Board mode
- What I did: Switched to Board.
- What I expected: Done tasks in one place.
- What happened: A "Done 1" column and, below the board, the collapsed "Completed (1)" section from list view. (screenshot: adv-pagehead/17-board.png)
- Suggested fix (one line): Hide the "Completed" section while the board is showing a Done column.

### F9. The avatar is a dead letter and does not say who it is  — severity: cosmetic
- Where: Right of the head, the green "A" circle
- What I did: Clicked it and hovered it.
- What I expected: A tooltip with the name, or the members list.
- What happened: Nothing; it is a plain span. "Share" next to it does the job, but on Desk there is no Share and the lone "A" floats there for no reason. (screenshot: adv-pagehead/14-avatar-clicked.png, adv-pagehead/01-_app.png)
- Suggested fix (one line): Tooltip the avatar with the name and make the stack open the same panel as Share.

### F10. "Desk" is reachable from two sidebar entries and shows the same head  — severity: duplicate
- Where: Sidebar "Desk" (top group) and Library "Desk 3"
- What I did: Clicked both.
- What I expected: Two different pages.
- What happened: `/app` and `/app/folders/<desk-id>` render the identical head and list; clicking the title on either turns it into a "Folder name" input, so the default folder is renamable from a page that also carries a fixed nav label "Desk". (screenshot: adv-pagehead/01-_app.png, adv-pagehead/01-folder.png, adv-pagehead/54-desk-title-click.png)
- Suggested fix (one line): Drop Desk from the Library list (or from the top group), and either lock the Desk name or rename the nav entry with it.

## What is good (keep)
- Adding a cover is two clicks (Add cover, pick a swatch) and it lands instantly, with gallery and upload in one small popover.
- Rename is one click on the title; Enter saves, Escape after typing correctly throws the edit away, and the sidebar and tab update at once.
- Description: one click on "Add a description", plain typing, Enter for a new line, click away to save; it survived a reload.
- The icon and colour picker is one click, compact, and closes on Escape.
- The filter panel puts the Due choices inline instead of behind a sub-menu, shows chips with an "x" each plus "Clear all" at the top, and the Filter icon carries a count.
- Filters persist across reload, and the chips make it obvious why a list is short.
- Right-click on the title does nothing surprising.

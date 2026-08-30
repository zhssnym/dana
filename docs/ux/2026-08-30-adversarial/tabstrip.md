# Tab strip and window bar — adversarial user round, 2026-08-30

**Verdict in one line.** The strip works mechanically (drag, close, keyboard reorder all fine) but it has two ways to open a page that behave differently, the active tab is nearly invisible, and on a phone the strip's "+" is the only navigation there is; the window bar's overflow menu is tidy but two of its items do nothing you can see, one lists no shelves, and "History" duplicates the "Created N minutes ago" popover next to it.

Account `adv-tabstrip`, 1440x900 headless Chromium, then 390x844. Screenshots in `adv-tabstrip/`.

## Findings

### F1. On a phone there is no sidebar and no way to open one; the "+" is the whole navigation  — severity: blocker
- Where: 390x844, every page, the strip at the top
- What I did: opened `/app` on the phone viewport and looked for the folder list, Today, Scheduled, search, settings.
- What I expected: a hamburger or some opener for the sidebar next to the tabs.
- What happened: the top row is `Desk x ... +` and nothing else; the sidebar, search, bell, People and Settings are gone with no button that brings them back. The only thing that opens another page is the "+" menu, and it lists folders and shelves only, so Today, Scheduled, Assignments, Important, All, People, Settings and search are unreachable on a phone. (screenshot: adv-tabstrip/61-phone-desk.png, 62-phone-newtab-menu.png)
- Suggested fix (one line): put a sidebar opener at the left of the strip on narrow widths (or make the Dana mark one), and let the "+" menu list the pinned pages too.

### F2. Two ways to open a page, and they do different things  — severity: unintuitive
- Where: sidebar rows vs the strip's "+" button
- What I did: clicked Apartment move, Dana launch, Reading in the sidebar one after another, expecting three tabs.
- What I expected: three tabs (that is what "open three folders and switch between them" means to me once a strip exists).
- What happened: one tab, renamed each time; the sidebar navigates *inside* the current tab. Only the "+" at the far right makes a new tab, so the obvious job took 6 clicks (+, item, +, item, +, item) instead of 3, and I found it by accident. With four tabs open, a sidebar click quietly replaces whichever tab is active (Reading became Home), which lost me the page I had there. (screenshots: adv-tabstrip/01-after-3-folders.png, 12-sidebar-click-with-tabs.png)
- Suggested fix (one line): pick one rule and make the other path discoverable: either a sidebar click opens (or focuses) a tab for that page, or every sidebar row and folder row gets an "Open in new tab" affordance (middle-click / Ctrl-click / context menu), none of which do anything today.

### F3. The active tab is almost impossible to tell from the others  — severity: unintuitive
- Where: the strip, any time two or more tabs are open
- What I did: opened five tabs and looked for which one I was on.
- What I expected: an obvious selected tab (a filled shape, an underline, a colour).
- What happened: the active tab is white on a white bar with white page below it; the only difference is the text is a shade darker and very slightly bolder. In 11-four-tabs-dup-reading.png I genuinely could not tell "Reading" from "Reading" without reading the sidebar highlight. (screenshots: adv-tabstrip/11-four-tabs-dup-reading.png, 12-sidebar-click-with-tabs.png)
- Suggested fix (one line): give the strip a tinted ground so the active tab's card colour reads as "lifted", or underline the active tab in the accent colour.

### F4. The "+" opens the same page twice as two identical tabs  — severity: duplicate
- Where: strip, "+" menu
- What I did: "+" then Reading, twice.
- What I expected: to be taken to the Reading tab I already had.
- What happened: two tabs both called "Reading", indistinguishable, showing the same folder. (screenshot: adv-tabstrip/11-four-tabs-dup-reading.png)
- Suggested fix (one line): if a tab for that path exists, select it instead of adding another.

### F5. The list/board switcher hides its other half until you hover  — severity: unintuitive
- Where: window bar, the first icon on the right
- What I did: looked for "show as board" on a folder page.
- What I expected: a two-button List | Board control.
- What happened: at rest only the *current* mode's icon shows (a single list icon, screenshot 21-folder-bar.png), which reads as a decoration or a "menu" icon rather than a choice; the Board button only materialises on hover (23-bar-Board.png, 32-view-switch-click-current.png). Nothing changes when you click the one that is showing. On a phone there is no hover at all, so the board view is effectively unreachable there (63-phone-three-tabs.png shows one icon). Took me 2 tries and a hover to change the view.
- Suggested fix (one line): always show both icons as a segmented control; the collapse saves 28px and costs the feature.

### F6. "Move to shelf" offers no shelves  — severity: blocker (for that item)
- Where: window bar "..." menu on a folder, Move to shelf submenu
- What I did: opened "..." on Dana launch, hovered "Move to shelf".
- What I expected: Home and Work, the two shelves I can see in the sidebar and in the "+" menu.
- What happened: the submenu contains one entry, "No group", already ticked. Nowhere to move to, and it calls the thing a "group" while the menu item and the sidebar call it a "shelf". (screenshot: adv-tabstrip/35-move-to-shelf.png)
- Suggested fix (one line): list the viewer's shelves in the submenu and use one word for them.

### F7. "Copy link" and "Save as workflow" do nothing you can see  — severity: clunky
- Where: window bar "..." menu on a folder
- What I did: clicked each, watched for 1.5 seconds, checked for toasts and dialogs and the sidebar.
- What I expected: "Link copied" for the first; a dialog or at least a "Saved as workflow" for the second, and something new somewhere.
- What happened: the menu closed and nothing else happened for either (no toast, no dialog, no new sidebar entry). Delete, by contrast, shows a proper "Deleted ... Undo" toast, so I know the app can. (screenshots: adv-tabstrip/5x-Copy-link.png, 5x-Save-as-workflow.png, compare 34-after-delete.png)
- Suggested fix (one line): toast both ("Link copied", "Saved as a workflow" with a link to it).

### F8. Two histories, side by side  — severity: duplicate
- Where: window bar: the text "Created 14 minutes ago" and, one click away, "..." > History
- What I did: clicked the "Created N minutes ago" text (it is a button), then opened "..." > History.
- What I expected: one place for what happened to this folder.
- What happened: the text opens an "Activity" popover with "Created by Adv-Tabstrip, 14 minutes ago"; History opens a modal in the middle of the page with "Today, 16:10, Created, Adv-Tabstrip". Same one fact, two controls, two layouts. The modal also lands over the task list rather than near the bar that opened it. (screenshots: adv-tabstrip/26-activity-popover.png, 31-history.png)
- Suggested fix (one line): make "Created N minutes ago" the single entry and have it open the full history (as a right-edge panel or the modal); drop the menu item.

### F9. Middle-click, right-click and Ctrl+W do nothing on a tab  — severity: clunky
- Where: strip, any tab
- What I did: middle-clicked a tab, right-clicked a tab, pressed Ctrl+W with a tab focused.
- What I expected: middle-click closes (every browser and editor does this), right-click gives "Close", "Close others", "Close to the right", Ctrl+W closes.
- What happened: nothing for all three; the only way to close is the small "x", and closing five tabs is five precise clicks. (screenshot: adv-tabstrip/14-rightclick-tab.png shows the right-click with no menu)
- Suggested fix (one line): middle-click to close and a small context menu with Close / Close others.

### F10. The "+" is at the far right edge, a screen away from the tabs  — severity: cosmetic
- Where: strip, 1440 wide
- What I did: with one tab open, looked for how to add another.
- What I expected: a "+" right after the last tab, where browsers put it.
- What happened: it is pinned at x=1420 on the far right while the tabs sit at the left; with one tab that is 1100px of empty bar between the two, and I did not connect them at first. On the phone it is fine because the bar is short. (screenshot: adv-tabstrip/01-after-3-folders.png)
- Suggested fix (one line): dock the "+" after the last tab.

### F11. Closing the last tab does not close it; Desk pops back  — severity: cosmetic
- Where: strip, the "x" on the sole remaining tab
- What I did: closed every tab.
- What I expected: either the "x" hides on the last tab, or the strip empties.
- What happened: the last "x" closes the tab and a "Desk" tab immediately replaces it, so the control looks live but is really "go to Desk". Not harmful, just a control that lies. (screenshot: adv-tabstrip/17-after-drag.png sequence, then the `Desk` loop in my log)
- Suggested fix (one line): hide the "x" on the only tab.

### F12. A tab dragged past the left edge is clipped by the sidebar  — severity: cosmetic
- Where: strip, drag to first position
- What I did: dragged the last tab to the front.
- What I expected: the carried tab to stay fully visible.
- What happened: it slid under the strip's left edge and was cut off ("ome x"). The reorder itself landed correctly, and the keyboard arrows also reorder, which is nice. (screenshot: adv-tabstrip/16-mid-drag.png)
- Suggested fix (one line): clamp the drag offset to the strip's box.

## What is good (keep)
- Drag to reorder is smooth, the neighbours make room, and Left/Right on a focused tab reorders too.
- Tabs and their order survive a reload; closing the active tab goes to a sensible neighbour.
- "Rename" from the overflow just focuses the title inline, no dialog. Good.
- "Delete folder..." is instant with a real Undo toast rather than a confirm dialog; keep that, but drop the "..." from the label since nothing further is asked.
- Every tab wears its folder's own icon and colour, so shelves and folders are told apart at a glance.
- The filter panel is complete and reads well, and it is identical on the phone.
- The "..." menu contents are the right set and in the right order (History, Rename, Move, Copy link, Duplicate, Save as workflow, Delete).
- Phone: the strip, filter and overflow menu all fit and are tappable at 390px.

# Settings and the profile — adversarial user round, 2026-08-30

**Verdict in one line.** The Settings page itself is calm and its appearance controls work and stick, but a phone user cannot reach it at all, the things a person most expects to edit on an account page (name, timezone) are read-only text, "export your work" does not exist under any name a person would look for and what does exist keeps only task titles, and Settings, People and Sign out are each reachable from two or three places at once.

## Findings

### F1. On a phone there is no way to reach Settings, People, Help or Sign out — severity: blocker
- Where: the whole app at 390×844
- What I did: opened `/app` on a phone-sized viewport, looked for a menu button, tapped and swiped from the left edge.
- What I expected: a hamburger or an avatar somewhere so I can get to the sidebar foot.
- What happened: the sidebar is simply gone and nothing replaces it. The only controls are the tab strip, the "+" and the page's own list/board/filter/more icons. No navigation exists (0 elements with the sidebar's role), so Settings, People, other pages, Help and Sign out are unreachable except by typing the URL. (screenshots: adv-settings/p01-app.png, adv-settings/p01b-mobile.png, adv-settings/p01d-swipe.png)
- Suggested fix (one line): give the phone layout a menu button that opens the sidebar as a drawer, with the avatar/foot in it.

### F2. "Export your work" does not exist; what exists is "Save as workflow", hidden per folder, and it keeps titles only — severity: unintuitive
- Where: folder page, "More actions" (…) menu at the top right; nothing in Settings
- What I did: looked in Settings for export (nothing), then for the sidebar's "Import" button's twin (there is none), then opened a folder, clicked "…", found "Save as workflow" and clicked it. 4 clicks after I knew where it was, plus a lot of hunting.
- What I expected: an "Export" next to "Import", ideally one for the whole account, and a file that contains my tasks as they are.
- What happened: a `Desk.dana-workflow.json` downloaded silently, no dialog, no toast. It is 316 bytes and contains only the folder name and three task titles: the due date and time on "Call mum", the date on "Water the plants", and the star on the third task are all dropped. Nobody would call that "my work". The word "workflow" is never explained anywhere in the app, including Help. (screenshots: adv-settings/24-folder-menu.png, adv-settings/26-after-export.png)
- Suggested fix (one line): name it "Export folder" next to a visible "Import" pairing, say what the file keeps and what it drops, and offer a whole-account export from Settings.

### F3. Import gives no feedback and happily makes a second folder called "Desk" — severity: clunky
- Where: sidebar foot, the "Import" icon button next to "New shelf"
- What I did: clicked Import, chose the file I had just exported.
- What I expected: to be taken to the new folder, or at least told it worked and where it went.
- What happened: nothing visible on the page I was on; the sidebar quietly grew a second "Desk 3" under the real "Desk 3". Opening it shows three bare titles with no dates and no star. A wrong file, by contrast, gets a clear toast ("That file isn't a workflow Dana can read."), so the success case is the odd one out. (screenshots: adv-settings/28-after-import.png, adv-settings/45-imported-desk.png, adv-settings/29-bad-import.png)
- Suggested fix (one line): on success navigate to the imported folder and toast "Imported Desk (3 tasks)"; suffix the name when it collides.

### F4. "Where a task opens: Tab" opens a dialog anyway — severity: unintuitive
- Where: Settings → Appearance → "Where a task opens" (Dialog / Panel / Tab)
- What I did: chose "Tab" (confirmed selected), went to Desk, clicked "Call mum".
- What I expected: the task to open as a tab in the tab strip at the top.
- What happened: the same centred dialog as the "Dialog" option; the URL stayed `/app` and no new tab appeared. "Panel" does work (task slides in at the right). (screenshots: adv-settings/50b-task-tab.png versus adv-settings/49-task-dialog.png and adv-settings/50c-task-panel.png)
- Suggested fix (one line): make Tab open a tab, or drop the option until it does.

### F5. Settings, People and Sign out each live in two or three places — severity: duplicate
- Where: sidebar foot and Settings page
- What I did: looked at the sidebar foot, opened the avatar menu, then read the Settings page.
- What I expected: one way in for each.
- What happened: the sidebar has plain "People" and "Settings" links directly above the avatar; the avatar menu one row below repeats "Settings" (plus Help and Sign out); the Settings page then has an "Open People" button and its own "Sign out" row with a "Sign out" button. That is Settings ×2, People ×3, Sign out ×2, all within about 100 px of each other. (screenshots: adv-settings/03-account-menu.png, adv-settings/12-settings-scroll-2.png)
- Suggested fix (one line): keep the two sidebar links and make the avatar menu Help + Sign out only; drop "Open People" and the Sign out row from Settings.

### F6. You cannot change your name or your timezone — severity: unintuitive
- Where: Settings → Account
- What I did: clicked and double-clicked my name "Adv-Settings"; clicked "Europe/Paris".
- What I expected: the name to become editable; the timezone to be choosable.
- What happened: nothing; both are static text, no input appears (0 editable fields on the page). The only hint is the small "Dana follows your device's timezone automatically". A name I cannot change on an account page is the one thing people always try first. (screenshots: adv-settings/13-name-click.png, adv-settings/16b-tz-click.png)
- Suggested fix (one line): make the name an inline editable field, and either allow a timezone override or say plainly "taken from Google".

### F7. A new profile picture shows in Settings but the sidebar and page header keep the letter "A" — severity: clunky
- Where: Settings → Account, the avatar circle ("Add a picture"); sidebar foot; folder page header avatar
- What I did: clicked the avatar, picked an image. It uploaded (survives reload in Settings).
- What I expected: my picture everywhere I am shown, and some sign that the upload finished.
- What happened: no confirmation, and the sidebar foot and the folder page's member avatar still show the initial after a reload. (screenshots: adv-settings/16-picture-set.png, adv-settings/40-avatar-after-reload.png)
- Suggested fix (one line): render the uploaded image wherever the user's face is drawn, and toast "Picture updated".

### F8. "Browser menu" looks like a button and does nothing — severity: unintuitive
- Where: Settings → Install Dana
- What I did: hovered and clicked "Browser menu".
- What I expected: an install prompt, or at least instructions for my browser.
- What happened: nothing at all; it is a bordered label styled exactly like the "Open People" and "Sign out" buttons beside it. (screenshots: adv-settings/41-browser-menu-hover.png, adv-settings/42-browser-menu-clicked.png)
- Suggested fix (one line): either wire it to the install prompt where available or render it as plain text, not a button.

### F9. Help is a six-line shortcut list, only reachable through the avatar menu; `?` does nothing — severity: unintuitive
- Where: avatar menu → Help
- What I did: pressed `?` on a page (nothing), then found Help in the avatar menu (2 clicks).
- What I expected: a help entry that explains the app's own words — workflow, shelf, Desk, Anytime — and opens on `?` like everywhere else.
- What happened: a small dialog titled "Help — The keyboard shortcuts Dana has today" listing six shortcuts. It could not tell me what a workflow file is, which was exactly my question. (screenshots: adv-settings/04-help.png, adv-settings/06-question-key.png)
- Suggested fix (one line): bind `?` to Help and add a short "Words Dana uses" section.

### F10. There are no notification settings, yet tasks offer reminders — severity: unintuitive
- Where: Settings (no Notifications section); bell icon in the sidebar header; task dialog "No reminder"
- What I did: looked for where reminders arrive and how to turn them on or off.
- What I expected: a Notifications section with email/push choices.
- What happened: Settings has no notifications at all; the bell only says "Nothing new. When someone assigns you a task or answers you, it lands here." A task's "No reminder" control promises something nothing in Settings explains. (screenshot: adv-settings/52-bell.png)
- Suggested fix (one line): add a Notifications section, even if it only states where reminders and mentions are delivered.

### F11. The task dialog header repeats the Dialog / Panel / Tab choice as three unlabeled icons — severity: duplicate
- Where: top-right of the open task dialog and panel
- What I did: opened a task and noticed three icons beside the close button.
- What I expected: one place to choose how tasks open.
- What happened: the same three modes as Settings' "Where a task opens", as icons with no words, so the two surfaces can disagree without saying so. (screenshot: adv-settings/49-task-dialog.png)
- Suggested fix (one line): keep one, and if the icons stay, give them labels and say they change the setting.

### F12. Phone layout of the Account and Install rows breaks into one-word columns — severity: cosmetic
- Where: Settings at 390 wide, "People and connections", "Sign out" and "Install Dana" rows
- What I did: scrolled the Settings page on the phone viewport (reached only by typing the URL, see F1).
- What I expected: rows to stack on narrow screens.
- What happened: the description text is squeezed into a 60 px column beside the button: "Use the / install / option in / your / browser's / address / bar or / application / menu." (screenshot: adv-settings/p04-settings-1.png)
- Suggested fix (one line): stack the row's control under its text below a narrow breakpoint.

## What is good (keep)
- Theme: three clear options, the description line updates ("Light, whatever your device says"), Light and Dark apply instantly and survive a reload and a sign-out/sign-in.
- Row height, Clock and the view pinning switches all take effect immediately and are visible in the sidebar or the list on the next page, no save button needed.
- Delete account: the red section, the typed DELETE confirmation with the Continue button disabled until then, and Escape cancelling cleanly are exactly right.
- Wrong-file import is refused with a plain sentence in a toast.
- Sign out is one click from the avatar menu and lands on the landing page; the avatar menu opens with Enter from the keyboard.
- People page is simple: one email field, one button, one honest empty state.

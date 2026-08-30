# Settings out of the sidebar, Help and resources into it

A plan, not a change. Written 2026-08-30 by the Frontend Architect session of
the UI polish round, at the owner's instruction that "this needs separate
planning". Nothing in it is implemented; the one part that could have been
lands in a file this session does not own.

## What was asked

The owner's words, in order:

1. Settings is already reachable through the profile avatar, so it should stop
   being a separate sidebar item.
2. "Help and resources" takes the place it leaves.
3. Version history goes either in the profile menu or under Help and
   resources.

## What is true today, read off the repository

The premise in (1) is **false as built**, and that is the first thing this plan
has to fix rather than assume.

- `app/src/client/shell/app-sidebar.tsx` draws three navigation rows in the
  footer, Trash, People and Settings, and then the account menu. The account
  menu carries **Help and Sign out only**. Settings was taken out of it at the
  polish round of 2026-08-30 under sidebar F3, whose comment in that file reads
  "Settings was here and four rows up as a foot link; the link a newcomer finds
  first is the survivor".
- Spec 9.1's footer bullet was amended the same day to match: "then Trash,
  People and Settings as links; then the avatar menu ("Account": Help, Sign
  out)".
- The prototype has **both**. `docs/design/prototype-v2/src/components/app-sidebar.tsx`
  draws `FOOTER_PAGES` (People, Settings) as rows and a `ProfileMenu` of
  Settings, Help, Sign out. So the door the owner believes exists is the
  prototype's, and this client removed it four hours before he asked.
- **AC-242 still asserts the prototype's menu**, exactly and in order:
  `MENU_ITEMS = ['Settings', 'Help', 'Sign out']`, compared with `toEqual`
  against `page.getByRole('menuitem').allInnerTexts()`
  (`app/tests/e2e/ac-242-help-sheet.spec.ts`). Section 12's own text for
  AC-242 says the same. The polish round changed the client and 9.1 and left
  the criterion behind, so **putting Settings back in the menu turns a red
  case green** rather than needing a new one. This should be checked against a
  browser leg before it is stated as fact, because this session was told not
  to run one.
- **AC-264 asserts the Settings link in the footer**, by name:
  `for (const name of ['People', 'Settings'])`
  (`app/tests/e2e/ac-264-sidebar-footer.spec.ts`). Removing the row makes that
  case red, and the criterion is the Adversarial Test Engineer's to amend
  (protocol section 8). This is the one hard dependency in the plan.
- AC-174's account-menu case reads `/help/i` and `/sign out/i` and asserts
  neither an order nor a set, so it is indifferent to the change.
- The search overlay does not index pages, so it is not a third door to
  Settings. After the row goes, the doors are the profile menu and the URL.
- Nothing in the repository is called "Version history". The only near
  neighbours are `components/history-sheet.tsx`, which is 4.13's event log for
  one object, and 10.6's "Update available, reload" affordance. There is no
  release note, no changelog, and no build-time version reaching the client:
  `app/package.json` says `2.1.0` and `app/vite.config.ts` defines nothing
  from it.

## Where it collides with the prototype, and what that means

RFC 0005 change control item 37 rules that Dana 2.0 is the exact prototype, and
the prototype's own sidebar file argues **against** a Help row in as many
words:

> **Help is not here**, and that is the one departure. It is neither a thing
> you make nor a place inside your work; it is about the application, which is
> what everything in the account menu is about. A fourth item would also have
> broken the row of three he asked for.

So request (2) is a departure from the prototype and from a stated design
argument, not a fidelity fix. Spec 11.13 says the numbered section wins over
the prototype and that a session escalates rather than guesses; here no
numbered section speaks, the prototype does, and the owner has overruled it out
loud. **That is a ruling and it should be written down as one** (RFC 0005
change control, and 9.1 amended with it) rather than absorbed into a commit.
The counter-argument above is the owner's to overrule with his eyes open, and
this plan records it for exactly that reason.

## The plan

### A. Settings moves into the profile menu

**Files.** `app/src/client/shell/app-sidebar.tsx` alone. Two edits: add a
`DropdownMenuItem` for Settings **above** Help in `AccountMenu`, navigating to
`paths.settings`, wearing `SettingsGlyph` which the file already imports; and
delete the `NavigationRow name="Settings"` from the footer's `SidebarMenu`.

**Order matters.** AC-242 compares the menu's items with `toEqual`, so Settings
first, Help second, Sign out last after the separator. That is also 9.1's own
sequence and the prototype's.

**The item is a navigation, so it should navigate.** The prototype's menu item
is an `onClick` because the prototype has no router. Here the row should carry
a real destination, for the reason 9.1's roles table gives the page block: a
page at a URL is opened, not actioned. A `DropdownMenuItem` rendering a
`Link` keeps "open in a new tab" alive. If the primitive fights it, an
`onClick` calling `navigate(paths.settings)` is acceptable and is what the
footer row does today one level up; AC-242 reads text, not role.

**Spec.** 9.1's footer bullet, mine to amend: the avatar menu becomes
("Account": Settings, Help, Sign out) again, and the list of footer links loses
Settings and gains Help and resources. The sidebar F3 sentence should be
**superseded in place rather than deleted**, so the record says the door was
moved twice and why, which is the thing a reader four weeks from now needs.

**Landmark and criteria.** The sidebar is still one `navigation` landmark with
one entry fewer; nothing about AC-174's "only chrome" reading changes. AC-264
needs its `['People', 'Settings']` loop reduced to People and given the new row
instead. AC-242 needs no edit and should go green.

### B. "Help and resources" takes the row

Two shapes were considered and the second is recommended.

**B1, the row opens the existing sheet.** No route, no page; the footer row
calls `useHelpSheet().setOpen(true)`. Cheapest, and wrong: it makes the
footer's navigation list mean two things at once, a button among links, which
is the same objection the prototype raises against a Help row at all, and it
leaves "resources" as a plural with one thing in it. It also cannot hold
Version history without growing a dialog inside a dialog.

**B2, the row is a link to a page (recommended).** A new surface at
**`/app/help`**.

- `app/src/client/routes.ts`: add `help: '/app/help'` to `paths`. It belongs in
  9.1's routes table, unlike `/privacy` and `/terms`, because it is inside the
  application and AC-239's redirect is correct for it.
- `app/src/client/Router.tsx`: `<Route path="help" element={<HelpPage />} />`
  inside the `/app` element, beside `settings` and `people`.
- `app/src/client/pages/HelpPage.tsx`: new, mine. It composes, and holds no
  copy of its own that another file already holds.
- `app/src/client/shell/app-sidebar.tsx`: the footer row, `NavigationRow
  name="Help and resources"` with `CircleQuestionMark`, in the slot Settings
  vacates, that is after People.
- `app/src/client/components/help-sheet.tsx`: **kept**, because the account
  menu's Help item still opens it and 9.1 still names Help there. Its
  `SHORTCUTS` array is exported so the page renders the same rows from the same
  data. One list, two surfaces; a second hand-written shortcut table is how the
  two drift. This file sits in `components/` and may be the Component
  engineer's; if so, exporting the constant is a one-line request to that role
  rather than an edit by this one.
- Spec 9.1 gains the row and the route; a new **9.14 Help and resources**
  should carry the page, because 9.7 is Settings and this is not part of it.

**What the page contains.** The discipline is `help-sheet.tsx`'s own, and it is
the whole reason that file is short: "Help is the easiest control in any
product to fill with a plausible lie: a Getting started that starts nothing, a
Contact support with no support behind it, a Documentation link to a page
nobody has written." So the page ships with what is true today and nothing
else:

1. **Keyboard shortcuts.** The six rows of `SHORTCUTS`, each bound to a live
   handler, which is what AC-242 measures the sheet against.
2. **What Dana is offline.** 9.1's offline contract said plainly: the shell
   opens, reads need a connection, writes fail rather than queue. A person who
   meets the banner has a question and this is where it is answered.
3. **The two public pages**, `/privacy` and `/terms`, which exist and are
   linked only from the landing footer today. A signed-in person has no way to
   reach either.
4. **Version history**, per section C.
5. **Nothing else until there is something behind it.** No "Contact support",
   no "Documentation", no "Getting started". Each of those is content work and
   should arrive as a ruling with the content, not as a heading.

The page is a named region per section, the way 9.7 is, so each of the above is
addressable.

### C. Version history

**It does not exist and cannot be faked**, so this is the part of the request
that is a ruling rather than a task. Two readings, and they are different
features:

- **C1, the application's release notes.** "What changed in Dana, and when."
  Needs a source of truth that is not `git log`: a hand-written, human-facing
  list. It needs the running version to reach the client, which is a
  `define` in `app/vite.config.ts` reading `package.json` (the Platform
  engineer's file, not mine), and a place to keep the notes. Recommended shape
  if it is wanted: a committed `app/src/client/parts/release-notes.ts` holding
  a typed array of `{ version, date, lines }`, rendered on the Help page under
  a "What's new" heading, with the running version named above it. No endpoint,
  no section 4 or 7 change, no server work at all. That is the whole cost.
- **C2, the viewer's own history.** Every event 4.13 records about the things
  they touched. This is `HistorySheet` widened from one object to an account,
  and it is **not free**: 7.x has no route that reads an account-wide event
  feed, so it is a frozen section 7 change and therefore the owner's. It is
  also arguably already offered, per object, from every overflow menu's
  History, and 9.1's one-word rule is against calling that same room by a
  second name.

**Recommendation: C1, on the Help page, not in the profile menu.** The profile
menu is three items and 9.1 fixes it as "the things that are about the
application rather than about your work"; a fourth item there is the "broke the
row of three" objection one level up. Release notes are the most inert thing in
the product and the least deserving of a permanent slot in chrome. If the owner
wants it in the menu instead, the same data serves either and only the call
site moves.

**And it should be named "What's new", not "Version history"**, if C1 is the
reading. "Version history" is what every document tool calls per-object
versions, which is C2, which Dana does not have and will not have while it
stores events rather than snapshots (the argument is written out at
`docs/design/prototype-v2/src/screens/folder-page-v2.tsx`, in the folder
History menu item: restoring to a point needs snapshots, and offering it over
an event log "would either be a lie or a promise to rebuild state by replaying
acts backwards, which is a different product"). A name that promises C2 and
delivers C1 is the plausible lie the Help sheet exists to refuse.

## Order of work, and who owns each part

| Step | File or artefact | Owner |
| - | - | - |
| Ruling: Help gets a sidebar row against the prototype's argument | RFC 0005 change control | Owner, via the Integration Steward |
| Ruling: Version history means C1 and is named "What's new" | RFC 0005 change control | Owner |
| 9.1 footer bullet, the routes table, and a new 9.14 | `docs/spec/09-ui.md` | Frontend Architect |
| AC-264 loses Settings and gains the new row | `app/tests/e2e/ac-264-sidebar-footer.spec.ts` | Adversarial Test Engineer |
| A criterion for the Help page, if section 12 wants one | `docs/spec/12-acceptance-criteria.md` | Adversarial Test Engineer |
| Settings into the menu, Settings row out, Help row in | `app/src/client/shell/app-sidebar.tsx` | whoever holds the sidebar |
| `paths.help`, the route, `HelpPage.tsx` | `routes.ts`, `Router.tsx`, `pages/` | Frontend Architect |
| `SHORTCUTS` exported | `components/help-sheet.tsx` | Component engineer, if that file is theirs |
| `__APP_VERSION__` define, if C1 | `app/vite.config.ts` | Platform engineer |

The two rulings gate everything under them. Steps three and below are a single
package once they land.

## What this session implemented, and what it did not

**Nothing here is implemented.** The one piece that needs no ruling and breaks
nothing is putting Settings back into the profile menu, which restores the
prototype, restores 9.1's pre-polish-round sentence and turns AC-242 green.
It lands entirely in `app/src/client/shell/app-sidebar.tsx`, which this session
was told to read and not write, so it is reported rather than done.

Everything else waits on a ruling: the sidebar row is a departure from the
prototype, and Version history names a feature that does not exist.

/*
The sidebar, on our router and our data.

**It is a navigation landmark.** 9.1's roles table fixes the sidebar as a
navigation landmark: it is 9.1's only chrome and holds the page set, and a
landmark is what lets a person skip to it. AC-174 names exactly one. The role
goes on the vendored `Sidebar`, which spreads unknown props onto the element
that carries the sidebar's own width, so the landmark and the thing AC-182
measures are one box.

**The page entries are links.** The routes table makes every page a URL and a
page reachable at a URL is navigated to; AC-175 names both the role and the
`href`. They are React Router `Link`s handed to `SidebarMenuButton`'s `render`,
which is how that distribution composes with a router, so the anchor is real and
the navigation is the client's.

**Folder rows are links too.** `components/folder-row.tsx` takes an `href` and a
`render`, and this file supplies the router's element.

**There is no top bar.** The app name and the global search control sit in this
header, and the avatar menu sits in this footer. 9.1 requires of the three that
they exist, that the app name links to My Day, and that each is reachable by its
role and its name.

**Names are section 9's.**

| Control | Name |
| - | - |
| Global search | `Search`, 9.1's names table |
| The avatar menu | `Account`, 9.1's names table |
| The app name | the word it renders, with no `aria-label` |
| The rail control | `Collapse sidebar` and `Expand sidebar`, in `ui/sidebar.tsx` |

The general rule: a name in 9.1's table is a fixed string, and what separates
two instances of one control is the region it sits in. A name built by
interpolating the object the control acts on also puts fixture data into the one
namespace a test has to know before it reads the fixture.

**The rail holds the folder you are in and the folders you have open.** A rail
listing one anonymous glyph per folder is a wall rather than a list, and what
belongs in 56 pixels is the folder in front of you and the ones you already have
open. `railFolderIds` and `RailLibrary` below are that rule; the page block, the
footer and every control are untouched, so what the rail loses is folder rows
and nothing else. Inbox stays drawn wherever the viewer is standing on Desk.

What makes the rail look like a rail otherwise: the primitive's own `size-8!`
and `overflow-hidden` clip a row's label without removing it from the
accessibility tree, and the section headings, which name nothing a person can
reach, are hidden there.

**The folder row's menu and the folder group's menu** are each wired to
`shell/folder-groups.tsx`, which holds 9.1's four operations and the dialogs
they open. A control that opens nothing is worse than one that is not there.

**The Library's "+"** is `LibraryPlusMenu` below, the only "New folder" control
in this landmark. Grouping stays on the folder row's menu, because 9.1 makes it
an action on a folder.

**Unnamed affordances are dropped rather than invented a name.** `Add task to
{folder}` on a folder row is an affordance no numbered section names, and 9.3's
entry-point table gives it no row.

Page visibility is a filter over three pages and never over six, which is 9.7's
own note, and `routes.ts` encodes it. A settings read that fails offline leaves
the permanent three visible rather than emptying the sidebar (AC-095), and every
page stays at its URL either way.

The folder list is ordered by 9.1 and not by 7.4: Inbox pinned, then per-member
label groups with labels ascending, then unlabeled folders by name. The labels
are the viewer's own, from the `my_shelf` of 7.4's membership row, so the same
folder is inside a group for one member and among the unlabeled for another.
AC-155 reads all four clauses.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
/* The icon module: one file owns the family and nothing imports `lucide-react`
   directly. */
import type { LucideIcon } from '../lib/icons.js'
import {
  ChevronDown,
  /* Help's glyph, exported for this menu. */
  CircleQuestionMark,
  Settings,
  FolderPlus,
  Folders,
  ListPlus,
  Plus,
  LogOut,
  Search,
  Workflow,
  Bookmark,
  Trash2,
  UsersRound,
} from '../lib/icons.js'

import { DanaMark } from '../components/dana-mark.js'
import { useSidebar } from '../components/ui/sidebar.js'
import { showToast } from '../state/toasts.js'
import { FolderRow } from '../components/folder-row.js'
import { useHelpSheet } from '../components/help-sheet.js'
import { onWorkflowImportRequest, openTaskForm } from './overlays.js'
import { Button } from '../components/ui/button.js'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '../components/ui/sidebar.js'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { MORE_ACTIONS } from '../components/ui/copy.js'
import { ObjectMenu } from '../components/object-menu.js'
import { cn } from '../components/ui/utils.js'
import { useDuplicateFolder } from '../api/mutations.js'
import { folderGates } from '../lib/folder-authority.js'
import { folderRowDisplay, initialsOf, shelfMark } from '../parts/presenters.js'
import { folderLink, shelfLink } from '../lib/nav-links.js'
import { navPages, paths, pinnedNavPages } from '../routes.js'
import { NotificationsBell } from '../components/notifications-bell.js'
import { openInNewTab, useTabs } from './tabs.js'
import type { Tab } from './tabs.js'
import { savedViewPath } from '../views/saved-views.js'
import type { SavedView } from '../../shared/bundle.js'
import { SidebarResizeHandle } from './SidebarResizeHandle.js'
/* The one drag engine, and the Library's answers to the two questions it asks
   about anything outside the list it is sorting. */
import { moved, swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'
import { DIRECTORY, grip, useLibraryZones } from './library-drag.js'
import type { LibraryZones } from './library-drag.js'
import {
  arrangeColumn,
  encodeColumn,
  entryName,
  groupKey,
  labelOfKey,
  moveFolderTo,
} from './library-order.js'
import type { DirectoryEntry } from './library-order.js'
import type { FolderGroupActions } from './folder-groups.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'

/*
Where a folder arriving from another list would land, drawn as a line.

Absolutely positioned, so nothing moves while it is shown. An indicator that
shifted the rows would be changing the answer it was describing.
*/
function InsertLine({ top }: { readonly top: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 left-2 z-20 h-0.5 rounded-full bg-[var(--color-dana-accent-600)]"
      style={{ top }}
    />
  )
}

/**
 * Which slot in a container the pointer is proposing, and where the line goes
 * to say so.
 *
 * It measures live rather than reading a stored geometry, because the rows have
 * been moving: an engine that has been making space has already changed every
 * box this reads.
 *
 * `at` is what the drop writes and `top` is what the line draws, so the two
 * cannot disagree. A line that promised a slot the drop did not honour would be
 * the worse half of drawing one at all.
 */
function proposalIn(
  zone: HTMLElement | null,
  y: number,
): { readonly at: number; readonly top: number } {
  if (zone === null) return { at: 0, top: 0 }
  const origin = zone.getBoundingClientRect().top
  const rows = [...zone.querySelectorAll<HTMLElement>('[data-drop-row]')]
  for (const [index, row] of rows.entries()) {
    const box = row.getBoundingClientRect()
    if (y < (box.top + box.bottom) / 2) return { at: index, top: box.top - origin }
  }
  const last = rows.at(-1)
  return {
    at: rows.length,
    top: last === undefined ? 0 : last.getBoundingClientRect().bottom - origin,
  }
}

/* A stable empty list, so a shelves read still in flight does not rebuild the
   column's memo on every render of the shell above it. */
const NO_SHELVES: readonly Shelf[] = []

/*
The three acts of making, as the Library's "+" names them.

One spelling each, shared with the tab strip's own "+" and with 9.1's names
table: the footer and the strip were one act reached through two doors even
while the footer existed, and two doors that disagree about a word are two
acts as far as anybody reading the screen is concerned. No ellipsis on any of
the three, on the section's own rule for what one means: each opens its
surface on the press.
*/
const NEW_FOLDER = 'New folder'
const NEW_SHELF = 'New shelf'
const NEW_TASK = 'New task'

/**
 * The glyph on a Library group's heading.
 *
 * A shelf wears its own mark, 4.18's icon and colour through the one resolver a
 * folder's uses, so a person who put a suitcase on Travel meets a suitcase in
 * the Library. A label no shelf row names has no identity to draw and keeps the
 * plain Folders glyph.
 */
function GroupGlyph({
  shelf,
  className,
}: {
  readonly shelf: Shelf | null
  readonly className: string
}): React.JSX.Element {
  if (shelf === null) {
    return (
      <Folders
        className={`${className} text-[var(--color-graphite-500)]`}
        strokeWidth={1.75}
        aria-hidden="true"
      />
    )
  }
  const mark = shelfMark(shelf)
  return (
    <mark.icon
      className={className}
      style={{ color: mark.color }}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  )
}
import { PersonFace } from '../components/person-face.js'

/**
 * 9.1's names table, for the two controls this file names rather than a
 * component below it. Both are fixed strings; see the header.
 */
const SEARCH = 'Search'
const ACCOUNT = 'Account'
/**
 * The Library's "+", named in 9.1's names table.
 *
 * One word, like every other fixed string in that table: what it opens is a
 * menu of the three things a person makes, and a name that listed them would be
 * the menu read aloud twice. The tab strip's own plus is "New tab" and this is
 * not that control: it makes things rather than opening places, which is why
 * the two are named apart.
 */
const LIBRARY_NEW = 'New'

/*
The page-to-icon map lives in `routes.ts`, on the page it draws, so a rename in
9.1's page set is one edit, and the sidebar and 9.7's pin list, which must carry
"the page's own mark", cannot disagree about what a page looks like.
*/

/**
 * React Router's `Link` as base-ui's `render` prop takes it.
 *
 * The prop is typed `ReactElement<Record<string, unknown>>` where the router
 * types its own props as an interface, and an interface carries no implicit
 * index signature, so the two do not meet without saying so. Nothing about
 * the element changes: `render` clones it with the primitive's props merged
 * in, which is how that distribution composes with a router.
 */
function routerLink(to: string): ReactElement<Record<string, unknown>> {
  return (<Link to={to} />) as unknown as ReactElement<Record<string, unknown>>
}

/**
 * The same link with 9.1's pending count inside it, which is the one place this
 * file reaches further into a component than supplying its anchor.
 *
 * 9.1 says a folder row shows "color dot, name, pending count" and fixes
 * nowhere in the row the count sits. `folder-row.tsx` renders it as
 * `SidebarMenuBadge`, a sibling of the anchor inside the row, and AC-155
 * asserts that the count is inside the link, which is what makes a screen
 * reader announce "Inbox 1" as one row rather than a name and a loose number
 * beside it. So the count arrives through the element this row already asks the
 * router for, `pending` is passed to the row as zero so there is exactly one of
 * it, and the day that component renders its badge inside the anchor this
 * wrapper is deleted and `pending` goes back to being the real number.
 *
 * The whitespace node is deliberate: adjacent inline elements concatenate in an
 * accessible name, so without it the row announces "Inbox1". A whitespace-only
 * text node is not laid out as a flex item, so it costs nothing on the screen.
 *
 * **The count is positioned rather than laid out.** Inside the anchor it sits
 * in the anchor's *content box*, and that box stops 4.75rem short of the row's
 * right edge: `folder-row.tsx` pads the link by that much so the name truncates
 * before it reaches the actions strip. Laid out, every count would sit 64px
 * left of the row's edge. So this is `SidebarMenuBadge`'s own geometry,
 * `right-3` against the row, expressed from inside the anchor: same offset,
 * same pill, same fade under the hover that brings the actions strip up, same
 * absence in the icon rail. The name keeps its padding and still truncates
 * before the number.
 *
 * `!absolute` carries the important marker on purpose. The link's own class
 * string sets `[&>*]:relative` on every direct child, to lift the row's
 * contents above the `before:` wash behind them, and Tailwind emits `.absolute`
 * ahead of `.relative` in the same layer, so the two collide at equal
 * specificity and the variant wins on source order.
 */
interface FolderRowLinkProps extends Omit<React.ComponentPropsWithRef<'a'>, 'href'> {
  readonly to: string
  readonly pending: number
}

function FolderRowLink({
  to,
  pending,
  children,
  ...rest
}: FolderRowLinkProps): React.JSX.Element {
  return (
    <Link to={to} {...rest}>
      {children}
      {pending > 0 ? (
        <>
          {' '}
          <span className="pointer-events-none !absolute top-1/2 right-3 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] leading-5 font-medium text-[var(--color-graphite-600)] tabular-nums transition-opacity select-none group-data-active/menu-button:text-[var(--color-graphite-800)] group-hover/folder-row:opacity-0 group-focus-within/folder-row:opacity-0 group-data-[collapsible=icon]:hidden">
            {pending}
          </span>
        </>
      ) : null}
    </Link>
  )
}

function folderRowLink(to: string, pending: number): ReactElement<Record<string, unknown>> {
  return (
    <FolderRowLink to={to} pending={pending} />
  ) as unknown as ReactElement<Record<string, unknown>>
}

const NAVIGATION_ROW_CLASS =
  "relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-[13px] font-semibold text-[var(--color-graphite-600)] hover:bg-transparent hover:text-[var(--color-graphite-600)] data-active:bg-transparent data-active:font-semibold data-active:text-[var(--color-graphite-900)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] data-active:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10"

/**
 * One entry of 9.1's page set, as a link to that surface's path.
 *
 * `aria-current` is set here rather than taken from `NavLink`, because which
 * entry is current is a question about the route table and My Day's `/app` is a
 * prefix of every other path in it; deciding it in one place is what keeps the
 * answer from depending on a prop somebody forgets to pass. AC-175 names the
 * mark on Planned and its absence on My Day.
 */
/* Two sidebar disclosures remembered per browser, the "More" row and each
   shelf's fold. Nothing here is a preference 4.19 holds, and losing it costs
   one click. */
const MORE_OPEN_KEY = 'dana.sidebar.more-open'
function readMoreOpen(): boolean {
  try {
    return globalThis.localStorage.getItem(MORE_OPEN_KEY) === '1'
  } catch {
    return false
  }
}
function writeMoreOpen(open: boolean): void {
  try {
    globalThis.localStorage.setItem(MORE_OPEN_KEY, open ? '1' : '0')
  } catch {
    /* A browser that keeps nothing still shows the row this session. */
  }
}
const SHELF_FOLD_KEY = 'dana.sidebar.shelf-collapsed:'
function readShelfOpen(label: string): boolean {
  try {
    return globalThis.localStorage.getItem(SHELF_FOLD_KEY + label) !== '1'
  } catch {
    return true
  }
}
function writeShelfOpen(label: string, open: boolean): void {
  try {
    globalThis.localStorage.setItem(SHELF_FOLD_KEY + label, open ? '0' : '1')
  } catch {
    /* As above. */
  }
}

function NavigationRow({
  name,
  to,
  icon: Icon,
  active,
}: {
  readonly name: string
  readonly to: string
  readonly icon: LucideIcon
  readonly active: boolean
}): React.JSX.Element {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={routerLink(to)}
        data-sidebar-tier="primary"
        isActive={active}
        aria-current={active ? 'page' : undefined}
        tooltip={name}
        className={NAVIGATION_ROW_CLASS}
      >
        <Icon
          className={
            active
              ? '!size-4 text-[var(--color-graphite-900)]'
              : '!size-4 text-[var(--color-graphite-500)]'
          }
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {/* Not hidden in the icon rail: the primitive clips it and AC-182 still
            reads the entry by this name there. */}
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * 9.1's folder list order, which is deliberately not 7.4's.
 *
 * That endpoint sorts is_default first then lower(name); this section pins
 * Inbox, then groups by the viewer's own label with labels ascending, then
 * lists the unlabeled by name. A sidebar rendering the response in the order it
 * arrived is wrong in a way that looks right until two folders disagree about
 * it, which is what AC-155's first case creates on purpose.
 *
 * **That order is the seed of one column rather than the shape of the list.**
 * `shell/library-order.ts` owns both halves: `seedColumn` is exactly the
 * sentence above and `arrangeColumn` lays the viewer's stored sequence over it,
 * so an untouched sidebar still reads as AC-155 asserts. Inbox is not in the
 * column, this section pinning it first and giving it a clause of its own, so
 * it is read off the list here and drawn above.
 */
function inboxOf(folders: readonly Folder[]): Folder | null {
  return folders.find((folder) => folder.is_default) ?? null
}

/** The prefix of 9.1's folder route, so a tab's path can be read back to an id. */
const FOLDER_PATH = paths.folder('')

/**
 * Which folders the icon rail draws: the folder you are standing in and the
 * folders you already have open, which is the part of the Library a rail is
 * narrow enough to be about. A 56px strip holding one anonymous glyph per
 * folder would be a wall rather than a list.
 *
 * **"Open" is the tab strip's own word.** 9.1 makes the strip the set of places
 * the viewer has open and "the place the viewer stands on is the active tab",
 * so a folder is open exactly when a tab points at it. Nothing new is
 * remembered to answer the question, which matters: a second record of what is
 * open would be a second opinion about it.
 *
 * Desk is the default folder's own page (9.1's routes table gives that folder
 * `/app` rather than a folder path), so a tab standing on Desk is that folder
 * open and its row is drawn. Without that clause the one folder every account
 * has would be the one the rail dropped first.
 */
function railFolderIds(
  tabs: readonly Tab[],
  activeFolderId: string | null,
  defaultFolderId: string | null,
): ReadonlySet<string> {
  const open = new Set<string>()
  if (activeFolderId !== null) open.add(activeFolderId)
  for (const tab of tabs) {
    if (tab.path === paths.desk) {
      if (defaultFolderId !== null) open.add(defaultFolderId)
    } else if (tab.path.startsWith(FOLDER_PATH)) {
      open.add(tab.path.slice(FOLDER_PATH.length))
    }
  }
  return open
}

/*
The acts a Library row can perform on its folder.

**Five of the contract's nine are reached by URL rather than rebuilt here.**
Rename, History, Save as workflow, Leave and Delete each need a surface the
folder page already has, an inline field, a sheet, a serialiser, a confirmation
and an undo bar. So the row opens the folder and asks its page to run the act
(`?folder-action=…`, like every other instrument reached by link), which is one
implementation of each rather than two.

The other four are performed in place because they need no surface: opening a
tab, copying an address, and the duplicate, whose whole behaviour is a server
call.

**An act with no handler is not drawn**, so the role split of 9.6 needs no
branch in `folder-row.tsx`: a row is given `delete`, `rename` or `leave` by
whether `folderGates` allows it. Desk is the standing exception, INV-2 making
the default folder undeletable and 9.1 giving it a clause of its own above the
label groups — and that exception is inside `folderGates` too, so this file does
not spell it a second time.

## The three gates read Access, not ownership

Rename is `folder.profile.edit` at Can edit and above, Delete is `folder.trash`
at Full control, and a leave is refused to the owner and to the last
Full-control member. `folder.is_owner` is neither necessary nor sufficient for
any of the three: a Full-control member who is not the owner may rename, and an
owner whose Access was lowered below Full control may not delete.

`GET /folders` carries `my_access` on the 7.4 Folder object, the viewer's own
preset. So the three gates below are `folderGates(...)` — the same call
`pages/FolderPage.tsx` makes, answering from `shared/folder-actions.ts`, which
is the table the routes themselves resolve against.

Workarounds that do not work: fetching the detail per row is up to 200 requests;
reading it out of the query cache gives a menu that is right for visited folders
and wrong for the rest; and `member_count === 1` proves Full control but says
nothing about *shared* folders.

**The one thing this surface cannot know is the roster**, so `otherFullControl`
is left undefined here: the list carries `member_count` and not who holds Full
control. `folderGates` reads that as "offer Leave and let the server refuse it"
rather than hiding a person's only way out of a folder, which is asserted in
`folder-authority.test.ts`. A leave the continuity invariant refuses comes back
as the route's own 409.
*/
export type FolderAction = 'rename' | 'history' | 'workflow' | 'leave' | 'delete'

/** The query the folder page reads to run an act the Library asked for. */
export const FOLDER_ACTION_PARAM = 'folder-action'

function folderActionPath(id: string, action: FolderAction): string {
  return `${paths.folder(id)}?${FOLDER_ACTION_PARAM}=${action}`
}

/**
 * A folder row on our data.
 *
 * `folderRowDisplay` is the only thing that knows how a 7.4 Folder becomes the
 * row's display props; the route and the active mark are this file's, being the
 * router's.
 */
function SidebarFolderRow({
  folder,
  activeId,
  groups,
  nested = false,
  tree = false,
  treeLast = false,
  drag,
}: {
  readonly folder: Folder
  readonly activeId: string | null
  readonly groups: FolderGroupActions
  readonly nested?: boolean
  readonly tree?: boolean
  readonly treeLast?: boolean
  /**
   * What the engine has to say about this row, absent for a row no list is
   * sorting. Inbox is the standing case: 9.1 pins it above the column, so it
   * is drawn by this component with nothing carrying it.
   */
  readonly drag?: {
    readonly itemRef: (element: HTMLElement | null) => void
    readonly rowProps: React.ComponentProps<'li'>
    readonly state: SortableItemState
    readonly proposal: string | null
  }
}): React.JSX.Element {
  const display = folderRowDisplay(folder)
  const navigate = useNavigate()
  const duplicate = useDuplicateFolder()
  /* What this row may offer, from `shared/folder-actions.ts` by way of
     `lib/folder-authority.ts` — the same table the routes resolve against and
     the same call `pages/FolderPage.tsx` makes, so the two menus cannot drift
     (AC-246). `otherFullControl` is deliberately absent: see the block above.

     No `useMemo`. This is three lookups in a fixed table over three fields of a
     prop, and memoising it would cost a dependency array that has to be kept in
     step with `FolderViewerFacts`. */
  const gates = folderGates({
    access: folder.my_access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
  })
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      /* `data-drop-row` is what `proposalIn` measures: the line's slot has to
         be read off the rows as they actually sit, after the engine has moved
         them. */
      rowProps={
        { ...drag?.rowProps, 'data-drop-row': '' } as React.ComponentProps<'li'>
      }
      dragState={drag?.state}
      proposal={drag?.proposal ?? null}
      name={display.name}
      color={display.color}
      icon={display.icon}
      /*
      Issue #158: the default folder's row says "<name> folder" to anything
      reading names, and nothing else about it changes.

      **The collision this answers is structural and belongs to this row.**
      9.1's page block opens with a page called Desk at `/app` and 4.3 names the
      default folder Desk, so every account has two sidebar links of one name.
      Expanded they differ by the pending badge and in the rail they do not
      differ at all. The folder row is the one that moves, because the page
      entry's name is 9.1's own fixed string while a folder's is the person's.

      **Only this row, and that is a decision rather than an oversight.** No
      other row collides with anything, a screen reader would otherwise hear the
      word once per folder in a list that is nothing but folders, and browser
      tests address folder rows by exact name. The rule written here is the
      narrow one: the row of the folder 9.1 also gives a page.

      It stays correct if the folder is renamed. `is_default` is what makes the
      collision certain rather than the word Desk, and "Home folder" reads as
      well as "Desk folder" for an account that renamed it.
      */
      qualifier={folder.is_default ? 'folder' : undefined}
      href={display.href}
      // Zero here and the real number inside the link; see `FolderRowLink`.
      pending={0}
      render={folderRowLink(display.href, display.pending)}
      active={activeId === folder.id}
      nested={nested}
      tree={tree}
      treeLast={treeLast}
      groupLabels={groups.labels}
      currentLabel={folder.my_shelf}
      // Desk is pinned first by 9.1 with a clause of its own, above the label
      // groups and never inside one, so a group act on this row would write a
      // label the sidebar then cannot render.
      onNewGroup={
        folder.is_default
          ? undefined
          : () => {
              groups.onNewGroup(folder)
            }
      }
      onMoveToLabel={
        folder.is_default
          ? undefined
          : (label) => {
              groups.onMoveToGroup(folder, label)
            }
      }
      onOpenInNewTab={() => {
        navigate(openInNewTab(paths.folder(folder.id)))
      }}
      onHistory={() => {
        navigate(folderActionPath(folder.id, 'history'))
      }}
      onRename={
        gates.identity
          ? () => {
              navigate(folderActionPath(folder.id, 'rename'))
            }
          : undefined
      }
      onCopyLink={() => {
        /* `lib/nav-links.ts`, so the sidebar row and the folder page copy one
           address rather than two spellings of it; the act says it happened. */
        void navigator.clipboard.writeText(folderLink(folder.id))
        showToast('Link copied')
      }}
      onDuplicate={() => {
        /* Duplicated server-side, and the copy is the duplicator's own private
           folder, so the Library goes to it exactly as the page does. */
        duplicate.mutate(folder.id, {
          onSuccess: (made) => {
            navigate(paths.folder(made.id))
          },
        })
      }}
      onSaveAsWorkflow={() => {
        navigate(folderActionPath(folder.id, 'workflow'))
      }}
      onLeave={
        gates.leave
          ? () => {
              navigate(folderActionPath(folder.id, 'leave'))
            }
          : undefined
      }
      onDelete={
        gates.trash
          ? () => {
              navigate(folderActionPath(folder.id, 'delete'))
            }
          : undefined
      }
    />
  )
}

/**
 * One personal label group: a collapsible section named by that label.
 *
 * 9.1's sections rule makes this a named region carrying a control with the
 * same name, and its `aria-expanded` is what open and collapsed mean. The
 * control's name is the label alone; a count here would make the accessible
 * name something no table fixes and no test can ask for. AC-155's third case
 * collapses it and asserts the folders inside are gone from the page, which is
 * why the panel unmounts rather than hides.
 *
 * **The region is what makes the group's own menu addressable.** 9.1's sections
 * table gives the sidebar "one per personal label group, named by that label",
 * and four controls in this application answer to "More actions"; the region
 * that names their object is the whole of what tells them apart. So the
 * `section` wraps the heading row and the folders together, and the menu sits
 * inside it. AC-180 reaches this menu that way.
 *
 * **The menu's own name is the same "More actions" as the other three.** A name
 * in 9.1's table is a fixed string and a fourth name would assert a difference
 * in kind that is not there.
 */
function FolderGroupBlock({
  group,
  activeId,
  groups,
  zones,
  drag,
  onMoveOut,
  onReorderWithin,
}: {
  readonly group: Extract<DirectoryEntry, { kind: 'group' }>
  readonly activeId: string | null
  readonly groups: FolderGroupActions
  readonly zones: LibraryZones
  /** This block's own place in the directory's list, from the outer engine. */
  readonly drag: {
    readonly itemRef: (element: HTMLElement | null) => void
    readonly handleProps: { onPointerDown: (event: React.PointerEvent) => void }
    readonly state: SortableItemState
    readonly proposal: string | null
    /**
     * Whether a folder carried from elsewhere is over this shelf, and where
     * inside it a release would land.
     *
     * Two facts and not one because the shelf answers them differently: open
     * and holding folders, it draws the line; closed or empty, it has nowhere
     * to draw one and says the words instead. A closed shelf is never sprung
     * open by a drag hovering it.
     */
    readonly isDropTarget: boolean
    readonly dropTop: number | null
  }
  /** A folder leaving this group, for the label the release writes. */
  readonly onMoveOut: (folder: Folder, label: string | null) => void
  readonly onReorderWithin: (label: string, from: number, to: number) => void
}): React.JSX.Element {
  const [open, setOpenState] = useState(() => readShelfOpen(group.label))
  const setOpen = (next: boolean): void => {
    setOpenState(next)
    writeShelfOpen(group.label, next)
  }
  const self = groupKey(group.label)
  const navigate = useNavigate()
  /* Null for a label no shelf row names, which is what makes the reaching
     acts absent rather than broken: 9.10's page is the shelf's, and a label
     that is not one has no address to open or to copy. */
  const shelfId = group.shelf?.id ?? null
  const shelfPath = shelfId === null ? null : paths.shelf(shelfId)

  /*
  The group's own folders, on the same engine as everything else.

  No hold in here, and no option for one: two folders already in a group cannot
  become a group, Dana nesting one level. What this list adds over the
  directory's is the way out, which needs no target of its own, the space around
  the containers already meaning unsectioned.
  */
  const inner = useSortableList({
    count: group.folders.length,
    onLift: swallowNextClick,
    describe: (index) => group.folders[index]?.name ?? 'Folder',
    onOver: (_from, point) => zones.containerAt(point, self),
    onDropAt: (from, point) => {
      const folder = group.folders[from]
      if (folder === undefined) return false
      const container = zones.containerAt(point, self)
      if (container === null) return false
      onMoveOut(folder, container === DIRECTORY ? null : labelOfKey(container))
      return true
    },
    onReorder: (from, to) => {
      onReorderWithin(group.label, from, to)
    },
  })

  /*
  Two refs on one element, because the section is two things at once: the
  entry the directory's list measures and moves, and the container a release
  from any other list can land in. Composed here rather than given an element
  each, a wrapper existing only to hold a ref being a wrapper that changes the
  layout it was added to.
  */
  const sectionRef = (element: HTMLElement | null): void => {
    drag.itemRef(element)
    zones.registerZone(self)(element)
  }

  const offset = drag.state.offset
  return (
    <section
      aria-label={group.label}
      ref={sectionRef}
      /*
      Three states, and they say three different things. Picked up: the whole
      shelf travels, folders and all, because that is what a person moving one
      means. About to receive: a container says so **as a whole**, because what
      is proposed is the shelf and not a line in it, and the line inside it says
      which slot.
      */
      className={cn(
        'relative rounded-md',
        drag.state.isActive &&
          'cursor-grabbing bg-card shadow-[var(--elevation-2)] ring-1 ring-[var(--color-graphite-300)]',
        drag.isDropTarget &&
          'bg-[var(--color-dana-accent-50)] ring-1 ring-[var(--color-dana-accent-300)]',
      )}
      style={
        offset === 0 && !drag.state.isActive
          ? undefined
          : {
              transform: `translateY(${String(offset)}px)`,
              transition:
                drag.state.isActive && !drag.state.isSettling
                  ? 'none'
                  : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
              position: drag.state.isActive ? 'relative' : undefined,
              zIndex: drag.state.isActive ? 30 : undefined,
              /* A carried section must not catch the point it follows, for
                 the reason folder-row.tsx records: containerAt asks the
                 document what is under the pointer. */
              pointerEvents: drag.state.isActive ? 'none' : undefined,
            }
      }
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          {...grip(drag.handleProps)}
          className="group/folder-group relative flex h-[var(--shell-sidebar-row-height)] items-center rounded-md bg-transparent text-[var(--color-graphite-600)] hover:text-[var(--color-graphite-600)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] focus-within:before:bg-[var(--color-graphite-100)] group-data-[collapsible=icon]:hidden [&>*]:relative [&>*]:z-10"
        >
          {/* What a release would do while **this shelf's own heading** is
              the thing being carried. The other direction, a folder carried
              *onto* this shelf, is the line and the "Into" line below. */}
          {drag.proposal === null ? null : (
            <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-full bg-[var(--color-graphite-900)] px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap text-[var(--color-graphite-50)]">
              {drag.proposal}
            </span>
          )}
          <CollapsibleTrigger
            data-sidebar-tier="group"
            /*
            The glyph is the disclosure and the name is the way in.

            A shelf has a page (9.10), so the row behaves like every other row
            that names something you can open: the label goes there, and the
            disclosure keeps the corner. Both halves are kept because 9.1 asks
            for both, "a shelf is a collapsible group of folder rows headed by
            its name", and a heading that became a link and stopped folding
            would trade one defect for another. AC-257 reads both.

            **The name is a link**, because every folder row in this Library is
            a link, 9.1's roles table makes them one, and a shelf row that
            navigated on click without being one would be the only row here a
            middle click could not open in a tab. **Where no shelf row backs the
            label there is nothing to link to**, so the name stays plain text:
            an account labelled before 7.16 existed loses nothing.
            */
            aria-label={`Show the folders on ${group.label}`}
            className="flex h-full shrink-0 items-center rounded-md py-0 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {/* A shelf's disclosure rests visible at reduced opacity beside its
                glyph rather than replacing it on hover, so an empty shelf still
                reads as a container. */}
            <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
              <GroupGlyph shelf={group.shelf} className="!size-4 opacity-90" />
              <ChevronDown
                className={`!size-3.5 text-[var(--color-graphite-500)] opacity-50 transition-[opacity,transform] group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${open ? '' : '-rotate-90'}`}
                strokeWidth={1.75}
              />
            </span>
          </CollapsibleTrigger>
          {group.shelf === null ? (
            <span className="flex h-full min-w-0 flex-1 items-center gap-2 py-0 pr-1 pl-2 text-left text-[13px] font-semibold">
              <span className="truncate">{group.label}</span>
            </span>
          ) : (
            <Link
              to={paths.shelf(group.shelf.id)}
              data-sidebar-tier="group"
              data-no-drag
              className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md py-0 pr-1 pl-2 text-left text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="truncate">{group.label}</span>
            </Link>
          )}
          {/*
          "Add folder to {shelf}".

          It opens 9.1's New-folder dialog with this shelf already named, so the
          folder is made and filed in one act rather than made loose and then
          moved. `data-no-drag` because the whole row is the grip.
           */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-no-drag
            className="size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] group-hover/folder-group:opacity-100 focus-visible:opacity-100"
            aria-label={`Add folder to ${group.label}`}
            onClick={() => { groups.onAddFolderTo(group.label) }}
          >
            <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </Button>
          {/*
          From the contract, like every other object's menu
          (`lib/object-acts.ts`): History, Copy link, Duplicate and Save as
          workflow are acts a shelf has, so this surface offers them.

          **A group with no shelf row keeps two items**, supplied as the same
          two acts rather than as a second menu: rename and delete are what a
          bare label can do, and the contract's own safety property, an act with
          no handler not drawing, is what expresses that. So the menu narrows
          for a label and widens for a shelf without either being a special
          case.

          Opacity and never a collapsed box, the rule `folder-row.tsx` records:
          a control with an empty bounding box is not visible to anything that
          addresses it by role and name.
           */}
          <ObjectMenu
            kind="shelf"
            name={group.label}
            width="w-44"
            handlers={{
              open: shelfPath === null ? undefined : () => { navigate(shelfPath) },
              rename: () => { groups.onRenameGroup(group.label) },
              'copy-link':
                shelfId === null
                  ? undefined
                  : () => {
                      /* `lib/nav-links.ts`, the same address the shelf page
                         itself copies. */
                      void navigator.clipboard?.writeText(shelfLink(shelfId))
                      showToast('Link copied')
                    },
              delete: () => { groups.onDeleteGroup(group.label) },
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                /* No hover text colour on this one, which is the difference
                   between it and the shelf's other control one line up. */
                className="mr-1 size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] group-hover/folder-group:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                aria-label={MORE_ACTIONS}
                // The heading row is the group's grip, so its own controls
                // have to say they are not: a press on a control belongs to
                // that control (`grip`, in `library-drag.ts`).
                data-no-drag
              />
            }
          />
        </div>
        <CollapsibleContent>
          <SidebarMenu className="pb-1">
            {group.folders.map((folder, index) => {
              const state = inner.itemState(index)
              return (
                <SidebarFolderRow
                  key={folder.id}
                  folder={folder}
                  activeId={activeId}
                  groups={groups}
                  nested
                  tree
                  treeLast={index === group.folders.length - 1}
                  drag={{
                    itemRef: inner.setItemRef(index),
                    rowProps: grip(inner.handleProps(index)),
                    state,
                    /* "Out of group" only. A release **into** a shelf is
                       said by that shelf, which draws the line when it is open
                       and the words when it is closed, and saying it on the
                       carried row as well put 9.1's one sentence on the page
                       twice. The ungrouped list has no container to say it, so
                       that half stays here. */
                    proposal:
                      state.isActive && inner.overKey === DIRECTORY
                        ? 'Out of group'
                        : null,
                  }}
                />
              )
            })}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
      {/* A keyboard move is heard and not only seen: the engine's arrow keys
          move a row, and this is what says so. */}
      <span aria-live="polite" className="sr-only">
        {inner.announcement}
      </span>

      {/*
      A closed shelf takes drops too and has nowhere inside it to draw a line,
      so it says the words instead. It is deliberately **not** sprung open by
      the drag: opening it would move every row below it after the engine had
      measured where they sit.

      9.1 fixes the sentence, "the drop reads 'Into {shelf}'".
       */}
      {drag.isDropTarget && drag.dropTop !== null && open && group.folders.length > 0 ? (
        <InsertLine top={drag.dropTop} />
      ) : null}
      {drag.isDropTarget && (!open || group.folders.length === 0) ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 z-20 -translate-y-1/2 text-[11px] leading-4 font-medium text-[var(--color-dana-accent-700)]"
        >
          Into {group.label}
        </span>
      ) : null}
    </section>
  )
}

/**
 * The Library's one ordered column, and three gestures on it.
 *
 * The directory is one list, not two. Groups and loose folders share a column,
 * so a person moving things in that column is arranging one sequence. A model
 * that kept them apart would have to refuse the obvious drag, a loose folder
 * above a group, for a reason that exists only in the code.
 *
 * The three gestures are one gesture seen from three angles, and stillness is
 * what separates them:
 *
 * - **Travelling proposes a slot.** The rows make space and the carried row
 *   settles into it. Nothing is outlined, because the space is the answer.
 * - **Resting inside a container proposes that container.** The list stops
 *   holding a space open and the container answers instead, in the words 9.1
 *   fixes: "Into {shelf}".
 * - **Resting on a folder proposes that the two become a group**, and that one
 *   takes a deliberate hold, because making a container is a larger act than
 *   using one. A group created by every clumsy pass of the pointer would be
 *   worse than no grouping at all.
 *
 * **The hold hands its pair to the panel that already exists**, with both
 * ticked: everything about making a group, the name, the validation, adding a
 * third folder before committing, stays one surface reached through a second
 * door. A group carried onto another proposes nothing, because Dana nests one
 * level and the honest answer to that drag is that the group moves past.
 */
function LibraryColumn({
  folders,
  shelves,
  order,
  onOrderChange,
  activeId,
  groups,
}: {
  readonly folders: readonly Folder[]
  /** The viewer's shelves (7.16), which are what a group is. */
  readonly shelves: readonly Shelf[]
  readonly order: readonly string[]
  readonly onOrderChange: (ids: readonly string[]) => void
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element {
  const zones = useLibraryZones()
  const entries = useMemo(
    () => arrangeColumn(folders, order, shelves),
    [folders, order, shelves],
  )

  /** The column with one entry moved, written back as a folder sequence. */
  function commit(next: readonly DirectoryEntry[]): void {
    onOrderChange(encodeColumn(next))
  }

  /*
  Which shelf the pointer is over and where inside it a release would land.

  One answer for the whole column, because only one drag runs at a time, and
  it is set in `onOver` rather than derived at paint: the rows have been
  moving, so the measurement is only true at the moment it is taken.
  */
  const [drop, setDrop] = useState<{
    readonly key: string
    readonly at: number
    readonly top: number
  } | null>(null)

  const outer = useSortableList({
    count: entries.length,
    onLift: swallowNextClick,
    describe: (index) => {
      const entry = entries[index]
      return entry === undefined ? 'Folder' : entryName(entry)
    },
    onOver: (from, point) => {
      const entry = entries[from]
      /* A group cannot be put inside anything. Dana nests one level, and the
         honest answer to dragging a group onto a group is that it moves past
         it. */
      if (entry === undefined || entry.kind === 'group') {
        setDrop(null)
        return null
      }
      const container = zones.containerAt(point, null)
      if (container === null || container === DIRECTORY) {
        setDrop(null)
        return null
      }
      const next = { key: container, ...proposalIn(zones.zoneElement(container), point.y) }
      setDrop((current) =>
        current !== null &&
        current.key === next.key &&
        current.at === next.at &&
        current.top === next.top
          ? current
          : next,
      )
      return container
    },
    onDropAt: (from, point) => {
      setDrop(null)
      const entry = entries[from]
      if (entry === undefined || entry.kind === 'group') return false
      const container = zones.containerAt(point, null)
      if (container === null || container === DIRECTORY) return false
      const label = labelOfKey(container)
      /* Measured again at the release rather than read off `drop`: the state
         is a paint-time convenience for the line, and the write must be a
         fact about where the pointer actually is. */
      const at = proposalIn(zones.zoneElement(container), point.y).at
      /* Two writes, and they are two different records: the membership is the
         server's, through 7.4's my-membership, and the sequence is this
         viewer's arrangement of a column. Without the second the folder would
         keep the rank it had as a loose row and the group it joined would
         take that rank, so one gesture would move two things. */
      groups.onMoveToGroup(entry.folder, label)
      commit(moveFolderTo(entries, entry.folder.id, label, at))
      return true
    },
    onReorder: (from, to) => {
      commit(moved(entries, from, to))
    },
    /*
    The hold, and the fallback under it.

    The engine arms on whatever pair it is over, and only folder-on-folder
    means anything here. But a hold that ends in nothing at all is the worst
    available answer, because the person waited for it, so an unusable pair
    falls back to the slot the drag was already proposing.
    */
    onDwell: (from, to) => {
      const carried = entries[from]
      const onto = entries[to]
      if (carried === undefined) return
      if (carried.kind === 'folder' && onto?.kind === 'folder') {
        groups.onGroupFolders([carried.folder, onto.folder])
        return
      }
      commit(moved(entries, from, to))
    },
  })

  /* A group being carried must not be drawn as a merge proposal: the engine
     arms on any pair, and only two folders make a group. */
  const carried = outer.activeIndex === null ? null : entries[outer.activeIndex]
  const canGroup = carried?.kind === 'folder'

  return (
    <SidebarGroupContent ref={zones.registerZone(DIRECTORY)}>
      <SidebarMenu className="mt-1">
        {entries.map((entry, index) => {
          const state = outer.itemState(index)
          const holding = canGroup && state.isDwelling && !state.isArmed
          const armed = canGroup && state.isArmed
          /* The hold's two states, and nothing about containers: a shelf about
             to receive says so itself. AC-227 reads that sentence exactly once. */
          const proposal = !state.isActive || outer.overKey !== null
            ? null
            : armed
              ? 'Release to group'
              : holding
                ? 'Hold to group'
                : null

          if (entry.kind === 'group') {
            return (
              <FolderGroupBlock
                key={entry.key}
                group={entry}
                activeId={activeId}
                groups={groups}
                zones={zones}
                drag={{
                  itemRef: outer.setItemRef(index),
                  handleProps: outer.handleProps(index),
                  state,
                  proposal,
                  isDropTarget: drop?.key === groupKey(entry.label),
                  dropTop: drop?.key === groupKey(entry.label) ? drop.top : null,
                }}
                onMoveOut={(folder, label) => {
                  groups.onMoveToGroup(folder, label)
                  commit(moveFolderTo(entries, folder.id, label))
                }}
                onReorderWithin={(label, from, to) => {
                  commit(
                    entries.map((candidate) =>
                      candidate.kind === 'group' && candidate.label === label
                        ? { ...candidate, folders: moved(candidate.folders, from, to) }
                        : candidate,
                    ),
                  )
                }}
              />
            )
          }

          return (
            <SidebarFolderRow
              key={entry.key}
              folder={entry.folder}
              activeId={activeId}
              groups={groups}
              drag={{
                itemRef: outer.setItemRef(index),
                rowProps: grip(outer.handleProps(index)),
                state,
                proposal,
              }}
            />
          )
        })}
      </SidebarMenu>
      <span aria-live="polite" className="sr-only">
        {outer.announcement}
      </span>
    </SidebarGroupContent>
  )
}

/**
 * The Library as the icon rail draws it: a flat list of the folders
 * `railFolderIds` names, in the column's own order.
 *
 * **Flat rather than the column, because the rail has already lost what makes
 * the column a column.** A shelf's heading is hidden there and has been since
 * the port, having no room for a name, so a shelf section in the rail is an
 * empty caption over some folders: it contributes a named region a screen
 * reader announces and a person cannot see, four pixels of padding, and a
 * tree line the row's own class already hides. Drawing the survivors as one
 * list says exactly what the rail shows.
 *
 * **And no drag.** `LibraryColumn`'s engine sorts the sequence it is
 * rendering, and a rail rendering a filtered list would write an arrangement
 * of the folders it happens to be showing over the arrangement of all of
 * them. Rearranging the Library is what the Library's own width is for.
 *
 * The order is `arrangeColumn`'s, so a folder keeps the place the viewer put
 * it in rather than the order the tabs happen to be in: the rail is a
 * narrower view of one list, not a second list.
 */
function RailLibrary({
  folders,
  shelves,
  order,
  shown,
  activeId,
  groups,
}: {
  readonly folders: readonly Folder[]
  readonly shelves: readonly Shelf[]
  readonly order: readonly string[]
  readonly shown: ReadonlySet<string>
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element {
  const rows = useMemo(
    () =>
      arrangeColumn(folders, order, shelves)
        .flatMap((entry) => (entry.kind === 'group' ? entry.folders : [entry.folder]))
        .filter((folder) => shown.has(folder.id)),
    [folders, order, shelves, shown],
  )
  return (
    <SidebarGroupContent>
      <SidebarMenu className="mt-1">
        {rows.map((folder) => (
          <SidebarFolderRow
            key={folder.id}
            folder={folder}
            activeId={activeId}
            groups={groups}
          />
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  )
}

/**
 * The Library's "+": one door to the three things a person makes.
 *
 * One control on a row that is already there, rather than a footer of buttons,
 * so every pixel it saves is a pixel the Library's scroll area gets.
 *
 * **It sits on the Library's heading**, a ghost icon button at the right end of
 * the heading row. The glyph is the `Plus` the shelf headings carry for "Add
 * folder to {shelf}", which is the same act one level down and reads as the
 * same affordance two places in one list.
 *
 * **It rests visible rather than appearing on hover.** 9.11: "a row whose only
 * controls appear on hover is a row with nothing to press". A touchscreen has
 * no hover to give, so a revealed control is a control a phone cannot find at
 * all.
 *
 * **New task is the third item**, recorded in 9.1. It opens a plain task and
 * carries none of 9.3's entry defaults: the sidebar belongs to the window and
 * not to the page under it, so a task made from here is not a task made on a
 * page.
 *
 * **It survives the icon rail, where the heading does not.** The heading has no
 * room for its word there and is hidden; the row it sits on is not, so the
 * three acts stay reachable at 56px.
 */
function LibraryPlusMenu({
  onNewFolder,
  onNewShelf,
  onNewTask,
}: {
  readonly onNewFolder: () => void
  readonly onNewShelf: () => void
  readonly onNewTask: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] data-popup-open:bg-[var(--color-graphite-200)] data-popup-open:text-[var(--color-graphite-900)]"
            /* 9.1's names table, one word; the sentence that lists the three
               is the tooltip's, a name that enumerated them being the menu
               read aloud before it opens. */
            aria-label={LIBRARY_NEW}
            title="New folder, shelf or task"
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onNewFolder}
        >
          <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {NEW_FOLDER}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onNewShelf}
        >
          <Folders className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {NEW_SHELF}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onNewTask}
        >
          <ListPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {NEW_TASK}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 9.1's header: the app name linking to My Day, the global search control,
 * and the rail control.
 *
 * The mark's `alt` is empty and the anchor carries no label of its own, so
 * the link's accessible name is the word it renders. His `aria-label` said
 * the same thing at more length and in a punctuation this repository does not
 * use; AC-174 reads the name and the `href`.
 */
function SidebarBrandHeader({
  onOpenSearch,
}: {
  readonly onOpenSearch: () => void
}): React.JSX.Element {
  /* The tooltip opens on hover only, never on the focus the closing search
     overlay hands back to this control, so it cannot park itself over the bell
     after Escape. */
  const [searchHovered, setSearchHovered] = useState(false)
  return (
    <SidebarHeader className="p-2 pb-1">
      <div className="flex min-h-[var(--shell-sidebar-item-height)] items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <Link
          to={paths.desk}
          className="flex min-w-0 items-center gap-3 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {/* Drawn rather than fetched (AC-265). This is the one mark a person
              sees all day, and it plays on the hover of the link it sits in
              rather than of itself, which is why the wordmark beside it
              triggers the same sweep. */}
          <DanaMark className="size-7 group-data-[collapsible=icon]:size-6" />
          <span className="truncate text-base font-semibold text-[var(--color-graphite-900)] group-data-[collapsible=icon]:hidden">
            Dana
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:flex-col">
          <Tooltip open={searchHovered} onOpenChange={setSearchHovered}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  className="size-[var(--shell-sidebar-item-height)] text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)]"
                  // 9.1's names table: "Search", exactly, and the shortcut
                  // it answers to belongs in the tooltip rather than in the
                  // name, which AC-174 matches exactly.
                  aria-label={SEARCH}
                  onClick={onOpenSearch}
                  onPointerEnter={() => { setSearchHovered(true) }}
                  onPointerLeave={() => { setSearchHovered(false) }}
                />
              }
            >
              <Search className="!size-4" strokeWidth={1.75} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right">Search · Ctrl K or /</TooltipContent>
          </Tooltip>
          {/* 9.12's bell, beside Search: awareness is global chrome, and the
              header is where Dana keeps its one other everywhere-control. */}
          <NotificationsBell />
          <SidebarTrigger className="size-[var(--shell-sidebar-item-height)] shrink-0 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-1 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] [&_svg]:!size-4" />
        </div>
      </div>
    </SidebarHeader>
  )
}

/**
 * 9.1's one footer control: the avatar menu, ("Account": Settings, People,
 * Trash, Import, Help, Sign out).
 *
 * Named "Account" by 9.1's names table: what the control opens is the viewer's
 * account, there is exactly one of it, and a name carrying the display name
 * would be the one string in that table a test cannot know before it reads the
 * fixture. The person's name is still rendered inside the control; what changes
 * is only what the control answers to.
 *
 * People, Import and Trash live here rather than as footer rows so the footer
 * is the account row alone and the Library gets the vertical room.
 *
 * **The order is the object-menu contract's read onto an account**: reach it,
 * change it, destroy it, and the door last. So the places this account owns
 * first (Settings, People, Trash); then the act and the sheet that are about
 * the application rather than about your work (Import, Help); then Sign out
 * alone behind its separator, because a door belongs last and because a door
 * beside a bin is a misclick nobody wanted.
 *
 * **Settings, People and Trash are menu items, not links.** 9.1's roles table
 * makes the page block links, and these three were never in it. What a menu
 * item costs is the middle click that opens a page in a tab, and the tab
 * strip's own "+" opens any place as a tab, so the gesture is not lost, only
 * moved.
 */
function AccountMenu({
  displayName,
  image = null,
  onOpenSettings,
  onOpenPeople,
  onOpenTrash,
  onImport,
  onOpenHelp,
  onSignOut,
}: {
  readonly displayName: string | null
  /** 7.15's avatar, drawn here as everywhere else. */
  readonly image?: string | null
  readonly onOpenSettings: () => void
  readonly onOpenPeople: () => void
  readonly onOpenTrash: () => void
  /** Presses the one file input this sidebar owns; see `workflowInput`. */
  readonly onImport: () => void
  readonly onOpenHelp: () => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className="h-[var(--shell-sidebar-item-height)] gap-2 px-2 text-[13px] font-semibold text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
            aria-label={ACCOUNT}
          >
            <PersonFace
              name={displayName ?? ''}
              initials={initialsOf(displayName ?? '')}
              image={image}
              className="size-7 group-data-[collapsible=icon]:size-5"
            />
            <span className="min-w-0 truncate text-[13px] font-semibold group-data-[collapsible=icon]:hidden">
              {displayName ?? ''}
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="right" align="end" className="w-48">
        {/* This is the one door to Settings. */}
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenPeople}
        >
          <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
          People
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenTrash}
        >
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Trash
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/*
        Import presses the one file input the application has, which lives in
        this sidebar's footer and stays there: a second input here would be a
        second answer to one selector, and it is the reason the tab strip's "+"
        asks through `overlays.ts` rather than growing one.
         */}
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onImport}
        >
          <Workflow className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Import
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenHelp}
        >
          <CircleQuestionMark className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Help
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onSignOut}
        >
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({
  pinnedViews,
  folders,
  shelves,
  sidebarOrder,
  onSidebarOrderChange,
  groups: groupActions,
  displayName,
  avatarUrl = null,
  activeFolderId,
  currentPath,
  currentSearch,
  savedViews,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onSidebarWidthReset,
  onOpenSearch,
  onNewFolder,
  onNewShelf,
  onImportWorkflow,
  onSignOut,
}: {
  /**
   * The pin list of 4.19, which decides which page entries exist.
   *
   * Absent while the bundle read is in flight or has failed, and the model
   * falls back to 9.1's defaults rather than to an empty list: a sidebar that
   * empties on a failed read strands a person wherever they are standing, which
   * is AC-095's third case generalised to the pin list.
   */
  readonly pinnedViews: readonly string[] | undefined
  readonly folders: readonly Folder[] | undefined
  /**
   * The viewer's shelves (7.16), and the prop whose absence was the whole of
   * the audit addendum's finding.
   *
   * The shell fetched `useShelves` and passed it nowhere, so 9.1's "holding
   * the viewer's shelves and folders as one ordered list" was unimplemented
   * for the shelves half and no work on the heading or a New shelf control
   * could reach it. Absent while the read is in flight or has failed, and the
   * Library then draws the label groups it always drew rather than emptying,
   * which is `pinnedViews`' own rule applied to the column.
   */
  readonly shelves: readonly Shelf[] | undefined
  /**
   * The viewer's arrangement of the Library, from the 4.19 bundle.
   *
   * A flat folder sequence, for the reason `library-order.ts` records at
   * length: `sidebar_order` is an array of uuids and a group is a label with no
   * id, and a column whose groups are drawn as blocks is held whole by the
   * folder sequence alone. Empty until somebody has dragged something, which is
   * what keeps AC-155 reading the alphabet.
   */
  readonly sidebarOrder: readonly string[]
  readonly onSidebarOrderChange: (ids: readonly string[]) => void
  /** 9.1's four folder-group operations, held by the shell that mounts them. */
  readonly groups: FolderGroupActions
  readonly displayName: string | null
  /** 7.15's avatar for the foot. */
  readonly avatarUrl?: string | null
  readonly activeFolderId: string | null
  readonly currentPath: string
  /** The active location's query string, so a pinned saved view can be active. */
  readonly currentSearch: string
  /** The viewer's saved views (4.19); the pinned ones join the page block. */
  readonly savedViews: readonly SavedView[]
  /** The width this viewer chose, or null while the design's is in force. */
  readonly sidebarWidth: number | null
  readonly onSidebarWidthChange: (width: number) => void
  readonly onSidebarWidthCommit: (width: number) => void
  readonly onSidebarWidthReset: () => void
  readonly onOpenSearch: () => void
  readonly onNewFolder: () => void
  /** 9.1's second act of making, which 7.16's POST /shelves is behind. */
  readonly onNewShelf: () => void
  /** 9.1's third: a workflow file, handed to 7.16's import as parsed text. */
  readonly onImportWorkflow: (file: File) => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  const [foldersOpen, setFoldersOpen] = useState(true)
  const { setOpen: setHelpOpen, sheet: helpSheet } = useHelpSheet()
  /* For the account menu's Settings item alone; every other navigation in
     this file happens in the row components, which hold their own. */
  const navigate = useNavigate()
  /* On a phone the sidebar is a drawer, and a drawer closes on the navigation
     it was opened to make: the shell's `PhoneBar` opens it, and this effect on
     the route closes it. */
  const { isMobile, setOpenMobile, state } = useSidebar()
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [currentPath, currentSearch, isMobile, setOpenMobile])
  /* The icon rail, which is a desktop state alone: below 768px the sidebar is
     a drawer at its full width (9.1), and `ui/sidebar.tsx` sets
     `data-collapsible` on the desktop element only, so the rail's own rule
     has to be scoped the same way or a phone would get it. */
  const railed = state === 'collapsed' && !isMobile
  const { tabs } = useTabs()
  /* The file input the Import button presses, hidden because a bare file
     control cannot be given the row's shape and a button that opens one can. */
  const workflowInput = useRef<HTMLInputElement>(null)
  /* The tab strip's "+" offers Import too (9.1's plus sentence), and the one
     file input belongs here; the strip asks through `overlays.ts` and this
     presses it. */
  useEffect(
    () =>
      onWorkflowImportRequest(() => {
        workflowInput.current?.click()
      }),
    [],
  )
  const inbox = inboxOf(folders ?? [])
  /* Memoised because `RailLibrary` filters on it: a fresh Set every render
     would rebuild that list whenever any chrome query settled. */
  const railShown = useMemo(
    () => railFolderIds(tabs, activeFolderId, inbox?.id ?? null),
    [tabs, activeFolderId, inbox],
  )
  const visiblePages = pinnedNavPages(pinnedViews)
  const pinnedSaved = savedViews.filter((view) => view.pinned)
  /* Done, Anytime and Abandoned ship unpinned, so a "More" row under the page
     block opens onto whatever native pages are not pinned; 9.7's pin list still
     promotes one to the block itself. Its open state is this browser's. */
  const morePages = navPages.filter((page) => !visiblePages.includes(page))
  const [moreOpen, setMoreOpen] = useState(() => readMoreOpen())

  return (
    <Sidebar
      collapsible="icon"
      // 9.1's roles table. The label is this file's: the section names no
      // string for the landmark itself, and a landmark with no name is
      // announced as "navigation" alone on a page that has exactly one.
      role="navigation"
      aria-label="Pages and folders"
      /*
      `transition-none` overrides the distribution's own
      `transition-[left,right,width] duration-200`, and it is a correction
      rather than a preference. That transition animates the very property both
      of 9.1's view preferences set: a drag on the resize handle would lag the
      pointer by a fifth of a second, and the rail would arrive at its width
      long after the click that asked for it. AC-182 reads the width immediately
      after each, and what it would otherwise read is a frame of an animation
      rather than the preference. What is lost is the slide.
      */
      /* No right border: a rule drawn down the whole window is not a small
         difference. */
      className="h-full shrink-0 bg-sidebar transition-none"
    >
      <SidebarBrandHeader onOpenSearch={onOpenSearch} />

      <SidebarContent className="py-1">
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {visiblePages.map((page) => (
                <NavigationRow
                  key={page.path}
                  name={page.name}
                  to={page.path}
                  icon={page.icon}
                  active={currentPath === page.path}
                />
              ))}
              {/*
              9.1's page block ends with "any unpinned view the pin list of 9.7
              has pinned ... and the viewer's saved views", so a pinned saved
              view is an entry here like any other. It is last because the six
              native pages are a fixed order this section states and a person's
              own views are not in it.

              **Where a saved view leads.** 9.1's routes table has no row for
              one. A saved view is a name over a filter on a place-page, so it
              opens that page carrying its own definition: `?view=<id>`, which
              `usePlace` reads and seeds the page's filter from. A path of its
              own would make a view another kind of surface rather than the page
              it is a view of.
               */}
              {pinnedSaved.map((view) => (
                <NavigationRow
                  key={view.id}
                  name={view.name}
                  to={savedViewPath(view)}
                  icon={Bookmark}
                  active={currentPath + currentSearch === savedViewPath(view)}
                />
              ))}
              {morePages.length === 0 ? null : (
                <>
                  <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                    <SidebarMenuButton
                      aria-expanded={moreOpen}
                      onClick={() => {
                        setMoreOpen(!moreOpen)
                        writeMoreOpen(!moreOpen)
                      }}
                      className="relative h-[var(--shell-sidebar-row-height)] gap-2 border-0 bg-transparent px-3 text-xs text-[var(--color-graphite-500)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:bg-transparent hover:text-[var(--color-graphite-700)] hover:before:bg-[var(--color-graphite-100)] [&>*]:relative [&>*]:z-10"
                    >
                      <ChevronDown
                        className={`size-3.5 shrink-0 transition-transform ${moreOpen ? '' : '-rotate-90'}`}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <span className="truncate">More</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {moreOpen
                    ? morePages.map((page) => (
                        <NavigationRow
                          key={page.path}
                          name={page.name}
                          to={page.path}
                          icon={page.icon}
                          active={currentPath === page.path}
                        />
                      ))
                    : null}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/*
        9.1's divider, and it is deliberately not a `separator`. The two
        resize handles of 9.1 and 9.3 are the separators on this page and
        AC-182 addresses them by that role alone; a decorative rule exposed
        beside them would be the first one a locator finds. Nothing about a
        divider is a control, so hiding it from the accessibility tree loses
        nothing.
        */}
        <div
          aria-hidden="true"
          className="mx-3 my-2 border-t border-[var(--color-graphite-200)] group-data-[collapsible=icon]:mx-2"
        />

        {/* `mt-2`: the Library stands off the page block above it. It does not
            take `group-data-[collapsible=icon]:hidden`, because the rail keeps
            the folders the header's rail paragraph names rather than none of
            them; what the rail drops it drops by not rendering the row, which
            is a fact about the list and not about the block around it. */}
        <Collapsible className="mt-2" open={foldersOpen} onOpenChange={setFoldersOpen}>
          <SidebarGroup className="py-0">
            {/*
            The Library block of 9.1, and it is a heading wrapping the
            control rather than a control alone. That section's regions
            paragraph asks for both: "a named region plus a control
            carrying that name, whose expanded state is what open and
            collapsed mean". A bare button satisfies the control half and
            leaves the block unnamed in the document outline, which is
            what AC-214 reads when it asks for the heading.

            The heading is hidden in the rail, where it has no room for its
            word and names nothing a person can reach; the rows below it are
            drawn there under the rule the header's rail paragraph records.
            */}
            {/*
            The heading row is a `div` with the heading inside it rather than
            around it: an `h2` wrapping both the word and the "+" would give the
            document outline a heading called "Library New". The word is the
            heading, the control is its neighbour, and the row is what the two
            share.
             */}
            <div className="group/folder-directory flex h-8 items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <h2 className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
                <CollapsibleTrigger
                  data-sidebar-tier="section"
                  className="group/folder-directory-trigger flex h-6 min-w-0 flex-1 items-center rounded-md px-2 text-left text-[11px] font-semibold text-[var(--color-graphite-600)] outline-none hover:bg-[var(--color-graphite-100)] focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  <span className="truncate">Library</span>
                  <ChevronDown
                    className={`ml-1 size-3.5 shrink-0 text-[var(--color-graphite-500)] opacity-0 transition-[opacity,transform] group-hover/folder-directory-trigger:opacity-100 group-focus-visible/folder-directory-trigger:opacity-100 ${foldersOpen ? '' : '-rotate-90'}`}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </CollapsibleTrigger>
              </h2>
              {/* No "Library options" menu here: one door per act, and the "+"
                  is that door. */}
              <LibraryPlusMenu
                onNewFolder={onNewFolder}
                onNewShelf={onNewShelf}
                onNewTask={() => {
                  openTaskForm({})
                }}
              />
            </div>
            <CollapsibleContent>
              {/* Inbox above the column and never in it: 9.1 pins it first,
                  above the label groups and never inside one, so it is the one
                  folder row no arrangement can move. Its row carries no group
                  action for the same reason, which `SidebarFolderRow` enforces. */}
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Pinned above the column, and in the rail only when it is
                      one of the folders the rail is about: Desk is the page
                      block's own entry there, so an Inbox row drawn beside it
                      for a folder nobody is standing in is the same glyph
                      twice. `railFolderIds` reads a tab on Desk as this
                      folder open, which is what keeps it drawn wherever it is
                      the folder in front of you. */}
                  {inbox === null || (railed && !railShown.has(inbox.id)) ? null : (
                    <SidebarFolderRow
                      folder={inbox}
                      activeId={activeFolderId}
                      groups={groupActions}
                    />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>

              {railed ? (
                <RailLibrary
                  folders={folders ?? []}
                  shelves={shelves ?? NO_SHELVES}
                  order={sidebarOrder}
                  shown={railShown}
                  activeId={activeFolderId}
                  groups={groupActions}
                />
              ) : (
                <LibraryColumn
                  folders={folders ?? []}
                  shelves={shelves ?? NO_SHELVES}
                  order={sidebarOrder}
                  onOrderChange={onSidebarOrderChange}
                  activeId={activeFolderId}
                  groups={groupActions}
                />
              )}
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter className="gap-0 py-2">
        {/*
        One control: the person.

        The three acts of making live at the Library's own "+", and People,
        Import and Trash inside the account menu, so the footer takes as little
        as possible off the bottom of a column whose whole purpose above it is a
        list that scrolls. The footer and `SidebarContent` are the fixed and the
        flexible halves of one column, so every row the first gives up the
        second takes.

        The file input is here too, but is not drawn at all.
         */}
        {/*
        The workflow file itself (7.16's POST /workflows/import), read in the
        browser and handed over as parsed structure.

        The import is client-side only as far as reading the bytes goes: 10.3
        caps a workflow file's contents and the server is what enforces every
        one of those caps, so what this does is hand the endpoint a document and
        let it refuse. A file that is not JSON at all is refused here, because
        sending a parse failure to the server as a 400 would tell the person
        less than the sentence the page can write itself.

        **It stays in this footer although the control that presses it does
        not.** There is one file input in the application and two ways to reach
        it: the account menu's Import below, and the tab strip's "+" through
        `overlays.ts`. A second input beside either caller would be a second
        answer to one selector, `input[type="file"]`, in the sidebar.
         */}
        <input
          ref={workflowInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file === undefined) return
            void onImportWorkflow(file)
          }}
        />
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu
              displayName={displayName}
              image={avatarUrl}
              onOpenSettings={() => {
                navigate(paths.settings)
              }}
              onOpenPeople={() => {
                navigate(paths.people)
              }}
              onOpenTrash={() => {
                navigate(paths.trash)
              }}
              onImport={() => {
                workflowInput.current?.click()
              }}
              onOpenHelp={() => {
                setHelpOpen(true)
              }}
              onSignOut={onSignOut}
            />
          </SidebarMenuItem>
        </SidebarMenu>
        {/* The sheet the menu item above opens, mounted beside its trigger
            rather than threaded down from the shell, which is the source
            file's own arrangement and its reason: nothing else opens it yet.
            It portals, so where it is mounted is not where it is drawn. */}
        {helpSheet}
      </SidebarFooter>

      <SidebarResizeHandle
        value={sidebarWidth}
        onChange={onSidebarWidthChange}
        onCommit={onSidebarWidthCommit}
        onReset={onSidebarWidthReset}
      />
    </Sidebar>
  )
}

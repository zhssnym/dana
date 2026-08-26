/*
The designer's `src/components/app-sidebar.tsx`, ported at P8R session R5 onto
our router and our data.

Under RFC 0002 his prototype is the source this client is built from rather
than a reference it is compared against, so his composition, his class strings
and his structure arrive unchanged except where a numbered section says
otherwise. Every such departure is named here, with the sentence that forced
it, and each was measured against the running prototype on 2026-08-13 rather
than remembered.

**It is a navigation landmark, and his sidebar is not one.** Measured: zero
`nav` elements and zero `role="navigation"` in his whole document. 9.1's roles
table, added at the RFC 0002 change control, fixes the sidebar as a navigation
landmark on the section's own ground, that it is 9.1's only chrome and holds
the page set, and a landmark is what lets a person skip to it. AC-174 asserts
exactly one. The role goes on the vendored `Sidebar`, which spreads unknown
props onto the element that carries the sidebar's own width, so the landmark
and the thing AC-182 measures are one box.

**The six page entries are links, and his are buttons.** Measured: six
`button` elements carrying `aria-current="page"`, the brand being the only
anchor anywhere in his sidebar. The same roles table fixes them as links,
because the routes table makes every page a URL and a page reachable at a URL
is navigated to; AC-175 asserts both the role and the `href`. They are React
Router `Link`s handed to `SidebarMenuButton`'s `render`, which is how that
distribution composes with a router, so the anchor is real and the navigation
is the client's.

**Folder rows are links too and R3 already built them that way.**
`components/folder-row.tsx` takes an `href` and a `render`, and this file
supplies the router's element. Nothing about the row is rebuilt here.

**The three relocated controls are here rather than in a bar above.** The
owner ruled on 2026-08-13 that his design wins on the top bar and 9.1 was
amended to match: there is no top bar, the app name and the global search
control sit in this header, and the avatar menu sits in this footer. What that
section has ever required of the three is that they exist, that the app name
links to My Day, and that each is reachable by its role and its name.

**Four names are section 9's over his, which is the same ruling read the other
way: his design wins on structure and section 9 wins on labels.**

| Control | His string | Section 9's |
| - | - | - |
| Global search | `Search Dana. Keyboard shortcut Control K or slash.` | `Search`, 9.1's names table |
| The avatar menu | `Open Imran Wafa's account menu` | `Account`, 9.1's names table |
| The app name | an `aria-label` naming the link and its destination, in a punctuation this repository does not use | the word it renders, the label removed rather than reworded |
| The rail control | `Toggle Sidebar` from the distribution | `Collapse sidebar` and `Expand sidebar`, corrected in `ui/sidebar.tsx` before this session |

The general rule under three of those four: a name in 9.1's table is a fixed
string, and what separates two instances of one control is the region it sits
in. A name built by interpolating the object the control acts on also puts
fixture data into the one namespace a test has to know before it reads the
fixture, which is 9.1's own argument at the avatar menu.

**The rail keeps the whole list, and his hides half of it.** His folder
directory carries `group-data-[collapsible=icon]:hidden`, so collapsing to the
rail drops Inbox, every label group and every folder. 9.1 says the width and
the collapsed state "change nothing about what the sidebar holds", and AC-182
asserts that the rail still reaches every page and every folder. So the class
is gone from the directory and the rows survive; what makes the rail look like
a rail is the primitive's own `size-8!` and `overflow-hidden`, which clips a
row's label without removing it from the accessibility tree. The section
headings, which name nothing a person can reach, are hidden there instead.

**Two of the three menus his sidebar carries arrived at R10 with the writes
they need, and the third is not coming.** The folder row's own menu and the
folder group's menu are wired below, each to `shell/folder-groups.tsx`, which
holds 9.1's four operations and the dialogs they open; until R10 they were
props that were absent rather than markup that had been removed, because a
control that opens nothing is worse than one that is not there. The one not
coming is his folder-directory menu: its two entries are "New folder", which
would be a second control of that name inside this landmark, and "New folder
group", which 9.1 makes an action on a folder and which is therefore on the
folder row's menu instead. 9.1's addressing sentence does not admit the first
and the P8R change control settled the second.

**Two controls he draws are dropped as unnamed rather than renamed.** `Add
task to {folder}` on a folder row and `Add folder to {group}` on a group
heading are affordances no numbered section names, and 9.3's entry-point table
gives neither of them a row. R3 recorded the rule this follows: a control
section 9 does not name keeps the designer's own string, and inventing a fixed
name for it would be the unrecorded deviation. Dropping the control is the
third option and the one taken here, because the RFC's own alternatives
section refuses to admit his affordances silently and neither of these two is
among the ten it ruled on.

Page visibility is a filter over three pages and never over six, which is
9.7's own note, and `routes.ts` encodes it. A settings read that fails offline
leaves the permanent three visible rather than emptying the sidebar, which is
what AC-095's third case is written against, and every page stays at its URL
either way.

The folder list is ordered by 9.1 and not by frozen 7.4: Inbox pinned, then
per-member label groups with labels ascending, then unlabeled folders by name.
The labels are the viewer's own, from the `my_label` of 7.4's membership row,
so the same folder is inside a group for one member and among the unlabeled
for another. AC-155 reads all four clauses.
*/
import { useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
/* The icon module of DES-125, since S8: one file owns the family and
   nothing imports `lucide-react` directly. */
import type { LucideIcon } from '../lib/icons.js'
import {
  ChevronDown,
  /* Help's glyph, which S8 exported for this menu and named DES-200 for. */
  CircleQuestionMark,
  FolderPlus,
  Folders,
  LogOut,


  Search,
  Workflow,
  Settings as SettingsGlyph,
  Bookmark,
  Trash2,
  UsersRound,
} from '../lib/icons.js'

import { DanaMark } from '../components/dana-mark.js'
import { FolderRow } from '../components/folder-row.js'
import { useHelpSheet } from '../components/help-sheet.js'
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
import { useDuplicateFolder } from '../api/mutations.js'
import { folderRowDisplay, initialsOf, shelfMark } from '../parts/presenters.js'
import { paths, pinnedNavPages } from '../routes.js'
import { NotificationsBell } from './NotificationsBell.js'
import { openInNewTab } from './tabs.js'
import { savedViewPath } from '../views/saved-views.js'
import type { SavedView } from '../../shared/bundle.js'
import { SidebarResizeHandle } from './SidebarResizeHandle.js'
/* The one drag engine of RFC 0004's S11 row, and the Library's answers to the
   two questions it asks about anything outside the list it is sorting. */
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

/* A stable empty list, so a shelves read still in flight does not rebuild the
   column's memo on every render of the shell above it. */
const NO_SHELVES: readonly Shelf[] = []

/* One class for the three, because they are one row and a difference between
   them here would be a difference nobody decided. */
const ROW_OF_THREE_CLASS =
  'h-[var(--shell-sidebar-item-height)] w-full justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:!size-auto group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0'

/**
 * The glyph on a Library group's heading.
 *
 * A shelf wears its own mark, 4.18's icon and colour through the one resolver
 * S17a built for a folder's (DES-130), so a person who put a suitcase on
 * Travel meets a suitcase in the Library. A label no shelf row names has no
 * identity to draw and keeps the plain Folders glyph the group always had.
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

/*
The map that stood here moved to `routes.ts` at S16, onto the page it draws.

Its own comment asked for it: "keyed by path rather than by name so that a
rename in 9.1's page set is one edit in `routes.ts` and not two". The second
reader arrived with 9.7's pin list, which that section requires to carry "the
page's own mark", and one mark on the page is the only arrangement in which
the sidebar and the pin list cannot disagree about what a page looks like.
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
 * The same link with 9.1's pending count inside it, which is the one place
 * this file reaches further into a ported component than supplying its
 * anchor, and it is a request against `components/folder-row.tsx` rather than
 * a preference.
 *
 * 9.1 says a folder row shows "color dot, name, pending count" and fixes
 * nowhere in the row the count sits. His component renders it as
 * `SidebarMenuBadge`, a sibling of the anchor inside the row, and AC-155 has
 * asserted since P8 that the count is inside the link, which is what makes a
 * screen reader announce "Inbox 1" as one row rather than a name and a loose
 * number beside it. AC-173 reads the count off the row and is satisfied
 * either way. So the count arrives through the element this row already asks
 * the router for, `pending` is passed to the row as zero so there is exactly
 * one of it, and the day that component renders its badge inside the anchor
 * this wrapper is deleted and `pending` goes back to being the real number.
 *
 * The whitespace node is deliberate and P8 measured why: adjacent inline
 * elements concatenate in an accessible name, so without it the row announces
 * "Inbox1". A whitespace-only text node is not laid out as a flex item, so it
 * costs nothing on the screen.
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
          <span className="shrink-0 rounded-full bg-[var(--color-graphite-200)] px-1.5 text-[0.625rem] leading-5 text-[var(--color-graphite-600)] tabular-nums">
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
 * entry is current is a question about the route table and My Day's `/app` is
 * a prefix of every other path in it; deciding it in one place is what keeps
 * the answer from depending on a prop somebody forgets to pass. AC-175
 * asserts the mark on Planned and its absence on My Day in one case.
 */
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
        {/* Not hidden in the icon rail, unlike his: the primitive clips it
            and AC-182 still reads the entry by this name there. */}
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * 9.1's folder list order, which is deliberately not frozen 7.4's.
 *
 * That endpoint sorts is_default first then lower(name); this section pins
 * Inbox, then groups by the viewer's own label with labels ascending, then
 * lists the unlabeled by name. A sidebar rendering the response in the order
 * it arrived is wrong in a way that looks right until two folders disagree
 * about it, which is what AC-155's first case creates on purpose.
 *
 * **That order is the seed of one column rather than the shape of the list**,
 * since S11 built DES-171's drag. `shell/library-order.ts` owns both halves:
 * `seedColumn` is exactly the sentence above and `arrangeColumn` lays the
 * viewer's stored sequence over it, so an untouched sidebar still reads as
 * AC-155 asserts. Inbox is not in the column, this section pinning it first
 * and giving it a clause of its own, so it is read off the list here and
 * drawn above.
 */
function inboxOf(folders: readonly Folder[]): Folder | null {
  return folders.find((folder) => folder.is_default) ?? null
}

/*
The acts a Library row can perform on its folder, since S17a.

**Five of the contract's nine are reached by URL rather than rebuilt here**,
and that is the prototype's own idiom rather than a shortcut. Rename, History,
Save as workflow, Leave and Delete each need a surface the folder page already
has, an inline field, a sheet, a serialiser, a confirmation and an undo bar,
and `lib/object-acts.ts`'s note on the retired "Label and colour" records the
mechanism the designer used for exactly this case: "The URL that did it
survives as ?folder-action=appearance, like every other instrument this plan
reaches by link." So the row opens the folder and asks its page to run the
act, which is one implementation of each rather than two, and is what DES-201
is about in the first place.

The other four are performed in place because they need no surface: opening a
tab, copying an address, and the duplicate, whose whole behaviour is a server
call (DES-198).

**An act with no handler is not drawn**, so the role split of 9.6 needs no
branch in `folder-row.tsx`: the owner's row is given `delete` and the
member's `leave`, from `folder.is_owner`, which 7.4 puts on the object.
Desk is the standing exception, INV-2 making the default folder undeletable
and 9.1 giving it a clause of its own above the label groups.
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
 * `folderRowDisplay` is R4's mapping and the only thing that knows how a 7.4
 * Folder becomes his display props; the route and the active mark are this
 * file's, being the router's.
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
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      rowProps={drag?.rowProps}
      dragState={drag?.state}
      proposal={drag?.proposal ?? null}
      name={display.name}
      color={display.color}
      icon={display.icon}
      href={display.href}
      // Zero here and the real number inside the link; see `FolderRowLink`.
      pending={0}
      render={folderRowLink(display.href, display.pending)}
      active={activeId === folder.id}
      nested={nested}
      tree={tree}
      treeLast={treeLast}
      groupLabels={groups.labels}
      currentLabel={folder.my_label}
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
        folder.is_owner
          ? () => {
              navigate(folderActionPath(folder.id, 'rename'))
            }
          : undefined
      }
      onCopyLink={() => {
        void navigator.clipboard.writeText(
          `${globalThis.location.origin}${paths.folder(folder.id)}`,
        )
      }}
      onDuplicate={() => {
        /* DES-198 server-side, and the copy is the duplicator's own private
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
        folder.is_owner
          ? undefined
          : () => {
              navigate(folderActionPath(folder.id, 'leave'))
            }
      }
      onDelete={
        folder.is_owner && !folder.is_default
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
 * collapses it and asserts the folders inside are gone from the page, which
 * is why the panel unmounts rather than hides.
 *
 * **The region is a real one since P8R session R10**, and it is what makes the
 * group's own menu addressable. 9.1's sections table gives the sidebar "one
 * per personal label group, named by that label", and four controls in this
 * application answer to "More actions"; the region that names their object is
 * the whole of what tells them apart, which is that section's own answer at
 * the folder header. So the `section` wraps the heading row and the folders
 * together, and the menu sits inside it. AC-180 reaches this menu that way.
 *
 * **The menu's own name is the same "More actions" as the other three.** His
 * prototype interpolates, `Manage {label} folder group`, measured on the
 * running prototype on 2026-08-13; a name in 9.1's table is a fixed string and
 * a fourth name would assert a difference in kind that is not there.
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
  }
  /** A folder leaving this group, for the label the release writes. */
  readonly onMoveOut: (folder: Folder, label: string | null) => void
  readonly onReorderWithin: (label: string, from: number, to: number) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const self = groupKey(group.label)
  const navigate = useNavigate()
  /* Null for a label no shelf row names, which is what makes the reaching
     acts absent rather than broken: 9.10's page is the shelf's, and a label
     that is not one has no address to open or to copy. */
  const shelfPath = group.shelf === null ? null : paths.shelf(group.shelf.id)

  /*
  The group's own folders, on the same engine as everything else.

  No hold in here, and no option for one: two folders already in a group
  cannot become a group, Dana nesting one level (DES-171). What this list adds
  over the directory's is the way out, which needs no target of its own, the
  space around the containers already meaning unsectioned.
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
          className="group/folder-group relative flex h-[var(--shell-sidebar-row-height)] items-center rounded-md bg-transparent text-[var(--color-graphite-600)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] focus-within:before:bg-[var(--color-graphite-100)] group-data-[collapsible=icon]:hidden [&>*]:relative [&>*]:z-10"
        >
          {/* What a release would do, on the heading being carried. 9.1 fixes
              the sentence for the container case and DES-171 gives the reason
              it is words: a closed group is never sprung open by a drag
              hovering it, so it takes the drop and says so instead. */}
          {drag.proposal === null ? null : (
            <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-full bg-[var(--color-graphite-900)] px-2 py-0.5 text-[0.625rem] font-medium whitespace-nowrap text-[var(--color-graphite-50)]">
              {drag.proposal}
            </span>
          )}
          <CollapsibleTrigger
            data-sidebar-tier="group"
            /*
            The glyph is the disclosure and the name is the way in (DES-207),
            which is the designer's own sentence and the whole of what S17b
            changes about this row.

            The whole row used to toggle, and that was right while a shelf was
            only a heading over some folders. It has a page now (9.10), so the
            row behaves like every other row that names something you can
            open: the label goes there, and the disclosure keeps the corner it
            already announced, the Folders glyph having swapped to a chevron
            on hover since the day it was drawn. Both halves are kept because
            9.1 asks for both, "a shelf is a collapsible group of folder rows
            headed by its name", and a heading that became a link and stopped
            folding would trade one defect for another. AC-214's Library still
            collapses; AC-257 reads both.

            **The name is a link where the designer draws a button**, and the
            departure is this client's own consistency rather than a
            preference: every folder row in this Library is a link, 9.1's
            roles table makes them one, and a shelf row that navigated on
            click without being one would be the only row here a middle click
            could not open in a tab. **Where no shelf row backs the label
            there is nothing to link to**, so the name stays plain text and
            the row reads exactly as it did: an account labelled before 7.16
            existed loses nothing.
            */
            aria-label={`Show the folders on ${group.label}`}
            className="flex h-full shrink-0 items-center rounded-md py-0 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="relative size-4 shrink-0" aria-hidden="true">
              <GroupGlyph
                shelf={group.shelf}
                className="absolute inset-0 !size-4 opacity-90 transition-opacity group-hover/folder-group:opacity-0 group-focus-within/folder-group:opacity-0"
              />
              <ChevronDown
                className={`absolute inset-0 !size-4 text-[var(--color-graphite-500)] opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${open ? '' : '-rotate-90'}`}
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
          From the contract, like every other object's menu, since S17b
          (DES-201). This used to be two hand-written items, Rename group and
          Delete group, and the audit's object-menu row names the gap: "the
          group menu lacks History, Copy link, Duplicate, Save as workflow".
          Those are not four features, they are four acts a shelf has and this
          surface was not offering, which is exactly the shape S17a built
          `lib/object-acts.ts` to end.

          **A group with no shelf row keeps the two items it had**, supplied
          as the same two acts rather than as a second menu: rename and delete
          are what a bare label can do, and the contract's own safety property,
          an act with no handler not drawing, is what expresses that. So the
          menu narrows for a label and widens for a shelf without either being
          a special case.

          Opacity and never a collapsed box, the rule `folder-row.tsx`
          records: a control with an empty bounding box is not visible to
          anything that addresses it by role and name.
          */}
          <ObjectMenu
            kind="shelf"
            name={group.label}
            width="w-44"
            handlers={{
              open: shelfPath === null ? undefined : () => { navigate(shelfPath) },
              rename: () => { groups.onRenameGroup(group.label) },
              'copy-link':
                shelfPath === null
                  ? undefined
                  : () => {
                      void navigator.clipboard?.writeText(
                        new URL(shelfPath, globalThis.location.origin).toString(),
                      )
                    },
              delete: () => { groups.onDeleteGroup(group.label) },
            }}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mr-1 size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] group-hover/folder-group:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
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
                    proposal:
                      state.isActive && inner.overKey !== null
                        ? inner.overKey === DIRECTORY
                          ? 'Out of group'
                          : `Into ${labelOfKey(inner.overKey)}`
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
    </section>
  )
}

/**
 * The Library's one ordered column, and DES-171's three gestures on it.
 *
 * "The directory is one list, not two. Groups and loose folders share a
 * column, so a person moving things in that column is arranging one sequence.
 * A model that kept them apart would have to refuse the obvious drag, a loose
 * folder above a group, for a reason that exists only in the code."
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
 * **The hold hands its pair to the panel that already existed**, with both
 * ticked (DES-154, DES-171): everything about making a group, the name, the
 * validation, adding a third folder before committing, stays one surface
 * reached through a second door. A group carried onto another proposes
 * nothing, because Dana nests one level and the honest answer to that drag is
 * that the group moves past.
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
  /** The viewer's shelves (7.16), which since S17b are what a group is. */
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
         it (DES-171's first deliberate limit). */
      if (entry === undefined || entry.kind === 'group') return null
      const container = zones.containerAt(point, null)
      return container === null || container === DIRECTORY ? null : container
    },
    onDropAt: (from, point) => {
      const entry = entries[from]
      if (entry === undefined || entry.kind === 'group') return false
      const container = zones.containerAt(point, null)
      if (container === null || container === DIRECTORY) return false
      const label = labelOfKey(container)
      /* Two writes, and they are two different records: the membership is the
         server's, through 7.4's my-membership, and the sequence is this
         viewer's arrangement of a column. Without the second the folder would
         keep the rank it had as a loose row and the group it joined would
         take that rank, so one gesture would move two things. */
      groups.onMoveToGroup(entry.folder, label)
      commit(moveFolderTo(entries, entry.folder.id, label))
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
          const proposal = !state.isActive
            ? null
            : outer.overKey !== null
              ? `Into ${labelOfKey(outer.overKey)}`
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
  return (
    <SidebarHeader className="p-2 pb-1">
      <div className="flex min-h-[var(--shell-sidebar-item-height)] items-center group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-1">
        <Link
          to={paths.desk}
          className="flex min-w-0 items-center gap-3 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          {/* Drawn rather than fetched at S21 (ledger L-141, AC-265), and the
              same call `app-sidebar.tsx:157` makes in the prototype. This is
              the one of the five a person sees all day, and it plays on the
              hover of the link it sits in rather than of itself, which is why
              the wordmark beside it triggers the same sweep. */}
          <DanaMark className="size-7 group-data-[collapsible=icon]:size-6" />
          <span className="truncate text-base font-semibold text-[var(--color-graphite-900)] group-data-[collapsible=icon]:hidden">
            Dana
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-1 group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:flex-col">
          <Tooltip>
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
                />
              }
            >
              <Search className="!size-4" strokeWidth={1.75} aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent side="right">Search · Ctrl K or /</TooltipContent>
          </Tooltip>
          {/* 9.12's bell, beside Search: awareness is global chrome, and the
              header is where Dana keeps its one other everywhere-control
              (DES-226). */}
          <NotificationsBell />
          <SidebarTrigger className="size-[var(--shell-sidebar-item-height)] shrink-0 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-1 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] [&_svg]:!size-4" />
        </div>
      </div>
    </SidebarHeader>
  )
}

/**
 * 9.1's footer control: the avatar menu, ("Account": Settings, Help, Sign out).
 *
 * Named "Account" by 9.1's names table, which took this control at the P8R
 * mid-package change control on 2026-08-13 and gave its reason: what the
 * control opens is the viewer's account, there is exactly one of it, and a
 * name carrying the display name would be the one string in that table a test
 * cannot know before it reads the fixture. The person's name is still
 * rendered inside the control and still read by anyone looking at it; what
 * changed is what the control answers to.
 *
 * **Help arrived at S16 and is the third item that section has always named.**
 * The menu shipped with two, and the sheet behind the third existed in the
 * prototype and in no package's row, so nobody built it. It goes between the
 * two rather than under them, because 9.1 spells the contents as a sequence
 * and because what the menu holds is the things that are about the
 * application rather than about your work; Sign out is the door, and a door
 * belongs last.
 */
function AccountMenu({
  displayName,
  onOpenSettings,
  onOpenHelp,
  onSignOut,
}: {
  readonly displayName: string | null
  readonly onOpenSettings: () => void
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
              className="size-7 group-data-[collapsible=icon]:size-5"
            />
            <span className="min-w-0 truncate text-[13px] font-semibold group-data-[collapsible=icon]:hidden">
              {displayName ?? ''}
            </span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="right" align="end" className="w-44">
        {/* A menu item that navigates rather than an anchor: 9.1 puts
            Settings in this menu and also in the list above it, and two
            links to one path inside one landmark is two controls answering
            to one name. */}
        <DropdownMenuItem
          className="min-h-[var(--control-height)] text-sm"
          onClick={onOpenSettings}
        >
          <SettingsGlyph className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
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
  activeFolderId,
  currentPath,
  currentSearch,
  savedViews,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onSidebarWidthReset,
  onOpenSearch,
  onOpenSettings,
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
   * empties on a failed read strands a person wherever they are standing,
   * which is AC-095's third case generalised to the pin list.
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
   * length: `sidebar_order` is an array of uuids and a group is a label with
   * no id, and a column whose groups are drawn as blocks is held whole by the
   * folder sequence alone. Empty until somebody has dragged something, which
   * is DES-171's own rule and what keeps AC-155 reading the alphabet.
   */
  readonly sidebarOrder: readonly string[]
  readonly onSidebarOrderChange: (ids: readonly string[]) => void
  /** 9.1's four folder-group operations, held by the shell that mounts them. */
  readonly groups: FolderGroupActions
  readonly displayName: string | null
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
  readonly onOpenSettings: () => void
  readonly onNewFolder: () => void
  /** 9.1's second act of making, which 7.16's POST /shelves is behind. */
  readonly onNewShelf: () => void
  /** 9.1's third: a workflow file, handed to 7.16's import as parsed text. */
  readonly onImportWorkflow: (file: File) => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  const [foldersOpen, setFoldersOpen] = useState(true)
  const { setOpen: setHelpOpen, sheet: helpSheet } = useHelpSheet()
  /* The file input the Import button presses, hidden because a bare file
     control cannot be given the row's shape and a button that opens one can. */
  const workflowInput = useRef<HTMLInputElement>(null)
  const inbox = inboxOf(folders ?? [])
  const visiblePages = pinnedNavPages(pinnedViews)
  const pinnedSaved = savedViews.filter((view) => view.pinned)

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
      rather than a preference. That transition animates the very property
      both of 9.1's view preferences set: a drag on the resize handle lags
      the pointer by a fifth of a second, and the rail arrives at its width
      long after the click that asked for it. AC-182 reads the width
      immediately after each, and what it would otherwise read is a frame of
      an animation rather than the preference. His prototype inherits the
      same lag, so nothing about his design is being overridden here; what is
      lost is the slide, which is flagged for the visual review of section 13
      item 33.
      */
      className="h-full shrink-0 border-r border-sidebar-border bg-sidebar transition-none"
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
              9.1's page block ends with "any unpinned view the pin list of
              9.7 has pinned ... and the viewer's saved views", so a pinned
              saved view is an entry here like any other. It is last because
              the six native pages are a fixed order this section states and a
              person's own views are not in it.

              **Where a saved view leads is this package's ruling, and it is
              recorded because 9.1's routes table has no row for one.** A
              saved view is a name over a filter on a place-page (DES-153), so
              it opens that page carrying its own definition: `?view=<id>`,
              which `usePlace` reads and seeds the page's filter from. The
              alternative, a path of its own, would have made a view a
              seventeenth kind of surface rather than the page it is a view
              of, and would have needed a route for something the table
              deliberately leaves out.
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

        <Collapsible open={foldersOpen} onOpenChange={setFoldersOpen}>
          <SidebarGroup className="py-0">
            {/* The heading is hidden in the rail and the rows below it are
                not, which is 9.1's "changes nothing about what the sidebar
                holds" applied to the half of the list a person can reach. */}
            {/*
            The Library block of 9.1, and it is a heading wrapping the
            control rather than a control alone. That section's regions
            paragraph asks for both: "a named region plus a control
            carrying that name, whose expanded state is what open and
            collapsed mean". A bare button satisfies the control half and
            leaves the block unnamed in the document outline, which is
            what AC-214 reads when it asks for the heading.

            The heading is hidden in the rail and the rows below it are
            not, which is 9.1's "changes nothing about what the sidebar
            holds" applied to the half of the list a person can reach.
            */}
            <h2 className="group/folder-directory flex h-8 items-center px-1 group-data-[collapsible=icon]:hidden">
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
            <CollapsibleContent>
              {/* Inbox above the column and never in it: 9.1 pins it first,
                  above the label groups and never inside one, so it is the
                  one folder row no arrangement can move. Its row carries no
                  group action for the same reason, which `SidebarFolderRow`
                  has enforced since R10. */}
              <SidebarGroupContent>
                <SidebarMenu>
                  {inbox === null ? null : (
                    <SidebarFolderRow
                      folder={inbox}
                      activeId={activeFolderId}
                      groups={groupActions}
                    />
                  )}
                </SidebarMenu>
              </SidebarGroupContent>

              <LibraryColumn
                folders={folders ?? []}
                shelves={shelves ?? NO_SHELVES}
                order={sidebarOrder}
                onOrderChange={onSidebarOrderChange}
                activeId={activeFolderId}
                groups={groupActions}
              />
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter className="gap-0 py-2">
        <SidebarMenu className="mb-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              data-sidebar-tier="action"
              tooltip="New folder"
              className="h-[var(--shell-sidebar-item-height)] justify-center gap-2 rounded-lg border border-transparent bg-[var(--color-graphite-100)] px-3 text-[13px] font-semibold text-[var(--color-graphite-600)] shadow-none hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-600)]"
              onClick={onNewFolder}
            >
              <FolderPlus className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">New folder</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/*
        The row of three (DES-209, DES-216), which arrived at S17b with the
        surfaces that make it. The sentence this replaces said so in the
        future tense: "the other two acts that row owes, New shelf and
        Import, arrive with the surfaces they make."

        9.1: "then a row of three placed by role: New shelf, Import (a
        workflow file), and Trash, the first two acts of making and the third
        a destination." **Trash keeps the place the older footer already gave
        it and gains the two neighbours it was waiting for**, so nothing about
        the reading that put it here has changed: it is a destination, and it
        ends the row because it is the only one of the three that is somewhere
        you go rather than something you do. It is still a link where the
        other two are buttons, which is that distinction made in the markup
        rather than only in a comment.

        **Whose label survives narrowing is arithmetic and not rank**
        (DES-216, and Imran on 2026-08-24: "New shelf is not fully visible,
        the remaining two should be shortened"). The three words need more
        room than the default row has, and "New shelf" is the label that was
        clipping and the one that reads worst clipped, so it keeps its word at
        every width and the other two go to their glyphs until the row
        genuinely fits all three. A container query asks the row how much room
        it has, so the answer follows the drag rather than a breakpoint
        somebody guessed.

        **Each carries an `aria-label` as well as its text**, which is not
        belt and braces: with the label hidden the button would have no
        accessible name at all, and 9.1's addressing sentence makes every
        control it names reachable by role and name in every state. The
        tooltip says more than the name for the same reason it does in the
        prototype, and 9.1's "all three named by tooltip in every state" is
        satisfied by the name being inside it.
        */}
        <SidebarMenu className="@container mb-1 flex-row gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:gap-0.5">
          {/* Content-sized rather than equal thirds: equal shares gave "New
              shelf" the same room as "Trash" and clipped it while its
              neighbours sat in slack (Imran, 2026-08-24). */}
          <SidebarMenuItem className="min-w-0 flex-auto">
            <SidebarMenuButton
              data-sidebar-tier="action"
              aria-label="New shelf"
              tooltip="New shelf, a group of folders"
              className={ROW_OF_THREE_CLASS}
              onClick={onNewShelf}
            >
              <Folders className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden">New shelf</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="min-w-0 flex-auto">
            <SidebarMenuButton
              data-sidebar-tier="action"
              aria-label="Import"
              tooltip="Import a workflow"
              className={ROW_OF_THREE_CLASS}
              onClick={() => {
                workflowInput.current?.click()
              }}
            >
              <Workflow className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden @max-[262px]:hidden">
                Import
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="min-w-0 flex-auto">
            <SidebarMenuButton
              data-sidebar-tier="action"
              aria-label="Trash"
              tooltip="Trash, deleted items, kept 30 days"
              isActive={currentPath === paths.trash}
              className={ROW_OF_THREE_CLASS}
              render={<Link to={paths.trash} />}
            >
              <Trash2 className="!size-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden @max-[262px]:hidden">
                Trash
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {/*
        The workflow file itself (7.16's POST /workflows/import), read in the
        browser and handed over as parsed structure.

        The import is client-side only as far as reading the bytes goes: 10.3
        caps a workflow file's contents and the server is what enforces every
        one of those caps, so what this does is hand the endpoint a document
        and let it refuse. A file that is not JSON at all is refused here,
        because sending a parse failure to the server as a 400 would tell the
        person less than the sentence the page can write itself.
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
          {/* 9.1: "then People and Settings as links", after the row of
              three and before the avatar menu. */}
          <NavigationRow
            name="People"
            to={paths.people}
            icon={UsersRound}
            active={currentPath === paths.people}
          />
          <NavigationRow
            name="Settings"
            to={paths.settings}
            icon={SettingsGlyph}
            active={currentPath === paths.settings}
          />
        </SidebarMenu>
        <SidebarMenu className="mt-2">
          <SidebarMenuItem>
            <AccountMenu
              displayName={displayName}
              onOpenSettings={onOpenSettings}
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

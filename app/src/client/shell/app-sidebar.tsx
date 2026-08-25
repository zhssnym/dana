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
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
/* The icon module of DES-125, since S8: one file owns the family and
   nothing imports `lucide-react` directly. */
import type { LucideIcon } from '../lib/icons.js'
import {
  Ban,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  ChevronDown,
  FolderPlus,
  Folders,
  LampDesk,
  Layers3,
  LogOut,
  MoreHorizontal,
  Pencil,
  Search,
  Settings as SettingsGlyph,
  Star,
  SunMedium,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from '../lib/icons.js'

import { FolderRow } from '../components/folder-row.js'
import {
  Avatar,
  AvatarFallback,
} from '../components/ui/avatar.js'
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
import { folderRowDisplay, initialsOf } from '../parts/presenters.js'
import { paths, pinnedNavPages } from '../routes.js'
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

/**
 * 9.1's names table, for the two controls this file names rather than a
 * component below it. Both are fixed strings; see the header.
 */
const SEARCH = 'Search'
const ACCOUNT = 'Account'

/**
 * The glyph beside each entry, which is the designer's and belongs to no
 * numbered section. Keyed by path rather than by name so that a rename in
 * 9.1's page set is one edit in `routes.ts` and not two.
 */
const pageIcons: Record<string, LucideIcon> = {
  /* Desk wears a desk lamp (DES-181), resolved here beside its siblings
     rather than inside a folder resolver, because in this list it is a page
     entry like the eight below it. */
  [paths.desk]: LampDesk,
  [paths.today]: SunMedium,
  [paths.scheduled]: CalendarDays,
  [paths.assignments]: UserRoundCheck,
  [paths.important]: Star,
  [paths.all]: Layers3,
  [paths.done]: CheckCircle2,
  [paths.abandoned]: Ban,
  /* A calendar with an X: the filter's own "No due date", and the other
     value of the axis Scheduled's calendar carries. It wore All's glyph for
     one revision and read as a repeated row (DES-152's own note). */
  [paths.anytime]: CalendarX,
}

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

/**
 * A folder row on our data.
 *
 * `folderRowDisplay` is R4's mapping and the only thing that knows how a 7.4
 * Folder becomes his four display props; the route and the active mark are
 * this file's, being the router's.
 *
 * **Two of the five entries his row menu carries are wired here and three are
 * not**, added at P8R session R10. 9.1 gives this menu the move ("a folder is
 * moved between groups from its own menu") and the P8R change control gave it
 * "New folder group", creating a group being naming it on a folder. Rename,
 * "Label and color" and delete belong to 9.6's folder header, which builds
 * them, and offering a second route to the same three writes from here would
 * be markup no section asks for. `folder-row.tsx` renders only the entries
 * whose callback it is given, so this is a prop that is absent rather than a
 * control that was removed.
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
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      rowProps={drag?.rowProps}
      dragState={drag?.state}
      proposal={drag?.proposal ?? null}
      name={display.name}
      color={display.color}
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
      // Inbox carries neither, so it carries no menu. 9.1 pins it first and
      // gives it a clause of its own, above the label groups and never inside
      // one, so a group action on this row would write a label the sidebar
      // then cannot render. The three entries 9.6 owns are absent here for
      // every row alike; see this function's header.
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
            className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md py-0 pr-1 pl-3 text-left text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <span className="relative size-4 shrink-0" aria-hidden="true">
              <Folders
                className="absolute inset-0 !size-4 text-[var(--color-graphite-500)] opacity-90 transition-opacity group-hover/folder-group:opacity-0 group-focus-within/folder-group:opacity-0"
                strokeWidth={1.75}
              />
              <ChevronDown
                className={`absolute inset-0 !size-4 text-[var(--color-graphite-500)] opacity-0 transition-opacity group-hover/folder-group:opacity-100 group-focus-within/folder-group:opacity-100 ${open ? '' : '-rotate-90'}`}
                strokeWidth={1.75}
              />
            </span>
            <span className="truncate">{group.label}</span>
          </CollapsibleTrigger>
          {/* Opacity and never a collapsed box, the rule `folder-row.tsx`
              records: a control with an empty bounding box is not visible to
              anything that addresses it by role and name. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
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
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  groups.onRenameGroup(group.label)
                }}
              >
                <Pencil className="size-4" aria-hidden="true" />Rename group
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  groups.onDeleteGroup(group.label)
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />Delete group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
  order,
  onOrderChange,
  activeId,
  groups,
}: {
  readonly folders: readonly Folder[]
  readonly order: readonly string[]
  readonly onOrderChange: (ids: readonly string[]) => void
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element {
  const zones = useLibraryZones()
  const entries = useMemo(() => arrangeColumn(folders, order), [folders, order])

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
          <img
            src="/dana-mark.svg"
            alt=""
            className="size-7 shrink-0 group-data-[collapsible=icon]:size-6"
          />
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
          <SidebarTrigger className="size-[var(--shell-sidebar-item-height)] shrink-0 rounded-md text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-900)] group-data-[collapsible=icon]:order-1 group-data-[collapsible=icon]:size-[var(--shell-sidebar-row-height)] [&_svg]:!size-4" />
        </div>
      </div>
    </SidebarHeader>
  )
}

/**
 * 9.1's footer control: the avatar menu, carrying Settings and Sign out.
 *
 * Named "Account" by 9.1's names table, which took this control at the P8R
 * mid-package change control on 2026-08-13 and gave its reason: what the
 * control opens is the viewer's account, there is exactly one of it, and a
 * name carrying the display name would be the one string in that table a test
 * cannot know before it reads the fixture. The person's name is still
 * rendered inside the control and still read by anyone looking at it; what
 * changed is what the control answers to.
 */
function AccountMenu({
  displayName,
  onOpenSettings,
  onSignOut,
}: {
  readonly displayName: string | null
  readonly onOpenSettings: () => void
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
            <Avatar className="size-7 group-data-[collapsible=icon]:size-5">
              <AvatarFallback className="bg-[var(--color-graphite-200)] text-xs font-medium text-[var(--color-graphite-700)]">
                {initialsOf(displayName ?? '')}
              </AvatarFallback>
            </Avatar>
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
  sidebarOrder,
  onSidebarOrderChange,
  groups: groupActions,
  displayName,
  activeFolderId,
  currentPath,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onSidebarWidthReset,
  onOpenSearch,
  onOpenSettings,
  onNewFolder,
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
  /** The width this viewer chose, or null while the design's is in force. */
  readonly sidebarWidth: number | null
  readonly onSidebarWidthChange: (width: number) => void
  readonly onSidebarWidthCommit: (width: number) => void
  readonly onSidebarWidthReset: () => void
  readonly onOpenSearch: () => void
  readonly onOpenSettings: () => void
  readonly onNewFolder: () => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  const [foldersOpen, setFoldersOpen] = useState(true)
  const inbox = inboxOf(folders ?? [])
  const visiblePages = pinnedNavPages(pinnedViews)

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
                  icon={pageIcons[page.path] ?? Layers3}
                  active={currentPath === page.path}
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
        <SidebarMenu>
          {/*
          Trash is a destination and not an action (9.1), which is why it
          sits here beside People and Settings rather than in the row
          above them where New folder lives: a destination is somewhere
          you go, look around, and come back from. The other two acts
          that row owes, "New shelf" and "Import", arrive with the
          surfaces they make.
          */}
          <NavigationRow
            name="Trash"
            to={paths.trash}
            icon={Trash2}
            active={currentPath === paths.trash}
          />
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
              onSignOut={onSignOut}
            />
          </SidebarMenuItem>
        </SidebarMenu>
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

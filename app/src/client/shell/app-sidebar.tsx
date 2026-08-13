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
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FolderPlus,
  Folders,
  Layers3,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Pencil,
  Search,
  Settings2,
  Star,
  SunMedium,
  Trash2,
  UsersRound,
} from 'lucide-react'

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
import { paths, sidebarPages } from '../routes.js'
import { SidebarResizeHandle } from './SidebarResizeHandle.js'
import type { FolderGroupActions } from './folder-groups.js'
import type { Folder } from '../../shared/folders.js'
import type { Settings } from '../../shared/me.js'

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
  [paths.myDay]: SunMedium,
  [paths.tasks]: ListTodo,
  [paths.planned]: CalendarDays,
  [paths.important]: Star,
  [paths.all]: Layers3,
  [paths.done]: CheckCircle2,
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

interface LabelGroup {
  readonly label: string
  readonly folders: readonly Folder[]
}

/** Case-insensitive, so "aardvark" and "Aardvark" order together. */
function byName(a: Folder, b: Folder): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
}

/**
 * 9.1's folder list order, which is deliberately not frozen 7.4's.
 *
 * That endpoint sorts is_default first then lower(name); this section pins
 * Inbox, then groups by the viewer's own label with labels ascending, then
 * lists the unlabeled by name. A sidebar rendering the response in the order
 * it arrived is wrong in a way that looks right until two folders disagree
 * about it, which is what AC-155's first case creates on purpose.
 */
export function groupFolders(folders: readonly Folder[]): {
  readonly inbox: Folder | null
  readonly groups: readonly LabelGroup[]
  readonly unlabeled: readonly Folder[]
} {
  const inbox = folders.find((folder) => folder.is_default) ?? null
  const rest = folders.filter((folder) => !folder.is_default)
  const byLabel = new Map<string, Folder[]>()
  const unlabeled: Folder[] = []
  for (const folder of rest) {
    const label = folder.my_label
    if (label === null || label === '') {
      unlabeled.push(folder)
      continue
    }
    const bucket = byLabel.get(label)
    if (bucket === undefined) byLabel.set(label, [folder])
    else bucket.push(folder)
  }
  const groups = [...byLabel.entries()]
    .map(([label, members]) => ({ label, folders: [...members].sort(byName) }))
    .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))
  return { inbox, groups, unlabeled: [...unlabeled].sort(byName) }
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
}: {
  readonly folder: Folder
  readonly activeId: string | null
  readonly groups: FolderGroupActions
  readonly nested?: boolean
  readonly tree?: boolean
  readonly treeLast?: boolean
}): React.JSX.Element {
  const display = folderRowDisplay(folder)
  return (
    <FolderRow
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
}: {
  readonly group: LabelGroup
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <section aria-label={group.label}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group/folder-group relative flex h-[var(--shell-sidebar-row-height)] items-center rounded-md bg-transparent text-[var(--color-graphite-600)] before:pointer-events-none before:absolute before:inset-x-1 before:inset-y-px before:rounded-md before:content-[''] hover:before:bg-[var(--color-graphite-100)] focus-within:before:bg-[var(--color-graphite-100)] group-data-[collapsible=icon]:hidden [&>*]:relative [&>*]:z-10">
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
                  className="pointer-events-none mr-1 size-6 shrink-0 rounded-md text-[var(--color-graphite-600)] opacity-0 group-hover/folder-group:pointer-events-auto group-hover/folder-group:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-900)] focus-visible:pointer-events-auto focus-visible:opacity-100 data-popup-open:pointer-events-auto data-popup-open:opacity-100"
                  aria-label={MORE_ACTIONS}
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
            {group.folders.map((folder, index) => (
              <SidebarFolderRow
                key={folder.id}
                folder={folder}
                activeId={activeId}
                groups={groups}
                nested
                tree
                treeLast={index === group.folders.length - 1}
              />
            ))}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
    </section>
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
          to={paths.myDay}
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
          <Settings2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
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
  settings,
  folders,
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
  /** Absent while the read is in flight or has failed. */
  readonly settings: Settings | undefined
  readonly folders: readonly Folder[] | undefined
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
  const { inbox, groups, unlabeled } = groupFolders(folders ?? [])
  const visiblePages = sidebarPages.filter(
    (page) => page.setting === null || settings?.[page.setting] === true,
  )

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
                  icon={pageIcons[page.path] ?? ListTodo}
                  active={
                    page.path === paths.myDay
                      ? currentPath === paths.myDay
                      : currentPath === page.path
                  }
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
            <div className="group/folder-directory flex h-8 items-center px-1 group-data-[collapsible=icon]:hidden">
              <CollapsibleTrigger
                data-sidebar-tier="section"
                className="group/folder-directory-trigger flex h-6 min-w-0 flex-1 items-center rounded-md px-2 text-left text-[11px] font-semibold text-[var(--color-graphite-600)] outline-none hover:bg-[var(--color-graphite-100)] focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="truncate">Folders</span>
                <ChevronDown
                  className={`ml-1 size-3.5 shrink-0 text-[var(--color-graphite-500)] opacity-0 transition-[opacity,transform] group-hover/folder-directory-trigger:opacity-100 group-focus-visible/folder-directory-trigger:opacity-100 ${foldersOpen ? '' : '-rotate-90'}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
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

                {groups.map((group) => (
                  <FolderGroupBlock
                    key={group.label}
                    group={group}
                    activeId={activeFolderId}
                    groups={groupActions}
                  />
                ))}

                <SidebarMenu className="mt-1">
                  {unlabeled.map((folder) => (
                    <SidebarFolderRow
                      key={folder.id}
                      folder={folder}
                      activeId={activeFolderId}
                      groups={groupActions}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
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
          <NavigationRow
            name="People"
            to={paths.people}
            icon={UsersRound}
            active={currentPath === paths.people}
          />
          <NavigationRow
            name="Settings"
            to={paths.settings}
            icon={Settings2}
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

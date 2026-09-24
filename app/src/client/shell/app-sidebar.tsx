/*
The sidebar: the application's only chrome, and a navigation landmark.

Top to bottom, and nothing else (redesign "Quiet", Navigation):

  Search · Notifications · Today · Upcoming · Assigned · Library · account

- **Search** is a row with its word, and Ctrl/Cmd-K opens the same overlay
  (`overlays.ts`). On a phone the phone bar holds the one search entry, so the
  drawer leaves it out.
- **Notifications** is one row with its unread count.
- **Today, Upcoming, Assigned** are the only cross-project lists. Upcoming and
  Assigned are the Scheduled and Assignments pages under their sidebar names.
- **Library**: the Desk folder first, then the viewer's shelves and folders as
  one ordered column (`library-order.ts`). A row is its icon and its name; its
  "…" appears on hover in space the row already reserves, and a right-click
  opens that same menu. The Library's one "+" makes a folder, a shelf, or
  imports a workflow.
- **Account** at the foot: Settings, People, Trash, Sign out.

Collapsing hides the sidebar entirely (`collapsible="offcanvas"`); the shell
draws the one small control that brings it back.
*/
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import type { LucideIcon } from '../lib/icons.js'
import {
  CalendarDays,
  ChevronRight,
  FolderPlus,
  Folders,
  LogOut,
  Plus,
  Search,
  Settings,
  SunMedium,
  Trash2,
  UserRoundCheck,
  UsersRound,
  Workflow,
} from '../lib/icons.js'

import { useSidebar } from '../components/ui/sidebar.js'
import { showToast } from '../state/toasts.js'
import { FolderRow } from '../components/folder-row.js'
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
import { MORE_ACTIONS } from '../components/ui/copy.js'
import { ObjectMenu } from '../components/object-menu.js'
import { cn } from '../components/ui/utils.js'
import { useDuplicateFolder } from '../api/mutations.js'
import { folderGates } from '../lib/folder-authority.js'
import { folderRowDisplay, initialsOf, shelfMark } from '../parts/presenters.js'
import { folderLink, shelfLink } from '../lib/nav-links.js'
import { paths } from '../routes.js'
import { NotificationsBell } from '../components/notifications-bell.js'
import { PersonFace } from '../components/person-face.js'
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

/** The one row treatment every sidebar entry shares. */
export const SIDEBAR_ROW =
  'h-8 gap-2 rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-foreground [&_svg]:!size-4 [&_svg]:shrink-0'

/** The three cross-project lists, under the names the sidebar gives them. */
const LISTS: readonly { name: string; path: string; icon: LucideIcon }[] = [
  { name: 'Today', path: paths.today, icon: SunMedium },
  { name: 'Upcoming', path: paths.scheduled, icon: CalendarDays },
  { name: 'Assigned', path: paths.assignments, icon: UserRoundCheck },
]

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/*
Where a folder arriving from another list would land, drawn as a line.
Absolutely positioned, so nothing moves while it is shown.
*/
function InsertLine({ top }: { readonly top: number }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2 left-2 z-20 h-0.5 rounded-full bg-primary"
      style={{ top }}
    />
  )
}

/**
 * Which slot in a container the pointer is proposing, and where the line goes.
 * Measured live, because the rows have been moving.
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

const NO_SHELVES: readonly Shelf[] = []

/**
 * React Router's `Link` as base-ui's `render` prop takes it. `render` clones it
 * with the primitive's props merged in.
 */
function routerLink(to: string): ReactElement<Record<string, unknown>> {
  return (<Link to={to} />) as unknown as ReactElement<Record<string, unknown>>
}

/* Each shelf's fold, remembered per browser. The key is never renamed. */
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
    /* A browser that keeps nothing still folds for this session. */
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
        isActive={active}
        aria-current={active ? 'page' : undefined}
        className={SIDEBAR_ROW}
      >
        <Icon strokeWidth={1.75} aria-hidden="true" />
        <span>{name}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function inboxOf(folders: readonly Folder[]): Folder | null {
  return folders.find((folder) => folder.is_default) ?? null
}

/*
The acts a Library row can perform on its folder.

Rename, History, Save as workflow, Leave and Delete each need a surface the
folder page already has, so the row opens the folder and asks its page to run
the act (`?folder-action=…`), one implementation of each. Copy link and
Duplicate need no surface and run here. `folderGates` decides which a viewer
gets, the same call the folder page makes.
*/
export type FolderAction = 'rename' | 'history' | 'workflow' | 'leave' | 'delete'

/** The query the folder page reads to run an act the Library asked for. */
export const FOLDER_ACTION_PARAM = 'folder-action'

function folderActionPath(id: string, action: FolderAction): string {
  return `${paths.folder(id)}?${FOLDER_ACTION_PARAM}=${action}`
}

function SidebarFolderRow({
  folder,
  activeId,
  groups,
  nested = false,
  drag,
}: {
  readonly folder: Folder
  readonly activeId: string | null
  readonly groups: FolderGroupActions
  readonly nested?: boolean
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
  const gates = folderGates({
    access: folder.my_access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
  })
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      rowProps={
        { ...drag?.rowProps, 'data-drop-row': '' } as React.ComponentProps<'li'>
      }
      dragState={drag?.state}
      proposal={drag?.proposal ?? null}
      name={display.name}
      color={display.color}
      icon={display.icon}
      href={display.href}
      render={routerLink(display.href)}
      active={activeId === folder.id}
      nested={nested}
      groupLabels={groups.labels}
      currentLabel={folder.my_shelf}
      /* The Desk folder is pinned first and never on a shelf. */
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
      onHistory={() => {
        void navigate(folderActionPath(folder.id, 'history'))
      }}
      onRename={
        gates.identity
          ? () => {
              void navigate(folderActionPath(folder.id, 'rename'))
            }
          : undefined
      }
      onCopyLink={() => {
        void navigator.clipboard.writeText(folderLink(folder.id))
        showToast('Link copied')
      }}
      onDuplicate={() => {
        duplicate.mutate(folder.id, {
          onSuccess: (made) => {
            void navigate(paths.folder(made.id))
          },
        })
      }}
      onSaveAsWorkflow={() => {
        void navigate(folderActionPath(folder.id, 'workflow'))
      }}
      onLeave={
        gates.leave
          ? () => {
              void navigate(folderActionPath(folder.id, 'leave'))
            }
          : undefined
      }
      onDelete={
        gates.trash
          ? () => {
              void navigate(folderActionPath(folder.id, 'delete'))
            }
          : undefined
      }
    />
  )
}

/**
 * A shelf: a collapsible group of folder rows headed by its name.
 *
 * The heading is the shelf's icon and name. The icon is the fold (it turns
 * into a chevron under the pointer, in the same box, so nothing shifts); the
 * name opens the shelf's page. Its "…" is the same menu a right-click opens.
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
  readonly drag: {
    readonly itemRef: (element: HTMLElement | null) => void
    readonly handleProps: { onPointerDown: (event: React.PointerEvent) => void }
    readonly state: SortableItemState
    readonly proposal: string | null
    readonly isDropTarget: boolean
    readonly dropTop: number | null
  }
  readonly onMoveOut: (folder: Folder, label: string | null) => void
  readonly onReorderWithin: (label: string, from: number, to: number) => void
}): React.JSX.Element {
  const [open, setOpenState] = useState(() => readShelfOpen(group.label))
  const setOpen = (next: boolean): void => {
    setOpenState(next)
    writeShelfOpen(group.label, next)
  }
  const self = groupKey(group.label)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const shelfId = group.shelf?.id ?? null
  const mark = group.shelf === null ? null : shelfMark(group.shelf)
  const Glyph = mark?.icon ?? Folders

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

  const sectionRef = (element: HTMLElement | null): void => {
    drag.itemRef(element)
    zones.registerZone(self)(element)
  }

  const offset = drag.state.offset
  return (
    <section
      aria-label={group.label}
      ref={sectionRef}
      className={cn(
        'relative rounded-md',
        drag.state.isActive && 'cursor-grabbing bg-popover shadow-md ring-1 ring-border',
        drag.isDropTarget && 'bg-sidebar-accent ring-1 ring-ring/40',
      )}
      style={
        offset === 0 && !drag.state.isActive
          ? undefined
          : {
              transform: `translateY(${String(offset)}px)`,
              transition:
                drag.state.isActive && !drag.state.isSettling
                  ? 'none'
                  : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
              position: drag.state.isActive ? 'relative' : undefined,
              zIndex: drag.state.isActive ? 30 : undefined,
              pointerEvents: drag.state.isActive ? 'none' : undefined,
            }
      }
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          {...grip(drag.handleProps)}
          onContextMenu={(event) => {
            event.preventDefault()
            menuTrigger.current?.click()
          }}
          className="group/folder-group relative flex h-8 items-center gap-1 rounded-md pr-8 pl-1 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {drag.proposal === null ? null : (
            <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
              {drag.proposal}
            </span>
          )}
          <CollapsibleTrigger
            aria-label={`Show the folders on ${group.label}`}
            data-no-drag
            className="relative flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <Glyph
              className="size-4 transition-opacity duration-150 group-hover/folder-group:opacity-0"
              style={mark === null ? undefined : { color: mark.color }}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <ChevronRight
              className={cn(
                'absolute size-4 opacity-0 transition-[opacity,transform] duration-150 group-hover/folder-group:opacity-100',
                open && 'rotate-90',
              )}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          {group.shelf === null ? (
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
          ) : (
            <Link
              to={paths.shelf(group.shelf.id)}
              data-no-drag
              className="flex h-full min-w-0 flex-1 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="truncate">{group.label}</span>
            </Link>
          )}
          <div className="absolute top-1/2 right-1 -translate-y-1/2">
            <ObjectMenu
              kind="shelf"
              name={group.label}
              width="w-44"
              handlers={{
                rename: () => {
                  groups.onRenameGroup(group.label)
                },
                'copy-link':
                  shelfId === null
                    ? undefined
                    : () => {
                        void navigator.clipboard?.writeText(shelfLink(shelfId))
                        showToast('Link copied')
                      },
                delete: () => {
                  groups.onDeleteGroup(group.label)
                },
              }}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  ref={menuTrigger}
                  className="size-6 rounded-sm text-muted-foreground opacity-0 group-hover/folder-group:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:none)]:opacity-100"
                  aria-label={MORE_ACTIONS}
                  data-no-drag
                />
              }
            />
          </div>
        </div>
        <CollapsibleContent>
          <SidebarMenu>
            {group.folders.map((folder, index) => {
              const state = inner.itemState(index)
              return (
                <SidebarFolderRow
                  key={folder.id}
                  folder={folder}
                  activeId={activeId}
                  groups={groups}
                  nested
                  drag={{
                    itemRef: inner.setItemRef(index),
                    rowProps: grip(inner.handleProps(index)),
                    state,
                    proposal:
                      state.isActive && inner.overKey === DIRECTORY
                        ? 'Out of shelf'
                        : null,
                  }}
                />
              )
            })}
          </SidebarMenu>
        </CollapsibleContent>
      </Collapsible>
      <span aria-live="polite" className="sr-only">
        {inner.announcement}
      </span>
      {drag.isDropTarget && drag.dropTop !== null && open && group.folders.length > 0 ? (
        <InsertLine top={drag.dropTop} />
      ) : null}
      {drag.isDropTarget && (!open || group.folders.length === 0) ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-4 right-3 z-20 -translate-y-1/2 text-xs text-foreground"
        >
          Into {group.label}
        </span>
      ) : null}
    </section>
  )
}

/**
 * The Library's one ordered column: shelves and loose folders in the viewer's
 * order. Dragging a row reorders it; resting inside a shelf files it there;
 * holding one folder on another proposes a new shelf of the two.
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

  function commit(next: readonly DirectoryEntry[]): void {
    onOrderChange(encodeColumn(next))
  }

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
      const at = proposalIn(zones.zoneElement(container), point.y).at
      groups.onMoveToGroup(entry.folder, label)
      commit(moveFolderTo(entries, entry.folder.id, label, at))
      return true
    },
    onReorder: (from, to) => {
      commit(moved(entries, from, to))
    },
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

  const carried = outer.activeIndex === null ? null : entries[outer.activeIndex]
  const canGroup = carried?.kind === 'folder'

  return (
    <SidebarGroupContent ref={zones.registerZone(DIRECTORY)}>
      <SidebarMenu>
        {entries.map((entry, index) => {
          const state = outer.itemState(index)
          const holding = canGroup && state.isDwelling && !state.isArmed
          const armed = canGroup && state.isArmed
          const proposal =
            !state.isActive || outer.overKey !== null
              ? null
              : armed
                ? 'Release to make a shelf'
                : holding
                  ? 'Hold to make a shelf'
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

/** The Library's one "+": the only home for making a folder, a shelf, or importing. */
function LibraryPlusMenu({
  onNewFolder,
  onNewShelf,
  onImport,
}: {
  readonly onNewFolder: () => void
  readonly onNewShelf: () => void
  readonly onImport: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-popup-open:bg-sidebar-accent data-popup-open:text-foreground"
            aria-label="New"
            title="New folder, shelf or import"
          />
        }
      >
        <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onClick={onNewFolder}>
          <FolderPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          New folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewShelf}>
          <Folders className="size-4" strokeWidth={1.75} aria-hidden="true" />
          New shelf
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImport}>
          <Workflow className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Import workflow…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The account menu: Settings, People, Trash, and Sign out. Named "Account". */
function AccountMenu({
  displayName,
  image = null,
  onNavigate,
  onSignOut,
}: {
  readonly displayName: string | null
  readonly image?: string | null
  readonly onNavigate: (path: string) => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            className={cn(SIDEBAR_ROW, 'h-9 text-foreground')}
            aria-label="Account"
          >
            <PersonFace
              name={displayName ?? ''}
              initials={initialsOf(displayName ?? '')}
              image={image}
              className="size-6"
            />
            <span className="min-w-0 truncate">{displayName ?? ''}</span>
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="top" align="start" className="w-52">
        <DropdownMenuItem onClick={() => { onNavigate(paths.settings) }}>
          <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { onNavigate(paths.people) }}>
          <UsersRound className="size-4" strokeWidth={1.75} aria-hidden="true" />
          People
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { onNavigate(paths.trash) }}>
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Trash
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({
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
  readonly folders: readonly Folder[] | undefined
  readonly shelves: readonly Shelf[] | undefined
  /** The viewer's arrangement of the Library (4.19's `sidebar_order`). */
  readonly sidebarOrder: readonly string[]
  readonly onSidebarOrderChange: (ids: readonly string[]) => void
  readonly groups: FolderGroupActions
  readonly displayName: string | null
  readonly avatarUrl?: string | null
  readonly activeFolderId: string | null
  readonly currentPath: string
  readonly currentSearch: string
  readonly sidebarWidth: number | null
  readonly onSidebarWidthChange: (width: number) => void
  readonly onSidebarWidthCommit: (width: number) => void
  readonly onSidebarWidthReset: () => void
  readonly onOpenSearch: () => void
  readonly onNewFolder: () => void
  readonly onNewShelf: () => void
  readonly onImportWorkflow: (file: File) => void
  readonly onSignOut: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  /* On a phone the sidebar is a drawer, and it closes on the navigation it was
     opened to make. */
  const { isMobile, setOpenMobile, state } = useSidebar()
  /* Hidden on a laptop means gone: out of the tab order and the tree too. */
  const hidden = !isMobile && state === 'collapsed'
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [currentPath, currentSearch, isMobile, setOpenMobile])
  /* The application's one file input, pressed by the Library's Import. */
  const workflowInput = useRef<HTMLInputElement>(null)
  const inbox = inboxOf(folders ?? [])

  return (
    <Sidebar
      collapsible="offcanvas"
      inert={hidden}
      role="navigation"
      aria-label="Pages and folders"
      /* No slide: the resize handle sets this width, and a transition would
         make the column lag the pointer. */
      className="h-full shrink-0 border-r border-border bg-sidebar transition-none"
    >
      <SidebarHeader className="gap-0 p-2 pb-0">
        <SidebarMenu>
          {/* On a phone the phone bar holds the one search entry. */}
          {isMobile ? null : (
            <SidebarMenuItem className="flex items-center gap-1">
              <SidebarMenuButton
                className={cn(SIDEBAR_ROW, 'flex-1')}
                aria-label="Search"
                onClick={onOpenSearch}
              >
                <Search strokeWidth={1.75} aria-hidden="true" />
                <span className="flex-1">Search</span>
                <kbd className="font-sans text-xs text-muted-foreground" aria-hidden="true">
                  {IS_MAC ? '⌘K' : 'Ctrl K'}
                </kbd>
              </SidebarMenuButton>
              <SidebarTrigger className="size-8 shrink-0 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [&_svg]:!size-4" />
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <NotificationsBell side={isMobile ? 'bottom' : 'right'} className={SIDEBAR_ROW} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarGroup className="px-2 py-0">
          <SidebarGroupContent>
            <SidebarMenu>
              {LISTS.map((page) => (
                <NavigationRow
                  key={page.path}
                  name={page.name}
                  to={page.path}
                  icon={page.icon}
                  active={currentPath === page.path}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-2 pt-4 pb-0">
          <div className="flex h-7 items-center pr-1 pl-2">
            <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              Library
            </h2>
            <LibraryPlusMenu
              onNewFolder={onNewFolder}
              onNewShelf={onNewShelf}
              onImport={() => {
                workflowInput.current?.click()
              }}
            />
          </div>
          {inbox === null ? null : (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarFolderRow
                  folder={inbox}
                  activeId={activeFolderId}
                  groups={groupActions}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          )}
          <LibraryColumn
            folders={folders ?? []}
            shelves={shelves ?? NO_SHELVES}
            order={sidebarOrder}
            onOrderChange={onSidebarOrderChange}
            activeId={activeFolderId}
            groups={groupActions}
          />
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
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
            onImportWorkflow(file)
          }}
        />
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu
              displayName={displayName}
              image={avatarUrl}
              onNavigate={(path) => {
                void navigate(path)
              }}
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

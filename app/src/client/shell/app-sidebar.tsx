/*
The sidebar: the application's only chrome, and a navigation landmark.

Top to bottom, and nothing else (round 2, Sidebar):

  head row · Search · Today · Upcoming · Assigned · Library · Settings, Trash

- **The head row** is one line: Search, the bell (a small square button with
  an unread dot) and the collapse button. A divider sets it apart. There is no account button: Sign out is
  in Settings › Account. The drawer on a phone draws the same row.
- **Search** is a quiet row on that line; its Ctrl K / ⌘K keycap shows on
  hover. Pressing it, or the shortcut, opens the
  palette (`overlays.ts`). On a phone the phone bar holds the one search
  entry, so the drawer leaves it out.
- **Focus** holds the cross-project lists (`focus-group.tsx`): Today,
  Upcoming and Assigned by default, plus the saved filters its "+" adds.
- **Library**: the Desk folder first, then the viewer's shelves and folders as
  one ordered column (`library-order.ts`). A row is its icon and its name; its
  "…" appears on hover in space the row already reserves, and a right-click
  opens that same menu. The Library's one "+" makes a top-level page in one
  click. Right-click on the sidebar's ground opens New page and Import….
- **Pages in pages**: a root draws its sub-pages indented inside its own item
  (`page-tree.ts`), a page with children folds from its mark, and a row's
  hover "+" adds a page inside it. Dragging a page onto the middle of a row
  puts it inside; between sub-pages, a line shows where it lands.
- **The foot** is two direct rows, Settings and Trash. People is a section of
  Settings, so the sidebar no longer links it; /app/people still answers.

Collapsing hides the sidebar entirely (`collapsible="offcanvas"`); the shell
draws the one small control that brings it back.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import type { LucideIcon } from '../lib/icons.js'
import {
  ChevronRight,
  FolderInput,
  Folders,
  Plus,
  Search,
  Settings,
  Trash2,
} from '../lib/icons.js'

import { useSidebar } from '../components/ui/sidebar.js'
import { FolderRow } from '../components/folder-row.js'
import { Button } from '../components/ui/button.js'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible.js'
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
import {
  useCreateFolder,
  useDeleteFolder,
  useDuplicateFolder,
  useLeaveFolder,
  useMoveFolder,
  useRenameFolder,
  useRestoreFolder,
} from '../api/mutations.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { leaveFolderConfirm } from '../lib/object-acts.js'
import { showToast } from '../state/toasts.js'
import { pushUndo, undoLabel } from './undo.js'
import { folderGates } from '../lib/folder-authority.js'
import { folderRowDisplay, shelfMark } from '../parts/presenters.js'
import { folderLink, shelfLink } from '../lib/nav-links.js'
import { paths } from '../routes.js'
import { NotificationsBell } from '../components/notifications-bell.js'
import { SidebarResizeHandle } from './SidebarResizeHandle.js'
import { FocusGroup } from './focus-group.js'
import type { FocusListKey } from './focus-lists.js'
import { usePageImport } from './workflow-import.js'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
/* The one drag engine, and the Library's answers to the two questions it asks
   about anything outside the list it is sorting. */
import { moved, swallowNextClick, useSortableList } from '../lib/use-sortable-list.js'
import type { SortableItemState } from '../lib/use-sortable-list.js'
import { DIRECTORY, grip, nestedGrip, pageRowAt, useLibraryZones } from './library-drag.js'
import type { LibraryZones, Point } from './library-drag.js'
import {
  buildTree,
  childrenOf,
  isDescendant,
  isNoop,
  placeInOrder,
  resolveDrop,
  visibleRows,
} from './page-tree.js'
import type { PageTree, TreeDrop } from './page-tree.js'
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
  'h-(--shell-sidebar-row-height) max-md:h-(--row-height) gap-2 rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-sidebar-accent hover:text-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-foreground [&_svg]:!size-4 [&_svg]:shrink-0'


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
const NO_FOLDERS: readonly Folder[] = []

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

/* The pages whose sub-pages are folded away, remembered per browser as one
   JSON array of ids. A page is open until somebody folds it, so a sub-page
   just made is visible. The key is never renamed. */
const PAGE_FOLD_KEY = 'dana.sidebar.page-folded'
function readPageFolds(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage.getItem(PAGE_FOLD_KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [],
    )
  } catch {
    return new Set()
  }
}
function writePageFolds(folded: ReadonlySet<string>): void {
  try {
    globalThis.localStorage.setItem(PAGE_FOLD_KEY, JSON.stringify([...folded]))
  } catch {
    /* A browser that keeps nothing still folds for this session. */
  }
}

/*
The Library's keyboard path: one Tab stop for the whole tree (roving
tabindex), the arrows between rows. A row is a page's link or a collection
heading's link (its fold, for a bare label). The row's other buttons (fold,
"+", "…") stay for the pointer and leave the Tab order; Shift+F10 opens the
"…". `folder-row.tsx` draws the page rows, so their tabindex is set here on
the DOM, again whenever rows mount.
*/
const TREE_ROW = '[data-page-row] > a, [data-tree-row]'

function pageRowLink(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-page-row="${CSS.escape(id)}"] > a`)
}

function useLibraryKeys(tree: PageTree, mayRename: (id: string) => boolean, startRename: (id: string) => void): {
  readonly ref: React.RefObject<HTMLDivElement | null>
  readonly onKeyDown: (event: React.KeyboardEvent) => void
  readonly onFocus: (event: React.FocusEvent) => void
  readonly onBlur: (event: React.FocusEvent) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  /* The row that last held focus, while focus is inside the tree. */
  const focused = useRef<HTMLElement | null>(null)

  const rows = useCallback((): HTMLElement[] => {
    const root = ref.current
    if (root === null) return []
    return [...root.querySelectorAll<HTMLElement>(TREE_ROW)].filter(
      (row) => row.getClientRects().length > 0,
    )
  }, [])

  const sync = useCallback((): void => {
    const root = ref.current
    if (root === null) return
    const all = rows()
    const held = focused.current
    const stop =
      (held !== null && all.includes(held) ? held : null) ??
      all.find((row) => row.getAttribute('aria-current') === 'page') ??
      all[0]
    for (const row of root.querySelectorAll<HTMLElement>(TREE_ROW)) {
      const want = row === stop ? 0 : -1
      if (row.tabIndex !== want) row.tabIndex = want
    }
    for (const inner of root.querySelectorAll<HTMLElement>('[data-page-row] button')) {
      if (inner.tabIndex !== -1) inner.tabIndex = -1
    }
  }, [rows])

  /* Every render, and whenever a row mounts on its own (a fold, the "+"). */
  useEffect(() => {
    sync()
  })
  useEffect(() => {
    const root = ref.current
    if (root === null) return
    const observer = new MutationObserver(sync)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [sync])

  const onFocus = (event: React.FocusEvent): void => {
    const target = event.target as HTMLElement
    if (!target.matches(TREE_ROW)) return
    focused.current = target
    sync()
  }
  const onBlur = (event: React.FocusEvent): void => {
    if (ref.current?.contains(event.relatedTarget) === true) return
    focused.current = null
    sync()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    const row = event.target as HTMLElement
    if (!row.matches(TREE_ROW) || event.altKey || event.ctrlKey || event.metaKey) return
    const all = rows()
    const index = all.indexOf(row)
    if (index === -1) return
    const pageId = row.parentElement?.getAttribute('data-page-row') ?? null
    const head = pageId === null ? row.closest<HTMLElement>('[data-shelf-head]') : null
    /* The fold: a page's chevron, or a collection heading's trigger. */
    const fold =
      pageId !== null
        ? row.parentElement?.querySelector<HTMLElement>(':scope > [data-fold]')
        : head?.querySelector<HTMLElement>('[aria-expanded]')
    const open = fold?.getAttribute('aria-expanded')
    const go = (next: HTMLElement | null | undefined): void => {
      next?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        go(all[index + 1])
        break
      case 'ArrowUp':
        go(all[index - 1])
        break
      case 'Home':
        go(all[0])
        break
      case 'End':
        go(all.at(-1))
        break
      case 'ArrowRight':
        if (open === 'false') fold?.click()
        else if (open === 'true') go(all[index + 1])
        break
      case 'ArrowLeft': {
        if (open === 'true') {
          fold?.click()
          break
        }
        const parent = pageId === null ? null : (tree.parent.get(pageId) ?? null)
        go(
          parent !== null && ref.current !== null
            ? pageRowLink(ref.current, parent)
            : row.closest('[data-shelf]')?.querySelector<HTMLElement>('[data-tree-row]'),
        )
        break
      }
      case 'F2':
        if (pageId !== null && mayRename(pageId)) startRename(pageId)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return { ref, onKeyDown, onFocus, onBlur }
}

/** What the drop key says to the engine: the tree answers this point. */
const TREE_KEY = 'library:page-tree'

/*
The page tree as every Library row sees it: the tree, the folds, what a drop
here would do, and the three acts (move, add inside, fold). One context
rather than props through the shelves, because a row at any depth in any
container asks the same questions.
*/
interface PageTreeValue {
  readonly tree: PageTree
  readonly folded: ReadonlySet<string>
  readonly toggle: (id: string) => void
  readonly mark: TreeDrop['mark'] | null
  /** The drop a carried page proposes at a point, drawn as it is found. */
  readonly probe: (carried: Folder, point: Point, allowRoot: boolean) => TreeDrop | null
  readonly clearMark: () => void
  readonly commit: (carried: Folder, drop: TreeDrop) => void
  readonly addInside: (parent: Folder) => void
  readonly mayEdit: (folder: Folder) => boolean
  /** The row being renamed in place, and the acts a row's menu runs here. */
  readonly renaming: string | null
  readonly startRename: (id: string) => void
  readonly rename: (folder: Folder, name: string | null) => void
  readonly trash: (folder: Folder) => void
  readonly leave: (folder: Folder) => void
  /** The page whose leave is being confirmed. */
  readonly leaving: Folder | null
  readonly confirmLeave: () => void
  readonly cancelLeave: () => void
}

/** Copy an address, then say so once. */
function copyLink(url: string): void {
  void navigator.clipboard?.writeText(url).then(
    () => {
      showToast('Link copied')
    },
    () => {},
  )
}

const PageTreeContext = createContext<PageTreeValue | null>(null)

function usePageTree(): PageTreeValue {
  const value = useContext(PageTreeContext)
  if (value === null) throw new Error('usePageTree outside the Library')
  return value
}

function mayEditPage(folder: Folder): boolean {
  return folderGates({
    access: folder.my_access,
    isOwner: folder.is_owner,
    isDefault: folder.is_default,
  }).identity
}

function samePlace(a: TreeDrop['mark'] | null, b: TreeDrop['mark'] | null): boolean {
  return a === b || (a !== null && b !== null && a.rowId === b.rowId && a.kind === b.kind)
}

function usePageTreeValue({
  folders,
  entries,
  onOrderChange,
  groups,
  activeId,
}: {
  readonly folders: readonly Folder[]
  readonly entries: readonly DirectoryEntry[]
  readonly onOrderChange: (ids: readonly string[]) => void
  readonly groups: FolderGroupActions
  readonly activeId: string | null
}): PageTreeValue {
  const navigate = useNavigate()
  const move = useMoveFolder()
  const create = useCreateFolder()
  const remove = useDeleteFolder()
  const restore = useRestoreFolder()
  const leaveFolder = useLeaveFolder()
  const renameFolder = useRenameFolder()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Folder | null>(null)
  /* Set on the press, before the mutation's own pending state has rendered:
     a double click lands both clicks in the same frame. */
  const creating = useRef(false)
  const tree = useMemo(() => buildTree(folders), [folders])
  const [folded, setFolded] = useState(readPageFolds)
  const [mark, setMark] = useState<TreeDrop['mark'] | null>(null)

  const setFold = useCallback((id: string, fold: boolean): void => {
    setFolded((current) => {
      if (current.has(id) === fold) return current
      const next = new Set(current)
      if (fold) next.add(id)
      else next.delete(id)
      writePageFolds(next)
      return next
    })
  }, [])

  const clearMark = useCallback((): void => {
    setMark(null)
  }, [])

  /* Only when the page on screen, or one under it, goes: to Today, replacing
     the entry so Back does not land on a page that is gone. */
  const leaveIfShowing = (id: string): void => {
    if (activeId !== null && (activeId === id || isDescendant(tree, id, activeId))) {
      void navigate(paths.today, { replace: true })
    }
  }

  const probe = (carried: Folder, point: Point, allowRoot: boolean): TreeDrop | null => {
    const hit = mayEditPage(carried) ? pageRowAt(point) : null
    const onto = hit === null ? undefined : tree.byId.get(hit.id)
    let drop =
      hit === null || onto === undefined
        ? null
        : resolveDrop(tree, folded, carried.id, hit.id, hit.zone, (id) => {
            const parent = tree.byId.get(id)
            return parent !== undefined && !parent.is_default && mayEditPage(parent)
          })
    /* The Desk page is pinned first, so nothing lands beside it, and it is
       never a parent (the server's 422), so nothing lands inside it either. */
    if (drop?.anchor !== undefined && (!allowRoot || onto?.is_default === true)) drop = null
    if (drop !== null && isNoop(tree, carried.id, drop)) drop = null
    const next = drop?.mark ?? null
    setMark((current) => (samePlace(current, next) ? current : next))
    return drop
  }

  const commit = (carried: Folder, drop: TreeDrop): void => {
    setMark(null)
    if (drop.parent !== null) {
      /* Nested into a folded page: open it, so the page is seen landing. */
      setFold(drop.parent, false)
      move.mutate({
        id: carried.id,
        body: {
          parent_folder_id: drop.parent,
          ...(drop.afterId === undefined ? {} : { after_id: drop.afterId }),
        },
      })
      return
    }
    const anchor = drop.anchor
    if (anchor === undefined) return
    /* Already a root here: only its place in the order changes. */
    if ((tree.parent.get(carried.id) ?? null) !== null) {
      move.mutate({ id: carried.id, body: { parent_folder_id: null } })
    }
    /* A root's place is the viewer's own Library order, and its collection
       is the one the root it lands beside is in. */
    onOrderChange(placeInOrder(encodeColumn(entries), carried.id, anchor.id, anchor.side))
    const beside = tree.byId.get(anchor.id)
    if (beside !== undefined && beside.my_shelf !== carried.my_shelf) {
      groups.onMoveToGroup(carried, beside.my_shelf)
    }
  }

  return {
    tree,
    folded,
    toggle: (id) => {
      setFold(id, !folded.has(id))
    },
    mark,
    probe,
    clearMark,
    commit,
    addInside: (parent) => {
      /* One page per press: a held key or a double click must not stack
         Untitled pages while the first create is in flight. */
      if (creating.current) return
      creating.current = true
      create.mutate(
        { name: 'Untitled', parent_folder_id: parent.id },
        {
          onSettled: () => {
            creating.current = false
          },
          onSuccess: (made) => {
            setFold(parent.id, false)
            /* Opened with its name field focused and selected, so typing
               replaces "Untitled" (the folder page's rename act). */
            void navigate(folderActionPath(made.id, 'rename'))
          },
        },
      )
    },
    mayEdit: mayEditPage,
    renaming,
    startRename: setRenaming,
    rename: (folder, name) => {
      setRenaming(null)
      if (name !== null) renameFolder.mutate({ id: folder.id, body: { name } })
      /* The field unmounts with focus in it: hand focus back to the row,
         unless the rename ended because focus went somewhere else. */
      requestAnimationFrame(() => {
        const at = document.activeElement
        if (at === null || at === document.body) pageRowLink(document, folder.id)?.focus()
      })
    },
    trash: (folder) => {
      /* An owner with other members is asked whether to hand it on first;
         that question lives on the page. */
      if (folder.is_owner && folder.member_count > 1) {
        void navigate(folderActionPath(folder.id, 'delete'))
        return
      }
      leaveIfShowing(folder.id)
      remove.mutateAsync(folder.id).then(
        () => {
          pushUndo(undoLabel('Deleted', folder.name), () => {
            restore.mutate(folder.id)
          })
        },
        () => {},
      )
    },
    leave: setLeaving,
    leaving,
    confirmLeave: () => {
      if (leaving === null) return
      setLeaving(null)
      leaveFolder.mutate(leaving.id, {
        onSuccess: () => {
          leaveIfShowing(leaving.id)
        },
      })
    },
    cancelLeave: () => {
      setLeaving(null)
    },
  }
}

/**
 * A page's sub-pages, drawn flat at their depths inside the page's own item.
 *
 * One list per root page, sorted by the one engine. Nothing slides: a carried
 * sub-page goes where the tree says, onto a row (inside it) or between two
 * (a line at the depth it would take), and the rows under it dim, because
 * they go with it.
 */
function PageDescendants({
  root,
  nested,
  activeId,
  groups,
}: {
  readonly root: Folder
  readonly nested: boolean
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element | null {
  const pages = usePageTree()
  const rows = useMemo(
    () => visibleRows(pages.tree, childrenOf(pages.tree, root.id), pages.folded, 1),
    [pages.tree, pages.folded, root.id],
  )
  const list = useSortableList({
    count: rows.length,
    onLift: swallowNextClick,
    describe: (index) => rows[index]?.folder.name ?? 'Page',
    onOver: (from, point) => {
      const row = rows[from]
      if (row === undefined) return null
      return pages.probe(row.folder, point, true) === null ? `${TREE_KEY}:none` : TREE_KEY
    },
    onDropAt: (from, point) => {
      const row = rows[from]
      if (row === undefined) return true
      const drop = pages.probe(row.folder, point, true)
      pages.clearMark()
      if (drop !== null) pages.commit(row.folder, drop)
      return true
    },
    /* Every pointer release is answered above; nothing reorders by slot. */
    onReorder: () => {},
  })
  const { clearMark } = pages
  useEffect(() => {
    if (!list.isDragging) clearMark()
  }, [list.isDragging, clearMark])

  if (rows.length === 0 || pages.folded.has(root.id)) return null
  const carried = list.activeIndex === null ? null : (rows[list.activeIndex]?.folder.id ?? null)
  return (
    <SidebarMenu>
      {rows.map((row, index) => (
        <SidebarFolderRow
          key={row.folder.id}
          folder={row.folder}
          activeId={activeId}
          groups={groups}
          nested={nested}
          depth={row.depth}
          dimmed={carried !== null && isDescendant(pages.tree, carried, row.folder.id)}
          drag={{
            itemRef: list.setItemRef(index),
            rowProps: nestedGrip(list.handleProps(index)),
            state: list.itemState(index),
            proposal: null,
          }}
        />
      ))}
    </SidebarMenu>
  )
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
The acts a Library row can perform on its page, all run in place (the page
keeps History, Tabs…, Import… and Export). `?folder-action=` remains for a new
page's name field and an owner's delete question, which live on the page.
`folderGates` decides which a viewer gets, the same call the page makes.
*/
export type FolderAction = 'rename' | 'leave' | 'delete'

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
  depth = 0,
  dimmed = false,
  drag,
}: {
  readonly folder: Folder
  readonly activeId: string | null
  readonly groups: FolderGroupActions
  readonly nested?: boolean
  /** 0 for a root, which draws its sub-pages inside its own item. */
  readonly depth?: number
  readonly dimmed?: boolean
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
  const pages = usePageTree()
  const hasChildren = childrenOf(pages.tree, folder.id).length > 0
  return (
    <FolderRow
      itemRef={drag?.itemRef}
      rowProps={
        /* A shelf's insert line counts its own rows, not the sub-pages
           drawn inside them. */
        (depth === 0
          ? { ...drag?.rowProps, 'data-drop-row': '' }
          : drag?.rowProps) as React.ComponentProps<'li'>
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
      pageId={folder.id}
      depth={depth}
      dimmed={dimmed}
      fold={
        hasChildren
          ? {
              open: !pages.folded.has(folder.id),
              onToggle: () => {
                pages.toggle(folder.id)
              },
            }
          : undefined
      }
      onAddInside={
        /* The Desk takes no sub-pages (the server answers 422). */
        gates.identity && !folder.is_default
          ? () => {
              pages.addInside(folder)
            }
          : undefined
      }
      dropMark={pages.mark?.rowId === folder.id ? pages.mark.kind : null}
      renaming={pages.renaming === folder.id}
      onRename={(name) => {
        pages.rename(folder, name)
      }}
      /* The row's menu: Rename, Copy link, Duplicate, then Leave or Delete
         by role, each run here. The page's own "…" keeps History, Tabs…,
         Import… and Export. */
      acts={{
        /* In the menu as well as on the hover "+", which is out of the Tab
           order: this is the keyboard's way to it (Shift+F10). */
        'add-page':
          gates.identity && !folder.is_default
            ? () => {
                pages.addInside(folder)
              }
            : undefined,
        rename: gates.identity
          ? () => {
              pages.startRename(folder.id)
            }
          : undefined,
        'copy-link': () => {
          copyLink(folderLink(folder.id))
        },
        duplicate: () => {
          duplicate.mutate(folder.id, {
            onSuccess: (made) => {
              void navigate(paths.folder(made.id))
            },
          })
        },
        leave: gates.leave
          ? () => {
              pages.leave(folder)
            }
          : undefined,
        delete: gates.trash
          ? () => {
              pages.trash(folder)
            }
          : undefined,
      }}
    >
      {depth === 0 && hasChildren ? (
        <PageDescendants root={folder} nested={nested} activeId={activeId} groups={groups} />
      ) : null}
    </FolderRow>
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

  const pages = usePageTree()
  const inner = useSortableList({
    count: group.folders.length,
    onLift: swallowNextClick,
    describe: (index) => group.folders[index]?.name ?? 'Page',
    onOver: (from, point) => {
      /* Onto a page, or between sub-pages: the tree answers first. */
      const folder = group.folders[from]
      if (folder !== undefined && pages.probe(folder, point, false) !== null) return TREE_KEY
      return zones.containerAt(point, self)
    },
    onDropAt: (from, point) => {
      const folder = group.folders[from]
      if (folder === undefined) return false
      const drop = pages.probe(folder, point, false)
      if (drop !== null) {
        pages.commit(folder, drop)
        return true
      }
      const container = zones.containerAt(point, self)
      if (container === null) return false
      onMoveOut(folder, container === DIRECTORY ? null : labelOfKey(container))
      return true
    },
    onReorder: (from, to) => {
      onReorderWithin(group.label, from, to)
    },
  })

  const { clearMark } = pages
  useEffect(() => {
    if (!inner.isDragging) clearMark()
  }, [inner.isDragging, clearMark])

  const sectionRef = (element: HTMLElement | null): void => {
    drag.itemRef(element)
    zones.registerZone(self)(element)
  }

  const offset = drag.state.offset
  return (
    <section
      aria-label={group.label}
      data-shelf=""
      ref={sectionRef}
      className={cn(
        'relative rounded-md',
        drag.state.isActive && 'cursor-grabbing bg-sidebar',
        drag.isDropTarget && 'bg-sidebar-accent ring-1 ring-ring/40',
      )}
      style={
        offset === 0 && !drag.state.isActive
          ? undefined
          : {
              transform:
                drag.state.isActive && !drag.state.isSettling
                  ? `translate(var(--space-inline), calc(${String(offset)}px + var(--space-inline)))`
                  : `translateY(${String(offset)}px)`,
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
          data-shelf-head=""
          onContextMenu={(event) => {
            event.preventDefault()
            menuTrigger.current?.click()
          }}
          className="group/folder-group relative flex h-(--shell-sidebar-row-height) max-md:h-(--row-height) items-center gap-1 rounded-md pr-8 pl-1 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {drag.proposal === null ? null : (
            <span className="pointer-events-none absolute top-1/2 right-2 z-40 -translate-y-1/2 rounded-sm bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background">
              {drag.proposal}
            </span>
          )}
          <CollapsibleTrigger
            aria-label={`Show the pages in ${group.label}`}
            data-no-drag
            /* A bare label has no page: its fold is the heading's one stop. */
            {...(group.shelf === null ? { 'data-tree-row': '' } : { tabIndex: -1 })}
            className="relative flex size-6 shrink-0 items-center justify-center rounded-sm outline-none hover:bg-sidebar-accent"
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
              data-tree-row=""
              className="flex h-full min-w-0 flex-1 items-center rounded-sm outline-none"
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
                /* A shelf with a page renames in its page title (the one home);
                   only a bare label, which has no page, renames here. */
                rename:
                  group.shelf === null
                    ? () => {
                        groups.onRenameGroup(group.label)
                      }
                    : undefined,
                'copy-link':
                  shelfId === null
                    ? undefined
                    : () => {
                        copyLink(shelfLink(shelfId))
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
                  tabIndex={-1}
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
                        ? 'Out of collection'
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
 * order. Dragging a row reorders it; resting inside a collection files it
 * there; letting go on the middle of a page puts it inside that page.
 *
 * Holding one folder on another used to propose a new shelf of the two; the
 * middle of a row now means "inside this page", and one gesture cannot mean
 * both. A collection is made from the Library's "+" or a row's menu.
 */
function LibraryColumn({
  entries,
  onOrderChange,
  activeId,
  groups,
}: {
  readonly entries: readonly DirectoryEntry[]
  readonly onOrderChange: (ids: readonly string[]) => void
  readonly activeId: string | null
  readonly groups: FolderGroupActions
}): React.JSX.Element {
  const zones = useLibraryZones()
  const pages = usePageTree()

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
      return entry === undefined ? 'Page' : entryName(entry)
    },
    onOver: (from, point) => {
      const entry = entries[from]
      if (entry === undefined || entry.kind === 'group') {
        setDrop(null)
        pages.clearMark()
        return null
      }
      /* Onto a page, or between sub-pages: the tree answers first. Beside a
         root is the column's own reorder, below. */
      if (pages.probe(entry.folder, point, true) !== null) {
        setDrop(null)
        return TREE_KEY
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
      const tree = pages.probe(entry.folder, point, true)
      if (tree !== null) {
        pages.commit(entry.folder, tree)
        return true
      }
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
  })

  const { clearMark } = pages
  useEffect(() => {
    if (!outer.isDragging) clearMark()
  }, [outer.isDragging, clearMark])

  return (
    <SidebarGroupContent ref={zones.registerZone(DIRECTORY)}>
      <SidebarMenu>
        {entries.map((entry, index) => {
          const state = outer.itemState(index)
          const proposal = null

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

/** The Library's one "+": a new top-level page, one click, no menu. */
function NewPageButton({ onNewPage }: { readonly onNewPage: () => void }): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-6 shrink-0 rounded-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      aria-label="New page"
      title="New page"
      onClick={onNewPage}
    >
      <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
    </Button>
  )
}

/** The head row's Search: a quiet row in look, a button in fact; it opens the
    palette. Its keycap shows only on hover, so the row stays one word. */
function SearchField({ onOpen }: { readonly onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search"
      className="group/search flex h-(--shell-sidebar-row-height) min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground"
    >
      <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">Search</span>
      <kbd
        aria-hidden="true"
        className="font-sans text-xs text-muted-foreground opacity-0 group-hover/search:opacity-100 group-focus-visible/search:opacity-100"
      >
        {IS_MAC ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  )
}

/* Right-click on the sidebar's own ground (empty space, the Library heading,
   the lists) opens this small menu at the pointer instead of the browser's.
   A row with its own menu (a page, a collection) claims the event first. */
function SidebarGroundMenu({
  at,
  onClose,
  onNewPage,
  onImport,
}: {
  readonly at: { readonly x: number; readonly y: number } | null
  readonly onClose: () => void
  readonly onNewPage: () => void
  readonly onImport: () => void
}): React.JSX.Element | null {
  if (at === null) return null
  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-0"
            style={{ left: at.x, top: at.y }}
          />
        }
      />
      <DropdownMenuContent sideOffset={0} className="w-auto min-w-40">
        <DropdownMenuItem onClick={onNewPage}>
          <Plus strokeWidth={1.75} aria-hidden="true" />
          New page
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImport}>
          <FolderInput strokeWidth={1.75} aria-hidden="true" />
          Import…
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
  focusLists,
  onFocusListsChange,
  groups: groupActions,
  activeFolderId,
  currentPath,
  currentSearch,
  sidebarWidth,
  onSidebarWidthChange,
  onSidebarWidthCommit,
  onSidebarWidthReset,
  onOpenSearch,
}: {
  readonly folders: readonly Folder[] | undefined
  readonly shelves: readonly Shelf[] | undefined
  /** The viewer's arrangement of the Library (4.19's `sidebar_order`). */
  readonly sidebarOrder: readonly string[]
  readonly onSidebarOrderChange: (ids: readonly string[]) => void
  /** The viewer's Focus lists in their order (`focus_lists`, round 8). */
  readonly focusLists: readonly FocusListKey[]
  readonly onFocusListsChange: (next: readonly FocusListKey[]) => void
  readonly groups: FolderGroupActions
  readonly activeFolderId: string | null
  readonly currentPath: string
  readonly currentSearch: string
  readonly sidebarWidth: number | null
  readonly onSidebarWidthChange: (width: number) => void
  readonly onSidebarWidthCommit: (width: number) => void
  readonly onSidebarWidthReset: () => void
  readonly onOpenSearch: () => void
}): React.JSX.Element {
  /* On a phone the sidebar is a drawer, and it closes on the navigation it was
     opened to make. */
  const { isMobile, setOpenMobile, state } = useSidebar()
  /* Hidden on a laptop means gone: out of the tab order and the tree too. */
  const hidden = !isMobile && state === 'collapsed'
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [currentPath, currentSearch, isMobile, setOpenMobile])
  const inbox = inboxOf(folders ?? [])
  const navigate = useNavigate()
  const create = useCreateFolder()
  /* One page per press, the row "+"'s rule: a double click must not stack
     Untitled pages while the first create is in flight. A ref and not
     `create.isPending`, which has not rendered yet when the second click of a
     double click arrives. Opened with its name selected, so typing replaces
     "Untitled". */
  const creating = useRef(false)
  const newPage = (): void => {
    if (creating.current) return
    creating.current = true
    create.mutate(
      { name: 'Untitled' },
      {
        onSettled: () => {
          creating.current = false
        },
        onSuccess: (made) => void navigate(folderActionPath(made.id, 'rename')),
      },
    )
  }
  const importPage = usePageImport()
  const [groundMenu, setGroundMenu] = useState<{ x: number; y: number } | null>(null)
  const openGroundMenu = (event: React.MouseEvent): void => {
    /* A row's own menu already answered; a text field keeps the browser's. */
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]') !== null) return
    event.preventDefault()
    setGroundMenu({ x: event.clientX, y: event.clientY })
  }
  /* The Library draws roots; each root draws its own sub-pages. A page whose
     parent this viewer cannot see is a root here (`page-tree.ts`). */
  const allFolders = folders ?? NO_FOLDERS
  const roots = useMemo(() => buildTree(allFolders).roots, [allFolders])
  const entries = useMemo(
    () => arrangeColumn(roots, sidebarOrder, shelves ?? NO_SHELVES),
    [roots, sidebarOrder, shelves],
  )
  const pageTree = usePageTreeValue({
    folders: allFolders,
    entries,
    onOrderChange: onSidebarOrderChange,
    groups: groupActions,
    activeId: activeFolderId,
  })
  const libraryKeys = useLibraryKeys(
    pageTree.tree,
    (id) => {
      const folder = pageTree.tree.byId.get(id)
      return folder !== undefined && mayEditPage(folder)
    },
    pageTree.startRename,
  )

  return (
    <Sidebar
      collapsible="offcanvas"
      inert={hidden}
      role="navigation"
      aria-label="Pages"
      /* No slide: the resize handle sets this width, and a transition would
         make the column lag the pointer. */
      className="h-full shrink-0 border-r border-border bg-sidebar transition-none"
    >
      {/* Solid and above the list, so nothing scrolling in the list shows
          through the head; the list below is the one scroll container. */}
      <SidebarHeader
        className={cn(
          'relative z-40 shrink-0 justify-center bg-sidebar py-0',
          isMobile ? 'h-12 px-1' : 'h-(--shell-windowbar-height) px-2',
        )}
      >
        {/* One line: Search, the bell, collapse. On a phone the phone bar holds
            the one search entry, so the line keeps only the two buttons, at
            the phone bar's size. */}
        <div className={cn('flex items-center', isMobile ? 'gap-1' : 'gap-0.5')}>
          {isMobile ? <span className="min-w-0 flex-1" /> : <SearchField onOpen={onOpenSearch} />}
          <NotificationsBell className={isMobile ? 'size-10 [&_svg]:size-5' : undefined} />
          <SidebarTrigger
            className={cn(
              'shrink-0 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
              isMobile ? 'size-10 [&_svg]:!size-5' : 'size-(--control-height) [&_svg]:!size-4',
            )}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-0 pb-2" onContextMenu={openGroundMenu}>
        {/* Focus and Library: one heading style and one gap above each
            heading; each heading's "+" adds to its own group. */}
        <FocusGroup
          lists={focusLists}
          onChange={onFocusListsChange}
          currentPath={currentPath}
          link={routerLink}
        />

        <SidebarGroup
          ref={libraryKeys.ref}
          onKeyDown={libraryKeys.onKeyDown}
          onFocus={libraryKeys.onFocus}
          onBlur={libraryKeys.onBlur}
          className="px-2 pt-(--space-group) pb-0"
        >
          <div className="flex h-(--shell-sidebar-row-height) items-center pr-1 pl-2">
            <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              Library
            </h2>
            <NewPageButton onNewPage={newPage} />
          </div>
          <PageTreeContext.Provider value={pageTree}>
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
            entries={entries}
            onOrderChange={onSidebarOrderChange}
            activeId={activeFolderId}
            groups={groupActions}
          />
          </PageTreeContext.Provider>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2" onContextMenu={openGroundMenu}>
        <SidebarMenu>
          <NavigationRow
            name="Settings"
            to={paths.settings}
            icon={Settings}
            active={currentPath.startsWith(paths.settings)}
          />
          <NavigationRow
            name="Trash"
            to={paths.trash}
            icon={Trash2}
            active={currentPath === paths.trash}
          />
        </SidebarMenu>
      </SidebarFooter>

      {pageTree.leaving === null ? null : (
        <ConfirmDialog
          message={leaveFolderConfirm(pageTree.leaving.name)}
          onContinue={pageTree.confirmLeave}
          onCancel={pageTree.cancelLeave}
        />
      )}

      <SidebarGroundMenu
        at={groundMenu}
        onClose={() => {
          setGroundMenu(null)
        }}
        onNewPage={newPage}
        onImport={() => {
          importPage()
        }}
      />

      <SidebarResizeHandle
        value={sidebarWidth}
        onChange={onSidebarWidthChange}
        onCommit={onSidebarWidthCommit}
        onReset={onSidebarWidthReset}
      />
    </Sidebar>
  )
}

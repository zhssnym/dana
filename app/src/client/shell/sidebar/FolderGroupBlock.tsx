/* A collection in the Library: its heading, its menu and its pages. */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Folders } from '../../lib/icons.js'
import { Button } from '../../components/ui/button.js'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../components/ui/collapsible.js'
import { SidebarMenu } from '../../components/ui/sidebar.js'
import { MORE_ACTIONS } from '../../components/ui/copy.js'
import { ObjectMenu } from '../../components/object-menu.js'
import { cn } from '../../components/ui/utils.js'
import { useDuplicateShelf } from '../../api/mutations.js'
import { copyLink } from '../../lib/object-acts.js'
import { shelfMark } from '../../parts/presenters.js'
import { shelfLink } from '../../lib/nav-links.js'
import { paths } from '../../routes.js'
import { heldForTab, sidebarDragOver, sidebarDropAt, TAB_STRIP } from '../tab-drop.js'
/* The one drag engine, and the Library's answers to the two questions it asks
   about anything outside the list it is sorting. */
import { swallowNextClick, useSortableList } from '../../lib/use-sortable-list.js'
import type { SortableItemState } from '../../lib/use-sortable-list.js'
import { DIRECTORY, grip } from '../library-drag.js'
import type { LibraryZones } from '../library-drag.js'
import { groupKey, labelOfKey } from '../library-order.js'
import type { DirectoryEntry } from '../library-order.js'
import type { FolderGroupActions } from '../folder-groups.js'
import type { Folder } from '../../../shared/folders.js'
import { InsertLine } from './drop-line.js'
import { readShelfOpen, writeShelfOpen } from './fold-storage.js'
import { TREE_KEY, usePageTree } from './page-tree-context.js'
import { SHELF_ACTION_PARAM } from './folder-action.js'
import { SidebarFolderRow } from './SidebarFolderRow.js'

/**
 * A shelf: a collapsible group of folder rows headed by its name.
 *
 * The heading is the shelf's icon and name. The icon is the fold (it turns
 * into a chevron under the pointer, in the same box, so nothing shifts); the
 * name opens the shelf's page. Its "…" is the same menu a right-click opens.
 */
export function FolderGroupBlock({
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
  const navigate = useNavigate()
  const duplicateShelf = useDuplicateShelf()
  const mark = group.shelf === null ? null : shelfMark(group.shelf)
  const Glyph = mark?.icon ?? Folders

  const pages = usePageTree()
  const inner = useSortableList({
    count: group.folders.length,
    onLift: swallowNextClick,
    describe: (index) => group.folders[index]?.name ?? 'Page',
    onOver: (from, point) => {
      /* Out of the sidebar: the row comes loose, and opens as a tab if it is
         let go on the tab strip (`tab-drop.ts`). */
      const folder = group.folders[from]
      if (sidebarDragOver(point, folder === undefined ? null : paths.folder(folder.id)) !== null) return TAB_STRIP
      /* Onto a page, or between sub-pages: the tree answers first. */
      if (folder !== undefined && pages.probe(folder, point, false) !== null) return TREE_KEY
      return zones.containerAt(point, self)
    },
    onDropAt: (from, point) => {
      const folder = group.folders[from]
      if (folder === undefined) return false
      if (sidebarDropAt(point, paths.folder(folder.id))) return true
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
          className="group/folder-group relative my-(--sidebar-row-gap) flex h-(--shell-sidebar-row-height) max-md:h-(--row-height) items-center gap-1 rounded-md pr-8 pl-1 text-sm text-muted-foreground hover:bg-(--sidebar-row-hover) hover:text-foreground"
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
              /* The collection page's own "…" (M4: one menu per object), plus
                 Rename for a bare label, whose title is not a field anywhere. */
              handlers={{
                history:
                  shelfId === null
                    ? undefined
                    : () => {
                        /* Asks the page, as a folder row does: a sheet
                           here would unmount when the phone sidebar closes. */
                        void navigate(`${paths.shelf(shelfId)}?${SHELF_ACTION_PARAM}=history`)
                      },
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
                duplicate:
                  shelfId === null
                    ? undefined
                    : () => {
                        duplicateShelf.mutate(shelfId, {
                          onSuccess: (made) => {
                            void navigate(paths.shelf(made.id))
                          },
                        })
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
              const state = heldForTab(inner.itemState(index), inner.overKey)
              return (
                <SidebarFolderRow
                  key={folder.id}
                  folder={folder}
                  activeId={activeId}
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

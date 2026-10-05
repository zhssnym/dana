/*
The sidebar: the application's only chrome, and a navigation landmark.

Top to bottom, and nothing else (round 2, Sidebar):

  Today · Upcoming · Assigned · Library · the foot row

Nothing sits above Focus.

- **Focus** holds the cross-project lists (`focus-group.tsx`): Today,
  Upcoming and Assigned by default, plus the saved filters its "+" adds.
- **Library**: the Desk folder first, then the viewer's shelves and folders as
  one ordered column (`library-order.ts`). A row is its icon and its name; its
  "…" appears on hover in space the row already reserves, and a right-click
  opens that same menu. The Library's one "+" makes a top-level page or a
  private collection. Right-click on the sidebar's ground opens the same menu.
- **Pages mirror their real hierarchy**: Library ordering and collections place
  only roots. A page with a visible `parent_folder_id` is drawn indented under
  that parent, using the existing page-tree fold and sibling order. Tabs/facets
  are still project-internal navigation and do not become another sidebar tree.
- **The foot** is one row of square icon buttons: Search (Ctrl K / ⌘K,
  named in its tooltip), the bell, Settings, Trash, and collapse at the far
  right. People is a section of Settings; /app/people still answers.

Collapsing hides the sidebar entirely (`collapsible="offcanvas"`); the shell
draws the one small control that brings it back.
*/
import { useEffect, useMemo, useState } from 'react'

import { useSidebar } from '../components/ui/sidebar.js'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '../components/ui/sidebar.js'
import { ConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { leaveFolderConfirm } from '../lib/object-acts.js'
import { SidebarResizeHandle } from './SidebarResizeHandle.js'
import { FocusGroup } from './focus-group.js'
import type { FocusListKey } from './focus-lists.js'
import { usePageImport } from './workflow-import.js'
import { buildTree } from './page-tree.js'
import { arrangeColumn } from './library-order.js'
import type { FolderGroupActions } from './folder-groups.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'
import { routerLink } from './sidebar/router-link.js'
import { inboxOf, libraryPages } from './sidebar/library-pages.js'
import { useLibraryKeys } from './sidebar/use-library-keys.js'
import { mayEditPage, PageTreeContext } from './sidebar/page-tree-context.js'
import { usePageTreeValue } from './sidebar/use-page-tree-value.js'
import { useLibraryCreate } from './sidebar/use-library-create.js'
import { SidebarFolderRow } from './sidebar/SidebarFolderRow.js'
import { LibraryColumn } from './sidebar/LibraryColumn.js'
import { NewPageButton, SidebarGroundMenu } from './sidebar/LibraryMenus.js'
import { SidebarFoot } from './sidebar/SidebarFoot.js'

export type { FolderAction } from './sidebar/folder-action.js'
export {
  FOLDER_ACTION_PARAM,
  folderActionPath,
  SHELF_ACTION_PARAM,
} from './sidebar/folder-action.js'
export { useAddPageInside } from './sidebar/use-add-page-inside.js'
export { FOOT_BUTTON } from './sidebar/SidebarFoot.js'

/** The one row treatment every sidebar entry shares. */
export const SIDEBAR_ROW =
  'my-(--sidebar-row-gap) h-(--shell-sidebar-row-height) max-md:h-(--row-height) gap-2 rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-(--sidebar-row-hover) hover:text-foreground data-active:bg-sidebar-accent data-active:hover:bg-sidebar-accent data-active:font-normal data-active:text-foreground [&_svg]:!size-4 [&_svg]:shrink-0'

const NO_SHELVES: readonly Shelf[] = []
const NO_FOLDERS: readonly Folder[] = []

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
  const { newPage, newCollection } = useLibraryCreate(shelves)
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
  /* The Library draws only project roots and true sub-pages. Tabs are removed
     from this projection, and a sub-page directly under a tab is lifted under
     the project root so the sidebar keeps the page hierarchy without copying
     the project's tab strip. */
  const allFolders = folders ?? NO_FOLDERS
  const libraryFolders = useMemo(() => libraryPages(allFolders), [allFolders])
  const activeLibraryId = useMemo(() => {
    if (activeFolderId === null) return null
    const active = allFolders.find((folder) => folder.id === activeFolderId)
    return active !== undefined && active.tab_position !== null && active.id !== active.project_id
      ? active.project_id
      : activeFolderId
  }, [activeFolderId, allFolders])
  const roots = useMemo(() => buildTree(libraryFolders).roots, [libraryFolders])
  const entries = useMemo(
    () => arrangeColumn(roots, sidebarOrder, shelves ?? NO_SHELVES),
    [roots, sidebarOrder, shelves],
  )
  const pageTree = usePageTreeValue({
    folders: libraryFolders,
    entries,
    onOrderChange: onSidebarOrderChange,
    groups: groupActions,
    activeId: activeLibraryId,
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
      <SidebarContent className="pt-2 pb-2" onContextMenu={openGroundMenu}>
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
            <NewPageButton
              onNewPage={newPage}
              onNewCollection={newCollection}
              onImport={() => { importPage() }}
            />
          </div>
          <PageTreeContext.Provider value={pageTree}>
          {inbox === null ? null : (
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarFolderRow
                  folder={inbox}
                  activeId={activeLibraryId}
                />
              </SidebarMenu>
            </SidebarGroupContent>
          )}
          <LibraryColumn
            entries={entries}
            onOrderChange={onSidebarOrderChange}
            activeId={activeLibraryId}
            groups={groupActions}
          />
          </PageTreeContext.Provider>
        </SidebarGroup>
      </SidebarContent>

      {/* The foot: one row of square icon buttons, collapse at the far
          right. Each is its own Tab stop; Ctrl/Cmd+K still opens search. */}
      <SidebarFoot
        currentPath={currentPath}
        isMobile={isMobile}
        onOpenSearch={onOpenSearch}
        onContextMenu={openGroundMenu}
      />

      {pageTree.leaving === null ? null : (
        <ConfirmDialog
          message={leaveFolderConfirm(
            /* Step 8: leaving any page leaves its project, so name that. */
            allFolders.find((f) => f.id === pageTree.leaving?.project_id)?.name ?? pageTree.leaving.name,
          )}
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
        onNewCollection={newCollection}
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

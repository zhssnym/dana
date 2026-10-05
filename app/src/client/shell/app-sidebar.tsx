/*
The sidebar: Focus lists, the Library (Desk, then shelves and page trees), and the
foot row. Tabs stay inside their project. Collapsed, it is hidden entirely.
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
  readonly sidebarOrder: readonly string[]
  readonly onSidebarOrderChange: (ids: readonly string[]) => void
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
  /* On a phone the drawer closes on the navigation it was opened to make. */
  const { isMobile, setOpenMobile, state } = useSidebar()
  /* Collapsed means out of the tab order and the accessibility tree too. */
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
      /* No transition: it would make the column lag the resize handle. */
      className="h-full shrink-0 border-r border-border bg-sidebar transition-none"
    >
      {/* The one scroll container. */}
      <SidebarContent className="pt-2 pb-2" onContextMenu={openGroundMenu}>
        {/* Each heading's "+" adds to its own group. */}
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

      {/* Each foot button is its own Tab stop. */}
      <SidebarFoot
        currentPath={currentPath}
        isMobile={isMobile}
        onOpenSearch={onOpenSearch}
        onContextMenu={openGroundMenu}
      />

      {pageTree.leaving === null ? null : (
        <ConfirmDialog
          message={leaveFolderConfirm(
            /* Leaving any page leaves its project, so name that. */
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

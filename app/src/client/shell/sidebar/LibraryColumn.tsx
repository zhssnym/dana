/* The Library's ordered column of collections and pages, and its drag. */
import { useEffect, useState } from 'react'
import { SidebarGroupContent, SidebarMenu } from '../../components/ui/sidebar.js'
import { paths } from '../../routes.js'
import { heldForTab, sidebarDragOver, sidebarDropAt, TAB_STRIP } from '../tab-drop.js'
/* The one drag engine, and the Library's answers to the two questions it asks
   about anything outside the list it is sorting. */
import { moved, swallowNextClick, useSortableList } from '../../lib/use-sortable-list.js'
import { DIRECTORY, grip, useLibraryZones } from '../library-drag.js'
import {
  encodeColumn,
  entryName,
  groupKey,
  labelOfKey,
  moveFolderTo,
} from '../library-order.js'
import type { DirectoryEntry } from '../library-order.js'
import type { FolderGroupActions } from '../folder-groups.js'
import { proposalIn } from './drop-line.js'
import { TREE_KEY, usePageTree } from './page-tree-context.js'
import { FolderGroupBlock } from './FolderGroupBlock.js'
import { SidebarFolderRow } from './SidebarFolderRow.js'

/**
 * The Library's one ordered column: shelves and loose folders in the viewer's
 * order. Dragging a row reorders it; resting inside a collection files it
 * there. Root-page dragging does not currently reparent nested pages; the
 * canonical parent relationship is shown here and edited through page acts.
 *
 * Holding one folder on another used to propose a new shelf of the two; the
 * middle of a row now means "inside this page", and one gesture cannot mean
 * both. A collection is made from the Library's "+".
 */
/** Where a Library row opens: its page, or its collection's. A label with
 * no collection behind it has no page, so it cannot become a tab. */
function entryPath(entry: DirectoryEntry): string | null {
  if (entry.kind === 'folder') return paths.folder(entry.folder.id)
  return entry.shelf === null ? null : paths.shelf(entry.shelf.id)
}

export function LibraryColumn({
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
      /* Out of the sidebar: the row comes loose, and opens as a tab if it is
         let go on the tab strip (`tab-drop.ts`). */
      if (sidebarDragOver(point, entry === undefined ? null : entryPath(entry)) !== null) {
        setDrop(null)
        pages.clearMark()
        return TAB_STRIP
      }
      if (entry === undefined || entry.kind === 'group') {
        setDrop(null)
        pages.clearMark()
        return null
      }
      /* Beside a root is the column's own reorder, below. */
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
      if (entry !== undefined && sidebarDropAt(point, entryPath(entry))) return true
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
          const state = heldForTab(outer.itemState(index), outer.overKey)
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

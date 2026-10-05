import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  useDeleteFolder,
  useLeaveFolder,
  useMoveFolder,
  useRenameFolder,
  useRestoreFolder,
} from '../../api/mutations.js'
import { useArchiveFolder, useRestoreArchivedFolder } from '../../api/archive.js'
import { pushUndo, undoLabel } from '../undo.js'
import { paths } from '../../routes.js'
import { pageRowAt } from '../library-drag.js'
import type { Point } from '../library-drag.js'
import {
  buildTree,
  isDescendant,
  isNoop,
  placeInOrder,
  resolveDrop,
} from '../page-tree.js'
import type { TreeDrop } from '../page-tree.js'
import { encodeColumn } from '../library-order.js'
import type { DirectoryEntry } from '../library-order.js'
import type { FolderGroupActions } from '../folder-groups.js'
import type { Folder } from '../../../shared/folders.js'
import { readPageFolds, writePageFolds } from './fold-storage.js'
import { pageRowLink } from './use-library-keys.js'
import { mayEditPage } from './page-tree-context.js'
import type { PageTreeValue } from './page-tree-context.js'
import { folderActionPath } from './folder-action.js'
import { useAddPageInside } from './use-add-page-inside.js'

function samePlace(a: TreeDrop['mark'] | null, b: TreeDrop['mark'] | null): boolean {
  return a === b || (a !== null && b !== null && a.rowId === b.rowId && a.kind === b.kind)
}

export function usePageTreeValue({
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
  const addPageInside = useAddPageInside()
  const remove = useDeleteFolder()
  const restore = useRestoreFolder()
  const archive = useArchiveFolder()
  const restoreArchived = useRestoreArchivedFolder()
  const leaveFolder = useLeaveFolder()
  const renameFolder = useRenameFolder()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Folder | null>(null)
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

  /* Unfold the open page's parents, once per page, so a later fold sticks. */
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (activeId === null || revealed.current === activeId || !tree.byId.has(activeId)) return
    revealed.current = activeId
    for (let at = tree.parent.get(activeId) ?? null; at !== null; at = tree.parent.get(at) ?? null) {
      setFold(at, false)
    }
  }, [activeId, tree, setFold])

  /* Replace, so Back does not land on a page that is gone. */
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
    /* The Desk is pinned first and never a parent (the server answers 422). */
    if (drop?.anchor !== undefined && (!allowRoot || onto?.is_default === true)) drop = null
    /* Tree drops only place roots: nested rows are not in the drag engine yet. */
    if (drop !== null && drop.parent !== null) drop = null
    if (drop !== null && isNoop(tree, carried.id, drop)) drop = null
    const next = drop?.mark ?? null
    setMark((current) => (samePlace(current, next) ? current : next))
    return drop
  }

  const commit = (carried: Folder, drop: TreeDrop): void => {
    setMark(null)
    if (drop.parent !== null) {
      /* Unfold the parent, so the page is seen landing. */
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
    /* A nested page becomes a root first. */
    if ((tree.parent.get(carried.id) ?? null) !== null) {
      move.mutate({ id: carried.id, body: { parent_folder_id: null } })
    }
    /* The root joins the collection of the root it lands beside. */
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
      addPageInside(parent.id, () => {
        setFold(parent.id, false)
      })
    },
    mayEdit: mayEditPage,
    renaming,
    startRename: setRenaming,
    rename: (folder, name) => {
      setRenaming(null)
      if (name !== null) renameFolder.mutate({ id: folder.id, body: { name } })
      /* The field unmounts with focus in it: hand focus back to the row,
         unless focus went somewhere else. */
      requestAnimationFrame(() => {
        const at = document.activeElement
        if (at === null || at === document.body) pageRowLink(document, folder.id)?.focus()
      })
    },
    trash: (folder) => {
      /* A shared page an owner deletes goes through the page's own delete. */
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
    archive: (folder) => {
      leaveIfShowing(folder.id)
      archive.mutateAsync(folder.id).then(
        () => pushUndo('Work archived', () => { restoreArchived.mutate(folder.id) }),
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

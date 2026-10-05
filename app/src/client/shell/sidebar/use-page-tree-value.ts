/* The page tree's state and acts, built once for the whole Library. */
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

  /* The page on screen is never hidden under a folded parent: a page made
     from its parent's own "…" opens with its row showing. Once per page
     opened, so folding the parent afterwards stays folded. */
  const revealed = useRef<string | null>(null)
  useEffect(() => {
    if (activeId === null || revealed.current === activeId || !tree.byId.has(activeId)) return
    revealed.current = activeId
    for (let at = tree.parent.get(activeId) ?? null; at !== null; at = tree.parent.get(at) ?? null) {
      setFold(at, false)
    }
  }, [activeId, tree, setFold])

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
    /* Tree drops are currently only used to resolve root placement. Nested
       pages are displayed here, but reparenting remains a separate act until
       nested rows themselves participate in the drag engine. */
    if (drop !== null && drop.parent !== null) drop = null
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

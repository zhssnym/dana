/*
 * Folder groups (spec 9.1): a group is a personal label and also a shelf. Deleting one clears labels; it never
 * deletes folders (AC-180). With a shelf, rename and delete are one request; a bare label is written once per
 * folder, in parallel.
 */
import { useMemo, useState } from 'react'

import {
  useDeleteShelf,
  usePatchShelf,
  useUpdateMyMembership,
} from '../api/mutations.js'
import { FolderGroupDialog } from '../components/index.js'
import { pushUndo } from './undo.js'
import { ConfirmDialog, useConfirm } from '../pages/task-rows.js'
import {
  folderGroupLabels,
  folderGroupOptions,
  folderIdsForNames,
} from '../parts/presenters.js'
import type { Folder } from '../../shared/folders.js'
import type { Shelf } from '../../shared/shelves.js'

/** 9.1, normative: the confirm a group deletion carries. */
export function deleteGroupConfirm(folderCount: number): string {
  /* Name the collection rather than a pronoun, and agree with a shelf holding one page. */
  return folderCount === 1
    ? 'Delete collection? 1 page keeps its tasks and leaves the collection.'
    : `Delete collection? ${String(folderCount)} pages keep their tasks and leave the collection.`
}

export interface FolderGroupActions {
  readonly labels: readonly string[]
  /** "Move to group"; null is the ungrouped list. */
  readonly onMoveToGroup: (folder: Folder, label: string | null) => void
  readonly onRenameGroup: (label: string) => void
  readonly onDeleteGroup: (label: string) => void
}

type GroupDialog = { readonly mode: 'rename'; readonly label: string }

/** Returned as a pair, because a dialog mounted inside a row would unmount on its own write's refetch. */
export function useFolderGroupActions(
  folders: readonly Folder[],
  /** A label these do not name is a bare one. */
  shelves: readonly Shelf[] = [],
): {
  readonly actions: FolderGroupActions
  readonly dialogs: React.JSX.Element
} {
  const relabel = useUpdateMyMembership()
  const patchShelf = usePatchShelf()
  const removeShelf = useDeleteShelf()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<GroupDialog | null>(null)

  const labels = useMemo(() => folderGroupLabels(folders, shelves), [folders, shelves])

  function inGroup(label: string): readonly Folder[] {
    return folders.filter((folder) => folder.my_shelf === label)
  }

  /* A shelf's name and its folders' memberships are kept in step, so the name is the join key. */
  function shelfNamed(label: string): Shelf | undefined {
    return shelves.find((shelf) => shelf.name === label)
  }

  function writeLabel(ids: readonly string[], label: string | null): void {
    for (const id of ids) {
      relabel.mutate({ id, body: { shelf: label } })
    }
  }

  const actions: FolderGroupActions = {
    labels,
    onMoveToGroup: (folder, label) => {
      /* The sidebar's move has the undo bar, like the folder page's. */
      const previous = folder.my_shelf
      if (previous === label) return
      relabel.mutate(
        { id: folder.id, body: { shelf: label } },
        {
          onSuccess: () => {
            pushUndo(
              label === null
                ? `Took "${folder.name}" out of ${previous ?? 'its collection'}`
                : `Moved "${folder.name}" to ${label}`,
              () => {
                relabel.mutate({ id: folder.id, body: { shelf: previous } })
              },
            )
          },
        },
      )
    },
    onRenameGroup: (label) => {
      setDialog({ mode: 'rename', label })
    },
    onDeleteGroup: (label) => {
      const targets = inGroup(label)
      const shelf = shelfNamed(label)
      confirm.ask(deleteGroupConfirm(targets.length), () => {
        /*
         * With a shelf, one request: the server drops it and clears the matching labels. A bare label takes the
         * loop.
         */
        if (shelf !== undefined) removeShelf.mutate(shelf.id)
        else
          writeLabel(
            targets.map((folder) => folder.id),
            null,
          )
      })
    },
  }

  /* Memoised: the dialog resets its fields when these change identity. */
  const subject = useMemo(
    () => (dialog === null ? [] : folders.filter((folder) => folder.my_shelf === dialog.label)),
    [dialog, folders],
  )
  const options = useMemo(() => folderGroupOptions(subject), [subject])

  const dialogs = (
    <>
      <FolderGroupDialog
        open={dialog !== null}
        currentLabel={dialog?.label}
        folders={options}
        existingLabels={labels}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onSubmit={(label, folderNames) => {
          // Names to ids: the dialog is keyed by display name, and names are not unique.
          const ids = folderIdsForNames(folderNames, subject)

          if (dialog === null) return
          const shelf = shelfNamed(dialog.label)
          /* With a shelf, one request: the patch rewrites every matching label. */
          if (shelf !== undefined) patchShelf.mutate({ id: shelf.id, body: { name: label } })
          else writeLabel(ids, label)
        }}
      />
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </>
  )

  return { actions, dialogs }
}

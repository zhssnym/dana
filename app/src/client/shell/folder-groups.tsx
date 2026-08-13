/*
9.1's folder groups: the four operations, their dialogs, and the writes behind
them, held in one place because they are one subject.

"A group is the label of 7.4's my-membership and nothing else, so creating one
is naming it on a folder, and deleting one clears that label from every folder
carrying it." Every operation below is therefore PATCH
/folders/:id/my-membership and nothing else: no endpoint creates a group, none
deletes one, and a client that reached for DELETE /folders on "Delete group"
would destroy tasks for every member of every folder in it. AC-180 asserts the
survival of the folders and their tasks through section 7 for exactly that
reason.

**Where each control lives is 9.1's, not this file's.** That section puts the
move on the folder's own menu ("a folder is moved between groups from its own
menu") and names the four actions "New folder group", "Rename group", "Delete
group" and "Move to group". Creating is an action on a folder because a group
is that folder's label, so "New folder group" sits in the folder row's menu
beside the move; renaming and deleting act on the group, so they sit in the
group's own menu, which is reached inside the region that names it. That is
what AC-180's four cases address and it is what the designer's prototype draws,
except that his "New folder group" is in a folder-directory menu his sidebar
carries and ours does not: R5 declined that menu because its other entry was a
second "New folder" inside one region, and 9.1's addressing sentence does not
admit two controls of one name there.

**Rename and delete write once per folder in the group**, which is what "every
folder carrying it" means, and each write is the ordinary hook from
`api/mutations.ts`. They are fired together rather than chained: 8.3 invalidates
after each own mutation, so a chain would refetch the whole chrome once per
folder, and no ordering between them exists to preserve.

**The delete confirm is 9.1's sentence and the shared `ConfirmDialog`**, which
carries that section's uniform "Continue" and "Cancel". The designer's
prototype splits the same warning across a dialog title and a description and
rewords the second half; 9.6's restatement of the same rule for its own three
confirms is the reason this one is a single run: what a person is owed is the
consequence in the words the specification chose.
*/
import { useMemo, useState } from 'react'

import { useUpdateMyMembership } from '../api/mutations.js'
import { FolderGroupDialog } from '../components/index.js'
import { ConfirmDialog, useConfirm } from '../pages/task-rows.js'
import {
  folderGroupLabels,
  folderGroupOptions,
  folderIdsForNames,
} from '../parts/presenters.js'
import type { Folder } from '../../shared/folders.js'

/** 9.1, normative: the confirm a group deletion carries. */
export function deleteGroupConfirm(folderCount: number): string {
  return (
    `Delete folder group? ${String(folderCount)} folders keep their tasks and ` +
    'move to the ungrouped list.'
  )
}

/** What the sidebar needs to offer 9.1's four operations on its rows. */
export interface FolderGroupActions {
  /** Every label in use, which is what the move submenu offers. */
  readonly labels: readonly string[]
  /** "New folder group", from the folder whose label the new group will be. */
  readonly onNewGroup: (folder: Folder) => void
  /** "Move to group", null being the ungrouped list rather than a group. */
  readonly onMoveToGroup: (folder: Folder, label: string | null) => void
  readonly onRenameGroup: (label: string) => void
  readonly onDeleteGroup: (label: string) => void
}

/** Which dialog the sidebar has asked for, and about what. */
type GroupDialog =
  | { readonly mode: 'create'; readonly folder: Folder }
  | { readonly mode: 'rename'; readonly label: string }

/**
 * The four operations plus the surfaces they open.
 *
 * Returned as a pair rather than rendered here, because the actions belong to
 * rows the sidebar draws and the dialogs belong to the shell: a dialog mounted
 * inside a row would be unmounted by the refetch its own write causes.
 */
export function useFolderGroupActions(folders: readonly Folder[]): {
  readonly actions: FolderGroupActions
  readonly dialogs: React.JSX.Element
} {
  const relabel = useUpdateMyMembership()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<GroupDialog | null>(null)

  const labels = useMemo(() => folderGroupLabels(folders), [folders])

  function inGroup(label: string): readonly Folder[] {
    return folders.filter((folder) => folder.my_label === label)
  }

  function writeLabel(ids: readonly string[], label: string | null): void {
    for (const id of ids) {
      relabel.mutate({ id, body: { label } })
    }
  }

  const actions: FolderGroupActions = {
    labels,
    onNewGroup: (folder) => {
      setDialog({ mode: 'create', folder })
    },
    onMoveToGroup: (folder, label) => {
      writeLabel([folder.id], label)
    },
    onRenameGroup: (label) => {
      setDialog({ mode: 'rename', label })
    },
    onDeleteGroup: (label) => {
      const targets = inGroup(label)
      confirm.ask(deleteGroupConfirm(targets.length), () => {
        writeLabel(
          targets.map((folder) => folder.id),
          null,
        )
      })
    },
  }

  /*
  The folders the open dialog is about, and the two derived props beside it.

  All three are memoised because the dialog resets its own fields whenever any
  of them changes identity, and a fresh array on every render of the shell
  would clear a half-typed group name the next time any chrome query settled.
  Create offers every folder a group may hold; rename offers the group's own.
  Inbox is excluded from the first because 9.1 pins it above the groups and
  never inside one, so a label written onto it is a membership the sidebar
  cannot render, and offering a choice that does nothing is worse than not
  offering it.
  */
  const subject = useMemo(() => {
    if (dialog === null) return []
    return dialog.mode === 'create'
      ? folders.filter((folder) => !folder.is_default)
      : folders.filter((folder) => folder.my_label === dialog.label)
  }, [dialog, folders])
  const options = useMemo(() => folderGroupOptions(subject), [subject])
  // The folder whose menu opened the dialog is the group's first member, which
  // is 9.1's "creating one is naming it on a folder" read literally: the
  // action was taken on that folder and it is what the label is written to.
  // Others may be added in the same dialog.
  const preselected = useMemo(
    () => (dialog?.mode === 'create' ? [dialog.folder.name] : undefined),
    [dialog],
  )

  const dialogs = (
    <>
      <FolderGroupDialog
        open={dialog !== null}
        mode={dialog?.mode ?? 'create'}
        currentLabel={dialog?.mode === 'rename' ? dialog.label : undefined}
        folders={options}
        preselected={preselected}
        existingLabels={labels}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
        onSubmit={(label, folderNames) => {
          // Names to ids through R4's presenter, which is the one place this
          // client knows that his dialog is keyed by a display name and 7.4 is
          // keyed by an id, and that folder names are not unique.
          writeLabel(folderIdsForNames(folderNames, subject), label)
        }}
      />
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </>
  )

  return { actions, dialogs }
}

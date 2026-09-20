/*
9.1's folder groups: the four operations, their dialogs, and the writes behind
them, held in one place because they are one subject.

"A group is the label of 7.4's my-membership and nothing else, so creating one
is naming it on a folder, and deleting one clears that label from every folder
carrying it." A client that reached for DELETE /folders on "Delete group" would
destroy tasks for every member of every folder in it, and AC-180 (no test since the 2026-09-20 cut)
names the survival of the folders and their tasks through section 7 for exactly that
reason.

**A group is a shelf as well, since S17b, and that is what this file changed.**
The sentence above was the whole model until 7.16 landed, and it left this
client with two disjoint worlds: a group made here wrote `folder_members.shelf_name`
and no `shelves` row, so it had no page, no mark and none of the object
contract's acts; a shelf made through 7.16 wrote a row and labelled nothing, so
the Library could not see it. Two ways to make the same thing, each missing
what the other had. 9.1 names one thing, "the Library holds the viewer's
shelves and folders as one ordered list", and 4.18 is what lets them be one:
a shelf's membership *is* that label, and the server holds the shelf's name and
its folders' labels in step inside one transaction.

So the operations now run through 7.16 where a shelf exists, and the shape of
each follows from which side of 4.18 owns the write:

- **Creating** writes the shelf row first and the labels after it, because the
  name has to exist as a shelf before it means anything as a label. A name
  already taken is not an error here: the shelf is already there and the labels
  are all that is owed.
- **Renaming and deleting are one request each, not one per folder**, and that
  is the real simplification. `PATCH /shelves/:id { name }` rewrites every
  matching label itself, and `DELETE /shelves/:id` clears them, both in the
  transaction that moves the shelf. The paragraph this replaces described
  firing one membership write per folder and accepting the refetch storm; that
  is now the fallback for a bare label rather than the path.
- **A label no shelf row names keeps the old behaviour exactly.** Accounts
  labelled before 7.16 existed carry those, and they rename and delete through
  the membership writes they always did.

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

**Where a bare label is renamed or deleted, the write is once per folder**,
which is what "every folder carrying it" means, and each write is the ordinary
hook from `api/mutations.ts`. They are fired together rather than chained: 8.3
invalidates after each own mutation, so a chain would refetch the whole chrome
once per folder, and no ordering between them exists to preserve.

**The delete confirm is 9.1's sentence and the shared `ConfirmDialog`**, which
carries that section's uniform "Continue" and "Cancel". The designer's
prototype splits the same warning across a dialog title and a description and
rewords the second half; 9.6's restatement of the same rule for its own three
confirms is the reason this one is a single run: what a person is owed is the
consequence in the words the specification chose.
*/
import { useMemo, useState } from 'react'

import {
  useCreateShelf,
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
  /* polish: sidebar F5 and shelves F1, one sentence found twice. The one
     word is shelf, and what "folders keep their tasks" means to a person is
     that they come off the shelf and stay; the shell fixer's ending was "come
     off it", and the pages fixer's names the shelf rather than leaning on a
     pronoun, which is the same finding's own rule. Its count agrees with a
     shelf holding one folder. */
  return (
    `Delete shelf? ${String(folderCount)} folder${folderCount === 1 ? '' : 's'} keep ` +
    'their tasks and come off the shelf.'
  )
}

/** What the sidebar needs to offer 9.1's four operations on its rows. */
export interface FolderGroupActions {
  /** Every label in use, which is what the move submenu offers. */
  readonly labels: readonly string[]
  /** "New folder group", from the folder whose label the new group will be. */
  readonly onNewGroup: (folder: Folder) => void
  /**
   * 9.1's footer act, from no folder at all.
   *
   * The same dialog through a third door, which is `onGroupFolders`' own
   * argument: everything about making a shelf, the name, the validation, the
   * folders to put on it, stays one surface. What arrives ticked is nothing,
   * because the act was taken on nothing.
   */
  readonly onNewShelf: () => void
  /**
   * The same dialog, opened by DES-171's hold with a pair already ticked.
   *
   * "The naming panel is the one that already existed": the hold hands its
   * pair to this dialog rather than inventing a surface, so everything about
   * making a group, the name, the validation, adding a third folder before
   * committing, stays one surface reached through a second door (DES-154).
   * `onNewGroup` is the same act with one folder, and both land here.
   */
  readonly onGroupFolders: (folders: readonly Folder[]) => void
  /** "Move to group", null being the ungrouped list rather than a group. */
  /**
   * "Add folder to {shelf}", the prototype's own control on a shelf heading.
   *
   * **Restored at S24 and it had been dropped on purpose**, which is why this
   * comment exists rather than a line of wiring. P8R's ruling was that a
   * control no numbered section names is either given the designer's string or
   * dropped, and it took the third option for this one and for "Add task to
   * {folder}" beside it. Change control item 37 overturns the premise: Dana
   * 2.0 is the exact `prototype-v2`, so a control the prototype draws in the
   * shell is part of the shell rather than an affordance awaiting a section.
   * Imran restated it at S24 in his own words, "the shell must be exactly as
   * prototype v2 in Dana 2.0".
   *
   * It opens 9.1's New-folder dialog with the shelf already named, so the
   * folder is created and filed in one act rather than made loose and then
   * moved. One surface for making a folder, three doors to it, which is
   * `onGroupFolders`' own argument one entry up.
   */
  readonly onAddFolderTo: (label: string) => void
  readonly onMoveToGroup: (folder: Folder, label: string | null) => void
  readonly onRenameGroup: (label: string) => void
  readonly onDeleteGroup: (label: string) => void
}

/** Which dialog the sidebar has asked for, and about what. */
type GroupDialog =
  | { readonly mode: 'create'; readonly folders: readonly Folder[] }
  | { readonly mode: 'rename'; readonly label: string }

/**
 * The four operations plus the surfaces they open.
 *
 * Returned as a pair rather than rendered here, because the actions belong to
 * rows the sidebar draws and the dialogs belong to the shell: a dialog mounted
 * inside a row would be unmounted by the refetch its own write causes.
 */
export function useFolderGroupActions(
  folders: readonly Folder[],
  /** The viewer's shelves (7.16); a label these do not name is a bare one. */
  shelves: readonly Shelf[] = [],
  /**
   * How to open 9.1's New-folder dialog with a shelf already named.
   *
   * Passed in rather than held here, because that dialog is the shell's: it is
   * mounted outside every row for the reason this file's own return records, a
   * dialog inside a row being unmounted by the refetch its own write causes.
   */
  openNewFolderIn: (label: string) => void = () => {},
): {
  readonly actions: FolderGroupActions
  readonly dialogs: React.JSX.Element
} {
  const relabel = useUpdateMyMembership()
  const createShelf = useCreateShelf()
  const patchShelf = usePatchShelf()
  const removeShelf = useDeleteShelf()
  const confirm = useConfirm()
  const [dialog, setDialog] = useState<GroupDialog | null>(null)

  const labels = useMemo(() => folderGroupLabels(folders, shelves), [folders, shelves])

  function inGroup(label: string): readonly Folder[] {
    return folders.filter((folder) => folder.my_shelf === label)
  }

  /* 4.18 holds a shelf's name and its folders' memberships in step, so the
     name is the join key. Undefined for a membership written before 7.16
     existed. The wire field is `shelf` since issue #226; the local variables
     here still read `label` because they are this component's own word for
     the string a person typed. */
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
    onNewGroup: (folder) => {
      setDialog({ mode: 'create', folders: [folder] })
    },
    onGroupFolders: (pair) => {
      setDialog({ mode: 'create', folders: pair })
    },
    onNewShelf: () => {
      setDialog({ mode: 'create', folders: [] })
    },
    onAddFolderTo: (label) => {
      openNewFolderIn(label)
    },
    onMoveToGroup: (folder, label) => {
      /* polish: shelves F6. The sidebar's move has the undo bar like the
         folder page's: a way back that is not three presses in reverse. */
      const previous = folder.my_shelf
      if (previous === label) return
      relabel.mutate(
        { id: folder.id, body: { shelf: label } },
        {
          onSuccess: () => {
            pushUndo(
              label === null
                ? `Took "${folder.name}" off ${previous ?? 'its shelf'}`
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
        /* One request where a shelf exists: 7.16's delete drops the row, its
           page, and the viewer's matching labels in one transaction, so the
           folders survive by the server's rule rather than by this client
           remembering to null each one. The membership loop is what a bare
           label still takes, and 9.1's confirm is unchanged either way. */
        if (shelf !== undefined) removeShelf.mutate(shelf.id)
        else
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
      : folders.filter((folder) => folder.my_shelf === dialog.label)
  }, [dialog, folders])
  const options = useMemo(() => folderGroupOptions(subject), [subject])
  // The folders the act was taken on arrive ticked, which is 9.1's "creating
  // one is naming it on a folder" read literally: the label is written to
  // what the action was taken on. That is one folder from a row's menu and
  // two from DES-171's hold, and others may be added in the same dialog.
  const preselected = useMemo(
    () =>
      dialog?.mode === 'create' ? dialog.folders.map((folder) => folder.name) : undefined,
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
          const ids = folderIdsForNames(folderNames, subject)

          if (dialog?.mode === 'rename') {
            const shelf = shelfNamed(dialog.label)
            /* One request where a shelf exists: 7.16's patch rewrites every
               matching label in the transaction that renames the row, which
               is 4.18's "held in step" being the server's job rather than
               this client's. The rename dialog checks the whole group, so
               what the server relabels and what the dialog offered are the
               same set. */
            if (shelf !== undefined) patchShelf.mutate({ id: shelf.id, body: { name: label } })
            else writeLabel(ids, label)
            return
          }

          /* Creating: the shelf row first, the labels after it, because the
             name has to exist as a shelf before it means anything as a label.
             A name already taken answers a refusal rather than an error worth
             raising: the shelf is already there, and what the person asked for
             is the folders on it, which the labels below do. */
          createShelf.mutate(
            { name: label },
            {
              onSettled: () => {
                if (ids.length > 0) writeLabel(ids, label)
              },
            },
          )
        }}
      />
      <ConfirmDialog pending={confirm.pending} onClose={confirm.close} />
    </>
  )

  return { actions, dialogs }
}

/*
Editing an existing task, as one hook, wherever the card is drawn.

polish: taskcard F3 (2026-08-30). `task-surface-host.tsx` held the whole of
what it takes to edit a task, the detail read, the thread beside it, the
comment writes, 9.5's un-complete confirmation, and the write path through
`tasks/task-writer.tsx`, and it held them for the dialog and the panel alone.
`/app/tasks/:id`, the task's own address and the "Tab" of 9.3's three homes,
drew a read-only sheet with an "Open editor" button that popped the dialog
over it, so choosing Tab in Settings gave a third, weaker card rather than
the card in a tab.

This hook is that editing, lifted out so the page can be the editor. The host
still owns the create path, which is a draft with no id and belongs to the
surface that opens over a page; a task with an address already exists. Both
consumers hand the same `ConceptTask` to the same `TaskSurface` composition,
which is DES-117's one-artifact promise kept rather than restated.

Everything below is the host's own code moved, comments included, so the
reasoning stays where the reader finds the mechanism.
*/

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  useDeleteComment,
  usePatchComment,
  usePostComment,
  useSetCommentLike,
} from '../api/mutations.js'
import { useConnections, useFolders, useMe, useTask, useThread } from '../api/queries.js'
import { uploadFile } from '../api/http.js'
import { folderGates } from '../lib/folder-authority.js'
import { applyThreadChange, commentFileKind, threadAttachments, toConceptComments } from '../lib/thread.js'
import { useTimeFormat } from '../lib/time-format.js'
import { presenterToday } from '../parts/presenters.js'
import { toConceptTask } from '../tasks/task-concept.js'
import type { ConceptTask } from '../tasks/task-model.js'
import { useApiTaskPatch } from '../tasks/task-writer.js'
import { UNCOMPLETE_SERIES_CONFIRM } from './task-copy.js'
import { ConfirmDialog } from './ui/ConfirmDialog.js'
import type { TaskRowProps } from './task-row.js'
import type { TaskDetail } from '../../shared/tasks.js'

/** A `ConceptTask` as `TaskSurface` takes one: the row's flat props, with the
    whole concept riding `detail` so nothing about it has to be flattened. */
export function surfaceTask(
  id: string,
  task: ConceptTask,
): TaskRowProps & { id: string } {
  return {
    id,
    title: task.title,
    ...(task.folder === undefined ? {} : { folder: task.folder }),
    ...(task.due === undefined ? {} : { due: task.due }),
    status: task.abandoned ? 'abandoned' : task.done ? 'completed' : 'pending',
    ...(task.important === undefined ? {} : { important: task.important }),
    /* Both of #169's empties are "no chip": `TaskRowProps['assignee']` carries
       a person or nothing, null being a patch's word and never a row's. */
    ...(task.assignee === undefined || task.assignee === null
      ? {}
      : { assignee: task.assignee }),
    ...(task.pulled === undefined ? {} : { pulled: task.pulled }),
    detail: task,
  }
}

export interface TaskEditing {
  /** 7.6's detail, undefined until it has been read. */
  readonly detail: TaskDetail | undefined
  /** Whether the read failed or is still on its way, for the page's states. */
  readonly query: ReturnType<typeof useTask>
  /** The task as the card reads it, with its conversation, or null until read. */
  readonly concept: ConceptTask | null
  /** The one write path out of the card for this task. */
  readonly write: (taskId: string, fields: Partial<ConceptTask>) => void
  /** 9.5's confirmation when it is owed, mounted by the consumer. */
  readonly confirm: ReactNode
}

export function useTaskEditing(editing: string | null): TaskEditing {
  const me = useMe()
  const folders = useFolders()
  const clock = useTimeFormat()
  const patch = useApiTaskPatch()
  const task = useTask(editing)

  /*
  **Seam, S23: 9.5's confirmation, on the surface that has no screen behind
  it.**

  9.3 gives the card's completion control 9.5's rule "unchanged": an
  un-complete that takes a G-SERIES successor confirms first, because 5.1
  deletes that successor in the same transaction and the parenthesis is the
  part the person cannot see, "any edits already made to the next occurrence
  go with it". A row gets this from its page, which is where the confirm has
  lived since P8; a surface has no page behind it, so it is here, in the one
  component that owns the surface's write.

  Only on the branch that has one: a task with no rule generates no
  successor, so there is nothing to warn about and a confirmation with an
  empty consequence is the dead control DES-144 removes.
  */
  const [uncompleting, setUncompleting] = useState<(() => void) | null>(null)

  /*
  **S26: the thread inside a task, which had no mount at all.**

  Ledger L-246 and L-258, and the owner's own list from the 2026-08-26 review.
  9.3 puts Comments on the card after the content blocks and applies 9.6's
  rules to them (L-158), `components/task-card.tsx` has drawn the disclosure
  since S23, and the server has answered `?task=` since S5. What was missing
  was one query and one write path, and this is the only component that holds
  both a task's identity and its folder's.
  */
  const threadFolderId = task.data?.folder.id ?? null
  const thread = useThread(
    threadFolderId ?? '',
    editing,
    threadFolderId !== null && editing !== null,
  )
  const connections = useConnections()
  const postComment = usePostComment()
  const patchComment = usePatchComment()
  const deleteComment = useDeleteComment()
  const setLike = useSetCommentLike()

  /* Who an author is, off the roster the People screen and the sharing panel
     already read; an id this client cannot resolve says "Someone" rather than
     being shown.
     polish round-2: the picture rides with the name, as it does on the folder
     page's own copy of this directory. 7.14 carries an author's id alone, so
     this map is the only route an avatar has onto a comment, and both reads
     behind it carry `avatar_url`. */
  const authorPeople = useMemo(() => {
    const people = new Map<string, { name: string; image?: string }>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) {
      people.set(viewer.id, {
        name: viewer.display_name,
        ...(viewer.avatar_url === null ? {} : { image: viewer.avatar_url }),
      })
    }
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name === null || people.has(connection.user.id)) continue
      const image = connection.user.avatar_url
      people.set(connection.user.id, { name, ...(image === null ? {} : { image }) })
    }
    return people
  }, [connections.data, me.data?.user])

  /* The thread's own folder row, which `GET /folders` already answered for
     every page in this client, read through the same gate the sidebar's
     folder row and the folder page use. Everything false while the library
     is loading or the folder is not in it, which offers nothing rather than
     guessing — the direction every other gate in this client takes. */
  const threadFolder = folders.data?.find((row) => row.id === threadFolderId)
  const mayConverse = useMemo(() => {
    if (threadFolder === undefined) {
      return { moderate: false, mutateOwnComment: false, likeComment: false }
    }
    const gates = folderGates({
      access: threadFolder.my_access,
      isOwner: threadFolder.is_owner,
      isDefault: threadFolder.is_default,
    })
    return {
      moderate: gates.moderate,
      mutateOwnComment: gates.mutateOwnComment,
      likeComment: gates.likeComment,
    }
  }, [threadFolder])

  const conversation = useMemo(
    () =>
      toConceptComments(
        thread.data?.comments ?? [],
        me.data?.user.id ?? null,
        (authorId) => authorPeople.get(authorId) ?? { name: 'Someone' },
        Date.now(),
        /*
        What this viewer's Access lets the thread offer.

        **It was one boolean off `is_owner` on the same library row until
        2026-09-20 (issue #268)**, and that had been false since #228's R8A
        landed — moderation is `comment.moderate`, Full control's, which
        custody neither confers nor implies, and an author's own edit and
        delete are `comment.mutate.own`, which authorship alone does not
        confer either. `my_access` rides the same row (Hassan's Ruling 4 of
        2026-09-20), so the correct gates cost the same lookup and go through
        `lib/folder-authority.ts`, the table the routes themselves resolve
        against, rather than through a second ladder here (AC-790).
        */
        mayConverse,
      ),
    [thread.data?.comments, me.data?.user.id, authorPeople, mayConverse],
  )

  const rows = folders.data
  const concept: ConceptTask | null =
    task.data === undefined || rows === undefined
      ? null
      : /* S26: the conversation rides the concept, which is where
           `components/task-card.tsx` reads it (9.3's Comments block). */
        {
          ...toConceptTask(task.data, { today: presenterToday(), folders: rows, clock }),
          comments: conversation,
          /* Item 58 (D): the Attachments block is the conversation's files,
             which is the only place 4.16 lets a task's file live. */
          attachments: threadAttachments(conversation),
        }

  function write(_taskId: string, fields: Partial<ConceptTask>): void {
    if (editing === null) return
    /*
    **S26's seam: the conversation is 7.14's and never 7.6's.**

    `writtenElsewhere` has carried `comments` since S22 precisely so that a
    thread change never rides a task PATCH; what it had nowhere to go to is
    what this answers. `lib/thread.ts` turns the array the lifted thread wants
    into the routes that would produce it, and the folder is the task's own,
    which is also where 7.15 scopes an attachment.
    */
    if (fields.comments !== undefined) {
      const folderId = threadFolderId
      if (folderId === null) return
      applyThreadChange(conversation, fields.comments, {
        post: (body) => {
          postComment.mutate({ folderId, body, taskId: editing })
        },
        edit: (commentId, body) => {
          patchComment.mutate({ id: commentId, body: { body } })
        },
        remove: (commentId) => {
          deleteComment.mutate(commentId)
        },
        like: (commentId, liked) => {
          setLike.mutate({ id: commentId, liked })
        },
        upload: (file) =>
          uploadFile(commentFileKind(file), folderId, file).then((stored) => stored.id),
      })
      return
    }
    /*
    The block's picker, item 58 (D): a file added under Attachments is a
    comment carrying that file and nothing said, because that is the one
    way 4.15 lets a file hang on a task. The same two calls the composer
    makes, 7.15 then 7.14, and the refetch draws it in both places.
    */
    if (fields.attachments !== undefined) {
      const folderId = threadFolderId
      if (folderId === null) return
      const taskId = editing
      for (const added of fields.attachments) {
        if (added.file === undefined) continue
        void uploadFile(commentFileKind(added.file), folderId, added.file).then((stored) => {
          postComment.mutate({ folderId, body: { file_id: stored.id }, taskId })
        })
      }
      return
    }
    /*
    **The condition is not "does it repeat", which is the reading that cost
    this row two runs.** Completing a rule-carrying task moves the rule to
    the successor, so the completed occurrence carries a `series_id` and no
    rule at all: a client asking whether the task repeats gets "no" from the
    one row where the confirm is owed. That is written down already, in
    `pages/DonePage.tsx`, and recorded as a reading in `src/client/README.md`
    with its own escalation. One condition, two surfaces, and this is the
    second.
    */
    const takesSuccessor =
      fields.done === false &&
      task.data?.series_id != null &&
      task.data.recurrence_rule === null
    if (takesSuccessor) {
      const id = editing
      setUncompleting(() => () => {
        patch(id, fields)
      })
      return
    }
    patch(editing, fields)
  }

  const confirm =
    uncompleting === null ? null : (
      <ConfirmDialog
        message={UNCOMPLETE_SERIES_CONFIRM}
        onContinue={() => {
          const run = uncompleting
          setUncompleting(null)
          run()
        }}
        onCancel={() => setUncompleting(null)}
      />
    )

  return { detail: task.data, query: task, concept, write, confirm }
}

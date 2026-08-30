/*
The one place a task surface is opened, and what replaces the task form.

9.3's v2 opens "There is no task form. A task is its row, its card, and its
page." So `components/task-form/**` retires whole at S23 and this is what the
layout mounts in its place: `components/task-surface.tsx`'s `TaskSurface`,
over this client's query layer, opened by the same two buses the form was
opened by.

**The buses do not move, and that is deliberate.** `shell/overlays.ts`'s
`openTaskForm(defaults)` carries 9.3's entry-point defaults, which are the
chrome's because that table keys them by where the person clicked, and
`openTask(id)` carries a task, which a row, a calendar cell and a search
result all raise. Both are subscribable modules rather than contexts, "so a
control anywhere in the chrome can raise one without the two being in the same
tree". Nothing about that changed when the surface behind them did, so the
callers are untouched by this row: the calendar, the search overlay and every
page still call what they called.

**Where a task opens is the person's**, 9.3: "Where a task opens (dialog,
panel, or tab) is a client-side preference; a row offers the choice and
remembers it." `lib/task-surface-preference.ts` is the record and the seam
onto 4.19's `task_open` column.

**The create path holds a draft and the edit path does not, which is not two
artifacts.** 9.3's "no Save control and no draft state" is about what a person
does: there is no button, and a task exists the moment it is named. But a
value cannot be written to a row that does not exist yet, and frozen 7.6
requires a title of 1 to 300 to make one. So a capture opens over a local
`ConceptTask` seeded from the entry defaults, every chip answered before the
title rides the create body, and the first non-empty title commit is the
`POST`. From that moment the surface is on the created id and every further
edit goes through `lib/task-writer.tsx` like any other. This is the
arrangement the retired chip strip already used and stated: "on a creation
there is no row to write to, so the value goes into the form's own state and
rides the create body. Both paths set the same form state, so the strip and
the fields below it never disagree about what the surface holds."

**Nothing renders until the surface can be drawn correctly**, which is the
retired overlay's rule and its reason survives whole: 9.3's entry-point table
names the default folder, which is a read, and an edit pre-fills from
`TaskDetail`, which is another. "A form that rendered first and filled itself
afterwards would show an empty folder and an empty title for as long as the
request took, which is a form whose first observable state is wrong; the
chrome already holds the folder list on every page, so the wait is a cache hit
in practice."

**9.5's upcoming banner keeps its one path.** A ghost opens the series' current
occurrence, which shows a date the person did not click, so the banner belongs
on that path and on no other: "a client showing the banner for every repeating
task passes AC-098 as written and tells the person something false every time
they open a repeat from its own day."
*/

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import {
  useCreateTask,
  useDeleteComment,
  usePatchComment,
  usePostComment,
  useSetCommentLike,
} from '../api/mutations.js'
import { useConnections, useFolders, useMe, useTask, useThread } from '../api/queries.js'
import { uploadFile } from '../api/http.js'
import { applyThreadChange, commentFileKind, threadAttachments, toConceptComments } from '../lib/thread.js'
import { useTimeFormat } from '../lib/time-format.js'
import { presenterToday } from '../parts/presenters.js'
import { conceptPatchToBody, toConceptTask } from '../lib/task-concept.js'
import type { ConceptTask } from '../lib/task-model.js'
import { TaskWriter, useApiTaskPatch } from '../lib/task-writer.js'
import {
  useTaskSurfacePreference,
  setTaskSurfacePreference,
} from '../lib/task-surface-preference.js'
import { onOpenTaskForm } from '../shell/overlays.js'
import type { TaskFormDefaults } from '../shell/overlays.js'
import { onOpenTask } from './task-open.js'
import { UNCOMPLETE_SERIES_CONFIRM, UPCOMING_OCCURRENCE } from './task-copy.js'
import { ConfirmDialog } from './ui/ConfirmDialog.js'
import { TaskSurface, type TaskSurfaceMode } from './task-surface.js'
import type { TaskRowProps } from './task-row.js'

interface OpenState {
  /** Bumped on every open, so the surface remounts with fresh state. */
  readonly seq: number
  readonly taskId: string | null
  readonly defaults: TaskFormDefaults
  readonly upcoming: boolean
}

/** A `ConceptTask` as `TaskSurface` takes one: the row's flat props, with the
    whole concept riding `detail` so nothing about it has to be flattened. */
function surfaceTask(
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
    ...(task.assignee === undefined ? {} : { assignee: task.assignee }),
    ...(task.pulled === undefined ? {} : { pulled: task.pulled }),
    detail: task,
  }
}

export function TaskSurfaceHost(): React.JSX.Element | null {
  const [open, setOpen] = useState<OpenState | null>(null)
  /* A counter rather than state, so subscribing happens once: a listener set
     that resubscribed on every open would drop the open that caused it. */
  const seq = useRef(0)
  /* The draft a capture holds until its title exists. Cleared on every open,
     which the `seq` key below makes a remount rather than a reset. */
  const [draft, setDraft] = useState<ConceptTask | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const making = useRef(false)
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

  const preference = useTaskSurfacePreference()
  const [mode, setMode] = useState<TaskSurfaceMode | null>(null)
  const navigate = useNavigate()

  const me = useMe()
  const folders = useFolders()
  const clock = useTimeFormat()
  const create = useCreateTask()
  const patch = useApiTaskPatch()

  const editing = open?.taskId ?? created
  const task = useTask(editing)

  /*
  **S26: the thread inside a task, which had no mount at all.**

  Ledger L-246 and L-258, and the owner's own list from the 2026-08-26 review.
  9.3 puts Comments on the card after the content blocks and applies 9.6's
  rules to them (L-158), `components/task-card.tsx` has drawn the disclosure
  since S23, and the server has answered `?task=` since S5. What was missing
  was one query and one write path, and this is the only component that holds
  both a task's identity and its folder's.

  It reads only while a surface is open, which is the whole of what the host's
  own lifetime already says: nothing renders until `open` is set.
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
     being shown. */
  const authorNames = useMemo(() => {
    const names = new Map<string, string>()
    const viewer = me.data?.user
    if (viewer?.display_name != null) names.set(viewer.id, viewer.display_name)
    for (const connection of connections.data ?? []) {
      const name = connection.user.display_name
      if (name !== null) names.set(connection.user.id, name)
    }
    return names
  }, [connections.data, me.data?.user])

  const conversation = useMemo(
    () =>
      toConceptComments(
        thread.data?.comments ?? [],
        me.data?.user.id ?? null,
        (authorId) => authorNames.get(authorId) ?? 'Someone',
        Date.now(),
        /* 4.15's other half, off the library row every page already holds. */
        folders.data?.find((row) => row.id === threadFolderId)?.is_owner ?? false,
      ),
    [thread.data?.comments, me.data?.user.id, authorNames, folders.data, threadFolderId],
  )

  useEffect(() => {
    const offForm = onOpenTaskForm((defaults) => {
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
      making.current = false
      setOpen({ seq: seq.current, taskId: null, defaults, upcoming: false })
    })
    const offTask = onOpenTask((taskId, options) => {
      seq.current += 1
      setDraft(null)
      setCreated(null)
      setMode(null)
      making.current = false
      setOpen({
        seq: seq.current,
        taskId,
        defaults: {},
        upcoming: options.upcoming === true,
      })
    })
    return () => {
      offForm()
      offTask()
    }
  }, [])

  if (open === null) return null

  const rows = folders.data
  if (rows === undefined) return null
  /*
  An *opened* task waits for its detail and a *made* one does not.

  The wait is the retired overlay's rule and it is right for the edit path: a
  surface that rendered first and filled itself afterwards shows an empty
  title for as long as the request takes, which is a first observable state
  that is wrong. It would be wrong for the create path, where the draft
  already holds everything the surface is showing: waiting there would blank
  the dialog for a round trip immediately after the person named the task,
  which is the same fault seen from the other side.
  */
  if (open.taskId !== null && task.data === undefined) return null

  const context = { today: presenterToday(), folders: rows, clock }

  /*
  9.3's entry defaults, "derived from the page's own spine so a made task
  appears where it was made". The folder column reads Desk for five of its six
  rows, and Desk is 4.3's default folder rather than a folder that happens to
  be called one; the assignee defaults to the viewer.
  */
  function seed(): ConceptTask {
    const fallback = rows?.find((folder) => folder.is_default) ?? rows?.[0]
    const chosen =
      open?.defaults.folder_id === undefined
        ? fallback
        : (rows?.find((folder) => folder.id === open.defaults.folder_id) ?? fallback)
    const viewer = me.data?.user
    return {
      id: 'new',
      title: '',
      important: open?.defaults.important ?? false,
      ...(chosen === undefined
        ? {}
        : { folder: { id: chosen.id, name: chosen.name, color: chosen.color ?? '' } }),
      ...(viewer === undefined
        ? {}
        : {
            assignee: {
              id: viewer.id,
              name: viewer.display_name ?? '',
              initials: '',
            },
          }),
      ...(open?.defaults.due_date == null
        ? {}
        : { due: { label: `Due ${open.defaults.due_date}` } }),
    }
  }

  /* The server's answer the moment there is one, and the draft until then. */
  const concept =
    task.data === undefined
      ? (draft ?? seed())
      : /* S26: the conversation rides the concept, which is where
           `components/task-card.tsx` reads it (9.3's Comments block). A capture
           has no task yet and therefore no thread, which is the same reason
           `lib/task-concept.ts` left the field undefined until now. */
        {
          ...toConceptTask(task.data, context),
          comments: conversation,
          /* Item 58 (D): the Attachments block is the conversation's files,
             which is the only place 4.16 lets a task's file live. */
          attachments: threadAttachments(conversation),
        }
  const id = editing ?? 'new'

  /*
  The write path, forked once and only once.

  An existing task reports through `lib/task-writer.tsx`, which is the one way
  an edit leaves a card and which fans a `Partial<ConceptTask>` out to the
  endpoints 7.6, 7.7, 7.8 and 7.9 put each field on. A capture reports into
  the draft, and the title is the field that ends the fork: the moment it
  commits non-empty, the draft becomes the create body and everything after it
  takes the first path.
  */
  function write(_taskId: string, fields: Partial<ConceptTask>): void {
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
      if (folderId === null || editing === null) return
      applyThreadChange(conversation, fields.comments, {
        post: (body) => {
          postComment.mutate({
            folderId,
            body,
            taskId: editing,
          })
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
      if (folderId === null || editing === null) return
      const taskId = editing
      for (const added of fields.attachments) {
        if (added.file === undefined) continue
        void uploadFile(commentFileKind(added.file), folderId, added.file).then((stored) => {
          postComment.mutate({ folderId, body: { file_id: stored.id }, taskId })
        })
      }
      return
    }
    if (editing !== null) {
      /*
      **Seam, S23: 9.5's confirmation, on the branch that has a
      successor, and the condition is `pages/DonePage.tsx`'s own.**

      9.3 gives the card's completion control 9.5's rule "unchanged": an
      un-complete that takes a G-SERIES successor confirms first, because
      5.1 deletes that successor in the same transaction and the
      parenthesis is the part the person cannot see, "any edits already
      made to the next occurrence go with it". A row gets this from its
      page; a surface has no page behind it, so it is here.

      **The condition is not "does it repeat", which is the reading that
      cost this row two runs.** Completing a rule-carrying task moves the
      rule to the successor, so the completed occurrence carries a
      `series_id` and no rule at all: a client asking whether the task
      repeats gets "no" from the one row where the confirm is owed. That
      is written down already, in `pages/DonePage.tsx`, and recorded as a
      reading in `src/client/README.md` with its own escalation, the
      transition endpoints answering `deleted_successor_id` so the server
      knows this before it acts while the client infers it beforehand.
      One condition, two surfaces, and this is the second.
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
      return
    }
    const next: ConceptTask = { ...(draft ?? seed()), ...fields }
    setDraft(next)
    /* 9.3: the title is required, 1 to 300, and frozen 7.6 refuses a create
       without one. So an unnamed capture holds its answers and makes nothing,
       which is also what a person means by opening a capture and changing
       their mind. */
    if (next.title.trim() === '') return
    /* One create per capture, whatever a fast blur does. `create.isPending`
       is not enough on its own: two blurs inside one tick both read false. */
    if (making.current) return
    making.current = true
    const body = conceptPatchToBody(next)
    create.mutate(
      {
        title: next.title.trim(),
        ...(body.folder_id === undefined ? {} : { folder_id: body.folder_id }),
        ...(body.assignee_id === undefined ? {} : { assignee_id: body.assignee_id }),
        ...(next.important === undefined ? {} : { important: next.important }),
        ...(open?.defaults.due_date == null
          ? {}
          : { due_date: open.defaults.due_date }),
      },
      {
        onSuccess: (detail) => setCreated(detail.id),
        onError: () => {
          /* The capture keeps its draft and may be named again. A surface that
             swallowed the refusal would look like a task that had been made. */
          making.current = false
        },
      },
    )
  }

  function close(): void {
    setOpen(null)
    setDraft(null)
    setCreated(null)
  }

  return (
    <TaskWriter patch={write}>
      {uncompleting === null ? null : (
        <ConfirmDialog
          message={UNCOMPLETE_SERIES_CONFIRM}
          onContinue={() => {
            const run = uncompleting
            setUncompleting(null)
            run()
          }}
          onCancel={() => setUncompleting(null)}
        />
      )}
      {open.upcoming ? (
        <p role="status" className="sr-only">
          {UPCOMING_OCCURRENCE}
        </p>
      ) : null}
      <TaskSurface
        key={open.seq}
        task={surfaceTask(id, concept)}
        mode={mode ?? preference}
        onModeChange={(next) => {
          setMode(next)
          setTaskSurfacePreference(next)
        }}
        {...(editing === null
          ? {}
          : {
              onOpenInTab: () => {
                close()
                void navigate(`/app/tasks/${editing}`)
              },
            })}
        onClose={close}
      />
    </TaskWriter>
  )
}

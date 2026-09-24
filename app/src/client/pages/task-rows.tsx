/*
A run of task rows, and the confirmations 9.3 and 9.4 put behind two of the
overflow menu's three entries.

One component, so section 9's sentence is written once rather than in a copy per
screen that would drift.

**Nothing in this file computes a date or an ordering.** The rows arrive in the
order section 6 fixed and are mapped, not sorted, which is that section's own
sentence: "every view returns rows already ordered; clients never re-sort".
Every display value comes from `parts/presenters.ts`, which owns the due label,
the overdue rule and the initials and is the only thing in this client that
reads today. 7.11 makes a rule that exists only in the client a specification
violation, and this file is where one would be written if it were written
anywhere.

**The confirmations are one sentence in one element.** A title plus a
description reads correctly and is not this copy: a block boundary is where a
reader stops hearing one sentence. AC-183 asserts the sentence as one text run,
so the whole string is the title and there is no description. The two controls
are 9.1's "Continue" and "Cancel", uniform for every confirmation of 9.3 to 9.9
and not a caller's to rename.

**An abandoned row's checkbox restores it** (9.5): an abandoned row draws a
"Restore" control in place of the box, and `TaskRow` raises
`onToggleComplete(false)` from it.
*/
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useCreateFolder, useOrderTask, usePullIntoMyDay, useUpdateTask } from '../api/mutations.js'
import { useFolders, useMe } from '../api/queries.js'
import {
  PendingPanel,
  TaskList,
  TaskRow,
  useRowSelection,
} from '../components/task-row.js'
import type { BulkDate, PendingAction } from '../components/task-row.js'
import { ConfirmDialog as UiConfirmDialog } from '../components/ui/ConfirmDialog.js'
import {
  ABANDON_CONFIRM,
  DELETE_CONFIRM_LABEL,
  DELETE_TASK_CONFIRM,
  deleteTasksConfirm,
  keepLabel,
} from '../components/ui/copy.js'
import { folderDisplay, presenterToday, taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { isScheduled } from '../parts/schedule.js'
import { useTimeFormat } from '../lib/time-format.js'
import type { TimeFormat } from '../lib/time-format.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { addDays, weekStart } from '../lib/dates.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'

/**
 * The three page-level facts every row needs and no `TaskCard` carries: 4.11's
 * today, the signed-in person, and the folder table a folder's colour is
 * resolved against.
 *
 * All three are chrome reads the shell already made, so a page asking for them
 * costs nothing: TanStack answers from the same cache entry (8.3). `today` is
 * `presenterToday()` and never a second clock, which is the rule
 * `parts/presenters.ts` states about itself.
 */
export function useRowBasis(): {
  today: string
  viewerId: string | null
  folders: readonly Folder[]
  clock: TimeFormat
} {
  const me = useMe()
  const folders = useFolders()
  /* 9.7's clock, subscribed here so every row of a page redraws together when
     the preference moves. The store is the one `lib/time-format.ts` owns, and
     the shell writes the account's value into it when the 4.19 bundle
     settles; nothing in `presenters.ts` reads it, that module being pure by
     its own header's rule. */
  const clock = useTimeFormat()
  return {
    today: presenterToday(),
    viewerId: me.data?.user.id ?? null,
    folders: folders.data ?? [],
    clock,
  }
}

interface PendingConfirm {
  /** The normative sentence section 9 writes for this action. */
  readonly message: string
  readonly run: () => void
  /* The delete confirms name their controls. */
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export interface ConfirmLabels {
  readonly confirmLabel: string
  readonly cancelLabel: string
}

/**
 * The confirmation of 9.3 to 9.9, as the pages consume it: whichever action
 * `useConfirm` holds, or nothing.
 *
 * The rendering is `ui/ConfirmDialog.tsx`'s, one component for every
 * confirmation in this client, so a task confirm and the People screen's
 * remove-connection confirm cannot drift apart. This adapter only maps the
 * held-action shape onto that component's props.
 */
export function ConfirmDialog({
  pending,
  onClose,
}: {
  readonly pending: PendingConfirm | null
  readonly onClose: () => void
}): React.JSX.Element | null {
  if (pending === null) return null
  return (
    <UiConfirmDialog
      message={pending.message}
      onContinue={() => {
        pending.run()
        onClose()
      }}
      onCancel={onClose}
      {...(pending.confirmLabel === undefined ? {} : { confirmLabel: pending.confirmLabel })}
      {...(pending.cancelLabel === undefined ? {} : { cancelLabel: pending.cancelLabel })}
    />
  )
}

/**
 * Holds whichever destructive action was last asked for, so a page renders one
 * confirmation rather than one per row.
 */
export function useConfirm(): {
  pending: PendingConfirm | null
  ask: (message: string, run: () => void, labels?: ConfirmLabels) => void
  close: () => void
} {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  return {
    pending,
    ask: (message, run, labels) => setPending({ message, run, ...labels }),
    close: () => setPending(null),
  }
}

/**
 * What a list may do beyond drawing its rows, decided by the page that draws
 * it.
 *
 * `arrangeable`: "in a folder, native or user's, with no filter or sort
 * applied, a task may be arranged by hand", and "in a view, or in a folder with
 * a filter or sort applied, the drag does not persist". The folder page
 * computes it from its own filter; every other page passes nothing and its drag
 * springs back. What it gates is the write and nothing else: the gesture, its
 * feedback, the hold that makes a folder and the selection bar are the same on
 * every list, because none of them needs a persisted order.
 */
export interface ListArrangement {
  readonly arrangeable: boolean
}

export function TaskRows({
  tasks,
  context,
  actions,
  onAsk,
  arrangement,
  selection,
  selectionChrome,
  onDropAt,
  onOver,
  onDragStateChange,
}: {
  readonly tasks: readonly TaskCard[]
  readonly context: RowContext
  readonly actions: RowActions
  /** Raised for the two overflow entries section 9 puts a confirmation on. */
  readonly onAsk: (message: string, run: () => void, labels?: ConfirmLabels) => void
  readonly arrangement?: ListArrangement
  readonly selection?: ReturnType<typeof useRowSelection>
  readonly selectionChrome?: boolean
  readonly onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  readonly onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  readonly onDragStateChange?: (dragging: boolean) => void
}): React.JSX.Element {
  const acts = useListActs(tasks, actions, onAsk, arrangement?.arrangeable ?? false)
  /*
  The rows the v2 list holds. `TaskList` sorts, measures and selects by id
  and describes a row by its title, so each entry is the row's display props
  plus the id, and the `TaskCard` rides along for the acts above to read
  without a second lookup.
  */
  const rows = useMemo(
    () => tasks.map((task) => ({ ...taskRowDisplay(task, context), id: task.id, card: task })),
    [tasks, context],
  )
  return (
    /*
    9.7's row density reaching a list.

    What 9.7 asks for by name is "row density (comfortable, compact)", which is
    how close a list stands: comfortable keeps the spacing every page has,
    compact closes it so more fits on a screen. AC-261 names the preference and
    deliberately not the row shape.

    Driven off the document attribute `shell/appearance.ts` sets rather than by
    threading the bundle into every page, for that file's own reason: a
    preference about how the whole document draws belongs on the document.

    **The list is `TaskList`**, which is where the three behaviours that exist
    only because rows are a list live: the drag, the 1.5 second hold that makes
    a folder of two tasks, and press-and-hold selection with its bar. The wiring
    is `useListActs` below, and the list carries `role="list"`.
    */
    <TaskList
      className="[[data-density=compact]_&]:gap-0"
      tasks={rows}
      onTaskOpen={(id) => {
        const task = tasks.find((entry) => entry.id === id)
        if (task !== undefined) actions.onOpenTask(task)
      }}
      onReorder={acts.onReorder}
      /* A page whose order does not persist does not draw a slot for one: the
         drag lifts and the hold still makes a folder, and the rows it passes
         stay where they are. */
      reorderable={arrangement?.arrangeable ?? false}
      selection={selection}
      selectionChrome={selectionChrome}
      onDropAt={onDropAt}
      onOver={onOver}
      onDragStateChange={onDragStateChange}
      onMerge={acts.onMerge}
      onBulk={acts.onBulk}
      onMove={acts.onMove}
      onDate={acts.onDate}
      onDelete={acts.onDelete}
      renderRow={(row, wiring) => (
        <TaskRow
          key={row.id}
          {...row}
          {...wiring}
          /*
          **The v2 row's id, and it is not decoration.** Every act the
          overflow menu performs needs it, the History sheet reads 7.12 with
          it, and Copy link builds 9.1's `/app/tasks/:id` from it. The v1 row
          took none because its menu had three items and each was a callback.
          */
          id={row.id}
          /*
          **A folder page's rows do not say "Desk".** `taskRowDisplay` drops the
          folder when the context says `showFolder: false`, which every folder
          page and the folder-grouped All page set, and a row with no folder
          would otherwise fall back to naming Desk. The row's own vocabulary for
          "the page already says this" is `given`, the word the Important screen
          and the board's axis pass, so the context's silence is handed to the
          row in that word rather than by a second display flag.
          */
          given={context.showFolder === false ? { folder: true } : undefined}
          /*
          The row is told its folder even where the page has already said it:
          `given` silences the chip, but the card the chevron opens still names
          the folder, and a card given none would say "Desk". The resolved name
          and colour come from the same table the chip reads when it is drawn.
          */
          folder={{ id: row.card.folder.id, ...folderDisplay(row.card.folder, context.folders) }}
          /*
          Every list this file draws drags through `TaskList`, which hands each
          row its state directly; `wiring` above is what it hands each row.
          */
          onOpen={() => {
            actions.onOpenTask(row.card)
          }}
          onToggleComplete={() => {
            if (row.card.status === 'abandoned') actions.onRestore(row.card)
            else actions.onToggleComplete(row.card)
          }}
          onToggleImportant={() => {
            actions.onToggleImportant(row.card)
          }}
          onRemoveFromMyDay={() => {
            actions.onRemoveFromMyDay(row.card)
          }}
          onAbandon={() => {
            onAsk(ABANDON_CONFIRM, () => {
              actions.onAbandon(row.card)
            })
          }}
          onDelete={() => {
            onAsk(
              DELETE_TASK_CONFIRM,
              () => {
                actions.onDelete(row.card)
              },
              { confirmLabel: DELETE_CONFIRM_LABEL, cancelLabel: keepLabel(1) },
            )
          }}
        />
      )}
    />
  )
}

/**
 * The list's three behaviours, performed over endpoints that exist: the drag
 * through 7.6's order endpoint, the hold through `POST /folders` then `PATCH
 * /tasks/:id`, and the bar through the same acts a row performs one at a time.
 * Nothing here adds an endpoint.
 */
function useListActs(
  tasks: readonly TaskCard[],
  actions: RowActions,
  onAsk: (message: string, run: () => void, labels?: ConfirmLabels) => void,
  arrangeable: boolean,
): {
  onReorder: (from: number, to: number, next: string[]) => Promise<boolean>
  onMerge: (ids: string[], name: string) => void
  onBulk: (ids: string[], fields: { done?: boolean; important?: boolean; pulled?: boolean }) => void
  onMove: (ids: string[], folder: { id: string; name: string }) => void
  onDate: (ids: string[], when: BulkDate) => void
  onDelete: (ids: string[]) => void
} {
  const order = useOrderTask()
  const createFolder = useCreateFolder()
  const update = useUpdateTask()
  const pull = usePullIntoMyDay()
  const queryClient = useQueryClient()
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])
  const pick = (ids: readonly string[]): TaskCard[] =>
    ids.map((id) => byId.get(id)).filter((task): task is TaskCard => task !== undefined)

  return {
    /*
    The drag. The list has already moved the row; this decides whether the
    server hears about it, and answers the list once it knows.

    The neighbours are the moved task's nearest unscheduled, unfinished peers in
    the order the list now shows, because 7.6's body names "the two rows the
    task was dropped between in its folder's unscheduled list" and the folder
    page's list is Q7's, Scheduled first then Unscheduled, concatenated. A
    Scheduled row carries no hand order (the endpoint's own 409), so a drag of
    one is answered `false` here rather than sent to be refused: the refusal is
    a state the client can read off the row, and a toast for a rule the row
    already shows would be noise. A Scheduled row a person drags past is skipped
    for the same reason, so an Anytime task dropped among the scheduled rows is
    placed first in the unscheduled list, which is where it will draw.

    **Scheduled means a start date or a due date** (issue #216), as the server
    and `folderUnscheduledIds` read it; a Start-only row is scheduled, so it is
    neither dragged nor counted as a neighbour.

    On success the views are read back before the list is told, because the list
    drops its own copy on the answer and must find the server's order already
    there (AC-266: the drag reads back in Q2's order). The mutation cache
    invalidates on every success and this awaits the same refetch.
    */
    onReorder: async (from, to, next) => {
      if (!arrangeable) return false
      const task = next[to] === undefined ? undefined : byId.get(next[to])
      if (task === undefined || from === to) return false
      if (isScheduled(task) || task.status !== 'pending') return false
      const peers = next.filter((id) => {
        const peer = byId.get(id)
        return peer !== undefined && !isScheduled(peer) && peer.status === 'pending'
      })
      const at = peers.indexOf(task.id)
      const body = { after_id: peers[at - 1] ?? null, before_id: peers[at + 1] ?? null }
      try {
        await order.mutateAsync({ id: task.id, body })
        await queryClient.invalidateQueries()
        return true
      } catch {
        return false
      }
    },
    /*
    The hold that makes a folder of two or more tasks, and "New folder…" from
    the bar and from a row's folder chip, which land in the same panel. One
    folder, then every task moved into it, in one act as the row's acceptance
    line asks. The moves go in parallel: 7.6 specifies each independently and
    INV-5 is checked per task, so nothing about one depends on another.
    */
    onMerge: (ids, name) => {
      const moving = pick(ids)
      if (moving.length === 0) return
      void createFolder.mutateAsync({ name }).then(async (folder) => {
        await Promise.all(
          moving.map((task) => update.mutateAsync({ id: task.id, body: { folder_id: folder.id } })),
        )
        /* One bar for one act: the undo entry names the folder, so there is no
           second toast saying the same thing. */
        pushUndo(`Moved ${plural(moving.length)} to "${folder.name}"`, () => {
          for (const task of moving) {
            update.mutate({ id: task.id, body: { folder_id: task.folder.id } })
          }
        })
      })
    },
    /*
    The bar's three marks, each the row's own act repeated, so every one
    registers its own inverse exactly as a single row's would (9.1's undo
    paragraph) and a row already in the asked-for state is left alone rather
    than toggled out of it.
    */
    onBulk: (ids, fields) => {
      for (const task of pick(ids)) {
        if (fields.done === true && task.status !== 'completed') actions.onToggleComplete(task)
        if (fields.important === true && !task.important) actions.onToggleImportant(task)
        if (fields.pulled === true && !task.pulled) pull.mutate(task.id)
      }
    },
    onMove: (ids, folder) => {
      const moving = pick(ids).filter((task) => task.folder.id !== folder.id)
      for (const task of moving) update.mutate({ id: task.id, body: { folder_id: folder.id } })
      if (moving.length > 0) {
        pushUndo(undoLabel('Moved', plural(moving.length)), () => {
          for (const task of moving) {
            update.mutate({ id: task.id, body: { folder_id: task.folder.id } })
          }
        })
      }
    },
    /* The bar's Date: one PATCH per task, one undo for the batch. A repeating
       task keeps its date, because a rule needs one (INV-6). */
    onDate: (ids, when) => {
      const today = presenterToday()
      const date =
        when === null
          ? null
          : when === 'today'
            ? today
            : when === 'tomorrow'
              ? addDays(today, 1)
              : weekStart(addDays(today, 7))
      const moving = pick(ids).filter(
        (task) => task.due_date !== date && !(date === null && task.is_recurring),
      )
      for (const task of moving) {
        update.mutate({
          id: task.id,
          body: date === null ? { due_date: null, due_time: null } : { due_date: date },
        })
      }
      if (moving.length > 0) {
        pushUndo(`Changed the date of ${plural(moving.length)}`, () => {
          for (const task of moving) {
            update.mutate({
              id: task.id,
              body: { due_date: task.due_date, due_time: task.due_time },
            })
          }
        })
      }
    },
    /* Behind the same confirmation a row's delete carries, in its plural. */
    onDelete: (ids) => {
      const going = pick(ids)
      if (going.length === 0) return
      /* One act, one undo entry for the whole batch. */
      onAsk(
        going.length === 1 ? DELETE_TASK_CONFIRM : deleteTasksConfirm(going.length),
        () => {
          actions.onDeleteMany(going)
        },
        { confirmLabel: DELETE_CONFIRM_LABEL, cancelLabel: keepLabel(going.length) },
      )
    },
  }
}

/** One selection controller for the task rows separated by prose, pictures,
 * and Section headings on a composed page. The existing bulk acts still run
 * over real task rows and their existing endpoints. */
export function useTaskRowsSelection(
  tasks: readonly TaskCard[],
  actions: RowActions,
  onAsk: (message: string, run: () => void, labels?: ConfirmLabels) => void,
): {
  readonly selection: ReturnType<typeof useRowSelection>
  readonly chrome: React.JSX.Element
  readonly proposeMerge: (ids: readonly [string, string], titles: readonly [string, string]) => void
} {
  const acts = useListActs(tasks, actions, onAsk, false)
  const [pending, setPending] = useState<Extract<PendingAction, { kind: 'folder-for' | 'merge' }> | null>(null)
  const selection = useRowSelection({
    onMove: acts.onMove,
    onNewFolder: (ids) => setPending({ kind: 'folder-for', ids }),
    onBulk: acts.onBulk,
    onDate: acts.onDate,
    onDelete: acts.onDelete,
  })
  return {
    selection,
    proposeMerge: (ids, titles) => {
      setPending({ kind: 'merge', ids: [...ids], titles: [...titles] })
    },
    chrome: (
      <>
        {selection.bar}
        {pending ? (
          <PendingPanel
            pending={pending}
            onConfirm={(name) => {
              acts.onMerge(pending.ids, name)
              setPending(null)
            }}
            onCancel={() => setPending(null)}
          />
        ) : null}
      </>
    ),
  }
}

function plural(count: number): string {
  return `${count} task${count === 1 ? '' : 's'}`
}

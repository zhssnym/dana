/*
 * A run of task rows, plus the confirmations behind two overflow entries. Rows arrive ordered by the server and
 * are never re-sorted; display values come from `parts/presenters.ts`. A confirmation is one sentence in one
 * element (AC-183).
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useCreateFolder, useOrderTask, usePullIntoMyDay, useUpdateTask } from '../api/mutations.js'
import { useFolders, useMe } from '../api/queries.js'
import {
  TaskList,
  TaskRow,
  useRowSelection,
} from '../components/task-row.js'
import type { BulkDate } from '../components/task-row.js'
import { ConfirmDialog as UiConfirmDialog } from '../components/ui/ConfirmDialog.js'
import { ABANDON_CONFIRM } from '../components/ui/copy.js'
import { folderDisplay, presenterToday, taskRowDisplay } from '../parts/presenters.js'
import type { RowContext } from '../parts/presenters.js'
import { isScheduled } from '../parts/schedule.js'
import { useTimeFormat } from '../lib/time-format.js'
import type { TimeFormat } from '../lib/time-format.js'
import { pushUndo, undoLabel } from '../shell/undo.js'
import { addDays, formatClockTime, weekStart } from '../lib/dates.js'
import type { RowActions } from '../parts/useRowActions.js'
import type { Folder } from '../../shared/folders.js'
import type { TaskCard } from '../../shared/tasks.js'

/**
 * Page-level facts every row needs: today, the signed-in person and the folder table. All are cached chrome
 * reads.
 */
export function useRowBasis(): {
  today: string
  viewerId: string | null
  folders: readonly Folder[]
  clock: TimeFormat
} {
  const me = useMe()
  const folders = useFolders()
  /* Subscribed here so every row redraws together when the clock preference changes. */
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
  readonly confirmLabel?: string
  readonly cancelLabel?: string
}

export interface ConfirmLabels {
  readonly confirmLabel: string
  readonly cancelLabel: string
}

/** Adapts the held action from `useConfirm` onto `ui/ConfirmDialog.tsx`. */
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

/** Holds the last destructive action asked for, so a page renders one confirmation, not one per row. */
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
 * `arrangeable` gates only the order write: a folder with no filter or sort persists a drag; elsewhere the drag
 * springs back. The hold, the selection bar and feedback work on every list.
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
  followAcross,
  given,
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
  readonly followAcross?: boolean
  /** `day` when the heading names the one day every row is due, so a row keeps only its time. */
  readonly given?: { readonly day?: boolean }
}): React.JSX.Element {
  const acts = useListActs(tasks, actions, onAsk, arrangement?.arrangeable ?? false)
  /* `TaskList` works by id, so each entry is the row's display props plus the id and its `TaskCard`. */
  const rows = useMemo(
    () =>
      tasks.map((task) => {
        const { due, starts, ...shownDisplay } = taskRowDisplay(task, context)
        /* Under a day's own heading the day is said; the start is not repeated. */
        const display = given?.day === true || starts === undefined ? shownDisplay : { ...shownDisplay, starts }
        /* Under a day's own heading the row says only its time, if it has one. */
        const time = given?.day === true ? formatClockTime(task.due_time, context.clock ?? '12') : null
        const shown =
          due === undefined || time === null
            ? due
            : time === ''
              ? undefined
              : { label: time, ...(due.overdue === true ? { overdue: true } : {}) }
        return { ...display, ...(shown === undefined ? {} : { due: shown }), id: task.id, card: task }
      }),
    [tasks, context, given?.day],
  )
  return (
    /*
     * `TaskList` owns the drag, the hold that makes a folder, and Shift/Cmd-click selection; `useListActs`
     * performs them.
     */
    <TaskList
      tasks={rows}
      onTaskOpen={(id) => {
        const task = tasks.find((entry) => entry.id === id)
        if (task !== undefined) actions.onOpenTask(task)
      }}
      onReorder={acts.onReorder}
      /* Where order does not persist, no drop slot is drawn and the rows stay put. */
      reorderable={arrangement?.arrangeable ?? false}
      selection={selection}
      selectionChrome={selectionChrome}
      onDropAt={onDropAt}
      onOver={onOver}
      onDragStateChange={onDragStateChange}
      followAcross={followAcross}
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
          id={row.id}
          /* A folder page's rows do not say "Desk": `showFolder: false` becomes `given.folder`. */
          /* Overdue stays in the late ink even under an "Overdue" heading. */
          given={context.showFolder === false ? { folder: true } : {}}
          /* The row still gets its folder: `given` hides the chip, but the card the chevron opens names it. */
          folder={{ id: row.card.folder.id, ...folderDisplay(row.card.folder, context.folders) }}
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
            /* One delete everywhere: Trash, with Undo, never a confirm. */
            actions.onDelete(row.card)
          }}
        />
      )}
    />
  )
}

/** The drag, the hold and the bar, over existing endpoints only. */
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
     * The neighbours are the nearest unscheduled, unfinished peers in the shown order. A scheduled row (start
     * or due date) has no hand order, so it is skipped and never dragged. Read the views back before answering
     * the list, which drops its own copy on the answer (AC-266).
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
    /* The hold, and "New folder…" from the bar or a row's chip: one folder, then every task moved in parallel. */
    onMerge: (ids, name) => {
      const moving = pick(ids)
      if (moving.length === 0) return
      void createFolder.mutateAsync({ name }).then(async (folder) => {
        await Promise.all(
          moving.map((task) => update.mutateAsync({ id: task.id, body: { folder_id: folder.id } })),
        )
        /* One undo bar for the act; no second toast. */
        pushUndo(`Moved ${plural(moving.length)} to "${folder.name}"`, () => {
          for (const task of moving) {
            update.mutate({ id: task.id, body: { folder_id: task.folder.id } })
          }
        })
      })
    },
    /* Each mark repeats the row's own act with its own undo; a row already in that state is left alone. */
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
    /* One PATCH per task, one undo for the batch. A repeating task keeps its date (INV-6). */
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
    /* One undo entry for the batch; no confirm. */
    onDelete: (ids) => {
      const going = pick(ids)
      if (going.length === 0) return
      actions.onDeleteMany(going)
    },
  }
}

function plural(count: number): string {
  return `${count} task${count === 1 ? '' : 's'}`
}

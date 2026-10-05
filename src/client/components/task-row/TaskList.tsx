import { useEffect, useRef, useState, type ReactNode } from "react"

import type { ConceptTask } from "../../tasks/task-model.js"
import { useSortableList } from "../../lib/use-sortable-list.js"
import type { SortableItemState } from "../../lib/use-sortable-list.js"
import { cn } from "../ui/utils.js"
import { PendingPanel, type PendingAction } from "./PendingPanel.js"
import { useRowSelection, type BulkDate } from "./use-row-selection.js"
import { rowProps } from "./row-props.js"
import { TaskRow } from "./TaskRow.js"
import type { TaskListWiring, TaskOpenMode, TaskRowProps } from "./types.js"

/* Reorder, the hold that makes a folder of two tasks, and selection. A component,
   not a hook, so screens never hold the drag and selection state themselves. */

export function TaskList<T extends TaskRowProps & { id: string }>({
  tasks,
  onReorder,
  reorderable = true,
  onDropAt,
  onOver,
  followAcross = false,
  onDragStateChange,
  onMerge,
  onBulk,
  onDate,
  onDelete,
  onMove,
  onTaskOpen,
  onTaskToggleComplete,
  onTaskToggleImportant,
  onTaskRemoveFromMyDay,
  onTaskAbandon,
  onTaskDelete,
  renderRow,
  className,
  selection: sharedSelection,
  selectionChrome = true,
  ...perRow
}: {
  tasks: T[]
  /** Shared so one selection spans a composed page's separate lists. */
  selection?: ReturnType<typeof useRowSelection>
  selectionChrome?: boolean
  /* The new order is provisional. A returned promise (true once written and read
     back, false if refused) makes the list drop its copy and show the screen's rows;
     returning nothing keeps the list's own order. */
  onReorder?: (from: number, to: number, next: string[]) => void | Promise<boolean>
  /* False: rows do not slide open a gap, but the row still lifts and the dwell
     still makes a folder. */
  reorderable?: boolean
  /* A release outside this list. Returning true means the page took it, so this
     list leaves its order alone. */
  onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  /* Returns the words the carried row draws, not a key. */
  onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  /* For a board, whose cards leave their column sideways. */
  followAcross?: boolean
  /* Pass a stable setter. */
  onDragStateChange?: (dragging: boolean) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDate?: (ids: string[], when: BulkDate) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  onMove?: (ids: string[], folder: { id: string; name: string; color: string }) => void
  /* Required: optional, it was forgotten and rows silently could not be opened. */
  onTaskOpen: (id: string, mode?: TaskOpenMode) => void
  onTaskToggleComplete?: (id: string, completed: boolean) => void
  onTaskToggleImportant?: (id: string) => void
  onTaskRemoveFromMyDay?: (id: string) => void
  onTaskAbandon?: (id: string) => void
  onTaskDelete?: (id: string) => void
  /* For screens whose rows carry their own logic: they keep their row and
     spread the list wiring onto it. */
  renderRow?: (task: T, wiring: TaskListWiring) => ReactNode
  /* Declared, not left to `perRow`, so each call site decides it. */
  given?: TaskRowProps["given"]
  className?: string
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  /* Null until somebody drags, so an untouched list keeps the screen's order. */
  const ordered = order
    ? [...tasks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tasks

  const cancelPress = useRef<() => void>(() => {})

  /* A list with no order to keep does not slide passed rows out of the way.
     Done here, not in the engine: persistence is the page's fact. */
  function stateOf(index: number): SortableItemState {
    const state = drag.itemState(index)
    if (reorderable || state.isActive) return state
    return { ...state, offset: 0 }
  }

  const dragging = useRef(false)
  const drag = useSortableList({
    count: ordered.length,
    onLift: () => cancelPress.current(),
    onDropAt: onDropAt
      ? (from, point) => {
          const task = ordered[from]
          return task ? onDropAt(task.id, point) : false
        }
      : undefined,
    onOver: onOver
      ? (from, point) => {
          const task = ordered[from]
          return task ? onOver(task.id, point) : null
        }
      : undefined,
    onReorder: (from, to) => {
      if (!reorderable) return
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      /* Hold our copy until the screen answers, either way. */
      const answer = onReorder?.(from, to, next)
      if (answer !== undefined) {
        void answer.then(() => setOrder(null))
      }
    },
    /* Opens the naming panel, which can be cancelled. */
    onDwell: (from, to) => {
      const moved = ordered[from]
      const onto = ordered[to]
      if (moved && onto) {
        setPending({
          kind: "merge",
          ids: [moved.id, onto.id],
          titles: [moved.title, onto.title],
        })
      }
    },
    describe: (index) => ordered[index]?.title ?? "Task",
    followAcross,
  })

  /* Each row registers its opener; the drag engine calls it on a tap. */
  const openers = useRef(new Map<string, () => void>())

  const localSelection = useRowSelection({
    onMove: (ids, folder) => onMove?.(ids, folder),
    onNewFolder: (ids) => setPending({ kind: "folder-for", ids }),
    onBulk: (ids, fields) => onBulk?.(ids, fields),
    onDate,
    onDelete: (ids) => onDelete?.(ids),
  })
  const selection = sharedSelection ?? localSelection
  cancelPress.current = selection.clearPress
  /* The hold that starts selecting would also open the task on release. The
     engine's listeners cannot see the hold, so the opener reads this at release. */
  const selectingNow = useRef(false)
  selectingNow.current = selection.selecting

  useEffect(() => {
    if (dragging.current === drag.isDragging) return
    dragging.current = drag.isDragging
    onDragStateChange?.(drag.isDragging)
  }, [drag.isDragging, onDragStateChange])

  /* A cross-list drop unmounts the source list mid-drag, so report the end here. */
  useEffect(
    () => () => {
      if (dragging.current) onDragStateChange?.(false)
    },
    [onDragStateChange],
  )

  function confirm(name: string) {
    if (!pending) return
    if (pending.kind === "merge" || pending.kind === "folder-for") {
      onMerge?.(pending.ids, name)
    }
    setPending(null)
  }

  return (
    /* Never `space-y-*`: it overrides every `my-*` on the open card.
       `role="list"` because each row is a `listitem`. */
    <div role="list" className={cn("flex flex-col", className)}>
      {selectionChrome ? selection.bar : null}
      {pending ? (
        <PendingPanel
          pending={pending}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {ordered.map((task, index) => {
        const wiring = {
          itemRef: drag.setItemRef(index),
          onNewFolder: () => setPending({ kind: "folder-for", ids: [task.id] }),
          /* Both want pointerdown, so they are chained: spreading keeps only the later one. */
          listProps: selection.selecting
            ? selection.selectProps(task.id)
            : rowProps(
                /* A tap asks the row to open itself, so it works without the screen's help. */
                drag.surfaceProps(index, () => {
                  /* See `selectingNow` above. */
                  if (selectingNow.current || selection.takeModifiedPress()) return
                  openers.current.get(task.id)?.()
                }),
                selection.selectProps(task.id),
              ),
          onRegisterOpen: (open: (() => void) | null) => {
            if (open) openers.current.set(task.id, open)
            else openers.current.delete(task.id)
          },
          dragState: stateOf(index),
          /* `overKey` is already the words, because `onOver` returns them. */
          proposal:
            drag.itemState(index).isActive && drag.overKey !== null
              ? drag.overKey
              : undefined,
          isSelected: selection.selected.includes(task.id),
          selecting: selection.selecting,
        }
        if (renderRow) return renderRow(task, wiring)
        return (
        <TaskRow
          key={task.id}
          {...task}
          {...perRow}
          /* Spread whole, so no wiring field is forgotten; the handlers below override it. */
          {...wiring}
          onOpen={onTaskOpen ? (mode) => onTaskOpen(task.id, mode) : undefined}
          onToggleComplete={
            onTaskToggleComplete
              ? (completed) => onTaskToggleComplete(task.id, completed)
              : undefined
          }
          onToggleImportant={
            onTaskToggleImportant ? () => onTaskToggleImportant(task.id) : undefined
          }
          onRemoveFromMyDay={
            onTaskRemoveFromMyDay ? () => onTaskRemoveFromMyDay(task.id) : undefined
          }
          onAbandon={onTaskAbandon ? () => onTaskAbandon(task.id) : undefined}
          onDelete={onTaskDelete ? () => onTaskDelete(task.id) : undefined}
          itemRef={wiring.itemRef}
          listProps={wiring.listProps}
          dragState={wiring.dragState}
          isSelected={wiring.isSelected}
          selecting={wiring.selecting}
        />
        )
      })}
    </div>
  )
}

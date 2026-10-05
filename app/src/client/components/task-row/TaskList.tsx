/* A list of task rows: reorder, hold-to-make-a-folder, and selection. */

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

/* ---------------------------------------------------------------- list, */
/*
A list of task rows, and the three behaviours that only exist because they are a
list rather than a row: reordering, the 1.5-second hold that makes a folder of
two tasks, and selecting several to act on at once.

**Why it is a component rather than a hook.** The state these behaviours need
belongs to the list and not to any row in it, which row is being carried, which
row it is resting on, what is selected, and a screen that had to hold that state
would be a screen that could get it wrong. A screen renders one of these per
section and passes tasks; everything else is here.
*/

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
  /** A composed page renders task rows between other block kinds. Sharing
   * this controller keeps one selection across those separate list islands. */
  selection?: ReturnType<typeof useRowSelection>
  /** The composed page draws the shared bar once above all of its islands. */
  selectionChrome?: boolean
  /*
  **The list's arrangement is provisional until the screen says otherwise.** 7.6
  persists a drag in a folder with no filter or sort applied and springs it back
  everywhere else, and only the screen knows which list it is. So the callback
  also receives the ids in their new order and may answer with a promise: `true`
  once the order endpoint has written and the view has been read back, `false`
  for a refusal or a list that never persists. Either way the list then drops
  its own copy and shows the screen's rows, which after a write is the server's
  order (AC-266: the drag reads back in Q2's order) and after a refusal is the
  order the sort put there. A screen that returns nothing keeps the list's own
  order.
  */
  onReorder?: (from: number, to: number, next: string[]) => void | Promise<boolean>
  /*
  Whether this list keeps an order at all.

  A list that cannot keep an order does not offer one: otherwise the rows a
  carried row passes slide open a gap and a slot appears under it, and on
  release nothing has moved. The row still lifts, still follows the pointer, and
  the 1.5 second dwell still makes a folder, that gesture needing no persisted
  order; what goes is the displacement of the rows it passes and the reorder
  itself, so the only thing a drag here offers is the one thing it can do.
  */
  reorderable?: boolean
  /*
  Where a row was let go, when it was let go outside this list.

  A list sorts what it holds; a page holds several. Passed through to the drag
  engine so a page with sections can catch a task on its way out of one and
  put it in another, see `onDropAt` in `use-sortable-list`. Returning true
  means the page took it and this list should leave its own order alone.
  */
  onDropAt?: (taskId: string, point: { x: number; y: number }) => boolean
  /* What a release at this point would do, asked while the drag is still in the
     air, so the carried row can say it. It returns the words rather than a key,
     because the words are the only thing the row draws and a key would need a
     second prop to translate. See `proposal` on `TaskListWiring`. */
  onOver?: (taskId: string, point: { x: number; y: number }) => string | null
  /* The carried row follows the pointer sideways too (`crossOffset`), for a
     board, whose cards leave their column for the one beside it. */
  followAcross?: boolean
  /* Whether a row in this list is currently being carried. A page with
     sections needs it: the place to drop a task that belongs to none of them
     only has to exist while something is in the air. Pass a stable setter. */
  onDragStateChange?: (dragging: boolean) => void
  onMerge?: (ids: string[], name: string) => void
  onBulk?: (ids: string[], fields: Partial<ConceptTask>) => void
  onDate?: (ids: string[], when: BulkDate) => void
  onDuplicate?: (ids: string[]) => void
  onDelete?: (ids: string[]) => void
  /* The id rides along; see `useRowSelection`. */
  onMove?: (ids: string[], folder: { id: string; name: string; color: string }) => void
  /* Per-task callbacks, taking the id, so a screen never has to map rows
     itself just to close over one. */
  /*
  **Required, and that is the point.**

  Opening a task by pressing its body is resolved by the drag engine, because
  only the engine knows whether a press became a drag (see `onTap` in
  use-sortable-list). The engine can only report the tap to whoever the list
  hands it, so a list without this prop is a list whose rows silently cannot
  be opened, which is exactly what happened on the folder page, where three
  lists were written with `renderRow` and nobody remembered this.

  Optional, it was a rule kept in memory and forgotten once per new list.
  Required, the compiler asks the question at every call site, including the
  ones nobody has written yet. Behaviour that is settled for the row belongs
  in the row's own contract rather than in each screen's diligence.
  */
  onTaskOpen: (id: string, mode?: TaskOpenMode) => void
  onTaskToggleComplete?: (id: string, completed: boolean) => void
  onTaskToggleImportant?: (id: string) => void
  onTaskRemoveFromMyDay?: (id: string) => void
  onTaskAbandon?: (id: string) => void
  onTaskDelete?: (id: string) => void
  /* An escape hatch for the screens whose rows carry logic of their own,
     a completion that restores an abandoned task, a transition on complete, a
     recurrence successor to warn about. Rather than push all of that into
     this component or flatten it into id-only callbacks, the screen keeps its
     own row and is handed the list wiring to spread onto it. */
  renderRow?: (task: T, wiring: TaskListWiring) => ReactNode
  /*
  What this list has already said, for every row in it.

  Declared here rather than left to `perRow` so the compiler asks the
  question at the call site: a list is where the decision belongs, because a
  row cannot see the heading above it (see TaskRowProps.given). A screen with
  its own `renderRow` passes it on the row instead, which is the same
  decision made in the same place.
  */
  given?: TaskRowProps["given"]
  className?: string
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  /* The screen owns the tasks; this owns the arrangement, and only once
     somebody has actually dragged something. Until then the screen's order is
     the order, so a list nobody has touched still sorts by its own rule. */
  const ordered = order
    ? [...tasks].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : tasks

  const cancelPress = useRef<() => void>(() => {})

  /*
  The carried row still follows the pointer and the dwell still arms on the row
  under it; what a list with no order to keep does not do is slide the rows it
  passes out of the way, which is the list drawing a slot it will not fill. Made
  here rather than in the engine, because whether an order persists is the
  page's fact and not the gesture's.
  */
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
      /* A list with no order to keep never takes one. */
      if (!reorderable) return
      const next = ordered.map((task) => task.id)
      const [moved] = next.splice(from, 1)
      if (moved) next.splice(to, 0, moved)
      setOrder(next)
      /* See `onReorder` on the props. The list's own copy of the order is held
         while the screen answers and dropped when it has, whichever way it
         answered. */
      const answer = onReorder?.(from, to, next)
      if (answer !== undefined) {
        void answer.then(() => setOrder(null))
      }
    },
    /* Resting on a row proposes a folder of the two. Nothing is destroyed on
       release: it opens the naming panel, which can be cancelled. */
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

  /* Each row registers how to open itself; the drag engine calls into this
     on a tap. See the comment where `listProps` is built. */
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
  /*
  A press that became a selection is not a tap.

  The engine resolves a still press as a tap on release and asks the row to open
  (`onTap` in use-sortable-list). Every row registers an opener, so the 400 ms
  hold that starts selecting would, on release, also open the task it had just
  selected. The engine's listeners were attached before the hold armed and
  cannot see it, so the opener the list hands the engine reads the mode at the
  moment of release rather than at the press.
  */
  const selectingNow = useRef(false)
  selectingNow.current = selection.selecting

  /* Reported up rather than only used here, so a page can offer somewhere to
     drop that is worth showing only while something is being carried. */
  useEffect(() => {
    if (dragging.current === drag.isDragging) return
    dragging.current = drag.isDragging
    onDragStateChange?.(drag.isDragging)
  }, [drag.isDragging, onDragStateChange])

  /* A list that unmounts mid-drag never gets to say the drag ended, and a
     cross-list drop unmounts exactly the list the row came from, which left
     the page believing something was still in the air. */
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
    /* A flex column with a gap, never `space-y-*`. The space utilities set
       their children's vertical margins at a priority that beat every form of
       `my-*` tried on the open card, inline styles included, so an expanded
       task had no breathing room in the screens while looking right in the
       lab. A gap belongs to the container and leaves the children's margins
       alone, which is what the card needs. */
    /* The container is a list: a `listitem` needs a `list` to be an item of,
       and 9.1's roles table fixes both ends of that. See the comment over
       `ExpandShell` above. */
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
          /* Press-and-hold selects; travel drags. Both want pointerdown, so
             they are chained rather than spread over one another, spreading
             silently keeps only the later handler, which is how the row once
             ended up with a drag that never started. */
          listProps: selection.selecting
            ? selection.selectProps(task.id)
            : rowProps(
                /* A press that stays still opens the task; one that travels
                   drags it. The engine decides which, because it is the one
                   tracking the gesture, see `onTap` in use-sortable-list.

                   The tap asks the *row* to open itself rather than calling a
                   handler this list was given. That distinction is the whole
                   point: `onTaskOpen` is a prop every screen has to remember
                   to pass, and the folder page did not, so tap-to-open worked
                   on six pages and silently not on the seventh. A row always
                   knows its own opener, so routing through the row makes the
                   behaviour a property of TaskRow rather than a courtesy each
                   caller extends. */
                drag.surfaceProps(index, () => {
                  /* See `selectingNow` above. */
                  if (selectingNow.current || selection.takeModifiedPress()) return
                  openers.current.get(task.id)?.()
                }),
                selection.selectProps(task.id),
              ),
          /* How a row hands its opener back. Spread with the rest of the
             wiring, so every `renderRow` screen gets it without knowing. */
          onRegisterOpen: (open: (() => void) | null) => {
            if (open) openers.current.set(task.id, open)
            else openers.current.delete(task.id)
          },
          dragState: stateOf(index),
          /* The words only the carried row draws, and only while a container
             has been proposed. `overKey` is the label because `onOver` returns
             one; see that prop. */
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
          /* The whole wiring, spread.

             It used to be handed over field by field, which meant every
             addition to `wiring` had to be repeated here, and twice in a row
             it was not: "New folder…" was missing from this path, then
             `onRegisterOpen` was, so tap-to-open worked on the screens that
             use `renderRow` (which spread wiring) and silently not on the
             ones that do not. Spreading removes the class of mistake rather
             than the two instances of it; the explicit handlers below still
             override, because they come after. */
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

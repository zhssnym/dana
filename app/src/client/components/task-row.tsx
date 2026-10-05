/*
The task row and the list around it.

One line, one layout (the stored row-height preference is no longer read):
checkbox, title, muted meta, star. Pressing the row opens the task; the list
adds drag, the hold that makes a folder of two tasks, and Shift/Cmd-click
selection with its labelled bar. `useCardWiring` is shared with the task panel.
*/

export { T_FAST, T_BASE } from "./task-row/motion.js"
export { DWELL_MS, MergeBadge } from "./task-row/MergeBadge.js"
export {
  PendingPanel,
  suggestFolderName,
  type PendingAction,
} from "./task-row/PendingPanel.js"
export { useRowSelection, type BulkDate } from "./task-row/use-row-selection.js"
export { Check } from "./task-row/Check.js"
export { rowProps } from "./task-row/row-props.js"
export { ExpandShell } from "./task-row/ExpandShell.js"
export type {
  TaskListWiring,
  TaskOpenMode,
  TaskRowProps,
  TaskStatus,
} from "./task-row/types.js"
export { useCardWiring } from "./task-row/use-card-wiring.js"
export { TaskRow } from "./task-row/TaskRow.js"
export { TaskList } from "./task-row/TaskList.js"

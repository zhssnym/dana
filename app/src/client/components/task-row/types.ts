
import type { ConceptLabel, ConceptTask } from "../../tasks/task-model.js"

export type TaskStatus = "pending" | "completed" | "abandoned"

/* Owned here because the row offers the choice; the surface imports it. */
export type TaskOpenMode = "dialog" | "right" | "tab"

export interface TaskRowProps {
  id?: string
  title: string
  /* `id` feeds the assignee roster and every move's `folder_id`; it is optional
     so a card with only a name and colour still works. */
  folder?: { name: string; color: string; id?: string }
  /* Drawn after the folder chip as a path. Absent when the row already sits
     under that section's heading. */
  section?: string
  /* What the list around this row already says, so the row leaves it out.
     Decided per list, because a row cannot see the heading above it. */
  given?: {
    folder?: boolean
    assignee?: boolean
    due?: boolean
    important?: boolean
    overdue?: boolean
  }
  due?: { label: string; overdue?: boolean }
  /* Only where the start is not the due day. */
  starts?: string
  status?: TaskStatus
  important?: boolean
  importantTooltip?: string
  assignee?: { initials: string; name: string; image?: string; id?: string }
  assignees?: { initials: string; name: string; image?: string; id?: string }[]
  pulled?: boolean
  steps?: { complete: number; total: number }
  recurrence?: string
  notes?: string
  /* What only the card shows (steps, files). Without it, steps would be invented
     from the count and renamed on a round trip. Spread last, so card edits survive. */
  detail?: Partial<ConceptTask>
  unassigned?: boolean
  invitePending?: string
  /* Unfinished blockers; absent or 0 draws nothing. */
  blockedBy?: number
  /* Archived labels are left out. */
  labels?: ConceptLabel[]
  /* Drawn only where the page asks. */
  createdBy?: string
  /* What a release would do, drawn on the row being carried. */
  proposal?: string
  completionPreview?: boolean
  collapsing?: boolean
  /* Opens the task somewhere other than in place. */
  onOpen?: (mode?: TaskOpenMode) => void
  /* Supplied by TaskList; without it the chip offers no dead menu item. */
  onNewFolder?: () => void
  /* The card's write path; without it every edit dies with the component. */
  onPatch?: (fields: Partial<ConceptTask>) => void
  /* Supplied by TaskList only, never by a screen. */
  onRegisterOpen?: (open: (() => void) | null) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  /* List wiring, supplied only by `TaskList`. */
  itemRef?: (element: HTMLElement | null) => void
  listProps?: Record<string, unknown>
  dragState?: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    crossOffset?: number
  }
  isSelected?: boolean
  selecting?: boolean
  /* The task surface (sidebar, dialog, tab) renders the row already expanded. */
  defaultOpen?: boolean
}

/* The list wiring a screen spreads onto its own row when it keeps one. */
export interface TaskListWiring {
  itemRef: (element: HTMLElement | null) => void
  listProps: Record<string, unknown>
  onNewFolder: () => void
  /* Only the drag engine knows whether a press was a tap or a drag, so a row
     cannot take an `onClick`. */
  onRegisterOpen: (open: (() => void) | null) => void
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    crossOffset?: number
  }
  /* Filled by the board, the only list that drags into a container; undefined
     on every row but the carried one. */
  proposal?: string
  isSelected: boolean
  selecting: boolean
}

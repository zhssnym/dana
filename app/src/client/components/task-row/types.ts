/* The task row's props and the list wiring spread onto it. */

import type { ConceptLabel, ConceptTask } from "../../tasks/task-model.js"

export type TaskStatus = "pending" | "completed" | "abandoned"

/* Where a task can be held once it leaves the list, the surface's five
   modes plus the tab strip. Owned here because the row is where the choice
   is offered; the surface imports it. */
export type TaskOpenMode = "dialog" | "right" | "tab"

export interface TaskRowProps {
  id?: string
  title: string
  /*
  Dana addresses a folder by id (7.4), and two things on this surface need one:
  the assignee menu, whose roster is 4.4's members of *that* folder, and every
  write that moves a task, which sends `folder_id`. So `id` is optional beside
  the name and colour, as on `ConceptTask.folder`: a card that sets a name and a
  colour still typechecks and still behaves, and a picker sets the id.

  `toConceptTask` below spreads this straight onto the concept task, so the id
  reaches the card without a second mapping.
  */
  folder?: { name: string; color: string; id?: string }
  /*
  Which section of its folder page this task sits in.

  A section is part of a task's address: carry the row anywhere else, open it in
  a dialog, look at it in Completed, and without this the section vanishes.

  It rides *after* the folder chip and reads as a path, because that is what it
  is: Travel › Venue & vendors. Absent when there is no section, and absent when
  the row is already sitting under that section's own heading, which the folder
  page decides per list rather than per row.
  */
  section?: string
  /*
  What the list around this row has already said.

  **A row says what its page does not.** Done shows no due date under headings
  that already group by when it was finished; Important draws no filled star on
  a page defined by the star; Carried over paints no date red on a block whose
  membership *is* being late. The section chip works the same way, absent when
  the row sits under that section's own heading.

  Decided per list, never per row: a row cannot see the heading above it, and a
  screen that had to remember this on every row is a screen that will forget on
  one.
  */
  given?: {
    /* Grouped by folder, or standing inside one. */
    folder?: boolean
    /* Grouped by person. */
    assignee?: boolean
    /* Grouped by date, or finished, where the deadline is spent. */
    due?: boolean
    /* Every row here is starred. */
    important?: boolean
    /* Every row here is late. */
    overdue?: boolean
  }
  due?: { label: string; overdue?: boolean }
  /* The start of a Schedule, in the due label's words, where it is not the due day (#215). */
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
  /*
  The parts of a task only its card shows: the steps themselves, the files, and
  anything the card learns to edit next.

  Dialog, sidebar and inline row are views of the same task, so the data inside
  them must be the same. A row's props carry a step *count*, because a count is
  all a row draws, so without this `toConceptTask` would have to invent steps
  from it ("Step 1", "Step 2") and a task could round-trip through the shell
  with its steps renamed. Attachments have no prop at all.

  One field rather than one per fact, deliberately: the card gains blocks over
  time and each new one would otherwise need a prop, a mapping and a line in the
  shell's patcher, three places to forget. The row spreads this last, so
  whatever the card knows how to edit survives being closed and reopened
  somewhere else.
  */
  detail?: Partial<ConceptTask>
  /*
  `visualState`, `showSecondaryActions` and `menuOpen` are deliberately not
  props: the row draws its own hover and focus, and a prop that cannot do
  anything is a dead control one level down. The previous row survives at
  `components/task-row-baseline.tsx` for anyone comparing.
  */
  /*
  `unassigned` and `invitePending` are props because they are driven by real
  data, Q3's chip and 7.4's pending invite, and section 9 is normative on both.
  The reasoning sits beside the two chips they draw, at the foot of `rowChips`.
  */
  unassigned?: boolean
  invitePending?: string
  /* #225: unfinished blockers, 7.25's `blocked_by_count`. Absent or 0 draws
     nothing, so an ordinary row carries no dependency chrome at all. */
  blockedBy?: number
  /* #208: the Labels this viewer sees on the task, archived ones left out. */
  labels?: ConceptLabel[]
  /* 9.5's from half. The person who made this task, drawn only where the page
     asks. See the chip at the foot of `rowChips`. */
  createdBy?: string
  /* What a release would do, drawn on the row being carried. See `ExpandShell`. */
  proposal?: string
  completionPreview?: boolean
  collapsing?: boolean
  /* Open the task somewhere other than in place: the row's own view strip
     and the card's full-screen action both speak through this, naming the
     surface they want. Bare calls mean "full". */
  onOpen?: (mode?: TaskOpenMode) => void
  /* Makes a folder holding this task, and names it. Supplied by TaskList, which
     owns the naming panel; absent for a row rendered outside one, and the chip
     then simply does not offer it rather than drawing a dead menu item. */
  onNewFolder?: () => void
  /* The write path out of the card. See `useCardWiring`: without it every
     edit lives and dies with the component, which is why a task opened in a
     surface could not be renamed. */
  onPatch?: (fields: Partial<ConceptTask>) => void
  /* Supplied by TaskList so a row can hand back its own opener; the list
     then taps into it. Never passed by a screen. */
  onRegisterOpen?: (open: (() => void) | null) => void
  onToggleComplete?: (completed: boolean) => void
  onToggleImportant?: () => void
  onRemoveFromMyDay?: () => void
  onAbandon?: () => void
  onDelete?: () => void
  /* List wiring, supplied by `TaskList` and by nothing else. A row rendered
     on its own, the states page does this, simply has none of it, and is
     the same row without a list around it to reorder within. */
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
  /* The task surface (sidebar, dialog, a tab) renders the row already expanded:
     the row is the task even there. */
  defaultOpen?: boolean
}

/* The list wiring a screen spreads onto its own row when it keeps one. */
export interface TaskListWiring {
  itemRef: (element: HTMLElement | null) => void
  listProps: Record<string, unknown>
  /* Make a folder holding this task. */
  onNewFolder: () => void
  /*
  How a row hands the list its opener.

  The engine resolves tap-versus-drag, because it is the only thing that knows
  which a press became, so a row cannot simply take an `onClick`. Both of these
  are in the object the list builds, and are typed here so a `renderRow` screen
  can reach them.
  */
  onRegisterOpen: (open: (() => void) | null) => void
  dragState: {
    isActive: boolean
    isDwelling: boolean
    isArmed: boolean
    isSettling: boolean
    offset: number
    /* Sideways travel of the carried row, when the list follows across. */
    crossOffset?: number
  }
  /*
  What a release would do, for a list that drags into a container.

  The engine's `overKey` is handed on so the only surface that drags into a
  container, the board, can fill the row's proposal slot. AC-228 reads "Into
  {column}" while the pointer is still down, which is the one moment it exists.
  Undefined on every row that is not the carried one.
  */
  proposal?: string
  isSelected: boolean
  selecting: boolean
}
